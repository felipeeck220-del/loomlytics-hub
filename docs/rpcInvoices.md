# Migração para RPCs — Notas Fiscais Trama (`src/pages/Invoices.tsx`)

> Documento de planejamento. **Não implementar** — descreve, 1:1 no padrão que já funciona em `FaturamentoTotal.tsx` / `docs/rpcreports.md` / `docs/rpcmecanica.md` / `docs/rpcoutsource.md`, como migrar todo o processamento pesado de `src/pages/Invoices.tsx` (2141 linhas, 7 abas) para RPCs Postgres, mantendo comportamento e telas idênticos. Base factual: `docs/Invoices.md`.

---

## 1. Diagnóstico da situação atual

Arquivo envolvido: `src/pages/Invoices.tsx` (2141 linhas) — abas `entrada`, `venda_fio`, `saida_malha`, `saldo` (por marca), `saldoGlobal` (por tipo), `efterceiro` (fio nas facções) e `fios` (registry de `yarn_types`).

Consultas atuais (todas SELECTs paralelos, filtradas/agregadas em JS):

| # | Origem | Tabela | Uso |
|---|--------|--------|-----|
| Q1 | `useQuery yarn_types` | `yarn_types` | Dropdowns + aba "Tipos de Fio" |
| Q2 | `useQuery invoices` | `invoices` (paginado 1000/vez até esgotar) | Todas as listagens + KPIs + saldos |
| Q3 | `useQuery invoice_items` | `invoice_items` (paginado 1000/vez até esgotar) | Joins client-side, saldos por marca e global |
| Q4 | `useQuery outsource_companies` | `outsource_companies` | Dropdown Tinturaria/Terceiros + aba EFT |
| Q5 | `useQuery outsource_yarn_stock` | `outsource_yarn_stock` (paginado 1000/vez) | Aba "Fio Terceiros" |
| Q6 | `handleSaveInvoice` (venda_fio Exportar) | `companies` | Nome + logo para PDF |
| — | `CompanyDataContext` | `clients`, `articles`, `productions` | Consumo produtivo no Saldo Global |

Processamentos pesados no cliente:

- `filteredInvoicesBase / filteredInvoices / totalPages` — filtragem por tipo/status/mês/busca (busca casa também em `invoice_items.yarn_type_name/article_name`) e paginação 20/página.
- `kpis` (count/totalKg/totalValue/pendentes) por aba, sobre NFs ativas.
- `availableMonths` — DISTINCT em `invoices.issue_date` (+ mês corrente), 2020–2099, DESC.
- `yarnBalance` (Saldo Fios) — agrupa `invoice_items` por `brand` sobre NFs `entrada`/`venda_fio` não canceladas, respeitando `saldoMonth`; retorna `{brand, received, sold, balance}`. `saldoBrandOptions` e `saldoKpis` derivam disso.
- `yarnGlobalBalance` (Saldo Global) — para cada `yarn_type` calcula `purchaseMonth`, `consumedMonth` (via `article.yarn_type_id` + `productions`), `salesMonth` e `stockAccumulated` até `endDate = lastDayOfMonth(saldoGlobalMonth)`. `saldoGlobalKpis` soma linha a linha.
- `eftGroups` / `eftKpis` / `eftAvailableMonths` — agrupa `outsource_yarn_stock` por facção após filtros `eftMonth/eftCompany/eftYarn`.
- Leitor de código de barras SEFAZ 44 dígitos (listener global de `keydown`, threshold 80 ms) — **não é banco, não migra**.

Problemas de escala:

1. Q2 e Q3 baixam **todas** as NFs e itens da empresa via loop `while(hasMore)` — inviável em empresas com > 10 k NFs (mesmo padrão do Q4 do Terceirizado já corrigido).
2. Toda troca de aba/filtro recalcula `yarnBalance` e `yarnGlobalBalance` sobre o array inteiro em memória.
3. `yarnGlobalBalance` combina `invoices + invoice_items + articles + productions` — 4 arrays completos em memória por render.
4. KPIs do header dependem do dataset completo mesmo quando o usuário só está na aba `fios` ou `efterceiro`.
5. Q5 mesmo padrão paginado — cresce linearmente com o histórico de facções.

---

## 2. Referência de padrão (obrigatória)

Todas as RPCs devem replicar, 1:1, o padrão de `get_faturamento_total_metrics` / `get_reports_metrics` / `get_outsource_report_metrics`:

- `LANGUAGE plpgsql` para agregações complexas, `LANGUAGE sql` para leituras simples de metadata.
- `STABLE` (leitura) ou `VOLATILE` (escrita).
- `SECURITY DEFINER` + `SET search_path = public`.
- `GRANT EXECUTE ON FUNCTION public.<name>(...) TO anon, authenticated, service_role;`.
- Retorno **JSON único** (`jsonb`) contendo todos os blocos que a tela precisa.
- Isolamento por `p_company_id` sempre no primeiro `WHERE`.
- Enriquecimento no cliente permitido só para labels (`formatYarnLabel`, formatação PT-BR). Números vêm prontos.
- Cliente chama via `(supabase.rpc as any)('nome', { p_... })` para não depender do `types.ts` regenerado.
- **Datas como texto** (`invoices.issue_date`, `productions.date`) — usar `substring(col,1,7)` para comparações por mês (mesma armadilha corrigida em `get_outsource_bootstrap`); comparações lexicográficas `>=/<=` funcionam para `YYYY-MM-DD`.

---

## 3. Plano de execução em 4 fases

### Fase 1 — Bootstrap único (leitura A)

Objetivo: substituir Q1 + Q4 + a metadata mínima do header por **uma** chamada no boot da tela.

`get_invoices_bootstrap(p_company_id uuid) RETURNS jsonb`

Retorna:

```json
{
  "company":          { "name":"...", "logo_url":"..." },
  "yarn_types":       [ { "id","name","composition","color","observations" } ],
  "outsource_companies": [ { "id","name" } ],
  "available_months_invoices": ["2026-07","2026-06"],
  "available_months_eft":      ["2026-07","2026-06"]
}
```

- `available_months_invoices`: `DISTINCT substring(issue_date,1,7)` em `invoices` onde `substring(issue_date,1,4) BETWEEN '2020' AND '2099'`, `ORDER BY 1 DESC`, com **mês corrente injetado no topo** (mesma regra do JS atual).
- `available_months_eft`: `DISTINCT reference_month` em `outsource_yarn_stock` + mês corrente, DESC.
- `company` cobre o botão "Exportar" (venda_fio) — elimina Q6 on-demand.
- Payload pequeno, staleTime 5 min.

### Fase 2 — Listas paginadas server-side (leitura B)

Objetivo: eliminar o `while(hasMore)` de Q2/Q3/Q5. Uma RPC unificada por família.

#### 2.1 `get_invoices_list`

```
get_invoices_list(
  p_company_id  uuid,
  p_type        text,                       -- 'entrada' | 'venda_fio' | 'saida'
  p_status      text default 'all',         -- 'all' | 'pendente' | 'conferida' | 'cancelada'
  p_month       text default 'all',         -- 'YYYY-MM' | 'all'
  p_search      text default null,          -- ILIKE em invoice_number/buyer_name/destination_name/access_key + yarn_type_name/article_name dos itens
  p_page        int  default 1,
  p_page_size   int  default 20
) RETURNS jsonb
```

Retorno:

```json
{
  "rows": [
    {
      "...colunas de invoices",
      "items": [ { "...invoice_items" } ]
    }
  ],
  "total_count": 1234,
  "kpis": { "count":0, "totalKg":0, "totalValue":0, "pendentes":0 }
}
```

- Ordena `issue_date DESC, created_at DESC`.
- `p_search` casa `ILIKE '%'||p_search||'%'` em campos da NF **e** em `invoice_items.yarn_type_name / article_name` via `EXISTS`.
- `items` aninhados via `jsonb_agg(... ORDER BY created_at)` do LEFT JOIN em `invoice_items` (mesma NF).
- `kpis` sempre calculado sobre o conjunto completo do filtro (não só a página), respeitando `status <> 'cancelada'`.

#### 2.2 `get_outsource_yarn_stock_list` (aba EFT)

```
get_outsource_yarn_stock_list(
  p_company_id uuid,
  p_month      text default 'all',
  p_outsource_company_id uuid default null,
  p_yarn_type_id uuid default null
) RETURNS jsonb
```

Retorno já **agrupado por facção** (elimina o `eftGroups` do JS):

```json
{
  "groups": [
    {
      "outsource_company_id":"...",
      "outsource_company_name":"...",
      "items": [ { "id","yarn_type_id","yarn_type_name","yarn_color","yarn_composition","quantity_kg","reference_month","observations" } ],
      "total_kg": 0
    }
  ],
  "kpis": { "total_kg":0, "companies_count":0, "yarn_types_count":0 }
}
```

- Ordenação: facção A→Z, dentro de cada facção `yarn_type_name` A→Z.
- Sem paginação (payload pequeno; comumente < 200 linhas). Se crescer, adicionar `p_page/p_page_size` no futuro.

#### 2.3 `get_yarn_types_list` (aba Tipos de Fio)

Registry é lido no bootstrap; a aba `fios` reusa `bootstrap.yarn_types` filtrando por `yarnSearchTerm` no cliente (custo O(n) sobre lista pequena — não vale RPC dedicada).

### Fase 3 — Saldos agregados (leitura C, agregação pesada)

Objetivo: replicar em SQL o que hoje é `yarnBalance` e `yarnGlobalBalance`. Padrão idêntico a `get_reports_metrics`.

#### 3.1 `get_yarn_balance_by_brand` (aba Saldo Fios)

```
get_yarn_balance_by_brand(
  p_company_id uuid,
  p_month      text default 'all',
  p_brand      text default 'all'
) RETURNS jsonb
```

Retorno:

```json
{
  "rows": [ { "brand":"Coats","received":1234.5,"sold":230.0,"balance":1004.5 } ],
  "kpis": { "totalReceived":0,"totalSold":0,"totalBalance":0 },
  "available_brands": [ "Coats","Karsten" ]
}
```

- Fonte: `invoice_items ii JOIN invoices i ON i.id = ii.invoice_id AND i.company_id = p_company_id AND i.status <> 'cancelada' AND i.type IN ('entrada','venda_fio')`.
- Agrupa por `COALESCE(ii.brand,'Sem marca')`.
- `received = Σ weight_kg WHERE i.type='entrada'`, `sold = Σ weight_kg WHERE i.type='venda_fio'`, `balance = received - sold`.
- Filtro de mês: `substring(i.issue_date,1,7) = p_month` (skip se `all`).
- `available_brands` é o mesmo agrupamento sem o filtro `p_brand`.

#### 3.2 `get_yarn_global_balance` (aba Saldo Global)

```
get_yarn_global_balance(
  p_company_id uuid,
  p_month      text default 'all',
  p_yarn_type_id uuid default null
) RETURNS jsonb
```

Retorno:

```json
{
  "rows": [
    {
      "yarn_type_id":"...",
      "yarn_type_name":"...","yarn_color":"...","yarn_composition":"...",
      "purchase_month":0, "consumed_month":0, "sales_month":0,
      "stock_accumulated":0
    }
  ],
  "kpis": { "totalPurchase":0,"totalConsumed":0,"totalSales":0,"totalStock":0 }
}
```

Algoritmo SQL espelhando §6.3 de `docs/Invoices.md`:

```
endDate := CASE WHEN p_month='all' THEN '9999-12-31'::date
                ELSE (date_trunc('month', to_date(p_month||'-01','YYYY-MM-DD'))
                      + interval '1 month - 1 day')::date END;

WITH
 purchases AS (
   SELECT ii.yarn_type_id,
          SUM(CASE WHEN p_month='all' OR substring(i.issue_date,1,7)=p_month
                   THEN ii.weight_kg ELSE 0 END)                                       AS purchase_month,
          SUM(CASE WHEN i.issue_date <= to_char(endDate,'YYYY-MM-DD')
                   THEN ii.weight_kg ELSE 0 END)                                       AS stock_purchase
     FROM invoice_items ii
     JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.company_id = p_company_id AND i.status <> 'cancelada' AND i.type = 'entrada'
      AND ii.yarn_type_id IS NOT NULL
    GROUP BY ii.yarn_type_id
 ),
 sales AS ( -- análoga com i.type = 'venda_fio' devolvendo sales_month e stock_sales
   SELECT ii.yarn_type_id, 0::numeric AS sales_month, 0::numeric AS stock_sales
     FROM invoice_items ii WHERE false GROUP BY ii.yarn_type_id
 ),
 consumption AS (
   SELECT a.yarn_type_id,
          SUM(CASE WHEN p_month='all' OR substring(p.date,1,7)=p_month
                   THEN p.weight_kg ELSE 0 END)                                        AS consumed_month,
          SUM(CASE WHEN p.date <= to_char(endDate,'YYYY-MM-DD')
                   THEN p.weight_kg ELSE 0 END)                                        AS stock_consumed
     FROM productions p
     JOIN articles a ON a.id = p.article_id
    WHERE p.company_id = p_company_id AND a.yarn_type_id IS NOT NULL
    GROUP BY a.yarn_type_id
 )
SELECT yt.id, yt.name, yt.color, yt.composition,
       COALESCE(pu.purchase_month,0), COALESCE(co.consumed_month,0), COALESCE(sa.sales_month,0),
       COALESCE(pu.stock_purchase,0) - COALESCE(co.stock_consumed,0) - COALESCE(sa.stock_sales,0)
  FROM yarn_types yt
  LEFT JOIN purchases   pu ON pu.yarn_type_id = yt.id
  LEFT JOIN sales       sa ON sa.yarn_type_id = yt.id
  LEFT JOIN consumption co ON co.yarn_type_id = yt.id
 WHERE yt.company_id = p_company_id
   AND (p_yarn_type_id IS NULL OR yt.id = p_yarn_type_id)
 ORDER BY yt.name;
```

- Regra idêntica ao JS: acumulado ignora filtro de mês (representa estoque real ao final do período).
- Consumo depende de `article.yarn_type_id` (mesma armadilha documentada em `mem://logic/yarn-balance-calculation`).

#### 3.3 `get_yarn_sales_report_export` (PDF venda_fio)

```
get_yarn_sales_report_export(
  p_company_id uuid,
  p_month  text default 'all',
  p_status text default 'all',
  p_search text default null
) RETURNS jsonb
```

Retorno já agregado no formato que `generateYarnSalesReportPdf` consome: `{ invoices:[…], items:[…], kpis:{…} }`. Elimina a necessidade de recarregar todos os itens no cliente para gerar o PDF.

### Fase 4 — Escritas atômicas (padrão `finalize_*` da Mecânica / `save_outsource_*`)

Objetivo: mover mutações para funções `SECURITY DEFINER` com validação server-side e idempotência (`{ok:true, already:true}` em double-click).

| RPC | Substitui hoje |
|-----|----------------|
| `save_invoice(p_id uuid null, p_payload jsonb, p_items jsonb, p_author_name text, p_author_code text)` | `handleSaveInvoice` (INSERT `invoices` + INSERT `invoice_items` em cascata) |
| `confirm_invoice(p_id uuid, p_author_name text, p_author_code text)` | `handleConfirmInvoice` (`UPDATE status='conferida'`) |
| `cancel_invoice(p_id uuid, p_author_name text, p_author_code text)` | `handleCancelInvoice` — regra "type='entrada' ⇒ DELETE físico; demais ⇒ status='cancelada'" **dentro da RPC** |
| `save_yarn_type(p_id uuid null, p_payload jsonb, p_author_name text, p_author_code text)` | `handleSaveYarn` |
| `delete_yarn_type(p_id uuid, p_author_name text, p_author_code text)` | `handleDeleteYarn` |
| `save_outsource_yarn_stock(p_id uuid null, p_payload jsonb, p_author_name text, p_author_code text)` | `handleSaveEft` — em `p_id=null`, faz **upsert** com `ON CONFLICT (company_id, outsource_company_id, yarn_type_id, reference_month)`; em `p_id<>null`, `UPDATE quantity_kg + observations` |
| `delete_outsource_yarn_stock(p_id uuid, p_author_name text, p_author_code text)` | `handleDeleteEft` |

Todas as escritas:

- `SELECT ... FOR UPDATE` na linha alvo em updates/deletes.
- Retornam `{ok:true, already:true}` quando o registro já não existe (anti double-click).
- Validam payload dentro da RPC (data ±5 anos, `access_key` 44 dígitos numéricos, itens com `weight_kg > 0`, tipo compatível com `yarn_type_id`/`article_id`), devolvendo `RAISE EXCEPTION` com mensagem amigável (consumida pelo `getFriendlyErrorMessage`).
- `save_invoice` grava **em uma única transação**: `INSERT invoices RETURNING id` → `INSERT INTO invoice_items SELECT ... FROM jsonb_to_recordset(p_items)`. Update segue mesmo padrão com `DELETE + INSERT` dos itens.
- `save_invoice` preserva o overload de `buyer_name` (fornecedor/cliente/terceiros) e `destination_name` (tinturaria) — só valida presença conforme `p_payload->>'type'`.
- Auditoria (`audit_logs`) segue no cliente por enquanto (padrão atual do projeto). Migrar para dentro da RPC pode ser fase 5 opcional.

---

## 4. Refactor no cliente (após cada fase)

### Fase 1
- Remover Q1, Q4 e a chamada pontual Q6. Introduzir `useQuery('invoices_bootstrap', get_invoices_bootstrap)` (staleTime 5 min).
- Repassar `yarnTypes`, `outsourceCompanies`, `availableMonths*` para as sub-abas via props/context local.

### Fase 2
- Substituir Q2 + Q3 por `useQuery(['invoices_list', type, filters, page], get_invoices_list)` com **debounce 300 ms** na busca. Página atual guardada por aba.
- Substituir Q5 por `useQuery(['outsource_yarn_stock_list', filters], get_outsource_yarn_stock_list)`. Deletar `eftGroups`/`eftKpis` do JS.
- Header/KPIs por aba vêm prontos no `rows.kpis` da própria RPC — sem `useMemo` extra.
- **Deletar os dois loops `while(hasMore)`**.

### Fase 3
- Aba `saldo`: substituir `yarnBalance`/`saldoBrandOptions`/`saldoKpis` por `useQuery(['yarn_balance_by_brand', filters], get_yarn_balance_by_brand)`.
- Aba `saldoGlobal`: substituir `yarnGlobalBalance`/`saldoGlobalKpis` por `useQuery(['yarn_global_balance', filters], get_yarn_global_balance)`. Remove a dependência de `productions` e `articles` in-memory.
- Botão "Exportar" (venda_fio) chama `get_yarn_sales_report_export` sob demanda, sem depender da lista já carregada.

### Fase 4
- Todas as `useMutation` viram `(supabase.rpc as any)('save_*'/'delete_*'/'confirm_*'/'cancel_*', {...})`.
- Remover validações de duplicidade/formato no cliente que a RPC passar a cobrir (mantém apenas UX imediata — ex.: desabilitar botão enquanto salva).
- Após sucesso, `queryClient.invalidateQueries` só nas chaves relevantes: `['invoices_list', type]`, `['yarn_balance_by_brand']`, `['yarn_global_balance']`, `['outsource_yarn_stock_list']`, `['invoices_bootstrap']` (quando fio novo/removido).
- Tratar `already:true` para não duplicar `logAction`/toast.

---

## 5. Realtime e cache

- Introduzir Realtime opcional em `invoices`, `invoice_items`, `outsource_yarn_stock`, `yarn_types` (padrão `mem://features/ofr-realtime` — `publication` + `REPLICA IDENTITY FULL` + canal). Handlers invalidam as queries das RPCs em vez de mutar arrays locais.
- `staleTime` sugerido: 30 s listas, 60 s saldos, 5 min bootstrap.
- **Acoplamento com Terceirizado:** `outsource_yarn_stock` também é escrita por `_adjust_outsource_yarn_stock` (Fase 4 de `rpcoutsource.md`) — o Realtime resolve a corrida entre as duas telas sem F5.

---

## 6. Segurança e RLS

- Nenhuma alteração em RLS/policies. RPCs são `SECURITY DEFINER` mas sempre filtram por `p_company_id` recebido; o cliente injeta `user.company_id` como já faz hoje.
- `GRANT EXECUTE` para `anon, authenticated, service_role` em todas — mesmo padrão de Mecânica/Relatórios/Terceirizado.
- `canSeeFinancial` continua sendo aplicado **no cliente** (esconde R$ em KPIs, colunas e no PDF) — RPC devolve os números; a UI decide o que renderizar.

---

## 7. Pontos de atenção específicos desta migração

1. **`issue_date` é `text`.** Todas as comparações por mês devem usar `substring(issue_date,1,7)` (mesma armadilha corrigida em `get_outsource_bootstrap`, registrada em `docs/mestre.md`). Comparações de intervalo por dia (`>=/<=`) funcionam por causa do formato `YYYY-MM-DD` ordenável lexicograficamente.
2. **NF cancelada = ignorada** em saldos e KPIs — condição `status <> 'cancelada'` em todas as agregações.
3. **Excluir NF de entrada é DELETE físico e não estorna `invoice_items`** — `cancel_invoice` deve preservar essa regra (deleta a NF e deixa itens órfãos; a leitura tolera via snapshot `yarn_type_name`).
4. **Marca (`brand`) é a chave do saldo por marca** — não confundir com `yarn_type_id` na RPC 3.1.
5. **`buyer_name` overloaded** (fornecedor/cliente/terceiros conforme `type`) — a RPC de save valida a presença do campo certo conforme o tipo, mas grava sempre em `buyer_name` para preservar o schema atual. Refactor de coluna fica fora deste plano.
6. **`upsert` do Fio Terceiros** (Fase 4, `save_outsource_yarn_stock`) precisa manter `ON CONFLICT (company_id, outsource_company_id, yarn_type_id, reference_month) DO UPDATE` — chave já existente no banco. Fecha corrida com o helper do Terceirizado.
7. **Aba morta "Estoque de Malha"** (§7 de `docs/Invoices.md`) — não migrar; remover os `useMemo` órfãos durante a Fase 2.
8. **Consumo do Saldo Global depende de `article.yarn_type_id`.** Artigos sem vínculo não são subtraídos — comportamento preservado (mesmo bug/feature do JS).
9. **Auditoria continua no cliente** via `logAction`. Se futuramente migrar para dentro da RPC, seguir o padrão de `finalize_maintenance_order` (parâmetros `p_author_name`/`p_author_code`).

---

## 8. Plano de validação (por fase)

1. `tsgo --noEmit` limpo após cada fase.
2. Comparar payload da RPC contra cálculo JS anterior em pelo menos duas empresas (uma pequena, uma com > 10 k NFs) — KPIs, saldos por marca e saldo global precisam bater centavo a centavo / grama a grama.
3. Rodar `supabase--linter` e resolver avisos ligados às novas funções.
4. Testar Realtime (opcional): inserir NF via outra sessão e ver a lista atualizar sem F5.
5. Testar exportação PDF (venda_fio) antes/depois — mesma quantidade de linhas e mesmos totais.
6. Testar scanner de código de barras (44 dígitos) — não deve ser afetado; segue puramente no cliente.
7. Testar as regras de escrita: NF de entrada excluída suma da lista; NF de saída cancelada continue visível com status `cancelada`; upsert do EFT sobrescreva registros com mesma chave.

---

## 9. Ordem sugerida de entrega

1. **Fase 1** (bootstrap) — ganho imediato de load, baixo risco.
2. **Fase 2** (listas paginadas + EFT agrupado) — resolve o problema dos dois `while(hasMore)`.
3. **Fase 3** (saldo por marca + saldo global + export PDF) — maior ganho de performance percebida (elimina 4 arrays em memória do Saldo Global).
4. **Fase 4** (escritas atômicas + idempotência) — encerra a migração eliminando queries diretas e a corrida do upsert do EFT.

Cada fase é independente: se interrompida, a tela continua funcionando com a mistura RPC + queries antigas (mesmo padrão de `docs/rpcmecanica.md` e `docs/rpcoutsource.md`).

---

## 10. Referências

- `docs/Invoices.md` — documentação factual da página (fonte deste plano).
- `docs/rpcoutsource.md` — modelo de plano em 4 fases; mesmas convenções.
- `docs/rpcmecanica.md`, `docs/rpcreports.md` — referências adicionais de padrão RPC.
- `src/pages/FaturamentoTotal.tsx` + `get_faturamento_total_metrics` — RPC-âncora do padrão.
- `mem://logic/yarn-balance-calculation`, `mem://logic/yarn-type-identification`, `mem://features/ofr-realtime`, `mem://features/scanner-integration`.

*Criado em 18/07/2026 (Brasília). Sem alteração em código/banco.*
