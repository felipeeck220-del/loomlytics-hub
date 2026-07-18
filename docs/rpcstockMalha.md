# Migração para RPCs — Estoque de Malha (`src/pages/StockMalha.tsx`)

> Documento de planejamento. **Não implementar** — descreve, 1:1 no padrão que já funciona em `FaturamentoTotal.tsx` / `docs/rpcreports.md` / `docs/rpcmecanica.md` / `docs/rpcoutsource.md` / `docs/rpcInvoices.md` / `docs/rpcclientInvoices.md`, como migrar todo o processamento pesado de `src/pages/StockMalha.tsx` (~1550 linhas, 4 abas) para RPCs Postgres, mantendo comportamento e telas idênticos. Base factual: `docs/stockMalha.md`.

---

## 1. Diagnóstico da situação atual

Arquivo envolvido: `src/pages/StockMalha.tsx` (~1550 linhas) — abas `estoque`, `propria`, `segunda`, `movimentos`.

Consultas atuais (todas SELECTs paralelos, filtradas/agregadas em JS):

| # | Origem | Tabela | Uso |
|---|--------|--------|-----|
| Q1 | `useQuery invoices_for_stock` | `invoices` (paginado 1000/vez até esgotar) | Apenas `availableMonths` (dropdown) |
| Q2 | `useQuery invoice_items_for_stock` | `invoice_items` (paginado 1000/vez) | Reservado (não usado hoje) |
| Q3 | `useQuery stock_movements_for_stock` | `stock_movements` (paginado 1000/vez, colunas específicas) | Alimenta `malhaEstoque` + `byMachineMap` + `segundaEstoque` |
| Q4 | `useQuery stock_movements_history` | `stock_movements` (LIMIT 500) + joins profiles/billing_orders/clients/articles/machines | Aba Movimentações |
| Q5 | `useQuery stock_cutoff_date` | `company_settings.stock_cutoff_date` | Cutoff aplicado em Q3 |
| Q6 | `useQuery company_info_for_stock_pdf` | `companies` | Header do PDF por artigo |
| Q7 | `useQuery own_stock_articles` | `own_stock_articles` | Aba Própria |
| Q8 | `useQuery own_stock_movements` | `own_stock_movements` + joins (author, outsource) | Aba Própria |
| — | `CompanyDataContext` | `productions`, `articles`, `clients`, `machines`, `yarnTypes` | Cálculo `malhaEstoque`/`byMachineMap` + labels |

Processamentos pesados no cliente:

- `malhaEstoque` — percorre `stock_movements` **inteiro** + `productions` **inteiro** aplicando cutoff, `machine_id` obrigatório, mapa por `(client_id, article_id)`.
- `byMachineMap` — mesma varredura particionada por `machine_id`.
- `segundaEstoque` — mesmo padrão com `is_second_quality=true` (sem cutoff, sem produções).
- `ownSummary` + `ownDetailByArticle` — agrega `own_stock_movements` por artigo próprio + lotes (`yarn_type + of_number + source + outsource_company_id`).
- `availableMonths` — DISTINCT sobre `invoices.issue_date.substring(0,7)`.
- `estoqueKpis`/`segundaKpis`/`ownKpis` — reduces sobre os arrays de grupos.
- Paginação Movimentações 15/página é 100% client-side sobre Q4 (LIMIT 500).
- Leitor de código de barras — não é banco, não migra.

Problemas de escala:

1. Q3 baixa **todas** as movimentações via `while(hasMore)` — inviável em facções com histórico longo.
2. Q1/Q2 baixam NFs e itens inteiros só para descobrir meses — desperdício.
3. Cutoff aplicado em memória — deveria ser filtro no `WHERE` do banco.
4. `malhaEstoque` + `byMachineMap` fazem duas varreduras separadas do mesmo dataset por render.
5. Aba Movimentações usa `LIMIT 500` fixo — quebra em empresas com fluxo alto.
6. `ownSummary` percorre todo o histórico próprio a cada render.

---

## 2. Referência de padrão (obrigatória)

Todas as RPCs devem replicar, 1:1, o padrão consolidado (`get_faturamento_total_metrics`, `get_reports_metrics`, `get_outsource_report_metrics`, `get_invoices_bootstrap`, `get_client_invoices_bootstrap`):

- `LANGUAGE plpgsql` para agregações complexas, `LANGUAGE sql` para leituras simples de metadata.
- `STABLE` (leitura) ou `VOLATILE` (escrita).
- `SECURITY DEFINER` + `SET search_path = public`.
- `GRANT EXECUTE ON FUNCTION public.<name>(...) TO anon, authenticated, service_role;`.
- **Guarda multi-tenant obrigatória** (herança do pente fino de `rpcclientInvoices.md`): validar `p_company_id = public.get_user_company_id()` no topo de toda RPC de leitura (retornar payload vazio se falhar); escritas fazem `SELECT ... FOR UPDATE` + `RAISE EXCEPTION 'Acesso negado'`.
- Retorno **JSON único** (`jsonb`) contendo todos os blocos que a tela precisa.
- Cliente chama via `(supabase.rpc as any)('nome', { p_... })` para não depender do `types.ts` regenerado.
- **Datas como texto** (`productions.date`, `invoices.issue_date`) — comparações lexicográficas funcionam por serem `YYYY-MM-DD`; para mês usar `substring(col,1,7)`.
- Idempotência das escritas via `{ok:true, already:true}` em double-click.

---

## 3. Plano de execução em 4 fases

### Fase 1 — Bootstrap único (leitura A)

Objetivo: substituir Q1, Q2, Q5, Q6, Q7 (metadata + cutoff + empresa + artigos próprios) por **uma** chamada no boot da tela. Elimina os dois loops `while(hasMore)` de NFs e itens.

`get_stock_malha_bootstrap(p_company_id uuid) RETURNS jsonb`

Retorno:

```json
{
  "company":           { "name":"...","logo_url":"..." },
  "cutoff_date":       "2026-01-01",
  "available_months":  ["2026-07","2026-06","2026-05"],
  "own_articles":      [ { "id","name","observations","created_at" } ]
}
```

- `available_months`: `DISTINCT substring(issue_date,1,7)` em `invoices` UNION mês corrente (America/Sao_Paulo), DESC.
- `cutoff_date`: valor bruto de `company_settings.stock_cutoff_date` (pode ser `null`).
- `company`: alimenta `handleExportArticlePdf` sem Q6 on-demand.
- `own_articles`: registry pequeno reaproveitado direto pela aba Própria.
- staleTime 5 min.

### Fase 2 — Estoque consolidado e listas paginadas (leitura B)

Objetivo: substituir Q3, Q4 e os `useMemo` `malhaEstoque` + `byMachineMap` + `segundaEstoque` + `ownSummary`/`ownDetailByArticle` por RPCs específicas por aba.

#### 2.1 `get_stock_malha_estoque` (aba Estoque, 1ª qualidade)

```
get_stock_malha_estoque(
  p_company_id     uuid,
  p_client_id      uuid  default null,
  p_article_id     uuid  default null,
  p_month          text  default 'all',
  p_entregue_from  date  default null,
  p_entregue_to    date  default null
) RETURNS jsonb
```

Retorno já **agrupado por cliente**, com quebra por máquina embutida:

```json
{
  "groups": [
    {
      "client_id":"...","client_name":"...",
      "articles": [
        {
          "article_id":"...","article_name":"...",
          "produced_kg":0,"produced_rolls":0,
          "delivered_kg":0,"delivered_rolls":0,
          "delivered_kg_total":0,"delivered_rolls_total":0,
          "reserved_kg":0,"reserved_rolls":0,
          "stock_kg":0,"available_kg":0,"available_rolls":0,
          "by_machine": [
            { "machine_id":"...","machine_name":"TEAR 12",
              "produced_kg":0,"produced_rolls":0,
              "delivered_kg_total":0,"delivered_rolls_total":0,
              "reserved_kg":0,"reserved_rolls":0,
              "stock_kg":0,"available_rolls":0 }
          ]
        }
      ],
      "totals": { "produced_kg":0,"delivered_kg":0,"reserved_kg":0,"available_kg":0 }
    }
  ],
  "kpis": {
    "producedKg":0,"deliveredKg":0,"physicalKg":0,
    "physicalRolls":0,"reservedKg":0,"availableKg":0
  }
}
```

Algoritmo SQL espelhando §7.1 e §7.2 de `docs/stockMalha.md` (CTEs `cutoff` → `prod` → `mov` → `mov_agg`), aplicando:

- `productions` filtrado por `machine_id IS NOT NULL` e `date >= cutoff`.
- `stock_movements` filtrado por `machine_id IS NOT NULL`, `is_second_quality = false`, `created_at::date >= cutoff`.
- Regra de tipos (idêntica ao JS):
  - `adjust_in` → +Produzido; `adjust_out` → −Produzido.
  - `in` sem `billing_order_id` → +Produzido (entrada manual).
  - `in` com `billing_order_id` → −EntregueTotal (estorno OF).
  - `out` → +EntregueTotal.
  - `reserve`/`release` → +/−Reservado.
- `delivered_kg`/`delivered_rolls` respeitam `p_entregue_from`/`p_entregue_to`; `delivered_kg_total`/`_rolls_total` são acumulados (base de Físico/Disponível).
- `stock_kg = produced_kg − delivered_kg_total`, `available_kg = stock_kg − reserved_kg`.
- Ordena grupos por `client_name`, artigos por `article_name`, máquinas por `number`.
- **NFs de saída não descontam** — nenhuma referência a `invoices` no cálculo.

#### 2.2 `get_stock_malha_segunda` (aba 2ª Qualidade)

```
get_stock_malha_segunda(
  p_company_id uuid,
  p_client_id  uuid default null,
  p_article_id uuid default null,
  p_month      text default 'all'
) RETURNS jsonb
```

- Fonte única: `stock_movements` com `is_second_quality = true`.
- Sem cutoff, sem produções.
- `in`/`adjust_in` = Entrada; `out`/`adjust_out` = Saída; Saldo = Entrada − Saída.
- Mesmo formato de 2.1 com colunas `entrada_kg/entrada_rolls/saida_kg/saida_rolls/saldo_kg/saldo_rolls`.

#### 2.3 `get_own_stock_summary` (aba Própria)

```
get_own_stock_summary(
  p_company_id uuid,
  p_article_id uuid default null,
  p_month      text default 'all'
) RETURNS jsonb
```

Retorno agrupado por artigo próprio com lotes desagregados por `(yarn_type, of_number, source, outsource_company_id)` — 1:1 com o JS atual.

#### 2.4 `get_stock_malha_movements` (aba Movimentações)

```
get_stock_malha_movements(
  p_company_id uuid,
  p_type       text default 'all',
  p_second     boolean default null,
  p_from       date default null,
  p_to         date default null,
  p_page       int  default 1,
  p_page_size  int  default 15
) RETURNS jsonb
```

Retorno com joins já resolvidos:

```json
{
  "rows": [
    {
      "id":"...","created_at":"...","type":"out","is_second_quality":false,
      "weight_kg":0,"pieces":0,"reason":"...",
      "author":{"id":"...","name":"...","short_id":123},
      "billing_order":{"id":"...","of_number":"OF-042"},
      "client":{"id":"...","name":"..."},
      "article":{"id":"...","name":"..."},
      "machine":{"id":"...","number":12,"name":"TEAR 12"}
    }
  ],
  "total_count": 4321
}
```

- Ordena `created_at DESC`.
- Elimina o `LIMIT 500` fixo e a paginação client-side; janela de 3 páginas continua derivada no cliente a partir de `total_count`.
- Cutoff **não** é aplicado aqui (histórico completo).

### Fase 3 — Auxiliares e export (leitura C)

#### 3.1 `get_stock_malha_article_export` (PDF por artigo)

```
get_stock_malha_article_export(
  p_company_id uuid,
  p_client_id  uuid,
  p_article_id uuid
) RETURNS jsonb
```

Retorna payload pronto para `handleExportArticlePdf`: `{ company, article, client, rows[{machine_number,machine_name,available_rolls,available_kg}], totals }`. Somente máquinas com `available_rolls >= 1`. Handler passa a apenas renderizar via `jsPDF`.

#### 3.2 `get_own_stock_movements_history` (opcional)

Paginação server-side de `own_stock_movements` para futura aba "Histórico Próprio". Mesmo contrato de 2.4.

### Fase 4 — Escritas atômicas

| RPC | Substitui hoje |
|-----|----------------|
| `save_stock_manual_movement(p_payload jsonb, p_author_name text, p_author_code text)` | `ManualStockEntryModal` (INSERT em `stock_movements`, 1ª ou 2ª qualidade) |
| `save_own_stock_article(p_id uuid null, p_payload jsonb, p_author_name text, p_author_code text)` | `OwnStockManualModal` — cadastro de artigo próprio |
| `save_own_stock_movement(p_payload jsonb, p_author_name text, p_author_code text)` | `OwnStockManualModal` — lançamento em `own_stock_movements` |
| `delete_own_stock_movement(p_id uuid, p_author_name text, p_author_code text)` | (futuro) desfazer lançamento próprio |

Regras obrigatórias (padrão `save_client_invoice` / `save_invoice`):

- `SECURITY DEFINER`, `search_path = public`, `GRANT` para `anon, authenticated, service_role`.
- Validação server-side: `p_company_id = get_user_company_id()`, `type IN (...)`, `weight_kg > 0`, `pieces >= 0`, `machine_id` obrigatório para 1ª qualidade, `article_id` pertence à mesma company.
- Em `save_stock_manual_movement`, quando `is_second_quality = true` a validação de `machine_id` afrouxa (reflete o JS atual).
- `SELECT ... FOR UPDATE` em UPDATE/DELETE.
- Retornam `{ok:true, id, action}` ou `{ok:true, already:true}` (anti double-click).
- Auditoria (`audit_logs`) segue no cliente por enquanto — mesmo padrão de Invoices/ClientInvoices.

---

## 4. Refactor no cliente (após cada fase)

### Fase 1
- Remover Q1, Q2, Q5, Q6, Q7. Introduzir `useQuery(['stock_malha_bootstrap', companyId], get_stock_malha_bootstrap)` (staleTime 5 min).
- `availableMonths`, `cutoff_date`, `company`, `own_articles` passam a vir do bootstrap.
- **Deletar os dois loops `while(hasMore)` de NFs e itens.**

### Fase 2
- Aba Estoque: substituir `stockMovementsQuery` + `malhaEstoque` + `byMachineMap` por `useQuery(['stock_malha_estoque', filters], get_stock_malha_estoque)` com **debounce 300 ms**. KPIs vêm prontos no payload.
- Aba 2ª Qualidade: substituir `segundaEstoque` por `useQuery(['stock_malha_segunda', filters], get_stock_malha_segunda)`.
- Aba Própria: substituir `ownSummary`/`ownDetailByArticle` por `useQuery(['own_stock_summary', filters], get_own_stock_summary)`.
- Aba Movimentações: substituir Q4 por `useQuery(['stock_malha_movements', filters, page], get_stock_malha_movements)` — paginação server-side.
- `expandedArticle`/`expandedOwnArticle` permanecem como UI local; só o dado agora vem pronto.

### Fase 3
- `handleExportArticlePdf` passa a chamar `get_stock_malha_article_export` no click. Trava `exportingArticleId` permanece no cliente.

### Fase 4
- `ManualStockEntryModal` e `OwnStockManualModal` migram INSERTs diretos para `supabase.rpc('save_stock_manual_movement'|'save_own_stock_article'|'save_own_stock_movement', ...)`.
- Após sucesso, `queryClient.invalidateQueries` apenas nas chaves relevantes: `['stock_malha_estoque']`, `['stock_malha_segunda']`, `['stock_malha_movements']`, `['own_stock_summary']`, `['stock_malha_bootstrap']` (quando artigo próprio novo).
- Tratar `already:true` para não duplicar `logAction`/toast.
- Emitir `window.dispatchEvent(new Event('stock-movements-changed'))` continua (compat com outros módulos).

---

## 5. Realtime e cache

- Canal `stock-malha-realtime-${companyId}` permanece — handlers passam a invalidar as chaves das RPCs em vez de mutar arrays locais.
- Publicação + `REPLICA IDENTITY FULL` já garantidos para `productions`, `stock_movements`, `own_stock_movements` (memória OFR Realtime). Nenhuma nova tabela entra no consumo.
- `staleTime` sugerido: 30 s listas, 60 s exports, 5 min bootstrap.
- **Acoplamento OF×Estoque:** `stock_movements` também é escrita por `BillingOrders` (coleta de paletes) — o Realtime resolve a corrida sem F5.

---

## 6. Segurança e RLS

- Nenhuma alteração em RLS/policies. RPCs `SECURITY DEFINER` validam `p_company_id = public.get_user_company_id()` no topo (herança do pente fino de `rpcclientInvoices.md`).
- `GRANT EXECUTE` para `anon, authenticated, service_role` em todas.
- `canOwnStock` (aba Própria) continua sendo aplicado no cliente — RPC devolve os números; a UI decide.

---

## 7. Pontos de atenção específicos

1. **`productions.date` é `text`.** Comparações por dia usam `>=/<=` direto (formato `YYYY-MM-DD`). Por mês, `substring(date,1,7)`.
2. **Cutoff obrigatório** em `stock_movements` **e** `productions` — nunca em apenas um dos dois; a divergência quebra Físico.
3. **`machine_id` obrigatório** em 1ª qualidade — filtrar `IS NOT NULL` em ambos.
4. **NFs de saída não descontam** — nenhuma RPC do estoque referencia `invoices`/`invoice_items`.
5. **Range Entregue é independente do Físico** — `delivered_*_range` afeta apenas colunas visíveis; `delivered_*_total` alimenta `stock_kg`.
6. **2ª qualidade não usa cutoff nem produções** — RPC 2.2 totalmente separada de 2.1.
7. **`in` com `billing_order_id`** = estorno OF ⇒ subtrai de `delivered_*`; **`in` sem `billing_order_id`** = entrada manual ⇒ soma em `produced_*`. Inverter isso quebra o estoque.
8. **`reserve`/`release`** afetam apenas `reserved_*` — não entram em `produced_*` nem em `delivered_*`.
9. **Aba Movimentações mostra tudo** (inclusive < cutoff) — cutoff não é aplicado em 2.4.
10. **`own_stock_movements.source`** ∈ (`internal`,`outsource`) — RPC 2.3 precisa `LEFT JOIN outsource_companies` sem quebrar quando `outsource_company_id IS NULL`.
11. **Auditoria** continua no cliente (padrão atual).
12. **Idempotência** (Fase 4): `save_stock_manual_movement` sem PK natural de dedupe — `disabled` no botão + `SELECT FOR UPDATE` bastam por ora.
13. **`canSeeFinancial` não existe aqui** — Estoque de Malha não expõe R$; sem mascaramento.

---

## 8. Checklist de validação (após cada fase)

- [ ] `tsgo --noEmit` limpo.
- [ ] Nenhuma `useQuery` restante fazendo `while(hasMore)` em `invoices`/`invoice_items`/`stock_movements`/`outsource_yarn_stock` **nesta página**.
- [ ] KPIs das 4 abas conferem com o JS antigo em 3 empresas (pequena, média, grande).
- [ ] Filtro range Entregue: `Físico` NÃO muda; `Entregue` muda.
- [ ] Cutoff configurado: movimentações antigas somem dos totais mas continuam em Movimentações.
- [ ] Aba Movimentações paginada além de 500 registros (regressão histórica corrigida).
- [ ] Expand por máquina bate com `by_machine`; total do artigo = soma das máquinas.
- [ ] PDF por artigo mostra apenas máquinas com `available_rolls ≥ 1` e header correto.
- [ ] Aba Própria: entradas lote-a-lote com `yarn_type + of_number + source + outsource_company_name`.
- [ ] Realtime: inserção de OF em outra aba invalida `['stock_malha_estoque']` e a linha atualiza sem F5.
- [ ] Isolamento multi-tenant: tentativa com `p_company_id` de outra empresa devolve payload vazio.
- [ ] `docs/mestre.md` atualizado com o histórico da fase entregue.

---

*Documento criado em 18/07/2026 (Brasília) a partir de `docs/stockMalha.md` e do padrão consolidado em `docs/rpcInvoices.md` / `docs/rpcclientInvoices.md`. Atualize ao concluir cada fase e registre em `docs/mestre.md`.*
