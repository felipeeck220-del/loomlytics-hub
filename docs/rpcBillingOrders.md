# Plano de migração para RPC — Ordem de Faturamento (OF)

**Arquivo alvo:** `src/pages/BillingOrders.tsx` (3.189 linhas) + `src/hooks/useBillingOrders.ts` (778 linhas)
**Doc funcional:** `docs/BillingOrders.md`
**Padrão de referência:** `docs/rpcInvoices.md`, `docs/rpcclientInvoices.md`, `docs/rpcstockMalha.md`, `get_faturamento_total_metrics`.
**Objetivo:** eliminar todos os `INSERT/UPDATE/DELETE` diretos e as leituras massivas do cliente, consolidando cada operação da máquina de estados em uma RPC atômica `SECURITY DEFINER` com isolamento multi-tenant obrigatório.

---

## 0. Regras herdadas (não negociáveis)

Toda RPC nova deste plano:

1. `SECURITY DEFINER SET search_path = public`, `LANGUAGE plpgsql`.
2. `GRANT EXECUTE ... TO anon, authenticated, service_role`.
3. Primeira instrução do corpo:
   ```sql
   v_caller_company := public.get_user_company_id();
   IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
     RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
   END IF;
   ```
   Em RPCs que recebem apenas `p_id`, buscar `company_id` da linha via `SELECT ... FOR UPDATE` **antes** de qualquer mutação e validar contra `get_user_company_id()`.
4. Idempotência via `{ok:true, already:true}` quando `SELECT FOR UPDATE` não encontra a linha esperada ou quando o estado já é o alvo — evita double-click e race com Realtime.
5. Toda transição de status usa `UPDATE ... WHERE id = p_id AND status = p_expected_status RETURNING id` para preservar a proteção contra concorrência que hoje mora em `useBillingOrders.updateStatus`.
6. Nunca sobrescrever colunas opcionais com `NULL` em `UPDATE` — usar `COALESCE(p_x, coluna)`; exceções documentadas por RPC (ex.: `revertToOpen` **precisa** zerar `pieces_real/weight_real/weight_avg/separated_by/delivery_doc_*`).
7. Efeitos de estoque (`stock_movements`, `own_stock_movements`, `own_stock_articles`) ficam **inteiramente dentro** da mesma transação da mudança de status. Nenhuma escrita fragmentada como hoje (hook faz vários `insert` em sequência).
8. Toda RPC de escrita registra em `audit_logs` via `INSERT` direto (mesmo payload que `logAction` monta no cliente) — deixa de depender do cliente lembrar de auditar.

---

## Fase 1 — Bootstrap de metadados

**Problema atual:** ao abrir `/billing-orders`, além do `useBillingOrders` (que já filtra por empresa), a página lê `CompanyDataContext` inteiro (`machines`, `clients`, `articles`, `ownStockArticles`, `profiles`). Ainda falta consolidar:

- lista de OFs em aberto/pending para o **badge do sidebar** (`useNotificationsBadge`);
- `stats` do topo (contadores por status);
- meses disponíveis para o filtro de "Coletadas" (hoje calculado sobre `collected_orders` em memória).

### RPC `get_billing_orders_bootstrap(p_company_id uuid)`

Retorno JSON:

```json
{
  "company": { "id": "...", "name": "...", "logo_url": "...", "slug": "..." },
  "stats": {
    "open": 0, "priority": 0, "separating": 0,
    "awaiting_doc": 0, "ready": 0, "collected_month": 0, "cancelled_month": 0
  },
  "available_months": ["2026-07", "2026-06"],
  "next_of_number": "601",
  "link_groups_count": 0
}
```

- `available_months`: `DISTINCT to_char(collected_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') DESC` da própria empresa, UNION mês corrente.
- `next_of_number`: mesma lógica de `useBillingOrders.getNextOfNumber` (maior `of_number` numérico + 1), no servidor.
- `stats.awaiting_doc`: `status = 'ready' AND delivery_doc_number IS NULL` — hoje é `filter` em memória.

Cliente:

- Nova `useQuery(['billing_orders_bootstrap', companyId], staleTime: 60s)`.
- Substitui `nextOfNumber` local, cabeçalho e badges superiores. `useBillingOrders` continua responsável pela **lista completa** (Fase 2).

---

## Fase 2 — Leituras paginadas server-side

**Problema atual:** `useBillingOrders` carrega **todas** as OFs da empresa em uma única query com joins (`billing_order_pallets`, `article:articles`, `client:clients`, `machine:machines`, `created_by_profile:profiles`, ...). Para tenants com histórico grande isso é lento e cresce sem limite. Filtros por aba, busca, mês, cliente e paginação de "Coletadas" acontecem em memória (`useMemo`).

### RPC `get_billing_orders_list(p_company_id, p_view, p_search, p_client_id, p_month, p_start_date, p_end_date, p_page, p_page_size)`

- `p_view`: `'priority' | 'open' | 'separating' | 'awaiting_doc' | 'ready' | 'collected' | 'cancelled' | 'all'`.
- Retorno:
  ```json
  {
    "rows": [ { "...billing_orders": "...", "client_name": "...", "article_name": "...",
                "machine_name": "...", "created_by_name": "...", "created_by_code": 0,
                "separated_by_name": "...", "collected_by_name": "...",
                "pallets": [ { "id": "...", "pallet_number": 1, "pieces": 10,
                              "weight_kg": 12.34, "machine_id": "...", "machine_name": "..." } ],
                "link_group_size": 3 } ],
    "total_count": 1234
  }
  ```
- Paletes vêm aninhados via `jsonb_agg` em CTE (padrão de `get_client_invoices_search`).
- `link_group_size`: `COUNT(*) OVER (PARTITION BY link_group_id)` para o rótulo "Atrelada (N)" — hoje é `linkGroups` `useMemo`.
- `awaiting_doc` filtra `status='ready' AND delivery_doc_number IS NULL`; `ready` filtra `status='ready' AND delivery_doc_number IS NOT NULL`. Isso trava a divisão real das abas no servidor.
- Ordenação: `priority DESC, created_at DESC` para abas ativas, `collected_at DESC` para "Coletadas".

### RPC `get_billing_order_detail(p_company_id, p_id)`

Payload completo para o modal de detalhes (auditoria, paletes, histórico de reversões, estorno etc.). Elimina a necessidade de manter todas as OFs vivas em memória para abrir uma.

### Realtime

O canal `billing-orders-${companyId}` continua vivo em `useBillingOrders`, mas passa apenas a **invalidar** as chaves:

- `['billing_orders_list', view, ...]`
- `['billing_orders_bootstrap', companyId]`
- `['billing_order_detail', id]` (quando o `payload.new.id` for o aberto).

---

## Fase 3 — Transições de status (escritas atômicas)

Substitui todas as chamadas de `useBillingOrders.updateStatus`, `editOrder`, `setDeliveryDoc`, `linkOrders`, `unlinkGroup`, `removeFromGroup`, `restoreOwnStockForOrder` por RPCs. Cada uma segue o **contrato** da §0 e retorna `{ok, already, conflict?}`.

### `start_billing_order_separation(p_company_id, p_id, p_author_name, p_author_code)`

- `SELECT ... FOR UPDATE`, valida tenant.
- `UPDATE billing_orders SET status='separating', separated_by = auth.uid(), updated_at=now() WHERE id=p_id AND status='open' RETURNING id`.
- Se `NOT FOUND`: devolve `{ok:true, already:true, current_status: ...}` (o cliente hoje trata isso como conflito silencioso).
- Registra `audit_logs`.

### `launch_billing_order_ready(p_company_id, p_id, p_pallets jsonb, p_pieces_real, p_weight_real, p_author...)`

Encapsula o fluxo hoje espalhado entre o modal de paletes e `useBillingOrders.updateStatus('ready',...)`:

1. `FOR UPDATE` na OF, valida tenant e `status='separating'`.
2. Recalcula `weight_avg = weight_real/pieces_real`.
3. Sincroniza `billing_order_pallets` (delete + insert do array `p_pallets`, cada item traz `{pallet_number, pieces, weight_kg, machine_id}`).
4. Aplica em `stock_movements` a diferença entre o **estado anterior** (release de reservas anteriores + reverter saídas) e o **novo estado** — mesma lógica do hook, mas agora **atômica**:
   - Para OF sem paletes: `type='reserve'` no total (`weight_expected` ou `weight_real`).
   - Para OF com paletes: sem `reserve` global, apenas `release` das reservas por máquina que sobram; `out` net por `(machine_id, is_second_quality)` calculado no servidor via `SUM(pallets.weight)` agrupado.
   - Preserva a regra "sem release fantasma": nunca cria `release` maior do que a soma de `reserve` prévia daquela chave (SQL: `LEAST(sum_reserve - sum_release, delta)`).
   - Ignora artigos com bandeira `own_stock` (`is_own_stock_article`) para o `stock_movements`, mas registra `own_stock_movements` correspondentes.
5. `UPDATE billing_orders SET status='ready', pieces_real=..., weight_real=..., weight_avg=..., updated_at=now() WHERE id=p_id AND status='separating' RETURNING id`.
6. Auditoria e retorno `{ok, already, applied_moves: [...]}`.

### `set_billing_order_delivery_doc(p_company_id, p_id, p_doc_type, p_doc_number, p_author...)`

- Só permite quando `status='ready'`.
- Update **condicional** também em `delivery_doc_number IS NULL` para não sobrescrever quando outro operador já preencheu (mesmo comportamento do hook).
- Retorna `{ok, already, conflict:{current_number}}` quando bater no conflito.

### `collect_billing_order(p_company_id, p_id, p_author...)`

- `status='ready'` → `status='collected'`, seta `collected_by=auth.uid()`, `collected_at=now()`.

### `revert_billing_order_to_open(p_company_id, p_id, p_reason, p_quality, p_author...)`

- Move `separating|ready|collected` de volta para `open`.
- Reversão **preserva** `reversal_quality` e limpa `delivery_doc_*`, `pieces_real`, `weight_real`, `weight_avg`, `separated_by`, `collected_by` (esses `SET x = NULL` são intencionais, não usar `COALESCE`).
- Reaplica o inverso dos `stock_movements` gerados por `launch_ready`/`collect` — cria linhas do tipo `release`/`in` calculadas via CTE sobre `stock_movements WHERE billing_order_id = p_id` para reverter o líquido (mesma regra netByKey de hoje). Registra `reversed_by`, `reversed_at`, `reverted_from`, `reversal_reason`.
- `own_stock_movements` restaurados com `restoreOwnStockForOrder` **embutido** na mesma transação.

### `cancel_billing_order(p_company_id, p_id, p_reason, p_author...)`

- Aplica cancelamento em qualquer status ≠ `collected` (regra atual do hook).
- Estorna reservas e saídas conforme quality escolhida (`reversal_quality`).
- Marca `cancelled_at`, `cancelled_by`, `cancellation_reason`, `status='open'` **ou** `status='cancelled'` — replicar exatamente o que `useBillingOrders.cancelOrder` faz hoje (documentado em `docs/BillingOrders.md §5`).

### `edit_billing_order(p_company_id, p_id, p_payload, p_edit_note, p_author...)`

Campos permitidos: `client_id, article_id, machine_id, dyehouse, pieces_expected, weight_expected, order_type, piece_weight_target, priority, priority_reason`. Nunca aceita `status`, `pieces_real`, `weight_real`, `delivery_doc_*` (esses são regidos por RPCs próprias). Usa `COALESCE` para não sobrescrever com NULL e grava `last_edited_by/at` + `edit_note`.

### `set_billing_order_priority(p_company_id, p_id, p_priority bool, p_reason, p_author...)`

- Atualiza `priority`, `priority_reason`, `priority_at`, `priority_by`. Se `priority=false`, zera `priority_reason/at/by`.

### `create_billing_order(p_company_id, p_payload, p_author...)`

Substitui `useBillingOrders.createOrder`:

- Gera `of_number` server-side chamando a lógica de `getNextOfNumber` (**dentro da mesma transação**, com `SELECT ... FOR UPDATE` numa linha sentinela em `billing_orders` para evitar corrida).
- Se `p_payload.of_number` já vier, valida unicidade e devolve `{ok:false, error:'duplicate_of_number', existing_id}` em vez de estourar `23505`.
- Cria também a `reserve` inicial em `stock_movements` (comportamento atual: cria uma reserva quando a OF nasce sem paletes e artigo não é `own_stock`).

### `link_billing_orders(p_company_id, p_ids uuid[], p_author...)` / `unlink_billing_order_group(p_company_id, p_group_id, p_author...)` / `remove_from_billing_order_group(p_company_id, p_id, p_author...)`

- Merge de grupos: escolhe o menor `link_group_id` existente entre os alvos (ou gera novo `gen_random_uuid()`); atualiza todas as linhas em um único `UPDATE`.
- `remove_from_group` deixa `link_group_id=NULL` na alvo e **dissolve o grupo** quando sobrar apenas 1 OF (regra atual).

---

## Fase 4 — Auxiliares e exports

### `get_billing_orders_export(p_company_id, p_view, p_filters jsonb)`

Payload pronto para o PDF: cabeçalho colorido por status, seção de auditoria (nomes + `#codigo`) e paletes já resolvidos. `src/pages/BillingOrders.tsx` para de precisar de `machines/clients/articles/profiles` inteiros só para renderizar a impressão.

### `get_billing_order_negative_warning(p_company_id, p_id)`

Move o cálculo do "aviso proativo" (quando o launch vai deixar estoque físico ou reserva negativos) para o servidor. Hoje é um `useMemo` grande que percorre `stock_movements`.

### `get_billing_order_link_group(p_company_id, p_group_id)`

Detalhe do grupo atrelado (modal "Atrelar"), com totais somados no banco.

---

## Refactor no cliente (por fase)

| Fase | Arquivos tocados | Substituições |
|---|---|---|
| 1 | `src/pages/BillingOrders.tsx` | `useQuery(bootstrap)` — badges, meses, `nextOfNumber` |
| 2 | `useBillingOrders.ts`, `BillingOrders.tsx` | Query única por aba, remoção dos `useMemo` de filtro/paginação; `linkGroups` vira coluna do payload |
| 3 | `useBillingOrders.ts` inteiro | Toda mutação vira `supabase.rpc(...)`; hook fica só com Realtime + invalidação + funções finas (`startSeparation`, `launchReady`, `setDoc`, `collect`, `cancel`, `revertToOpen`, `edit`, `setPriority`, `linkOrders`, `unlinkGroup`, `removeFromGroup`) |
| 4 | `BillingOrders.tsx`, PDF helpers | PDF consome payload da RPC; `negativeWarning` vira `useQuery` sob demanda; modal "Atrelar" consome `get_billing_order_link_group` |

Ao final da Fase 4 **nenhum** `INSERT/UPDATE/DELETE` direto sobra em `billing_orders`, `billing_order_pallets`, `stock_movements` (via OF), `own_stock_movements` (via OF) no arquivo — todos passam pelas RPCs, garantindo transação única, tenant isolado e idempotência.

---

## Realtime

Canal `billing-orders-${companyId}` mantém `postgres_changes` em `billing_orders`, `billing_order_pallets`, `stock_movements` (filtrado por `billing_order_id IS NOT NULL`). Handlers apenas invalidam:

- `['billing_orders_bootstrap', companyId]`
- `['billing_orders_list', ...]`
- `['billing_order_detail', id]`
- `['stock_malha_*']` (Fase RPC de StockMalha já observa)

Nenhuma reprocessamento client-side — a próxima leitura já vem completa do banco.

---

## Riscos e regras críticas a preservar

1. **Sem release fantasma** — cálculo do `release` sempre limitado pelo saldo de `reserve` prévio da chave `(article_id, machine_id, is_second_quality)`.
2. **Baixa `out` por máquina** — `SUM(pallets.weight_kg) GROUP BY machine_id, is_second_quality`, nunca lança linha global quando há paletes.
3. **1ª qualidade exige `machine_id`** — validar no `launch_ready` e `edit_billing_order`.
4. **`own_stock` isolado** — se `articles.own_stock = true`, não escreve em `stock_movements`; escreve em `own_stock_movements`. Reversão idem.
5. **`delivery_doc_*` só em `status='ready'`** — RPC dedicada, `UPDATE` condicional para evitar conflito de digitação simultânea.
6. **`of_number` único** — geração + validação dentro da mesma transação, com `SELECT ... FOR UPDATE` de sentinela ou índice único já existente (retornar erro amigável em vez de `23505`).
7. **`reversal_quality` preservada** no revert/cancel — não zerar em edits.
8. **`link_group_id`** — merge deve escolher o menor UUID vivo entre os alvos; `remove_from_group` dissolve grupo com só 1 remanescente.
9. **Auditoria** — toda RPC grava `audit_logs` server-side com `author_name` / `author_code` recebidos, no mesmo padrão do `logAction` atual (não confiar no cliente para lembrar).
10. **Idempotência** — `{ok, already, conflict}` em toda mutação para tolerar double-click, retry de rede e Realtime que dispara antes do `await`.

---

## Checklist de validação (aplicar após cada fase)

1. `tsgo --noEmit` limpo.
2. Nenhum `.from('billing_orders')` / `.from('billing_order_pallets')` de escrita sobra em `src/pages/BillingOrders.tsx` ou `src/hooks/useBillingOrders.ts` (após Fase 3).
3. Fluxo `open → separating → ready → collected` executado por dois usuários simultâneos não gera duplicidade nem conflito silencioso — `{already:true}` no segundo.
4. Estorno via `revertToOpen` recompõe `stock_movements` com `SUM(peso_in) = SUM(peso_out)` da OF (query de conferência em `docs/BillingOrders.md §5`).
5. Cancelamento de OF em `separating` respeita `reversal_quality` escolhida.
6. Criação com `of_number` duplicado devolve `{ok:false, error:'duplicate_of_number'}` sem 500.
7. Edição não sobrescreve `pieces_real/weight_real/delivery_doc_*` (COALESCE + campos vetados).
8. `revertToOpen` **realmente** zera `delivery_doc_*`, `pieces_real`, `weight_real`, `separated_by`, `collected_by` (SET NULL, sem COALESCE) — testar visualmente.
9. Baixa em artigo `own_stock` não gera nenhuma linha em `stock_movements`, apenas em `own_stock_movements`.
10. Atrelamento merge escolhe o menor `link_group_id`; desatrelar deixa a última sem grupo.
11. Multi-tenant: chamar qualquer RPC com `p_company_id` de outra empresa devolve `Acesso negado` (mesmo padrão do pente fino de `rpcclientInvoices.md`).

---

**Status:** nada implementado — apenas planejamento. Aprovação por fase segue o padrão dos planos anteriores.
