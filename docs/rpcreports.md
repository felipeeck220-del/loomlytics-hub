# RPCREPORTS.MD — RPCs de Relatórios (padrão FaturamentoTotal)

Reformulado para replicar o padrão que já funcionou em `FaturamentoTotal.tsx` /
`get_faturamento_total_metrics`: **uma única RPC** que devolve todo o payload
necessário como `JSON`, `LANGUAGE plpgsql`, `STABLE`, `SECURITY DEFINER`,
`SET search_path = public`, `GRANT EXECUTE ... TO anon, authenticated, service_role`.

Objetivo: eliminar o `useEffect` do `Reports.tsx` que hoje itera a tabela
`productions` inteira no cliente. Os algoritmos são preservados 1:1 — apenas
migrados para SQL.

## Diretrizes gerais
- Prefixo `p_` em todos os parâmetros (mesmo padrão do faturamento).
- Sempre filtrar por `company_id`.
- Datas em `productions.date` são texto `YYYY-MM-DD`; usar comparações lexicográficas
  (`>= p_start_date::text` etc.) para bater com o comportamento atual do cliente.
- `NULL` em filtros opcionais = "todos".
- Retornar `JSON` (não `JSONB`), consumido com `(supabase.rpc as any)(...)` para
  driblar tipos gerados desatualizados — igual FaturamentoTotal.

## RPCs

### 1. `get_reports_available_months(p_company_id UUID) → JSON`
Espelho de `get_faturamento_available_months`. Retorna `[{ "month_str": "YYYY-MM" }]`
distinto e ordenado desc, usado no dropdown de mês.

### 2. `get_reports_metrics(p_company_id, p_start_date, p_end_date, p_shift, p_machine_id, p_client_id, p_article_id) → JSON`

Payload único com todas as métricas do topo e das 5 abas. Todos os filtros
opcionais aceitam `NULL`.

Estrutura de retorno:

```json
{
  "kpis": {
    "total_rolls": number,
    "total_weight": number,
    "total_revenue": number,
    "active_days": number,
    "avg_efficiency": number
  },
  "by_shift":   [{ "shift", "rolos", "kg", "faturamento", "eficiencia", "pct_rolls", "pct_revenue" }],
  "by_machine": [{ "machine_id", "name", "rolos", "kg", "faturamento", "eficiencia", "pct_rolls", "pct_revenue", "article_names", "article_ids" }],
  "by_client":  [{ "name", "rolos", "kg", "faturamento", "pct_rolls", "pct_kg", "pct_revenue" }],
  "by_article": [{ "id", "name", "client_name", "rolos", "kg", "faturamento", "eficiencia", "pct_rolls", "pct_kg", "pct_revenue" }],
  "evolution":  [{ "date", "rolos", "kg", "faturamento" }]
}
```

Regras preservadas (idênticas ao JS atual):
- **KPIs**: somas simples de `rolls_produced`, `weight_kg`, `revenue`;
  `active_days = COUNT(DISTINCT date)`;
  `avg_efficiency = SUM(efficiency*weight_kg) / SUM(weight_kg)` restrito a
  `rolls_produced > 0`.
- **by_shift**: sempre devolve as três chaves `manha`, `tarde`, `noite`
  (mesmo com zero) — o cliente aplica o label da empresa.
- **by_machine**: agrupa por `COALESCE(machine_id::text, machine_name)`;
  `article_names` = string separada por vírgula dos `article_name` distintos;
  `article_ids` = array dos ids distintos (o cliente calcula `target_efficiency`
  média a partir de `articles` já carregado no contexto, para não puxar essa
  coluna de novo).
- **by_client**: `LEFT JOIN articles ON articles.id = p.article_id
  LEFT JOIN clients ON clients.id = articles.client_id`; nome vira `'Diversos'`
  quando nulo.
- **by_article**: chave = `article_name`; `client_name` via mesmo join;
  `id = COALESCE(article_id::text, name)`.
- **Eficiência ponderada** (`by_shift`, `by_machine`, `by_article`):
  `SUM(efficiency*weight_kg) FILTER (WHERE rolls_produced > 0)
   / NULLIF(SUM(weight_kg) FILTER (WHERE rolls_produced > 0), 0)`.
- **evolution**: agrupa por `date` (texto), ordenado asc; formatação `dd/MM`
  é feita no cliente para preservar o comportamento atual.
- **Percentuais**: calculados sobre os totais do próprio período filtrado.

### 3. `get_reports_podio(p_company_id, p_start_date, p_end_date) → JSON`

Retorna o pódio por turno (janela independente dos filtros gerais):

```json
{
  "ranking": [{ "id", "name", "rolos", "kg", "eficiencia" }],
  "daily":   [{ "date", "ranking": [ ... ] }]
}
```

- `ranking` = agregado por `shift` no período, ordenado desc por `eficiencia`
  (mesma fórmula ponderada, `rolls_produced > 0`).
- `daily` = mesma agregação por dia; o cliente cuida do label do turno e da
  formatação de data. Cobrir todos os dias do intervalo (mesmo sem produção)
  via `generate_series(p_start_date, p_end_date, '1 day')`.

## Exportação (`handleExport`)
Permanece 100% no cliente — consome os arrays retornados pelas RPCs, sem
recomputar nada. Regras de permissão (Admin vs Employee) e formatos (PDF/CSV)
não mudam.

## Ganhos esperados
- Remove ~150 linhas de agregação em JS no boot do módulo.
- Deixa `Reports.tsx` independente de `productions` inteiro no contexto,
  destravando o corte da janela de 90 dias no `useCompanyData`.
- Latência típica esperada: <300 ms por chamada em empresa grande (índice
  `productions(company_id, date)`).

---
*Última atualização: 17/07/2026 (Brasília) — reformulado no padrão FaturamentoTotal.*
