# Migração para RPCs — Módulo Terceirizado (Outsource)

> Documento de planejamento. **Não implementar** — descreve, 1:1 no padrão que já funciona em `FaturamentoTotal.tsx` / `docs/rpcreports.md` / `docs/rpcmecanica.md`, como migrar todo o processamento pesado de `src/pages/Outsource.tsx` e `src/components/outsource/FreightsTab.tsx` para RPCs Postgres, mantendo comportamento e telas idênticos.

---

## 1. Diagnóstico da situação atual

Arquivos envolvidos:

- `src/pages/Outsource.tsx` (2707 linhas) — abas Produções, Malharias, Relatórios e header com KPIs globais.
- `src/components/outsource/FreightsTab.tsx` (816 linhas) — aba Frete completa.

Consultas atuais (todas SELECTs paralelos, filtradas/agregadas em JS):

| # | Origem | Tabela | Uso |
|---|--------|--------|-----|
| Q1 | `Outsource.tsx` boot | `companies` | Nome + logo (`companyName`, `companyLogoUrl`) |
| Q2 | `useQuery outsource_companies` | `outsource_companies` | Lista malharias |
| Q3 | `useQuery outsource_freights` | `outsource_freights + outsource_companies!left(name)` | Fretes com nome da malharia |
| Q4 | `useQuery outsource_productions` | `outsource_productions` | **Paginado 1000 em 1000 até esgotar** — puxa TUDO |
| Q5 | `useQuery articles` | `articles` | Selects de artigo |
| Q6 | `FreightsTab useQuery` | `outsource_freights + outsource_companies!left(name)` | Duplicado de Q3 |
| Q7 | `handleSaveWithValidation` | `outsource_productions` | Checa NF/ROM duplicada por malharia |

Processamentos pesados no cliente:

- `totals` (header) — soma revenue/cost/weight/rolls/freight/profit/loss sobre `displayProductions + filteredFreights`.
- `ProductionsTab.filteredProductions / paginatedProductions / availableMonths` — filtros, busca, paginação.
- `ReportsTab` — `filtered`, `totals` (com histórico de frete embutido em produções antigas via `freight_per_kg`), `filteredFreightsInReport`, `availableMonths`, `availableClients`, ordenação, paginação 20/página, agrupamentos para o PDF por Malharia/Cliente.
- `FreightsTab.filteredFreights / paginatedFreights / availableMonths` — filtros + paginação.
- Mapeamento de `total_revenue`/`total_cost`/`total_profit` com regra de frete histórico (`freight_per_kg` na própria produção antiga) + frete novo em `outsource_freights`.

Problemas de escala:

1. Q4 baixa **todas** as produções da empresa (loop paginado) — inviável em empresas com muitos meses.
2. `Relatórios` recalcula tudo em memória a cada mudança de filtro.
3. `FreightsTab` refaz a query de fretes que `Outsource.tsx` já fez (Q3 e Q6 duplicados).
4. KPIs do header dependem de todas as produções, mesmo quando o usuário só está na aba Malharias.

---

## 2. Referência de padrão (obrigatória)

Todas as RPCs devem replicar, 1:1, o padrão de `get_faturamento_total_metrics` / `get_reports_metrics`:

- `LANGUAGE plpgsql` para agregações complexas, `LANGUAGE sql` para leituras simples de metadata.
- `STABLE` (leitura) ou `VOLATILE` (escrita).
- `SECURITY DEFINER` + `SET search_path = public`.
- `GRANT EXECUTE ON FUNCTION public.<name>(...) TO anon, authenticated, service_role;`.
- Retorno **JSON único** (`jsonb`) contendo todos os blocos que a tela precisa (`kpis`, `list`, `by_*`, `evolution`…).
- Isolamento por `p_company_id` sempre no primeiro `WHERE`.
- Enriquecimento no cliente permitido só para labels de tradução (turnos, cores) — números vêm prontos.
- Cliente chama via `(supabase.rpc as any)('nome', { p_... })` para evitar dependência de types regenerados.

---

## 3. Plano de execução em 4 fases

### Fase 1 — Bootstrap único (leitura A)

Objetivo: substituir Q1+Q2+Q5 e o resumo mínimo por **uma** chamada no boot da tela.

`get_outsource_bootstrap(p_company_id uuid) RETURNS jsonb`

Retorna:

```json
{
  "company":   { "name": "...", "logo_url": "..." },
  "companies": [ { "id","name","cnpj","phone","address","observations","created_at" } ],
  "articles":  [ { "id","name","client_id","client_name" } ],
  "available_months": ["2026-07","2026-06", ...]
}
```

- `available_months` extraído de `DISTINCT to_char(date,'YYYY-MM')` sobre `outsource_productions` UNION `outsource_freights`, filtrando `date BETWEEN '2020-01-01' AND '2099-12-31'`, `ORDER BY 1 DESC`.
- `articles` vem com `client_name` via `LEFT JOIN clients`.
- Payload pequeno (metadata).

### Fase 2 — Listas paginadas server-side (leitura B)

Objetivo: eliminar o `while (hasMore)` de Q4. Três abas ganham RPCs próprias que retornam página + totals filtrados.

#### 2.1 `get_outsource_productions_list`

```
get_outsource_productions_list(
  p_company_id uuid,
  p_start_date date default null,
  p_end_date   date default null,
  p_month      text default null,          -- 'YYYY-MM'
  p_search     text default null,          -- malharia/artigo/cliente/nf_rom (ILIKE)
  p_page       int  default 1,
  p_page_size  int  default 20
) RETURNS jsonb
```

Retorno:

```json
{
  "rows": [ { "...produção", "outsource_company_name":"...", "total_revenue":0, "total_cost":0, "total_profit":0, "freight_per_kg":0 } ],
  "total_count": 1234,
  "totals": { "revenue":0, "cost":0, "weight":0, "rolls":0, "historical_freight":0 }
}
```

- Cálculos idênticos ao mapper JS atual (`weight_kg * client_value_per_kg`, etc.).
- Ordenação padrão `date DESC, id ASC`.
- `p_search` via `ILIKE '%'||p_search||'%'` em `outsource_company_name/article_name/client_name/nf_rom`.

#### 2.2 `get_outsource_freights_list`

```
get_outsource_freights_list(
  p_company_id uuid,
  p_start_date date default null,
  p_end_date   date default null,
  p_month      text default null,
  p_outsource_company_id uuid default null,
  p_search     text default null,
  p_page       int  default 1,
  p_page_size  int  default 20
) RETURNS jsonb
```

Retorno análogo: `{ rows, total_count, totals: { total_freight, total_weight } }`, com `outsource_company_name` resolvido (fallback `'Avulso'` quando null).

#### 2.3 `get_outsource_kpis` (header global)

```
get_outsource_kpis(
  p_company_id uuid,
  p_start_date date default null,
  p_end_date   date default null,
  p_month      text default null
) RETURNS jsonb
```

Retorna o objeto `totals` que hoje o `useMemo` do header monta (`totalRevenue/Cost/Profit/Weight/Rolls/Loss/Freight`), aplicando a mesma regra: `totalFreight = historicalFreight + newFreight`, `totalLoss` só de linhas com `profit < 0`.

### Fase 3 — Relatórios (leitura C, agregação pesada)

Objetivo: replicar em SQL o que o `ReportsTab` monta em JS. Padrão idêntico a `get_reports_metrics`.

#### 3.1 `get_outsource_report_metrics`

```
get_outsource_report_metrics(
  p_company_id uuid,
  p_start_date date,
  p_end_date   date,
  p_month      text default null,
  p_outsource_company_id uuid default null,
  p_client_name text default null,
  p_profit_filter text default 'all'       -- 'all' | 'profit' | 'loss'
) RETURNS jsonb
```

Retorno:

```json
{
  "kpis": { "revenue":0,"cost":0,"profit":0,"finalProfit":0,"weight":0,"rolls":0,"freight":0,"loss":0 },
  "by_company": [ { "outsource_company_id":"...","name":"...","weight":0,"rolls":0,"revenue":0,"cost":0,"freight":0,"profit":0 } ],
  "by_client":  [ { "client_name":"...","weight":0,"rolls":0,"revenue":0,"cost":0,"freight":0,"profit":0 } ],
  "by_article": [ { "article_id":"...","article_name":"...","weight":0,"rolls":0,"revenue":0,"cost":0,"profit":0 } ],
  "evolution":  [ { "date":"YYYY-MM-DD","weight":0,"revenue":0,"cost":0,"profit":0 } ],
  "available_clients": [ "Cliente A","Cliente B" ]
}
```

- `freight` respeita a regra híbrida: histórico (`p.freight_per_kg * weight_kg`) + novo (`outsource_freights` filtrado pelo mesmo período/malharia).
- `evolution` usa `generate_series(p_start_date, p_end_date, '1 day')` LEFT JOIN produções.

#### 3.2 `get_outsource_report_list`

```
get_outsource_report_list(
  ...mesmos filtros de 3.1...,
  p_page int default 1,
  p_page_size int default 20
) RETURNS jsonb
```

Retorno `{ rows, total_count }` com as colunas da tabela do relatório (inclui `total_profit` já com frete deduzido).

#### 3.3 `get_outsource_report_export`

```
get_outsource_report_export(
  ...mesmos filtros...,
  p_group_by text default 'malharia'       -- 'malharia' | 'cliente'
) RETURNS jsonb
```

Retorna estrutura já agrupada que o PDF consome hoje (`{ groups: [ { key,label,rows,subtotals } ], grand_totals }`). Elimina agrupamento JS.

### Fase 4 — Escritas atômicas (padrão `finalize_*` da Mecânica)

Objetivo: mover mutações para funções `SECURITY DEFINER` com validação server-side, como `finalize_maintenance_order` / `save_needle_lot`.

| RPC | Substitui hoje |
|-----|----------------|
| `save_outsource_production(p_id uuid null, p_payload jsonb, p_items jsonb, p_author_name text, p_author_code text)` | `saveMutation` (inclui checagem de NF/ROM duplicada por malharia + insert/update) |
| `delete_outsource_production(p_id uuid, p_author_name text, p_author_code text)` | delete atual |
| `save_outsource_freight(p_id uuid null, p_payload jsonb, p_author_name text, p_author_code text)` | `FreightsTab.saveMutation` |
| `delete_outsource_freight(p_id uuid, p_author_name text, p_author_code text)` | delete de fretes |
| `save_outsource_company(p_id uuid null, p_payload jsonb, p_author_name text, p_author_code text)` | CRUD malharias |
| `delete_outsource_company(p_id uuid, p_author_name text, p_author_code text)` | delete malharia (`RAISE` se houver produções/fretes vinculados) |

Todas as escritas:

- `SELECT ... FOR UPDATE` na linha alvo em updates/deletes.
- Retornam `{ok:true, already:true}` quando o registro já não existe (idempotência anti double-click).
- Validam NF/ROM duplicada dentro da RPC (elimina Q7 e a corrida entre validação e insert).
- Preservam `created_by_name/code` / `updated_at`.
- Cliente só chama `logAction`/push quando `already:false`.

---

## 4. Refactor no cliente (após cada fase)

### Fase 1
- Remover Q1, Q2, Q5. Introduzir `useQuery('outsource_bootstrap', ...)` que chama `get_outsource_bootstrap`.
- Repassar `companies`/`articles`/`availableMonths` por props (evita re-fetches em subtelas).

### Fase 2
- `ProductionsTab`: substituir `productions` global + `filteredProductions` + `paginatedProductions` por `useQuery(['outsource_productions_list', filters, page], get_outsource_productions_list)`. Debounce 300 ms na busca.
- `FreightsTab`: mesma substituição via `get_outsource_freights_list` (elimina duplicidade Q3/Q6).
- Header: consumir `get_outsource_kpis` (independente do dataset completo).
- Deletar Q4 (`while(hasMore)`).

### Fase 3
- `ReportsTab`: substituir `filtered`, `totals`, `filteredFreightsInReport`, `availableClients` por `useQuery(get_outsource_report_metrics)` + `useQuery(get_outsource_report_list, page)`. Botão "Exportar PDF" chama `get_outsource_report_export`.
- Remover `useMemo` de agregação/ordenação (ficam só formatadores).

### Fase 4
- `useMutation` viram `(supabase.rpc as any)('save_*'/'delete_*', {...})`.
- Remover pre-checks de duplicidade.
- Após sucesso: `queryClient.invalidateQueries` só nas chaves relevantes (`outsource_productions_list`, `outsource_kpis`, `outsource_report_metrics`…).

---

## 5. Realtime e cache

- Manter Realtime em `outsource_productions`, `outsource_freights`, `outsource_companies`. Handlers passam a invalidar as queries das RPCs em vez de mutar arrays locais.
- `staleTime` sugerido: 30 s listas, 60 s KPIs, 5 min bootstrap.

## 6. Segurança e RLS

- Nenhuma alteração em RLS/policies. RPCs são `SECURITY DEFINER` mas sempre filtram por `p_company_id` recebido; cliente injeta `user.company_id`.
- `GRANT EXECUTE` para `anon, authenticated, service_role` em todas — mesmo padrão da Mecânica e Relatórios.

## 7. Plano de validação

Por fase:

1. `tsgo --noEmit` limpo.
2. Comparar payload da RPC contra cálculo JS anterior em pelo menos duas empresas (uma pequena, uma com >10k produções) — KPIs precisam bater centavo a centavo.
3. Rodar `supabase--linter` e resolver avisos ligados às novas funções.
4. Testar Realtime: inserir produção/frete via outra sessão e ver listas atualizarem sem F5.
5. Testar exportação PDF antes/depois — mesma quantidade de linhas e mesmos totais.

## 8. Ordem sugerida de entrega

1. **Fase 1** (bootstrap) — ganho imediato de load, baixo risco.
2. **Fase 2** (listas + KPIs paginados) — resolve o problema do `while(hasMore)`.
3. **Fase 3** (relatórios agregados) — maior ganho de performance percebida.
4. **Fase 4** (escritas atômicas) — encerra a migração eliminando queries diretas.

Cada fase é independente: se interrompida, a tela continua funcionando com a mistura RPC + queries antigas (mesmo padrão de `docs/rpcmecanica.md`).
