# RPCMECANICA.MD — Migração de `src/pages/Mecanica.tsx` para RPCs

> **Documentação de execução — 100% detalhada, 4 fases.**
> Padrão de RPC seguido em todo o documento: `LANGUAGE plpgsql`,
> `SECURITY DEFINER`, `SET search_path = public`, `STABLE` para leitura /
> `VOLATILE` para escrita, retorno `JSON` único, `GRANT EXECUTE ... TO
> anon, authenticated, service_role`. Cliente consome via
> `(supabase.rpc as any)('nome', { p_... })` — mesmo padrão que já funciona
> em `get_faturamento_total_metrics`, `get_reports_metrics` e
> `get_reports_podio`.
>
> **Regra de ouro:** cada fase é auto-contida — pode ser mergeada,
> validada em produção e revertida individualmente sem quebrar as demais.
> Nada é apagado até a fase seguinte confirmar que a substituição está
> estável (deprecated → dead-code → remover em turno futuro).

---

## Sumário

1. Diagnóstico atual
2. Convenções e diretrizes gerais
3. Catálogo de RPCs (leitura + escrita)
4. **Fase 1 — Leitura A (bootstrap + estoques)**
5. **Fase 2 — Leitura B (listas, calendário, detalhes, movimentações)**
6. **Fase 3 — Escrita A (finalizações atômicas OM/OC/OT)**
7. **Fase 4 — Escrita B (lotes, FIFO, fornecedores)**
8. Enriquecimento que permanece no cliente
9. Índices sugeridos
10. Checklist de validação por fase / rollback

---

## 1. Diagnóstico atual

`Mecanica.tsx` (5.144 linhas) + `MaintenanceOrdersTab.tsx`,
`MaintenanceMovementsTab.tsx`, `ArticleChangeOrdersTab.tsx` fazem hoje
**~83 idas ao banco**, distribuídas em:

- **Boot do módulo** (`useEffect` inicial + cada aba): 12 SELECTs
  paralelos sobre `needle_providers`, `needle_provider_prices`,
  `needle_lots`, `needle_transactions`, `sinker_providers`,
  `sinker_provider_prices`, `sinker_lots`, `sinker_transactions`,
  `machine_maintenance_observations`, `maintenance_orders`,
  `maintenance_order_items`, `article_change_orders`,
  `article_change_yarns`, `machine_needle_refs`, `machine_sinker_refs`.
  `cylinders` e `machines` vêm de `useCompanyData` (já compartilhado).
- **Detalhes de máquina**: 3 SELECTs sequenciais + merge em JS para
  montar timeline.
- **Calendário**: itera `maintenance_orders` + `article_change_orders`
  no cliente para pintar cada dia.
- **Movimentações**: merge em JS de 4 fontes (`needle_transactions`,
  `sinker_transactions`, `cylinders`, `machine_logs`).
- **Escritas críticas (OM / OC / OT finalizar)**: sequência
  **não-atômica** de 5-8 UPDATEs/INSERTs em `maintenance_orders`,
  `maintenance_order_items`, `machines`, `machine_logs`,
  `needle_transactions`, `sinker_transactions`, `machine_needle_refs`,
  `machine_sinker_refs`, `cylinders`. Origem do bug de "status travado"
  corrigido pontualmente em 17/07/2026 — aqui atacamos a causa raiz.

---

## 2. Convenções e diretrizes gerais

- Prefixo `p_` em todos os parâmetros.
- Filtrar sempre por `p_company_id` no corpo (defesa em profundidade
  sobre a RLS).
- Datas: colunas `TIMESTAMPTZ` no schema; parâmetros aceitam
  `TIMESTAMPTZ` ou `TEXT` ISO e o corpo faz `::timestamptz`.
- `NULL` = "todos" em qualquer filtro opcional.
- Retornar `JSON` (não `JSONB`) para bater com o padrão dos outros
  módulos.
- Escritas: **uma RPC por fluxo de negócio** (não por tabela); tudo
  dentro do mesmo `BEGIN ... END` para atomicidade — se qualquer passo
  falhar, `RAISE EXCEPTION` desfaz o resto.
- Toda RPC de escrita retorna `{ ok: true, ... }` para o cliente
  conseguir reagir de forma uniforme (toast + `refreshData()`).
- Auditoria (`audit_logs`) continua sendo escrita **de dentro da RPC**
  (não mais do cliente) — elimina divergência entre o que foi feito no
  banco e o que foi registrado.
- Guarda anti-double-click no cliente permanece (`useRef` + botão
  desabilitado), mas a idempotência real fica no SQL (checagem de
  status antes de aplicar transição).

---

## 3. Catálogo de RPCs

### Leitura (STABLE)

| # | Nome | Substitui |
|---|---|---|
| 3.1 | `get_mecanica_bootstrap(p_company_id)` | 12 SELECTs do boot |
| 3.2 | `get_maintenance_orders_list(p_company_id, p_status?, p_machine_id?, p_from?, p_to?)` | `MaintenanceOrdersTab.loadOrders` + `MaintenanceMovementsTab.loadFinished` |
| 3.3 | `get_article_change_orders_list(p_company_id, p_status?, p_machine_id?)` | `ArticleChangeOrdersTab.loadOrders` + loop de `article_change_yarns` |
| 3.4 | `get_mecanica_calendar(p_company_id, p_year, p_month)` | Iteração cliente-side do calendário |
| 3.5 | `get_machine_maintenance_detail(p_machine_id)` | 3 SELECTs da aba Detalhes |
| 3.6 | `get_needle_stock(p_company_id)` | Abas Agulhas (Estoque/Lotes/Movim.) |
| 3.7 | `get_sinker_stock(p_company_id)` | Espelho de 3.6 para Platinas |
| 3.8 | `get_maintenance_movements(p_company_id, p_from?, p_to?, p_kind?, p_search?)` | Merge cliente-side de 4 fontes |

### Escrita (VOLATILE, atômicas)

| # | Nome | Substitui |
|---|---|---|
| 4.1 | `finalize_maintenance_order(p_order_id, p_items, p_ref_updates)` | `MaintenanceOrdersTab.confirmFinish` (OM/OC) |
| 4.2 | `finalize_article_change_order(p_order_id, p_report, p_next_article_id?)` | `ArticleChangeOrdersTab.FinalizeModal.submit` |
| 4.3 | `save_needle_lot(p_payload)` / `save_sinker_lot(p_payload)` | `handleSaveNeedleLot` / `handleSaveSinkerLot` |
| 4.4 | `delete_needle_lot(p_lot_id)` / `delete_sinker_lot(p_lot_id)` | `handleDeleteNeedleLot` / `handleDeleteSinkerLot` |
| 4.5 | `needle_exit_fifo(...)` / `sinker_exit_fifo(...)` | Loop FIFO no cliente |
| 4.6 | `upsert_needle_provider` / `upsert_needle_price` (+ deletes / espelhos sinker) | CRUD de fornecedor & preço |

*(Payloads detalhados: seções específicas de cada fase.)*

---

## 4. Fase 1 — Leitura A (bootstrap + estoques)  🟢 baixo risco

**Objetivo:** derrubar o boot de 12 SELECTs para 3 RPCs e eliminar toda
a matemática de saldo de lote feita em JS. Zero mudança de escrita.

### 4.1 Escopo

RPCs criadas:

- `get_mecanica_bootstrap(p_company_id)` — providers, provider_prices,
  refs de máquinas, `profiles_min` (`id` + `full_name` + `code`).
- `get_needle_stock(p_company_id)` — providers, prices, lots
  enriquecidos com `current_quantity` / `consumed_quantity` / `entries`
  / `exits` já calculados, transactions (últimas 500 por padrão) com
  joins de fornecedor/lote/máquina, `balance_by_ref` agregado.
- `get_sinker_stock(p_company_id)` — espelho 1:1.

### 4.2 Contratos de retorno

`get_mecanica_bootstrap`:

```json
{
  "needle_providers":       [ { "id":"", "name":"" } ],
  "needle_provider_prices": [ { "id":"","provider_id":"","reference":"","brand":"","price":0 } ],
  "sinker_providers":       [ ],
  "sinker_provider_prices": [ ],
  "machine_needle_refs":    [ { "id":"","machine_id":"","reference":"","brand":"","provider_id":"" } ],
  "machine_sinker_refs":    [ ],
  "profiles_min":           [ { "id":"","user_id":"","full_name":"","code":"","role":"" } ]
}
```

`get_needle_stock` (`get_sinker_stock` idêntico trocando `needle_`→`sinker_`):

```json
{
  "providers":       [ ],
  "provider_prices": [ ],
  "lots": [ {
     "id":"","provider_id":"","provider_name":"","reference":"","brand":"","short_id":"",
     "quantity":0,"purchase_price":0,"purchase_date":"","note":"",
     "entries":0,"exits":0,"current_quantity":0,"consumed_quantity":0
  } ],
  "transactions": [ {
     "id":"","date":"","type":"","exit_mode":"","quantity":0,"note":"",
     "provider_id":"","provider_name":"","lot_id":"","lot_short_id":"",
     "machine_id":"","machine_name":"","created_by_name":"","created_by_code":""
  } ],
  "balance_by_ref": [ { "reference":"","brand":"","total_quantity":0,"avg_price":0 } ]
}
```

### 4.3 Migration (Fase 1)

Uma única migration `phase1_mecanica_reads` cria as 3 funções + GRANTs.
Ordenações preservam 1:1 as atuais (`purchase_date DESC NULLS LAST`,
`name ASC`, `date DESC, created_at DESC`). Nenhum `CREATE TABLE`.

### 4.4 Alterações no cliente

- `src/pages/Mecanica.tsx`
  - Novo hook `useMecanicaBootstrap(companyId)` (React Query,
    `staleTime: 60s`, invalidação em `refreshData()` via `queryClient`).
  - `useEffect` que faz os 12 fetches é substituído por 3 `rpc()`.
  - Estados locais (`needleProviders`, `needleLots`, …) passam a ler do
    payload da RPC. Nenhum cálculo de saldo/consumo no cliente
    (`current_quantity` vem pronto do SQL).
- Realtime existente (canal `mecanica-${companyId}`) apenas dispara
  `queryClient.invalidateQueries(['mecanica-bootstrap'])` — não altera
  estado local diretamente.
- Nenhuma mudança em modais, toasts, permissões ou export PDF.

### 4.5 Validação

- `tsgo --noEmit` limpo.
- Playwright headless: abrir `/mecanica`, checar que cada aba (Agulhas /
  Platinas / Cilindros / Movimentações / Calendário) renderiza sem
  console error.
- Comparar visualmente os totais de estoque com o valor anterior
  (screenshot antes/depois em uma empresa de staging).
- Registrar em `docs/mestre.md`: "Fase 1 concluída — RPCs de leitura
  ativas".

### 4.6 Rollback

Reverter apenas o commit do cliente restabelece o comportamento antigo
(as RPCs continuam no banco, inertes). Nenhum drop necessário.

---

## 5. Fase 2 — Leitura B (listas, calendário, detalhes, movimentações)  🟡 médio

**Objetivo:** mover para SQL o restante das agregações que hoje o
cliente faz varrendo arrays. Nada de escrita ainda.

### 5.1 Contratos

`get_maintenance_orders_list`:

```json
{
  "orders": [ {
     "id":"","number":0,"type":"","status":"","machine_id":"","machine_name":"",
     "started_at":"","finished_at":"","monitoring_started_at":"",
     "author_user_id":"","author_name":"","author_code":"",
     "finisher_user_id":"","finisher_name":"","finisher_code":"",
     "notes":"","progress_notes":[ ],
     "items": [ { "id":"","kind":"","reference":"","brand":"","quantity":0 } ]
  } ],
  "kpis": { "abertas":0,"em_curso":0,"finalizadas":0,"tempo_medio_min":0 }
}
```

`get_article_change_orders_list`:

```json
{
  "orders": [ {
     "id":"","number":0,"status":"","machine_id":"","machine_name":"",
     "current_article_id":"","next_article_id":"","next_article_name":"",
     "created_at":"","yarn_change_at":"","yarn_change_finished_at":"",
     "adjustment_at":"","adjustment_finished_at":"","monitoring_started_at":"",
     "concluded_at":"","cancelled_at":"","report":"","monitoring_turns":0,
     "created_by_name":"","created_by_code":"",
     "yarn_change_by_name":"","yarn_change_by_code":"",
     "yarn_change_finished_by_name":"","yarn_change_finished_by_code":"",
     "adjustment_by_name":"","adjustment_by_code":"",
     "adjustment_finished_by_name":"","adjustment_finished_by_code":"",
     "concluded_by_name":"","concluded_by_code":"",
     "cancelled_by_name":"","cancelled_by_code":"",
     "yarns": [ { "id":"","yarn_type_id":"","yarn_name":"","quantity_kg":0 } ]
  } ]
}
```

`get_mecanica_calendar(p_year, p_month)` — 1 linha por dia do mês:

```json
[ { "date":"YYYY-MM-DD",
    "om": { "iniciadas":0,"finalizadas":0,"duracao_total_min":0 },
    "oc": { "iniciadas":0,"finalizadas":0,"duracao_total_min":0 },
    "ot": { "iniciadas":0,"concluidas":0 } } ]
```

`get_machine_maintenance_detail(p_machine_id)`:

```json
{
  "observations": [ ],
  "timeline": [ { "kind":"OM|OC|OT","id":"","number":0,"started_at":"",
                  "finished_at":"","duration_min":0,"summary":"" } ],
  "totals": { "om_finalizadas":0,"oc_finalizadas":0,"ot_concluidas":0,
              "tempo_total_min":0 }
}
```

`get_maintenance_movements(p_from,p_to,p_kind,p_search)`:

```json
[ { "kind":"needle|sinker|cylinder|status",
    "date":"","machine_id":"","machine_name":"",
    "description":"","qty":0,"author_name":"","author_code":"","meta":{ } } ]
```

### 5.2 Implementação SQL

- Calendário: `generate_series(date_trunc('month', ...), ...)` LEFT
  JOIN agregados de `maintenance_orders` e `article_change_orders`.
  `troca_agulhas` e `troca_platinas` de `machine_logs` também contam
  como reset (mesma regra usada em `urgencyByMachine`).
- Timeline (3.5): `UNION ALL` de OM/OC/OT com `kind` sintético e
  `duration_min = EXTRACT(EPOCH FROM finished_at - started_at)/60`.
- Movimentações (3.8): `UNION ALL` de 4 fontes, `ORDER BY date DESC`,
  `LIMIT 500` por padrão (ou paginação `p_offset`, `p_limit`).

### 5.3 Alterações no cliente

- `MaintenanceOrdersTab.loadOrders` → 1 `rpc()`, remove a 2ª query de
  itens e o mapeamento de autor por `profiles_min`.
- `ArticleChangeOrdersTab.loadOrders` → 1 `rpc()`, remove o loop N+1
  de `article_change_yarns`.
- `Mecanica.tsx` calendário: substitui a matriz local por
  `data[dateKey]` vindo pronto.
- Aba Detalhes: 1 `rpc()` em vez de 3.
- `MaintenanceMovementsTab`: consome `get_maintenance_movements` com
  filtros server-side (data / tipo / busca).

### 5.4 Validação

- `tsgo --noEmit`.
- Conferir contadores das abas OM (Abertas / Em curso / Finalizadas)
  contra a query antiga em uma empresa com histórico.
- Calendário: comparar totais mensais (OM/OC/OT) com o mês atual.
- Movimentações: buscar 3 termos distintos e comparar linhas
  retornadas.
- Registrar no `docs/mestre.md`.

### 5.5 Rollback

Como na Fase 1, reverter só o cliente basta. As RPCs ficam ociosas.

---

## 6. Fase 3 — Escrita A (finalizações atômicas OM/OC/OT)  🔴 alto risco

**Objetivo:** eliminar de vez o bug "status travado". Todas as
finalizações passam a rodar dentro de uma única transação SQL — se
qualquer passo falhar, o banco desfaz tudo automaticamente.

### 6.1 `finalize_maintenance_order(p_order_id, p_items JSON, p_ref_updates JSON)`

Payload `p_items`: array de itens de finalização (peças trocadas /
observações). Payload `p_ref_updates`: opcional,
`{ needle_refs:[...], sinker_refs:[...], cylinder_swap:{ old_id, new_id } }`.

Sequência dentro do `BEGIN`:

1. `SELECT ... FOR UPDATE` na ordem — garante que 2 mecânicos não
   finalizem em paralelo. Se `status` já for `finalizada`, retorna
   `{ ok:true, already:true }` (idempotência).
2. Se OC: `UPDATE machine_logs SET ended_at = now() WHERE machine_id
   = ... AND ended_at IS NULL AND status IN
   ('manutencao_corretiva','manutencao_preventiva','troca_agulhas',
   'troca_platinas')`.
3. `UPDATE machines SET status='ativa'`, mais:
   - `last_needle_change_at = now()` se `type` for troca de agulheiro;
   - `last_sinker_change_at = now()` se troca de platinas;
   - `cylinder_id = new_id` se `cylinder_swap`.
4. `UPDATE maintenance_orders SET status='finalizada',
   finished_at=now(), finisher_user_id=auth.uid()`.
5. `INSERT INTO maintenance_order_items` a partir de `p_items`.
6. Consumos de agulha/platina: chamada interna a `needle_exit_fifo`
   / `sinker_exit_fifo` para cada item quantificável.
7. `UPDATE machine_needle_refs` / `machine_sinker_refs` conforme
   `p_ref_updates`.
8. Se `cylinder_swap`: `UPDATE cylinders SET machine_id = ...` no par
   antigo/novo (dentro da mesma transação, sem chance de dessincronia).
9. `INSERT INTO machine_logs (status='ativa', started_at=now(),
   started_by_user_id=auth.uid())` — só se passos 3-8 tiverem sucesso
   (implícito pela transação).
10. `INSERT INTO audit_logs` com o payload completo.

Retorno:

```json
{ "ok":true,"order_id":"","machine_id":"","machine_status":"ativa",
  "consumed_lots":[ { "lot_id":"","qty":0 } ] }
```

### 6.2 `finalize_article_change_order(p_order_id, p_report TEXT, p_next_article_id UUID DEFAULT NULL)`

Sequência:

1. `SELECT ... FOR UPDATE` da OT; idempotência se `status='concluida'`.
2. `UPDATE article_change_orders SET status='concluida',
   concluded_at=now(), concluded_by_user_id=auth.uid(), report=p_report,
   next_article_id=COALESCE(p_next_article_id,next_article_id)`.
3. `UPDATE machines SET article_id = <next_article_id>, status='ativa'`
   (força ativa — regressão de 17/07/2026 nunca mais acontece).
4. `INSERT INTO machine_logs (status='ativa', started_at=now(), ...)`.
5. `INSERT INTO audit_logs`.

Retorno: `{ "ok":true, "machine_id":"","article_id":"","status":"ativa" }`.

### 6.3 Alterações no cliente

- `MaintenanceOrdersTab.confirmFinish` (linhas 451-558): substitui a
  sequência de 5-8 calls por **1** `rpc('finalize_maintenance_order',
  ...)` + tratamento de erro com `getFriendlyErrorMessage`.
  Notificação push disparada **uma única vez** após `ok:true` (elimina
  duplicação reportada no pente-fino de push).
- `ArticleChangeOrdersTab.FinalizeModal.submit` (linhas 1048-1090):
  idem com `finalize_article_change_order`.
- Guarda `useRef` mantida no cliente por UX; a idempotência real vem
  do `already:true` do banco.

### 6.4 Validação

- **Dry-run em staging obrigatório** antes de produção.
- Fluxo E2E via Playwright: criar OM → iniciar → finalizar; conferir
  `machines.status='ativa'` no banco após cada passo.
- Repetir para OC e OT.
- Testar concorrência: 2 sessões finalizando a mesma ordem → segunda
  deve receber `already:true` sem duplicar `machine_logs`.
- Verificar `audit_logs`: exatamente 1 registro por finalização.
- Verificar `push_subscriptions`: exatamente 1 notificação por
  dispositivo.
- Registrar em `docs/mestre.md`.

### 6.5 Rollback

- Reverter commit do cliente (volta a chamar UPDATEs diretos).
- As RPCs continuam no banco mas sem callers — inertes.
- Se detectar regressão só em produção: feature flag no cliente
  (`import.meta.env.VITE_USE_MECANICA_RPC_WRITE`) permite alternar sem
  redeploy.

---

## 7. Fase 4 — Escrita B (lotes, FIFO, fornecedores)  🟡 médio

**Objetivo:** encerrar a migração. CRUD de lotes/fornecedores +
centralização do FIFO no SQL.

### 7.1 `save_needle_lot(p_payload JSON)` / `save_sinker_lot(p_payload JSON)`

Payload:

```json
{
  "id": null,
  "provider_id":"","reference":"","brand":"",
  "quantity":0,"purchase_price":0,"purchase_date":"YYYY-MM-DD","note":""
}
```

Sequência atômica:

1. Se `id` null: `INSERT INTO needle_lots ...` + `INSERT INTO
   needle_transactions (type='entry', ...)` com a quantidade inicial.
2. Se `id` != null:
   - `SELECT ... FOR UPDATE` do lote.
   - Se existirem saídas vinculadas e a quantidade nova for menor que
     o consumido, `RAISE EXCEPTION` (mesma regra que já existe no
     cliente, agora inviolável).
   - `UPDATE needle_lots ...`.
   - Sincroniza a data da transação de entrada correspondente.
3. `INSERT INTO audit_logs`.

Retorno: `{ "ok":true, "lot_id":"" }`.

### 7.2 `delete_needle_lot(p_lot_id)` / `delete_sinker_lot(p_lot_id)`

- `SELECT ... FOR UPDATE`.
- Se existir qualquer `needle_transactions` do tipo `exit`
  referenciando este lote: `RAISE EXCEPTION 'lote com saídas — não
  pode ser removido'`.
- Apaga transações do tipo `entry` + o lote.
- Audit.

### 7.3 `needle_exit_fifo(...)` / `sinker_exit_fifo(...)`

Parâmetros: `p_company_id, p_provider_id, p_reference, p_brand, p_qty,
p_machine_id, p_note`.

Loop server-side, algo como:

```sql
FOR r IN
  SELECT id, current_quantity
  FROM needle_lots
  WHERE company_id = p_company_id
    AND provider_id = p_provider_id
    AND reference = p_reference
    AND brand = p_brand
  ORDER BY purchase_date ASC, created_at ASC
LOOP
  ...
END LOOP;
```

Se `p_qty` restante > 0 após esgotar todos os lotes: `RAISE EXCEPTION
'estoque insuficiente'`. Retorna array `{ lot_id, qty }` dos lotes
debitados — útil para audit_log e para o toast do cliente.

### 7.4 Fornecedores e preços (4.6)

`upsert_needle_provider(p_payload)`, `delete_needle_provider(p_id)`,
`upsert_needle_price(p_payload)`, `delete_needle_price(p_id)` (+
espelhos sinker). São conveniência — cada uma reduz a 1 RPC o par
`insert/update` + `audit_logs` que hoje é feito no cliente.

### 7.5 Alterações no cliente

- `handleSaveNeedleLot`, `handleDeleteNeedleLot`, `handleSaveSinkerLot`,
  `handleDeleteSinkerLot` viram 1 `rpc()` cada.
- Todas as saídas FIFO (Troca de Agulheiro / Troca de Platinas) passam
  a chamar `needle_exit_fifo` / `sinker_exit_fifo` em vez do loop
  atual.
- CRUD de fornecedor/preço migrado.

### 7.6 Validação

- Criar/editar/apagar lote em staging; tentar apagar lote com saída ⇒
  erro amigável.
- Simular saída FIFO com estoque insuficiente ⇒ erro amigável.
- Registrar em `docs/mestre.md`.

### 7.7 Limpeza final

- Após 1 semana estável em produção: remover as funções JS que ficaram
  como dead-code (marcadas com `// deprecated` na Fase 4, deletar em
  turno seguinte).
- Remover imports não usados de `supabase.from(...)` em `Mecanica.tsx`
  e componentes filhos.

---

## 8. Enriquecimento que permanece no cliente

Como em Reports:

- Labels de turno / roles / permissões: `CompanyDataContext` +
  `usePermissions`.
- Ordenação alfanumérica de "TEAR NN" (client-side, O(n)).
- Modais de confirmação, toasts, `getFriendlyErrorMessage`, spinners.
- Exportações PDF/CSV consomem o payload das RPCs (sem novo fetch).

---

## 9. Índices sugeridos

Confirmar cada um com `supabase--slow_queries` antes de criar (não
recriar existente):

- `maintenance_orders (company_id, status, machine_id)`
- `maintenance_orders (company_id, started_at DESC)`
- `article_change_orders (company_id, status, machine_id)`
- `article_change_orders (company_id, created_at DESC)`
- `needle_transactions (company_id, lot_id, date)`
- `sinker_transactions (company_id, lot_id, date)`
- `needle_lots (company_id, provider_id, reference, brand, purchase_date)`
- `sinker_lots (company_id, provider_id, reference, brand, purchase_date)`
- `machine_logs (machine_id, started_at DESC)`

---

## 10. Checklist de validação por fase / rollback

| Fase | Antes do merge | Depois do merge | Rollback |
|---|---|---|---|
| 1 | `tsgo` limpo · abrir cada aba de Mecânica sem console error · totais visualmente idênticos | Monitorar `edge_function_logs` + console por 24h | Reverter commit do cliente (RPCs ficam inertes) |
| 2 | `tsgo` · contadores OM/OT/Calendário/Movim. batendo com produção | Monitorar 48h · comparar KPIs com semana anterior | Reverter cliente |
| 3 | `tsgo` · **E2E Playwright** OM/OC/OT · teste de concorrência · audit_logs sem duplicação · push sem duplicação | **Feature flag** ativa (`VITE_USE_MECANICA_RPC_WRITE`) · monitorar 72h em modo canário | Desligar flag no cliente (sem redeploy) |
| 4 | `tsgo` · CRUD de lote OK · FIFO com estoque insuficiente ⇒ erro amigável | Monitorar 48h | Reverter cliente · limpeza de dead-code adiada para turno seguinte |

Registrar cada fase concluída em `docs/mestre.md` com data/hora
Brasília e resumo do que foi ativado.

---

*Última atualização: 18/07/2026 (Brasília) — documento reescrito com
plano de execução 100% detalhado em 4 fases. Nada implementado ainda —
aguardando "vai" para começar pela Fase 1.*
