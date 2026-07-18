# Migração para RPCs — Notas Fiscais Clientes (`src/pages/ClientInvoices.tsx`)

> Documento de planejamento. **Não implementar** — descreve, 1:1 no padrão que já funciona em `FaturamentoTotal.tsx` (`get_faturamento_total_metrics`), `docs/rpcInvoices.md` (Fases 1–4 já entregues), `docs/rpcreports.md`, `docs/rpcmecanica.md` e `docs/rpcoutsource.md`, como migrar todo o processamento pesado de `src/pages/ClientInvoices.tsx` (1803 linhas) para RPCs Postgres, mantendo comportamento e telas idênticos. Base factual: `docs/clientInvoices.md`.

---

## 1. Diagnóstico da situação atual

Arquivo envolvido: `src/pages/ClientInvoices.tsx` — rota `/:slug/client-invoices`. 2 níveis de abas: raiz (`Busca Geral` + N abas por cliente aberto); sub-abas por cliente (`aberto | encerrada | historico`).

Consultas atuais (queries diretas via PostgREST, sem RPC):

| # | Origem | Tabela | Uso |
|---|--------|--------|-----|
| Q1 | `useQuery client_invoices` | `client_invoices` + `items:client_invoice_items(*)` | Todas as listagens, KPIs, saldos e PDFs |
| Q2 | `useQuery client_invoice_exit_links` | `client_invoice_exit_links` | Cálculo de saldo (`invoicesWithBalance`), modal "Saídas vinculadas", auto-distribuir |
| Q3 | `useEffect companies` | `companies` (name, logo_url) | Header dos PDFs |
| — | `useSharedCompanyData()` | `clients`, `articles`, `yarn_types` | Dropdowns (já vem do `CompanyDataContext`, não migra) |

Escritas atuais (todas queries diretas, **sem transação SQL** — rollback manual best-effort):

- `saveInvoiceMutation` CREATE: `INSERT client_invoices` → `INSERT client_invoice_items` → (saída) `INSERT client_invoice_exit_links[]`. Rollback manual (DELETE cascade) se qualquer passo falha.
- `saveInvoiceMutation` UPDATE: `UPDATE client_invoices` → `UPDATE client_invoice_items` → (saída) snapshot `exit_links` → `DELETE exit_links WHERE exit_invoice_id=id` → `INSERT client_invoice_exit_links[]`. Se o INSERT falha, tenta restaurar snapshot — não é atômico.
- `handleDeleteInvoice`: `DELETE client_invoices` (FKs CASCADE cuidam de items + exit_links + saídas legadas via `parent_invoice_id`).

Processamentos pesados no cliente:

- `invoicesWithBalance` (`useMemo` em `ClientDetailView`) — para cada entrada, cruza `client_invoice_items` + `client_invoice_exit_links` + saídas legadas via `parent_invoice_id`, evita contagem dupla e calcula `saldo` e `isEncerrada`. Roda por render, por cliente aberto.
- `stats` (KPIs Entrada/Saída/Saldo) — soma sobre `invoicesWithBalance` filtrado por `localSearch`.
- `filteredInvoices` (`Busca Geral`) — filtra por `searchTerm` (casa `invoice_number`, `client_name`, `items.yarn_type_name`, `items.article_name`) + `searchMonth`; paginado 15/página no cliente.
- Auto-distribuir peso (`Wand2`) — replica `invoicesWithBalance` no cliente para descobrir saldo por entrada e distribuir proporcionalmente.
- PDFs (`exportClientInvoicesGeneralPdf`, `exportClientInvoiceByNfPdf`) — recalculam o mesmo saldo dentro de `src/lib/clientInvoicePdf.ts`, sobre o dataset já em memória.

Problemas de escala:

1. Q1 traz **todas** as NFs da empresa + itens aninhados em uma única query, sem paginação server-side. Cresce linearmente com histórico.
2. Q2 traz **todos** os `exit_links` da empresa. Necessário porque o cálculo do saldo cruza entradas e saídas de qualquer período.
3. `invoicesWithBalance` é O(entradas × links) por render. Sem memo por cliente entre trocas de sub-aba.
4. Escritas de `saida` executam até 4 statements sequenciais sem transação — falhas parciais deixam a NF sem vínculos ou com vínculos duplicados.
5. `handleDeleteInvoice` confia em CASCADE, mas não devolve ao operador quantas saídas foram apagadas.
6. Modal "Saídas vinculadas" reprocessa `invoicesWithBalance` inteiro só para calcular o consumido/saldo de 1 entrada.

---

## 2. Referência de padrão (obrigatória)

Todas as RPCs devem replicar, 1:1, o padrão consolidado em `get_faturamento_total_metrics` / `get_reports_metrics` / `get_invoices_bootstrap` / `get_outsource_bootstrap`:

- `LANGUAGE plpgsql` para agregações; `LANGUAGE sql` para leituras simples.
- `STABLE` (leitura) ou `VOLATILE` (escrita).
- `SECURITY DEFINER` + `SET search_path = public`.
- `GRANT EXECUTE ON FUNCTION public.<name>(...) TO anon, authenticated, service_role;`.
- Retorno **JSON único** (`jsonb`) contendo todos os blocos que a tela precisa.
- Isolamento por `p_company_id` sempre no primeiro `WHERE`.
- Escritas `SECURITY DEFINER`: **sempre** validar `get_user_company_id()` contra o `company_id` do payload E da linha carregada via `SELECT ... FOR UPDATE`, abortando com `RAISE EXCEPTION 'Acesso negado'` (armadilha do pente fino em `docs/mestre.md` — Fase 4 rpcInvoices.md).
- Cliente chama via `(supabase.rpc as any)('nome', { p_... })` para não depender do `types.ts` regenerado.
- **Datas nativas**: `client_invoices.issue_date` é `date`, não `text` — comparações diretas funcionam; não há armadilha `substring` (diferente de `invoices.issue_date` e `productions.date`).
- **Idempotência anti double-click**: escritas devolvem `{ok:true, already:true}` quando a linha alvo já não existe.
- Enriquecimento no cliente permitido só para labels de UI. Saldos e KPIs vêm prontos.

---

## 3. Plano de execução em 4 fases

### Fase 1 — Bootstrap único (leitura A)

Objetivo: substituir Q3 (companies) e reduzir o payload inicial ao carregar apenas metadata leve. Q1/Q2 (listagens pesadas) migram na Fase 2/3.

`get_client_invoices_bootstrap(p_company_id uuid) RETURNS jsonb`

Retorna:

```json
{
  "company":          { "name":"...", "logo_url":"..." },
  "available_months": ["2026-07","2026-06","..."],
  "clients_with_activity": [
    { "client_id":"...", "client_name":"...", "open_entries_count":0, "total_entrada_kg":0, "total_saida_kg":0 }
  ]
}
```

- `company` cobre o header dos PDFs — elimina o `useEffect` avulso de Q3.
- `available_months`: `DISTINCT to_char(issue_date,'YYYY-MM')` em `client_invoices` do tenant, DESC, com mês corrente injetado no topo.
- `clients_with_activity` é opcional (útil para pré-popular o `SearchableSelect` do topo com ordenação por atividade). Se ficar caro, adiar para Fase 3.
- Payload pequeno, `staleTime` 5 min.
- **Não** trazer `exit_links` nem `client_invoices` completos aqui — quem trata é `get_client_invoices_list` (Fase 2) e `get_client_invoice_balances` (Fase 3).

### Fase 2 — Listas paginadas server-side (leitura B)

Objetivo: eliminar Q1 (SELECT * de `client_invoices`) e Q2 (SELECT * de `client_invoice_exit_links`) trocando por leituras paginadas por contexto.

#### 2.1 `get_client_invoices_search` (aba raiz `Busca Geral`)

```
get_client_invoices_search(
  p_company_id uuid,
  p_search     text default null,   -- ILIKE em invoice_number / clients.name / items.yarn_type_name / items.article_name
  p_month      text default 'all',  -- 'YYYY-MM' | 'all'
  p_type       text default 'all',  -- 'all' | 'entrada' | 'saida'
  p_page       int  default 1,
  p_page_size  int  default 15
) RETURNS jsonb
```

Retorno:

```json
{
  "rows": [
    {
      "...colunas de client_invoices",
      "client_name": "...",
      "items": [ { "id","yarn_type_id","yarn_type_name","article_id","article_name","weight_kg" } ]
    }
  ],
  "total_count": 1234
}
```

- Ordena `issue_date DESC, created_at DESC`.
- `items` aninhados via `jsonb_agg` do LEFT JOIN em `client_invoice_items` (+ LEFT JOIN em `yarn_types`/`articles` para expor `yarn_type_name`/`article_name` já resolvidos — hoje o cliente resolve via `useSharedCompanyData`).
- `p_search` casa também em `client_invoice_items` via `EXISTS`.
- **Sem KPIs aqui** — a aba `search` não os exibe.

#### 2.2 `get_client_invoices_by_client` (uma aba por cliente aberto)

```
get_client_invoices_by_client(
  p_company_id uuid,
  p_client_id  uuid,
  p_view       text default 'aberto',   -- 'aberto' | 'encerrada' | 'historico'
  p_search     text default null,
  p_page       int  default 1,
  p_page_size  int  default 15          -- 'aberto' ignora paginação (sempre 1 página cheia)
) RETURNS jsonb
```

Retorno **já com saldos calculados server-side** (elimina `invoicesWithBalance` do JS):

```json
{
  "rows": [
    {
      "...colunas de client_invoices",
      "items":            [ { "..." } ],
      "weight_entrada":   1000.0,
      "weight_saida":     420.5,
      "saldo":            579.5,
      "is_encerrada":     false,
      "has_linked_outputs": true
    }
  ],
  "total_count": 42,
  "kpis": { "totalEntrada": 0, "totalSaida": 0, "totalSaldo": 0 }
}
```

Regras:

- `p_view='aberto'` → apenas `type='entrada'` com `saldo > 0.001`. Sem paginação (retorna tudo).
- `p_view='encerrada'` → apenas `type='entrada'` com `saldo <= 0.001`. Paginado.
- `p_view='historico'` → todas as NFs (`entrada` + `saida`) do cliente. `saldo`/`is_encerrada` retornam `null` para linhas de `type='saida'` (economiza CPU e casa com a UI, que mostra `-`).
- `p_search` casa nos mesmos campos da 2.1.
- `kpis` sempre calculado sobre o conjunto completo do filtro (não só a página), replicando `stats` do `ClientDetailView`.

**Algoritmo SQL do saldo** (replica §7 de `docs/clientInvoices.md`):

```sql
WITH entradas AS (
  SELECT ci.*, COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = ci.id),0) AS weight_entrada
    FROM client_invoices ci
   WHERE ci.company_id = p_company_id AND ci.client_id = p_client_id AND ci.type = 'entrada'
),
links_agg AS (
  SELECT l.entry_invoice_id, SUM(l.deduct_kg) AS weight_from_links,
         array_agg(l.exit_invoice_id) AS linked_exit_ids
    FROM client_invoice_exit_links l
   WHERE l.company_id = p_company_id
   GROUP BY l.entry_invoice_id
),
legacy_agg AS (
  SELECT s.parent_invoice_id AS entry_invoice_id,
         COALESCE(SUM((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id)),0) AS weight_legacy
    FROM client_invoices s
    LEFT JOIN links_agg la ON s.parent_invoice_id = la.entry_invoice_id
   WHERE s.company_id = p_company_id AND s.type = 'saida' AND s.parent_invoice_id IS NOT NULL
     AND (la.linked_exit_ids IS NULL OR NOT (la.linked_exit_ids @> ARRAY[s.id]))   -- evita contagem dupla
   GROUP BY s.parent_invoice_id
)
SELECT e.*,
       COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0) AS weight_saida,
       GREATEST(0, e.weight_entrada - (COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0))) AS saldo,
       (GREATEST(0, e.weight_entrada - (COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0))) <= 0.001) AS is_encerrada,
       (la.entry_invoice_id IS NOT NULL) AS has_linked_outputs
  FROM entradas e
  LEFT JOIN links_agg  la ON la.entry_invoice_id = e.id
  LEFT JOIN legacy_agg lg ON lg.entry_invoice_id = e.id;
```

- `GREATEST(0, …)` esconde saldos negativos (mesma tolerância do JS).
- Tolerância de 0.001 kg para "encerrada" — idêntica.

#### 2.3 `get_client_invoice_linked_exits` (modal "Saídas vinculadas")

```
get_client_invoice_linked_exits(
  p_company_id       uuid,
  p_entry_invoice_id uuid
) RETURNS jsonb
```

Retorna, para uma NF de entrada:

```json
{
  "entry": { "...client_invoices","weight_entrada":0,"yarn_type_name":"...","yarn_color":"..." },
  "consumed_kg": 0,
  "linked":   [ { "exit_invoice_id","invoice_number","issue_date","deduct_kg","source":"link" } ],
  "legacy":   [ { "exit_invoice_id","invoice_number","issue_date","weight_kg","source":"legacy" } ]
}
```

- Elimina o recorte do `invoicesWithBalance` que o modal faz hoje.
- `linked` vem do JOIN `client_invoice_exit_links + client_invoices`. `legacy` vem de saídas com `parent_invoice_id = p_entry_invoice_id` que **não** aparecem em `linked` (`NOT EXISTS`).

### Fase 3 — Saldos/consultas auxiliares e Export PDF (leitura C)

Objetivo: mover para o servidor os cálculos usados por auto-distribuir e pelos PDFs, para eles rodarem sem depender do dataset local.

#### 3.1 `get_client_invoice_balances_for_distribute` (auto-distribuir)

```
get_client_invoice_balances_for_distribute(
  p_company_id       uuid,
  p_client_id        uuid,
  p_entry_invoice_ids uuid[],
  p_exclude_exit_id  uuid default null   -- ignora o próprio exit_invoice_id quando editando
) RETURNS jsonb
```

Retorno:

```json
{
  "entries": [
    { "entry_invoice_id":"...", "weight_entrada":0, "already_consumed":0, "saldo":0 }
  ]
}
```

- Ignora contribuições vindas de `p_exclude_exit_id` (mesma regra do JS ao editar uma saída existente).
- Cliente aplica a distribuição proporcional local (é UI puro — não vale RPC).

#### 3.2 `get_client_invoices_export` (PDF geral por cliente)

```
get_client_invoices_export(
  p_company_id uuid,
  p_client_id  uuid,
  p_type       text default 'ambos',    -- 'ambos' | 'entrada' | 'saida'
  p_month      text default 'all',      -- 'YYYY-MM' | 'all'
  p_start      date default null,
  p_end        date default null
) RETURNS jsonb
```

Retorno já no formato que `exportClientInvoicesGeneralPdf` consome:

```json
{
  "company":       { "name":"...", "logo_url":"..." },
  "client":        { "id":"...", "name":"..." },
  "rows": [
    {
      "issue_date":"2026-07-01","invoice_number":"12345","type":"entrada",
      "yarn_name":"...","supplier_name":"...",
      "weight_entrada":0,"weight_saida":0,"saldo":0
    }
  ],
  "totals": { "totalEntrada":0,"totalSaida":0,"totalSaldo":0 }
}
```

- Cliente só monta a tabela do PDF.
- Aplica os mesmos filtros do modal `exportOpen general`.

#### 3.3 `get_client_invoice_by_nf_export` (PDF por NF de entrada)

```
get_client_invoice_by_nf_export(
  p_company_id       uuid,
  p_entry_invoice_id uuid
) RETURNS jsonb
```

Retorno: mesmo payload da 2.3 (`entry + linked + legacy + consumed_kg`) acrescido de `{ company:{name,logo_url}, client:{id,name} }`. Alimenta `exportClientInvoiceByNfPdf` sem depender do array de `invoices` em memória.

### Fase 4 — Escritas atômicas (padrão `save_invoice` / `cancel_invoice` da rpcInvoices.md)

Objetivo: mover as mutações para funções `SECURITY DEFINER` com **transação SQL única**, validação server-side e idempotência.

| RPC | Substitui hoje |
|-----|----------------|
| `save_client_invoice(p_id uuid null, p_payload jsonb, p_items jsonb, p_exit_links jsonb, p_author_name text, p_author_code text)` | `saveInvoiceMutation` (INSERT/UPDATE cabeçalho + INSERT/UPDATE item + delete+insert de `exit_links`) |
| `delete_client_invoice(p_id uuid, p_author_name text, p_author_code text)` | `handleDeleteInvoice`/`confirmDelete` — devolve `cascade_count` (nº de saídas apagadas via CASCADE) para o toast |
| `sync_client_invoice_exit_links(p_exit_invoice_id uuid, p_links jsonb, p_author_name text, p_author_code text)` | Opcional — permite editar apenas os vínculos sem reeditar a NF |

Todas as escritas:

- Rodam em **BEGIN/COMMIT único** (garantia SQL — elimina rollback manual).
- Validam `get_user_company_id() = p_payload->>'company_id'` (INSERT) E `= (SELECT company_id FROM client_invoices WHERE id=p_id FOR UPDATE)` (UPDATE/DELETE). `RAISE EXCEPTION 'Acesso negado'` caso contrário.
- `SELECT ... FOR UPDATE` na linha alvo em updates/deletes.
- Retornam `{ok:true, id:uuid, already:false}` — `already:true` quando a NF já foi apagada ou o mesmo UUID de idempotência já rodou (anti double-click).
- Validam payload dentro da RPC:
  - `type IN ('entrada','saida')`.
  - `issue_date` dentro de ±5 anos da data corrente (mesma regra de `constraints/date-entry-validation`).
  - Item único com `weight_kg > 0` (mesmo pressuposto do JS — 1 item por NF).
  - `type='entrada'` → `items[0].yarn_type_id NOT NULL`; `type='saida'` → `items[0].article_id NOT NULL`.
  - `type='saida'` → `jsonb_array_length(p_exit_links) >= 1`; sem duplicatas de `entry_invoice_id`; `SUM(deduct_kg) <= items[0].weight_kg + 0.001`.
  - Cada `entry_invoice_id` referenciado precisa ser `type='entrada'` do mesmo `client_id` e mesma `company_id` (`EXISTS` server-side — hoje o cliente não valida).
- `save_client_invoice`:
  - INSERT: `INSERT client_invoices RETURNING id` → `INSERT client_invoice_items SELECT ... FROM jsonb_to_recordset(p_items)` → (se saída) `INSERT client_invoice_exit_links SELECT ... FROM jsonb_to_recordset(p_exit_links)`.
  - UPDATE: `UPDATE client_invoices` (COALESCE nos campos opcionais para não sobrescrever com NULL — mesma armadilha corrigida em `save_invoice`) → `UPDATE client_invoice_items` (ou DELETE+INSERT se o modelo evoluir para N itens) → (se saída) `DELETE client_invoice_exit_links WHERE exit_invoice_id=p_id` + `INSERT` dos novos, tudo dentro da mesma transação.
  - `composition` gravado sempre como `NULL` (mesma regra atual — coluna legada).
  - Preserva `created_by_name`/`created_by_code` no INSERT; UPDATE não sobrescreve o autor original (só `updated_at` automático via trigger).
- `delete_client_invoice`:
  - `SELECT FOR UPDATE` → conta `linked_exits + legacy_children` antes do DELETE → `DELETE client_invoices` (CASCADE cuida do resto) → retorna `{ok:true, cascade_count:N, was_parent:bool}`.
  - Cliente usa `cascade_count` no toast (`"Nota excluída — N saída(s) vinculada(s) também foram removidas"`).
- `sync_client_invoice_exit_links` (opcional): permite editar só os vínculos sem tocar no cabeçalho. Segue mesmas validações da parte de saída de `save_client_invoice`.

Auditoria (`audit_logs`) continua no cliente por enquanto (padrão atual do projeto e do Fase 4 de `rpcInvoices.md`). Migrar para dentro da RPC é fase 5 opcional.

---

## 4. Refactor no cliente (após cada fase)

### Fase 1
- Remover o `useEffect(companies)`. Substituir por `useQuery(['client_invoices_bootstrap', companyId], get_client_invoices_bootstrap)` com `staleTime` 5 min.
- PDFs passam a receber `{name, logo_url}` de `bootstrap.company` (via prop ou context local).
- Se `clients_with_activity` for entregue, alimentar o `SearchableSelect` do topo com esses dados (ordenação/preenchimento por atividade).

### Fase 2
- **Aba raiz `Busca Geral`**: substituir o filtro `filteredInvoices` por `useQuery(['client_invoices_search', {search, month, type, page}], get_client_invoices_search)` com **debounce 300 ms** na busca. Página guardada localmente.
- **Sub-abas por cliente (`ClientDetailView`)**: substituir Q1 + Q2 + `invoicesWithBalance` por `useQuery(['client_invoices_by_client', {clientId, view, search, page}], get_client_invoices_by_client)` — uma query por sub-aba visível. Elimina o dataset global de `client_invoices` e `exit_links` em memória.
- **Modal "Saídas vinculadas"**: chamar `get_client_invoice_linked_exits({p_entry_invoice_id})` ao abrir; deixar de calcular no cliente.
- **Deletar** os dois `useQuery` globais (`client_invoices`, `client_invoice_exit_links`) e o `useMemo invoicesWithBalance`.

### Fase 3
- Auto-distribuir: chamar `get_client_invoice_balances_for_distribute({p_entry_invoice_ids, p_exclude_exit_id})` para obter saldos frescos antes de aplicar a distribuição proporcional (que continua no cliente — é UI).
- PDFs: `exportClientInvoicesGeneralPdf` recebe o payload de `get_client_invoices_export`; `exportClientInvoiceByNfPdf` recebe `get_client_invoice_by_nf_export`. Nenhum cálculo de saldo no cliente.
- Remover funções auxiliares de saldo em `src/lib/clientInvoicePdf.ts` (o PDF só desenha).

### Fase 4
- Todas as `useMutation` viram `(supabase.rpc as any)('save_client_invoice'/'delete_client_invoice'/'sync_client_invoice_exit_links', {...})`.
- Remover o snapshot manual dos `exit_links` e o rollback manual do CREATE (a RPC entrega atomicidade real).
- Após sucesso, invalidar apenas as chaves relevantes: `['client_invoices_by_client', clientId]`, `['client_invoices_search']`, `['client_invoice_linked_exits', entryId]`, `['client_invoices_bootstrap']` (só quando o cabeçalho muda `available_months`).
- Tratar `already:true` para não duplicar `logAction`/toast (idem `rpcInvoices.md` Fase 4).
- Manter no cliente somente as validações de UX imediata (desabilitar botão enquanto salva, feedback de campos vazios). Validações de negócio ficam no servidor.

---

## 5. Realtime e cache

- Introduzir Realtime opcional em `client_invoices`, `client_invoice_items`, `client_invoice_exit_links` (padrão `mem://features/ofr-realtime` — `publication` + `REPLICA IDENTITY FULL` + canal). Handlers apenas invalidam as queries — não mutam arrays locais (não há mais array global).
- `staleTime` sugerido: 30 s listas/`by_client`, 60 s `linked_exits`, 5 min `bootstrap`, 0 s `balances_for_distribute` (sempre fresco).
- **Acoplamento com Invoices.tsx (trama):** as duas telas são **independentes** (`docs/clientInvoices.md` §12) — não compartilham tabelas. Nenhuma invalidação cruzada necessária.
- **Acoplamento com ClientsArticles.tsx:** `clients`/`articles`/`yarn_types` continuam vindo do `CompanyDataContext`; alterações lá continuam refletindo via context, sem tocar nas queries desta tela.

---

## 6. Segurança e RLS

- Nenhuma alteração em RLS/policies. RPCs são `SECURITY DEFINER` mas sempre filtram por `p_company_id` recebido; escritas validam contra `get_user_company_id()` (regra do pente fino em `docs/mestre.md` — obrigatória para todo SECURITY DEFINER que aceita UUID vindo do cliente).
- `GRANT EXECUTE` para `anon, authenticated, service_role` em todas — mesmo padrão de Invoices/Mecânica/Relatórios/Terceirizado.
- FKs CASCADE das tabelas `client_invoice_items`, `client_invoice_exit_links` e a self-ref `parent_invoice_id` continuam intactas — o `delete_client_invoice` apenas encapsula o DELETE físico já existente.
- Nenhuma leitura de `companies` fora do `bootstrap` (elimina o `select('*').eq('id', companyId)` avulso).

---

## 7. Pontos de atenção específicos desta migração

1. **`client_invoices.issue_date` é `date` nativo** — comparações diretas (`= p_month::date` via `date_trunc('month', ...)`, `>= p_start`, `<= p_end`) funcionam. Não há a armadilha `substring` de `invoices.issue_date`/`productions.date`.
2. **1 item por NF (invariante da UI)** — a RPC `save_client_invoice` deve aceitar `p_items jsonb` como array por generalidade, mas validar `jsonb_array_length(p_items) = 1` até que a UI evolua para N itens.
3. **Contagem dupla de saídas legadas** — o `LEFT JOIN` + `NOT (linked_exit_ids @> ARRAY[s.id])` é o coração do `invoicesWithBalance`. Testar com fixture que tem: (a) só links, (b) só `parent_invoice_id`, (c) ambos (link migrado + registro legado). Precisa dar o mesmo resultado do JS atual, senão surge saldo dobrado ou zerado.
4. **`composition` (jsonb) é legado** — RPC de save grava sempre `NULL`. Documentado em `docs/clientInvoices.md` §13.7.
5. **`parent_invoice_id` é LEGADO** — RPC de save nunca escreve nele (só lê nas leituras 2.2/2.3 para preservar histórico). `handleEditInvoice` do cliente continua migrando automaticamente registros legados para `exit_links` ao editar (a RPC apenas persiste o resultado).
6. **`invoice_number` sem unicidade** — a RPC não valida duplicidade (intencional: cliente/tipo diferentes podem repetir; `docs/clientInvoices.md` §13.6).
7. **DELETE cascade em `delete_client_invoice`** — CASCADE já existe nas FKs. A RPC só encapsula, conta o impacto e devolve `cascade_count` para o toast. Sem lógica nova de cascata.
8. **Auto-distribuir** — a distribuição proporcional continua no cliente (é UX puro). O que muda é que o **saldo consultado é fresco** (RPC 3.1), evitando distribuir sobre um snapshot desatualizado.
9. **`canSeeFinancial`** não se aplica aqui (não há campos R$ nesta tela). Nada a fazer.
10. **Auditoria continua no cliente** via `logAction('NF CLIENTES: ...', {...})`. Se migrar para dentro da RPC futuramente, seguir o padrão de `finalize_maintenance_order` (parâmetros `p_author_name`/`p_author_code`).

---

## 8. Plano de validação (por fase)

1. `tsgo --noEmit` limpo após cada fase.
2. Comparar payload da RPC contra cálculo JS anterior em pelo menos duas empresas (uma pequena, uma com > 5 k NFs de cliente) — `saldo` e `is_encerrada` precisam bater grama a grama.
3. Testar as 3 sub-abas (`aberto`, `encerrada`, `historico`) em um cliente com histórico misto (links + legacy `parent_invoice_id`) — nenhuma NF pode aparecer/desaparecer em relação ao comportamento atual.
4. Rodar `supabase--linter` e resolver avisos ligados às novas funções.
5. Testar Realtime (opcional): inserir NF via outra sessão e ver a lista atualizar sem F5.
6. Testar exportação PDF (`general` e `by_nf`) antes/depois — mesma quantidade de linhas, mesmos totais.
7. Testar auto-distribuir: em uma saída com 3 entradas selecionadas, o total distribuído deve bater com o `SUM(deduct_kg)` gravado.
8. Testar CREATE + falha de rede simulada em `client_invoice_items` — a NF **não pode** ficar órfã (garantia da transação SQL da Fase 4; antes ficava se o rollback manual falhasse).
9. Testar edição de saída com troca completa dos `exit_links` — snapshot antigo somem, novos ficam consistentes; se a RPC falhar, nada foi tocado.
10. Testar DELETE de entrada que tem 2 saídas vinculadas (uma via link, uma via legacy) — `cascade_count` do toast deve reportar `2`.
11. Testar tentativa de UPDATE/DELETE com `p_id` de outra empresa — deve falhar com `Acesso negado` (regra do pente fino).

---

## 9. Ordem sugerida de entrega

1. **Fase 1** (bootstrap) — ganho pequeno, baixo risco, prepara o terreno.
2. **Fase 2** (listas + `by_client` + `linked_exits`) — **maior ganho de performance percebida** (elimina Q1/Q2 globais e o `invoicesWithBalance` custoso). É o "core" desta migração.
3. **Fase 3** (auto-distribuir server-side + export PDF) — encerra a leitura no servidor.
4. **Fase 4** (escritas atômicas + idempotência + isolamento multi-tenant) — encerra a migração eliminando queries diretas e resolvendo a não-atomicidade documentada em `docs/clientInvoices.md` §5.3 / §13.4.

Cada fase é independente: se interrompida, a tela continua funcionando com a mistura RPC + queries antigas (mesmo padrão de `rpcInvoices.md`, `rpcmecanica.md`, `rpcoutsource.md`).

---

## 10. Referências

- `docs/clientInvoices.md` — documentação factual da página (fonte deste plano).
- `docs/rpcInvoices.md` — modelo mais próximo (mesmo domínio de NFs, já entregue nas 4 fases).
- `docs/rpcoutsource.md`, `docs/rpcmecanica.md`, `docs/rpcreports.md` — referências adicionais de padrão RPC em 4 fases.
- `src/pages/FaturamentoTotal.tsx` + `get_faturamento_total_metrics` — RPC-âncora do padrão.
- `src/lib/clientInvoicePdf.ts` — consumidor dos payloads de export (Fase 3).
- `mem://features/ofr-realtime`, `mem://constraints/date-entry-validation`, `mem://logic/data-normalization`.
- `docs/mestre.md` (18/07/2026) — pente fino Fases 1–4 rpcInvoices.md: obrigatoriedade de validar `get_user_company_id()` em todo SECURITY DEFINER de escrita.

*Criado em 18/07/2026 (Brasília). Sem alteração em código/banco.*
