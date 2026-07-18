# Plano de migração para RPC — Ordem de Frete (OFR)

**Arquivo alvo:** `src/pages/FreightOrders.tsx` (~1.379 linhas) + `src/hooks/useFreightOrders.ts` (~589 linhas) + `src/components/freight/FreightReportsTab.tsx` (~684 linhas) + `src/lib/freightOrderPdf.ts` (~278 linhas).
**Doc funcional:** `docs/FreightOrders.md`.
**Padrão de referência:** `docs/rpcBillingOrders.md`, `docs/rpcInvoices.md`, `docs/rpcclientInvoices.md`, `docs/rpcstockMalha.md`, `get_faturamento_total_metrics`.
**Objetivo:** eliminar todos os `INSERT/UPDATE/DELETE` diretos do cliente e as leituras massivas com 5 joins de `profiles`, consolidando cada operação em uma RPC atômica `SECURITY DEFINER` com isolamento multi-tenant obrigatório, geração de `ofr_number` sem race e agregação de relatórios 100% server-side.

---

## 0. Regras herdadas (não negociáveis)

Toda RPC nova deste plano:

1. `SECURITY DEFINER SET search_path = public`, `LANGUAGE plpgsql` (ou `sql STABLE` para leituras puras).
2. `GRANT EXECUTE ... TO anon, authenticated, service_role`.
3. Primeira instrução do corpo:
   ```sql
   v_caller_company := public.get_user_company_id();
   IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
     RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
   END IF;
   ```
   Em RPCs que recebem apenas `p_id`, buscar `company_id` da linha via `SELECT ... FOR UPDATE` **antes** de qualquer mutação e validar contra `get_user_company_id()`.
4. Idempotência via `{ok:true, already:true}` quando o `SELECT FOR UPDATE` não encontra a linha esperada ou quando o estado já é o alvo — evita double-click e race com Realtime.
5. Toda transição de status usa `UPDATE ... WHERE id = p_id AND status = p_expected_status RETURNING id`, preservando a proteção contra concorrência que hoje mora nos `.eq('status',...)` de `useFreightOrders`.
6. Nunca sobrescrever colunas opcionais com `NULL` em `UPDATE` — usar `COALESCE(p_x, coluna)`; exceções documentadas por RPC (ex.: `cancelOrder` grava `cancellation_reason` novo, `completeOrder` grava `delivery_doc_*` somente se ainda vazio).
7. **Role `freteiro`** — RLS já filtra por `freighter.user_id = auth.uid()`; mesmo assim toda RPC de escrita valida se o caller pode operar aquela OFR (admin/lider_frete livre; freteiro só pode `start_freight_pickup` e `complete_freight_order` das suas). Enforcement server-side além do RLS.
8. Toda RPC de escrita registra em `audit_logs` server-side (recebe `p_author_name`/`p_author_code`) — deixa de depender do cliente lembrar de auditar.
9. **Snapshots preservados** — `cost_company_name` no header e `article_name`/`yarn_type_name` nos itens são gravados pela RPC no INSERT (não vindos do cliente cru), garantindo histórico mesmo se cadastros forem renomeados/excluídos.

---

## Fase 1 — Bootstrap de metadados

**Problema atual:** ao abrir `/freight-orders`, `useFreightOrders` faz 3 queries independentes (`freighters`, `freight_cost_companies`, `freight_orders` com 5 joins de `profiles`) mais consultas via `CompanyDataContext` (articles, yarn types) só para popular selects. Nada consolida os contadores de abas e a lista de meses do relatório é calculada em memória.

### RPC `get_freight_orders_bootstrap(p_company_id uuid)`

Retorno JSON:

```json
{
  "company": { "id": "...", "name": "...", "logo_url": "...", "slug": "..." },
  "role_scope": "admin" | "lider_frete" | "freteiro",
  "freighter_id": "..." | null,
  "freighters": [ { "id": "...", "name": "...", "phone": "...", "vehicle": "...", "user_id": "...", "profile_id": "...", "active": true } ],
  "cost_companies": [ { "id": "...", "name": "...", "document": "...", "active": true } ],
  "stats": { "open": 0, "in_progress": 0, "completed_month": 0, "cancelled_month": 0 },
  "available_months": ["2026-07", "2026-06"],
  "next_ofr_number": "142"
}
```

- `available_months`: `DISTINCT to_char(completed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') DESC` UNION mês corrente.
- `next_ofr_number`: mesma lógica de `useFreightOrders.nextOfrNumber` (maior numérico + 1), server-side.
- `role_scope` / `freighter_id`: quando o caller é freteiro, o cliente já sabe filtrar UI sem depender só do RLS.
- `stats` respeita o escopo do caller (freteiro vê só o que enxerga via RLS).

Cliente:

- Nova `useQuery(['freight_orders_bootstrap', companyId], staleTime: 60s)`.
- Substitui as três queries de metadados (`freighters`/`cost_companies`/contagens) e o cálculo local de meses/`nextOfrNumber`. `useFreightOrders` continua responsável pela **lista completa** (Fase 2).

---

## Fase 2 — Leituras paginadas server-side

**Problema atual:** `useFreightOrders` traz **todas** as OFRs da empresa em uma única query com joins pesados (`freighter`, `cost_company`, `items(*, article(...))`, `photos`, e 5 aliases de `profiles` para autoria). Para tenants ativos isso cresce sem limite; abas, busca e paginação de Finalizados são todas em memória (`useMemo` + `filtered.slice`).

### RPC `get_freight_orders_list(p_company_id, p_view, p_search, p_freighter_id, p_cost_company_id, p_month, p_start_date, p_end_date, p_page, p_page_size)`

- `p_view`: `'open' | 'in_progress' | 'completed' | 'cancelled' | 'all'`.
  - `in_progress` = `status IN ('pickup_in_progress','delivery_in_progress')`.
- Retorno:
  ```json
  {
    "rows": [ { "...freight_orders": "...", "freighter_name": "...", "freighter_phone": "...",
                "cost_company_name": "...", "created_by_name": "...", "created_by_code": 0,
                "pickup_started_by_name": "...", "delivery_started_by_name": "...",
                "completed_by_name": "...", "cancelled_by_name": "...",
                "items": [ { "id": "...", "item_type": "malha", "article_name": "...", "yarn_type_name": null,
                             "boxes": 0, "pieces": 0, "weight_kg": 0 } ],
                "photos_count": 2 } ],
    "total_count": 1234
  }
  ```
- Itens vêm aninhados via `jsonb_agg` em CTE (padrão de `get_client_invoices_search`). Fotos só devolvem contagem — signed URLs seguem sob demanda.
- Busca textual server-side em `ofr_number`, `freighter.name`, `cost_company_name`, `pickup_location`, `delivery_location`, `delivery_doc_number`, `items.article_name`, `items.yarn_type_name` (mesmos 8 campos de hoje).
- Ordenação: `created_at DESC` para abas ativas; `completed_at DESC` para "Finalizados"; `cancelled_at DESC` para "Cancelados".
- Enforcement de escopo: quando caller é freteiro, injeta `AND freighter_id IN (SELECT id FROM freighters WHERE user_id = auth.uid())`.

### RPC `get_freight_order_detail(p_company_id, p_id)`

Payload completo para o modal de detalhes (auditoria de cada transição, itens, fotos com `storage_path`/`description`). Elimina a necessidade de manter todas as OFRs em memória para abrir uma. Signed URLs continuam sendo geradas via `supabase.storage` no cliente (não faz sentido devolver URL assinada em RPC — expira em 1h).

### Realtime

O canal `freight_orders_rt_${companyId}` continua vivo em `useFreightOrders`, mas passa apenas a **invalidar** as chaves:

- `['freight_orders_bootstrap', companyId]` — para stats/next_ofr_number/freighters/cost_companies.
- `['freight_orders_list', view, ...]` — só a view impactada.
- `['freight_order_detail', id]` (quando o `payload.new.id`/`payload.old.id` for o aberto).

A regra global de OFR obrigatoriamente em tempo real (memory `features/ofr-realtime`) é preservada — publication + REPLICA IDENTITY FULL nas 5 tabelas já existentes.

---

## Fase 3 — Escritas atômicas (máquina de estados)

Substitui todas as chamadas de `useFreightOrders.createOrder`, `updateOrder`, `startPickup`, `completeOrder`, `cancelOrder`, `createFreighter`/`updateFreighter`/`deleteFreighter`, `createCostCompany`/`updateCostCompany`/`deleteCostCompany` por RPCs. Cada uma segue o **contrato** da §0 e retorna `{ok, already, conflict?}`.

### `create_freight_order(p_company_id, p_payload jsonb, p_items jsonb, p_author_name, p_author_code)`

Substitui `useFreightOrders.createOrder` (hoje faz retry manual até 5x + rollback manual do header se itens falharem):

1. `SELECT ... FOR UPDATE` numa linha sentinela (padrão `create_billing_order`) para serializar a geração de `ofr_number` — elimina a race que hoje o cliente combate com retry 5x em `23505`.
2. Snapshot server-side de `cost_company_name` (busca `freight_cost_companies.name` do `cost_company_id` do payload).
3. `INSERT` do cabeçalho + `INSERT` em batch dos itens (`freight_order_items`) — tudo na mesma transação, então **rollback é automático** se os itens falharem (dispensa o `deleteHeader` best-effort atual).
4. Snapshot server-side de `article_name` (join com `articles`) e `yarn_type_name` (join com `yarn_types`) em cada item — cliente não precisa mais montar isso.
5. Se `p_payload.ofr_number` vier do cliente e já existir, devolve `{ok:false, error:'duplicate_ofr_number', existing_id}` em vez de estourar `23505`.
6. `audit_logs` server-side. Devolve `{ok:true, id, ofr_number}` + payload para o cliente disparar o `send-push-notification` (a chamada da edge function continua no cliente porque depende de `supabase.functions.invoke`).

### `update_freight_order(p_company_id, p_id, p_payload jsonb, p_items jsonb, p_author_name, p_author_code)`

Substitui `useFreightOrders.updateOrder`:

1. `FOR UPDATE` na OFR, valida tenant e `status='open'` (edição só nesse estado — enforcement server-side em vez de checagem `select` prévio + `.eq('status','open')`).
2. Detecta troca de freteiro comparando `p_payload->>freighter_id` com o valor atual e devolve `{ freighter_changed: true, old_freighter_id, new_freighter_id }` para o cliente disparar push apropriada.
3. Atualiza cabeçalho via `COALESCE` (nunca sobrescreve com NULL).
4. Sincroniza `freight_order_items`: `DELETE WHERE freight_order_id = p_id` + `INSERT` do array — agora em **transação SQL única** (hoje são duas chamadas HTTP com rollback best-effort).
5. Refaz snapshots de `article_name`/`yarn_type_name` nos itens novos.
6. Auditoria e retorno `{ok, already, freighter_changed, old_freighter_id, new_freighter_id}`.

### `start_freight_pickup(p_company_id, p_id, p_author_name, p_author_code)`

- `FOR UPDATE`, valida tenant e escopo (freteiro só pode iniciar as suas).
- `UPDATE freight_orders SET status='pickup_in_progress', pickup_started_at=now(), pickup_started_by=v_profile_id WHERE id=p_id AND status='open' RETURNING id`.
- Se `NOT FOUND`: devolve `{ok:true, already:true, current_status: ...}`.

### `complete_freight_order(p_company_id, p_id, p_price_per_kg numeric, p_delivery_doc_type text, p_delivery_doc_number text, p_photos jsonb, p_author...)`

Encapsula o fluxo hoje espalhado entre `CompleteOFRModal` e `useFreightOrders.completeOrder`:

1. `FOR UPDATE`, valida tenant, escopo e `status IN ('pickup_in_progress','delivery_in_progress')`.
2. Valida `array_length(p_photos)` BETWEEN 1 AND 2 (enforcement server-side além do UI).
3. Insere as linhas em `freight_order_photos` com os `storage_path` (upload continua no cliente, RPC só grava o registro pós-upload).
4. Recalcula `v_total_kg := (SELECT SUM(weight_kg) FROM freight_order_items WHERE freight_order_id = p_id)` — **server-side, ignora o total do cliente** (evita divergência com dado real).
5. Calcula `v_freight_total := round(v_total_kg * p_price_per_kg * 100) / 100`.
6. `UPDATE freight_orders SET status='completed', completed_at=now(), completed_by=v_profile_id, freight_price_per_kg=p_price_per_kg, freight_total=v_freight_total, delivery_doc_type=COALESCE(p_delivery_doc_type, delivery_doc_type), delivery_doc_number=COALESCE(p_delivery_doc_number, delivery_doc_number) WHERE id=p_id AND status IN ('pickup_in_progress','delivery_in_progress') RETURNING id`.
7. Auditoria e retorno `{ok, already, total_kg, freight_total}`.

### `cancel_freight_order(p_company_id, p_id, p_reason text, p_author...)`

- Motivo obrigatório (RPC valida `p_reason IS NOT NULL AND length(trim(p_reason)) > 0`).
- Cancela em qualquer status ≠ `completed`/`cancelled`.
- `UPDATE ... SET status='cancelled', cancelled_at=now(), cancelled_by=v_profile_id, cancellation_reason=p_reason WHERE id=p_id AND status NOT IN ('completed','cancelled') RETURNING id`.

### CRUD auxiliar

- `save_freighter(p_company_id, p_id?, p_payload jsonb, p_author...)` — INSERT/UPDATE em `freighters` com vínculo opcional a `profiles` (busca `profile_id` a partir de `user_id`).
- `delete_freighter(p_company_id, p_id, p_author...)` — só quando não há OFR ativa vinculada (`RAISE EXCEPTION 'Freteiro tem OFRs ativas'` caso contrário); alternativamente marca `active=false` (soft delete — replicar exatamente o comportamento atual do hook).
- `save_cost_company(p_company_id, p_id?, p_payload jsonb, p_author...)` — INSERT/UPDATE em `freight_cost_companies`.
- `delete_cost_company(p_company_id, p_id, p_author...)` — snapshot `cost_company_name` já preserva OFRs antigas, então DELETE hard é seguro.

---

## Fase 4 — Relatórios e auxiliares

### `get_freight_reports_metrics(p_company_id, p_freighter_id, p_cost_company_id, p_month, p_start_date, p_end_date, p_search, p_page, p_page_size)`

Move a agregação de `FreightReportsTab` (hoje 100% client-side sobre `orders.filter(status==='completed')`) para o banco. Retorno:

```json
{
  "kpis": {
    "orders_count": 0, "total_pieces": 0, "total_boxes": 0, "total_kg": 0,
    "revenue": 0,
    "cost": 0,
    "profit": 0
  },
  "rows": [ { "id": "...", "ofr_number": "...", "completed_at": "...",
              "freighter_name": "...", "cost_company_name": "...",
              "pickup_location": "...", "delivery_location": "...",
              "pieces": 0, "weight_kg": 0, "freight_price_per_kg": 0, "freight_total": 0 } ],
  "total_count": 0
}
```

- Filtro padrão do cliente continua sendo o mês corrente (memory `features/date-range-filtering`).
- Enforcement de escopo por role idêntico à Fase 2 (freteiro nunca recebe `revenue`/`profit`).
- Paginação server-side 20/pg (janela deslizante no cliente permanece).
- `revenue` = SUM(receita da OFR — hoje não existe no schema direto; o cliente cruza com `productions`/`outsource_productions`). **Verificar fonte real em auditoria** antes de implementar; se depender de dado externo, quebrar em RPC separada `get_freight_revenue_by_period` ou manter `revenue`/`profit` como `null` no payload.

### `get_freight_orders_export(p_company_id, p_filters jsonb)`

Payload pronto para o PDF do relatório (colunas OFR/Data/Freteiro/Empresa/Coleta→Entrega/Peças/Kg/R$/kg/Total). `FreightReportsTab` para de montar linha por linha manualmente.

### `get_freight_order_pdf_payload(p_company_id, p_id)`

Payload pronto para `freightOrderPdf.ts`: header colorido por status, auditoria completa (nomes + `#codigo`), itens, fotos (com `storage_path` para o cliente resolver via `createSignedUrl`) e durações calculadas. Cliente para de fazer 5 joins de `profiles` só para imprimir uma OFR.

---

## Refactor no cliente (por fase)

| Fase | Arquivos tocados | Substituições |
|---|---|---|
| 1 | `src/pages/FreightOrders.tsx`, `src/hooks/useFreightOrders.ts` | `useQuery(bootstrap)` — badges, meses, `next_ofr_number`, freighters, cost_companies |
| 2 | `useFreightOrders.ts`, `FreightOrders.tsx` | Query única por aba (`get_freight_orders_list`), remoção dos `useMemo` de filtro/paginação, detalhe via `get_freight_order_detail` sob demanda |
| 3 | `useFreightOrders.ts` inteiro | Toda mutação vira `supabase.rpc(...)`; hook fica só com Realtime + invalidação + funções finas (`createOrder`, `updateOrder`, `startPickup`, `completeOrder`, `cancelOrder`, `saveFreighter`, `deleteFreighter`, `saveCostCompany`, `deleteCostCompany`). Push notifications continuam sendo disparadas no cliente com os campos que a RPC devolve (`ofr_number`, `freighter_changed`, `old/new_freighter_id`). |
| 4 | `FreightReportsTab.tsx`, `freightOrderPdf.ts` | Relatório consome `get_freight_reports_metrics`; export PDF consome `get_freight_orders_export`/`get_freight_order_pdf_payload` |

Ao final da Fase 4 **nenhum** `INSERT/UPDATE/DELETE` direto sobra em `freight_orders`, `freight_order_items`, `freight_order_photos`, `freighters`, `freight_cost_companies` nesses arquivos — todos passam pelas RPCs, garantindo transação única, tenant isolado, snapshot preservado e idempotência.

---

## Realtime

Canal `freight_orders_rt_${companyId}` mantém `postgres_changes` nas 5 tabelas. Handlers apenas invalidam:

- `['freight_orders_bootstrap', companyId]`
- `['freight_orders_list', ...]`
- `['freight_order_detail', id]`

Nenhum reprocessamento client-side — a próxima leitura já vem completa do banco. Preserva a memory `features/ofr-realtime`.

---

## Riscos e regras críticas a preservar

1. **`ofr_number` único por empresa** — geração + validação dentro da mesma transação via `SELECT ... FOR UPDATE` de sentinela, retornando `{ok:false, error:'duplicate_ofr_number'}` em vez de `23505`. Elimina o retry 5x do cliente.
2. **Snapshots preservados** — `cost_company_name` no header e `article_name`/`yarn_type_name` nos itens são gravados server-side no INSERT (não confiar em payload do cliente).
3. **Edição só em `status='open'`** — enforcement server-side no `update_freight_order`.
4. **Rollback automático de itens** — `create_freight_order`/`update_freight_order` executam header + itens numa única transação SQL. Elimina o `deleteHeader` best-effort de hoje.
5. **`freight_total` sempre server-side** — RPC recalcula `SUM(weight_kg)` dos itens e nunca aceita total do cliente.
6. **Fotos obrigatórias na finalização** — enforcement `1 <= array_length(p_photos) <= 2` no `complete_freight_order`, além do UI.
7. **Cancelamento com motivo obrigatório** — validação server-side no `cancel_freight_order`.
8. **Escopo por role** — freteiro só opera as próprias OFRs; enforcement além do RLS em toda RPC de escrita.
9. **Troca de freteiro** — `update_freight_order` devolve `freighter_changed` + `old/new_freighter_id` para o cliente disparar push ao novo freteiro. Visibilidade do antigo é removida via RLS.
10. **Auditoria** — toda RPC grava `audit_logs` server-side com `author_name`/`author_code` recebidos.
11. **Idempotência** — `{ok, already, conflict}` em toda mutação para tolerar double-click, retry de rede e Realtime que dispara antes do `await`.
12. **Bucket privado `freight-photos`** — RPC só grava linhas em `freight_order_photos`; upload/signed URL continuam no cliente (Storage não é acessível de dentro de função SQL).
13. **Push notifications continuam no cliente** — `supabase.functions.invoke('send-push-notification', ...)` não é chamável de dentro de RPC. A RPC devolve os campos necessários (`ofr_number`, `freighter_changed`, `old/new_freighter_id`, `include_admins`) para o cliente disparar, mantendo dedup por `source=OFR`/`ref_id`/`ref_number`.

---

## Checklist de validação (aplicar após cada fase)

1. `tsgo --noEmit` limpo.
2. Nenhum `.from('freight_orders')` / `.from('freight_order_items')` / `.from('freight_order_photos')` / `.from('freighters')` / `.from('freight_cost_companies')` de escrita sobra em `src/pages/FreightOrders.tsx`, `src/hooks/useFreightOrders.ts`, `src/components/freight/FreightReportsTab.tsx` (após Fase 3/4).
3. Dois admins criando OFRs simultaneamente não recebem `23505` — retorno amigável `{ok:false, error:'duplicate_ofr_number'}` ou geração serializada com `FOR UPDATE`.
4. Criar OFR → aparece na aba **Aberto** em todos os clientes conectados via Realtime (invalidação).
5. Iniciar → move para **Frete em curso**; segunda chamada devolve `{already:true}`.
6. Finalizar sem foto → RPC devolve erro amigável; com 1–2 fotos → move para **Finalizados**, `freight_total` server-side confere com `SUM(items.weight_kg) * price_per_kg` arredondado.
7. Cancelar sem motivo → RPC devolve erro amigável; com motivo → aba **Cancelados** com auditoria completa.
8. Editar OFR fora de `open` → RPC devolve erro amigável.
9. Alterar freteiro na edição → novo freteiro passa a ver (RLS) e recebe push; antigo perde a linha; RPC devolve `freighter_changed:true`.
10. Excluir empresa de rateio → OFRs antigas seguem exibindo o nome (snapshot server-side preservado).
11. Freteiro sem `user_id` vinculado → não recebe push, mas OFRs criadas ainda aparecem para admins.
12. Aba Relatórios abre com **mês corrente** filtrado; freteiro não vê KPIs `revenue`/`profit`; paginação 20/pg vem do servidor.
13. Fotos da OFR só carregam via `createSignedUrl` no cliente (RPC devolve `storage_path`, não URL).
14. Multi-tenant: chamar qualquer RPC com `p_company_id` de outra empresa devolve `Acesso negado`.

---

**Status:** nada implementado — apenas planejamento. Aprovação por fase segue o padrão dos planos anteriores (`rpcInvoices.md` → `rpcclientInvoices.md` → `rpcstockMalha.md` → `rpcBillingOrders.md`).
