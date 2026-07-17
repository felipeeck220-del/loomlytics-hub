# RPCMECANICA.MD — RPCs do módulo Mecânica (padrão FaturamentoTotal / Reports)

> **Somente documentação.** Nada implementado ainda. Este arquivo descreve
> 1:1 como migrar `src/pages/Mecanica.tsx` (5.144 linhas + 3 componentes) para
> RPCs no mesmo padrão que já funcionou em `get_faturamento_total_metrics` e
> `get_reports_metrics`: `LANGUAGE plpgsql`, `STABLE` (leitura) ou `VOLATILE`
> (escrita atômica), `SECURITY DEFINER`, `SET search_path = public`,
> `GRANT EXECUTE ... TO anon, authenticated, service_role`, payload `JSON`
> único consumido no cliente com `(supabase.rpc as any)(...)`.

## 1. Diagnóstico atual

`Mecanica.tsx` faz **hoje** 40+ chamadas `supabase.from(...)` diretas e os 3
componentes filhos (`MaintenanceOrdersTab`, `MaintenanceMovementsTab`,
`ArticleChangeOrdersTab`) somam mais 43. Total ~ **83 idas ao banco**
distribuídas em:

- **Boot do módulo** (`loadAllData` interno + `useEffect` de cada aba):
  needle_providers, needle_provider_prices, needle_lots, needle_transactions,
  sinker_providers, sinker_provider_prices, sinker_lots, sinker_transactions,
  machine_maintenance_observations, maintenance_orders, maintenance_order_items,
  article_change_orders, article_change_yarns, machine_needle_refs,
  machine_sinker_refs, cylinders (herdados de `useCompanyData`), machines
  (idem), profiles (para nomes de autor em OM/OC).
- **Detalhes de máquina**: monta timeline de OMs/OCs/OTs juntando 3 tabelas
  em JS.
- **Calendário**: itera `maintenance_orders` + `article_change_orders` no
  cliente para pintar dias.
- **Escritas críticas** (OM/OC/OT finalizar): sequência não-atômica de 5-8
  UPDATEs/INSERTs em `maintenance_orders`, `maintenance_order_items`,
  `machines`, `machine_logs`, `needle_transactions`, `sinker_transactions`,
  `machine_needle_refs`, `machine_sinker_refs`, `cylinders` — risco de
  estado inconsistente se falhar no meio (foi origem do bug de status
  travado corrigido em 17/07/2026).

## 2. Diretrizes gerais

- Prefixo `p_` em todos os parâmetros.
- Sempre filtrar por `p_company_id` no corpo da função (defesa em
  profundidade sobre a RLS).
- Datas: colunas `TIMESTAMPTZ` no schema; parâmetros aceitam `TIMESTAMPTZ`
  ou `TEXT` ISO e o corpo faz `::timestamptz`.
- `NULL` = "todos" em qualquer filtro opcional.
- Retornar `JSON` (não `JSONB`) para bater com o padrão dos outros módulos.
- Escritas: uma única RPC por **fluxo de negócio** (não por tabela); tudo
  dentro do mesmo bloco `BEGIN ... END` para atomicidade e para eliminar o
  vai-e-vem cliente<->banco.
- Callers no cliente: substituir a série de `supabase.from(...)` por
  `(supabase.rpc as any)('nome_rpc', { p_... })`.

## 3. RPCs de LEITURA (consolidam o boot e cada aba)

### 3.1 `get_mecanica_bootstrap(p_company_id) -> JSON`
Consolida em uma chamada tudo que hoje é carregado no `useEffect` inicial
de `Mecanica.tsx`. Substitui 12 SELECTs paralelos.

```json
{
  "needle_providers":         [ ... ],
  "needle_provider_prices":   [ ... ],
  "needle_lots":              [ ... ],
  "sinker_providers":         [ ... ],
  "sinker_provider_prices":   [ ... ],
  "sinker_lots":              [ ... ],
  "machine_needle_refs":      [ ... ],
  "machine_sinker_refs":      [ ... ],
  "profiles_min":             [ { "id", "full_name" } ]
}
```

Ordenações preservadas 1:1 (`purchase_date desc`, `name asc` etc.).
`profiles_min` só traz `id + full_name` dos usuários da empresa — resolve
o "Nome #ID" em OMs sem trafegar a tabela inteira.

### 3.2 `get_maintenance_orders_list(p_company_id, p_status?, p_machine_id?, p_from?, p_to?) -> JSON`
Substitui as duas queries em `MaintenanceOrdersTab.loadOrders` e a de
`MaintenanceMovementsTab.loadFinished`.

```json
{
  "orders": [ { "...maintenance_orders": "...", "items": [ "...maintenance_order_items" ],
                 "author_name": "", "finisher_name": "" } ],
  "kpis":   { "abertas": 0, "em_curso": 0, "finalizadas": 0, "tempo_medio_min": 0 }
}
```

- Join server-side com `maintenance_order_items` (evita a 2a query).
- `author_name`/`finisher_name` resolvidos por LEFT JOIN em `profiles`.
- `kpis.tempo_medio_min` = `AVG(EXTRACT(EPOCH FROM (finished_at-started_at))/60)`
  restrito a `status='finalizada'`.

### 3.3 `get_article_change_orders_list(p_company_id, p_status?, p_machine_id?) -> JSON`
Substitui a query de `ArticleChangeOrdersTab.loadOrders` + o loop que hoje
busca `article_change_yarns` por OT.

```json
{ "orders": [ { "...article_change_orders": "...", "yarns": [ "...article_change_yarns" ],
                "author_name": "", "finisher_name": "" } ] }
```

### 3.4 `get_mecanica_calendar(p_company_id, p_year, p_month) -> JSON`
Elimina a iteração cliente-side que hoje monta o calendário. Retorna, por
dia, quantas OMs/OCs/OTs iniciaram e finalizaram + as durações agregadas.

```json
[ { "date": "YYYY-MM-DD",
    "om":  { "iniciadas": 0, "finalizadas": 0, "duracao_total_min": 0 },
    "oc":  { "iniciadas": 0, "finalizadas": 0, "duracao_total_min": 0 },
    "ot":  { "iniciadas": 0, "concluidas": 0 } } ]
```

Uso: pintar bolinhas/badges no calendário e alimentar o tooltip. Cobrir
**todos** os dias do mês via `generate_series` (mesmo padrão do
`get_reports_podio.daily`).

### 3.5 `get_machine_maintenance_detail(p_machine_id) -> JSON`
Substitui a aba **Detalhes**: hoje faz 3 SELECTs sequenciais
(`machine_maintenance_observations`, `maintenance_orders`,
`maintenance_order_items`). Retorna:

```json
{
  "observations": [],
  "timeline":     [ { "kind": "OM|OC|OT", "id": "", "number": 0, "started_at": "",
                       "finished_at": "", "duration_min": 0, "summary": "" } ],
  "totals":       { "om_finalizadas": 0, "oc_finalizadas": 0, "ot_concluidas": 0,
                    "tempo_total_min": 0 }
}
```

Timeline já vem ordenada `started_at desc` e mesclada por SQL — o cliente
só renderiza.

### 3.6 `get_needle_stock(p_company_id) -> JSON`
Consolida abas **Agulhas > Estoque / Cadastro / Lotes / Movimentações**.

```json
{
  "providers":       [],
  "provider_prices": [],
  "lots":            [ { "...needle_lots": "...", "provider_name": "",
                          "current_quantity": 0, "consumed_quantity": 0,
                          "entries": 0, "exits": 0 } ],
  "transactions":    [ { "...needle_transactions": "...", "provider_name": "",
                          "lot_short_id": "", "machine_name": "" } ],
  "balance_by_ref":  [ { "reference": "", "brand": "", "total_quantity": 0,
                          "avg_price": 0 } ]
}
```

Elimina os cálculos de saldo por lote que hoje são feitos em JS varrendo
`needle_transactions`.

### 3.7 `get_sinker_stock(p_company_id) -> JSON`
Espelho 1:1 do 3.6 para platinas (`sinker_*`). Mesmo formato de retorno.

### 3.8 `get_maintenance_movements(p_company_id, p_from?, p_to?, p_kind?, p_search?) -> JSON`
Consolida a aba **Movimentações** (histórico misturado de agulhas,
platinas, cilindros e status de máquina). Retorna uma linha por evento com
`kind`, `date`, `machine_name`, `description`, `qty`, `author_name` já
resolvidos. Cliente só pagina e renderiza; hoje o merge é em JS.

## 4. RPCs de ESCRITA (atômicas)

Cada uma envelopa em transação a sequência que hoje é feita em 5-8 calls
separados. Elimina bugs de estado parcial (o mesmo tipo de bug já corrigido
em 17/07 para OT/OM/OC).

### 4.1 `finalize_maintenance_order(p_order_id, p_items JSON, p_ref_updates JSON) -> JSON`
Substitui `MaintenanceOrdersTab.confirmFinish` (linhas 451-558). Executa
**dentro de uma transação**:
1. `machine_logs`: fecha log corrente (se OC) e insere log final.
2. `machines`: reseta `status='ativa'` (+ `last_needle_change_at` /
   `last_sinker_change_at` / `cylinder_id` quando o item se aplica).
3. `maintenance_orders`: `status='finalizada'`, `finished_at=now()`,
   `finisher_user_id`.
4. `maintenance_order_items`: insere items da finalização.
5. Consumos: `needle_transactions`/`sinker_transactions` de saída (com
   FIFO por lote), atualização de `machine_needle_refs`/`machine_sinker_refs`
   e swap de `cylinders.machine_id` <-> `machines.cylinder_id`.

Retorna `{ "ok": true, "order_id": "...", "machine_status": "ativa" }`.

### 4.2 `finalize_article_change_order(p_order_id, p_report TEXT, p_next_article_id?) -> JSON`
Substitui `ArticleChangeOrdersTab.FinalizeModal.submit` (linhas 1048-1090).
Em uma transação: atualiza OT (status/finished_at/report), aplica
`article_id` novo em `machines` **e** força `status='ativa'` (evita a
regressão corrigida em 17/07). Retorna `{ "ok", "machine_id", "article_id",
"status" }`.

### 4.3 `save_needle_lot(p_payload JSON) -> JSON` / `save_sinker_lot(p_payload JSON) -> JSON`
Envelopam o create-or-update de lote + entrada em `*_transactions` +
re-sync de estoque (`handleSaveNeedleLot`/`handleSaveSinkerLot`). Regras
de bloqueio (troca de agulha/platina, qty vinculada a movimentações,
sincronia de data) permanecem, apenas migradas para SQL.

### 4.4 `delete_needle_lot(p_lot_id)` / `delete_sinker_lot(p_lot_id)`
Verificam se há saídas vinculadas, apagam entradas e o lote em transação.
Espelha `handleDeleteNeedleLot`/`handleDeleteSinkerLot`.

### 4.5 `needle_exit_fifo(p_company_id, p_provider_id, p_reference, p_qty, p_machine_id) -> JSON`
RPC dedicada para as saídas FIFO (hoje um loop no cliente que faz N
updates em `needle_lots` + N inserts em `needle_transactions`). Recebe a
quantidade, resolve FIFO no SQL, retorna os lotes debitados. Idem
`sinker_exit_fifo`.

### 4.6 Fornecedores e preços
`upsert_needle_provider`, `delete_needle_provider`, `upsert_needle_price`,
`delete_needle_price` (+ espelhos para sinker). São puramente conveniência
— reduzem o número de callsites e centralizam a auditoria em
`audit_logs`.

## 5. Enriquecimento no cliente (o que **não** vai para RPC)

Para ficar igual a Reports:
- Labels de turno / roles / permissões: continuam via `CompanyDataContext`
  e `usePermissions`.
- Ordenação alfanumérica de "TEAR NN" já é feita no cliente e permanece.
- Modais de confirmação, toasts, `getFriendlyErrorMessage`, spinners e
  guardas `useRef` contra double-click permanecem no front — as RPCs
  apenas atomizam o SQL.
- Exportações PDF/CSV consomem os arrays retornados pelas RPCs (sem novo
  fetch).

## 6. Plano de execução em fases (implementação futura)

1. **Fase Leitura A (baixo risco):** `get_mecanica_bootstrap`,
   `get_needle_stock`, `get_sinker_stock`. Refactor `Mecanica.tsx` para
   consumir e remover os SELECTs correspondentes.
2. **Fase Leitura B:** `get_maintenance_orders_list`,
   `get_article_change_orders_list`, `get_mecanica_calendar`,
   `get_machine_maintenance_detail`, `get_maintenance_movements`.
3. **Fase Escrita A (atomicidade):** `finalize_maintenance_order`,
   `finalize_article_change_order` — resolve de vez o risco de status
   travado / notificações duplicadas.
4. **Fase Escrita B:** `save_*_lot`, `delete_*_lot`, `*_exit_fifo`,
   upserts de fornecedor/preço.
5. Cada fase acompanhada de `tsgo --noEmit`, verificação manual das 5
   sub-abas (Agulhas/Platinas/Cilindros/Movimentações/Calendário) e
   registro em `docs/mestre.md`.

## 7. Ganhos esperados

- Boot do módulo: de ~15 SELECTs paralelos para **3 RPCs**
  (`bootstrap` + `needle_stock` + `sinker_stock`).
- Aba Detalhes: de 3 selects sequenciais para **1** chamada.
- Calendário e Movimentações: agregação sai do cliente, latência típica
  esperada <300 ms com índice `(company_id, started_at)`.
- OM/OC/OT finalizar: fluxo atômico -> elimina a classe inteira de bugs
  "status travado" e "notificação duplicada por double-invoke".
- Cliente perde ~600 linhas de lógica de merge/aggregate/loop-FIFO.

## 8. Índices sugeridos (verificar antes de criar)

- `maintenance_orders (company_id, status, machine_id)`
- `maintenance_orders (company_id, started_at desc)`
- `article_change_orders (company_id, status, machine_id)`
- `needle_transactions (company_id, lot_id, date)`
- `sinker_transactions (company_id, lot_id, date)`
- `machine_logs (machine_id, started_at desc)`

Confirmar com `supabase--slow_queries` antes de aplicar — não recriar
índice já existente.

---
*Última atualização: 17/07/2026 (Brasília) — documentação inicial, sem
implementação. Aguardando aprovação para executar as fases 1-4.*
