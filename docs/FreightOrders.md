# FreightOrders.tsx — Documentação Técnica Completa

> Módulo **Ordem de Frete (OFR)** — coletas e entregas executadas por freteiros vinculados à empresa, com controle de status, fotos de entrega, precificação por kg e relatórios consolidados. Arquivos: `src/pages/FreightOrders.tsx` (~1.379 linhas), `src/hooks/useFreightOrders.ts` (~589 linhas), `src/components/freight/FreightReportsTab.tsx` (~684 linhas), `src/lib/freightOrderPdf.ts` (~278 linhas).

---

## 1. Propósito

Gerenciar todas as movimentações de frete de uma empresa multi-tenant:

- Cadastro de **freteiros** (com vínculo opcional a um `auth.user`/`profile` para acesso ao app) e de **empresas de rateio de custo** (quem paga o frete).
- Criação de **OFRs** com múltiplos itens (malha ou fio), origem, destino, documento (NF/ROM) e observações.
- Fluxo operacional: `Aberto → Frete em curso → Finalizado`, com fotos obrigatórias na entrega e preço por kg.
- Cancelamento com motivo obrigatório em qualquer etapa não finalizada.
- **Relatórios** com KPIs (rolos, kg, receita, custo, lucro), filtros de mês/freteiro/empresa e exportação PDF.
- Notificações **push** para admins e para o freteiro vinculado a cada evento (criada / finalizada / freteiro alterado).

---

## 2. Permissões

Baseadas em `usePermissions().role`:

| Role           | Pode ver | Nova OFR | Iniciar / Finalizar | Editar (open) | Cancelar | Cadastro Freteiros / Empresas | Relatórios |
|----------------|----------|----------|---------------------|---------------|----------|-------------------------------|------------|
| `admin`        | Todas    | ✅       | ✅                  | ✅            | ✅       | ✅                            | Completos (com valores $) |
| `lider_frete`  | Todas    | ✅       | ✅                  | ✅            | ✅       | ✅                            | Completos |
| `freteiro`     | Só as suas (RLS por `freighter_id → user_id`) | ❌ | ✅ | ❌ | ❌ | ❌ | Somente as suas, sem valores financeiros |

Módulo condicionado a `freight_orders` presente em `company_settings.enabled_nav_items`.

---

## 3. Modelo de Dados

### 3.1 `freighters` (10 col)
`id, company_id, user_id, profile_id, name, phone, vehicle, active, created_at`. `user_id` liga o freteiro a uma conta que faz login e recebe push; `profile_id` guarda o `profiles.id` correspondente para exibir Nome #Código.

### 3.2 `freight_cost_companies` (7 col)
`id, company_id, name, document, active, created_at`. Empresa que **paga** o frete (rateio de custo). O nome é **snapshotado** em `freight_orders.cost_company_name` no momento da criação para preservar histórico caso o cadastro seja renomeado depois.

### 3.3 `freight_orders` (28 col)
Cabeçalho da OFR. Campos-chave:

- Identidade: `id`, `company_id`, `ofr_number` (string sequencial única por empresa, `UNIQUE (company_id, ofr_number)`).
- Vínculos: `freighter_id`, `cost_company_id`, `cost_company_name` (snapshot).
- Trajeto: `pickup_location`, `delivery_location`, `observations`.
- Documento: `delivery_doc_type` (`nf` | `rom` | null), `delivery_doc_number`.
- Status: `status` (`open` | `pickup_in_progress` | `delivery_in_progress` | `completed` | `cancelled`).
- Auditoria de transições: `created_by`, `pickup_started_at/by`, `delivery_started_at/by`, `completed_at/by`, `cancelled_at/by`, `cancellation_reason`.
- Financeiro: `freight_price_per_kg`, `freight_total` (calculado no servidor = kg total × preço/kg).

### 3.4 `freight_order_items` (12 col)
`id, freight_order_id, company_id, item_type (malha|fio), article_id, article_name, yarn_type_id, yarn_type_name, boxes, pieces, weight_kg, created_at`. Snapshots (`article_name`, `yarn_type_name`) preservam o rótulo se o cadastro for renomeado.

### 3.5 `freight_order_photos` (7 col)
`id, freight_order_id, company_id, storage_path, description, uploaded_by, created_at`. Arquivos residem no bucket privado **`freight-photos`** (path: `${company_id}/${order_id}/${uuid}.${ext}`). Acesso via `createSignedUrl` (expiração 1h por padrão).

### 3.6 RLS
Todas as tabelas com `company_id = get_user_company_id()`. Em `freight_orders`/`freight_order_items` há política adicional para role `freteiro` restringir a `freighter_id IN (SELECT id FROM freighters WHERE user_id = auth.uid())`.

---

## 4. Hook `useFreightOrders`

### 4.1 Queries

| Chave React Query                              | Fonte                                                              |
|------------------------------------------------|--------------------------------------------------------------------|
| `['freighters', company_id]`                   | `freighters` ordenado por nome                                     |
| `['freight_cost_companies', company_id]`       | `freight_cost_companies` ordenado por nome                         |
| `['freight_orders', company_id]`               | `freight_orders` **+ joins**: `freighter`, `cost_company`, `items(*, article(...))`, `photos`, e 5 aliases de `profiles` (creator/pickup_starter/delivery_starter/completer/canceller) para exibir autoria como *Nome #Código* |

### 4.2 Realtime

Canal único `freight_orders_rt_${company_id}` assina eventos `*` (INSERT/UPDATE/DELETE) em `freight_orders`, `freight_order_items`, `freight_order_photos`, `freighters` e `freight_cost_companies`, invalidando as chaves acima. Atende a regra global de OFR obrigatoriamente em tempo real (memória `features/ofr-realtime`).

### 4.3 Numeração — `nextOfrNumber()`

Percorre **todas** as OFRs da empresa e devolve `max(ofr_number)+1`. Como não é atômico, o `createOrder` faz **retry** até 5x tratando `23505` (unique_violation) para vencer race conditions de admins criando ao mesmo tempo.

### 4.4 Mutations

#### `createOrder`
1. Snapshotta `cost_company_name` a partir do cache local.
2. Loop de retry inserindo cabeçalho com `ofr_number` gerado.
3. Insere `freight_order_items` em batch; **em caso de erro faz rollback** deletando o cabeçalho para não deixar `ofr_number` consumido.
4. Dispara `send-push-notification` com `include_admins: true` + `target_user_ids: [freighter.user_id]`; título `Nova OFR #N — {freteiro}`, mensagem com peças/caixas/kg e link `/{slug}/freight-orders`.

#### `updateOrder`
- Só permite editar quando `status = 'open'` (checagem via `select` prévio).
- Atualiza cabeçalho, **deleta e re-insere** todos os itens (transacional a nível de aplicação — se re-insert falhar, faz rollback restaurando o snapshot).
- Se `freighter_id` mudou, **notifica o novo freteiro** e remove visibilidade para o antigo (não há delete de push antigo — o novo freteiro apenas passa a ver na listagem via RLS).

#### `startPickup`
`UPDATE ... SET status='pickup_in_progress', pickup_started_at=now(), pickup_started_by=profile.id WHERE id=? AND status='open'`. Update **condicional** evita duplicar transição.

#### `completeOrder`
1. Valida 1–2 fotos (obrigatório mínimo 1, máximo 2).
2. Faz upload no bucket `freight-photos` (path com `crypto.randomUUID()` para evitar colisão).
3. Insere linhas em `freight_order_photos`.
4. Recalcula `totalKg` server-side (`sum(weight_kg)` da tabela de itens).
5. Calcula `freight_total = round(totalKg * pricePerKg * 100) / 100`.
6. `UPDATE freight_orders SET status='completed', completed_at, completed_by, freight_price_per_kg, freight_total, delivery_doc_* ... WHERE id=? AND status IN ('pickup_in_progress','delivery_in_progress')`.
7. Push **para admins** com título `OFR #N finalizada — {freteiro}`.

#### `cancelOrder`
`UPDATE ... SET status='cancelled', cancelled_at, cancelled_by, cancellation_reason=? WHERE id=?`. Motivo obrigatório na UI.

#### CRUD auxiliar
- `createFreighter / updateFreighter / deleteFreighter` — inclui `active` para toggle.
- `createCostCompany / updateCostCompany / deleteCostCompany` — o snapshot em `freight_orders.cost_company_name` protege OFRs antigas se a empresa for excluída.

#### `getPhotoSignedUrl(path, expires=3600)`
Envelopa `supabase.storage.from('freight-photos').createSignedUrl` — usado no modal de detalhes/PDF para carregar fotos privadas.

---

## 5. Página `FreightOrders.tsx`

### 5.1 Abas (`TabKey`)
`open`, `in_progress` (une `pickup_in_progress`+`delivery_in_progress`), `completed`, `cancelled`, `reports`. Cabeçalho da aba mostra badge com contagem — exceto `reports`, cujo número foi ocultado a pedido do usuário.

### 5.2 Estado local
`tab`, `searchTerm`, `completedPage` (paginação 15/pg apenas em Finalizados), modais (`newOpen`, `editOrder`, `freightersOpen`, `costCompaniesOpen`, `detailsOrder`, `completeOrderId`, `cancelOrderId`) e `companyName/companyLogo` (fetch avulso para logotipo no PDF).

### 5.3 Filtro `filtered`
Aplica `tabOfStatus` e busca textual (case-insensitive) em: `ofr_number`, `freighter.name`, `cost_company_name`, `pickup_location`, `delivery_location`, `delivery_doc_number`, `items[].article.name/article_name`, `items[].yarn_type_name`.

### 5.4 Ticker
`useTicker(tab === 'in_progress')` força re-render a cada 1s para atualizar o contador `elapsed()` das OFRs em curso.

### 5.5 Handlers dos cartões
- **Iniciar Frete** → `startPickup.mutate(order.id)`.
- **Finalizar** → abre `CompleteOFRModal` (fotos + preço/kg + doc opcional).
- **Cancelar** → abre `CancelOFRModal` (motivo).
- **Editar** → abre `NewOFRModal` em modo edição (só se `status='open'`).
- **Baixar PDF** → `generateFreightOrderPdf(order, companyName, companyLogo)`.
- **Detalhes** → abre `DetailsModal` (auditoria + itens + fotos com signed URL).

### 5.6 Modais principais

| Modal                    | Responsabilidade                                                                                          |
|--------------------------|-----------------------------------------------------------------------------------------------------------|
| `NewOFRModal`            | Criação/edição — freteiro, empresa de rateio, coleta/entrega, doc, observações, N itens (malha/fio) com `SearchableSelect` e `BrazilianWeightInput`. |
| `CompleteOFRModal`       | Upload 1–2 fotos + descrição, `freight_price_per_kg`, `delivery_doc_type/number` (se ainda não preenchido). |
| `CancelOFRModal`         | Motivo obrigatório (textarea).                                                                            |
| `DetailsModal`           | Cabeçalho, auditoria completa (quem/quando de cada transição), itens, fotos (via `getPhotoSignedUrl`).    |
| `FreightersManagerModal` | CRUD freteiros com toggle `active` e binding opcional a `profiles` (para push).                           |
| `CostCompaniesModal`     | CRUD empresas de rateio com toggle `active` e documento (CNPJ opcional).                                  |

### 5.7 Paginação
Somente na aba **Finalizados**: 15 registros por página, contador `n–m de total`, botões Anterior/Próxima. `completedPage` reseta ao trocar busca ou aba.

---

## 6. `FreightReportsTab`

Consome `orders.filter(status==='completed')` e agrupa client-side (candidato futuro a RPC).

### 6.1 Filtros
- **Mês** — padrão `mês corrente` (memory `features/date-range-filtering`); dropdown lista meses com dados.
- **Freteiro** (`all` | id) e **Empresa** (`all` | id | `none`).
- **Busca** textual.
- Paginação **20/pg** (janela deslizante para não vazar no mobile).

### 6.2 KPIs
Rolos (soma de `pieces`), Peso Total (`weight_kg`), Receita (visível apenas para admin/lider), Custo (`freight_total`), Lucro (Receita − Custo). No mobile os cards são empilhados; para `freteiro` os cards financeiros são omitidos.

### 6.3 Exportação PDF
`jsPDF + autoTable`, com `sanitizePdfText` para caracteres não-latinos. Colunas: OFR, Data, Freteiro, Empresa, Coleta → Entrega, Peças, Kg, R$/kg, Total. Cabeçalho com logo (`companyLogoUrl`) quando disponível.

---

## 7. `freightOrderPdf.ts`

Gera PDF individual de uma OFR:
- Cabeçalho colorido conforme status (azul/âmbar/verde/cinza) — mesmo padrão da OF.
- Dados: número, status, freteiro, empresa (com snapshot), trajeto, doc entrega, criador, timestamps de cada transição (`fmtDateTime`) e `duration()` total.
- Tabela de itens (tipo, artigo/fio, caixas, peças, kg).
- Se `completed`: preço/kg, kg total, `freight_total`.
- Fotos embutidas via `fetchImageDataUrl` (converte para dataURL) — busca a URL pública/assinada antes.
- Rodapé com paginação e observações.

---

## 8. Notificações Push (integração)

Chama `supabase.functions.invoke('send-push-notification', {...})` com `source: 'OFR'` e `ref_id`/`ref_number` para deduplicação server-side (ver `docs/mestre.md` — pente fino do sistema de push).

| Evento               | Alvo                                                     |
|----------------------|----------------------------------------------------------|
| OFR criada           | admins + freteiro vinculado (`user_id`)                  |
| Freteiro alterado    | novo freteiro (o antigo perde visibilidade via RLS)      |
| OFR finalizada       | admins                                                    |

Todas as chamadas são `catch(()=>{})` — falha silenciosa não bloqueia a operação principal.

---

## 9. Regras Críticas

1. **`ofr_number` único por empresa** — retry até 5x em `23505`.
2. **Snapshot do nome da empresa de rateio** grava no cabeçalho para preservar histórico.
3. **Rollback manual do cabeçalho** se a inserção dos itens falhar.
4. **Edição só em `open`** — enforcement no hook (checagem `select` prévio) e na UI (esconde botão em outros status).
5. **UPDATEs condicionais por status** (`.eq('status','open')`, `.in('status',[...])`) previnem transições duplicadas.
6. **Fotos obrigatórias** para finalizar (1–2). Bucket privado; sempre `createSignedUrl`.
7. **`freight_total` calculado no servidor**, não no cliente, evitando divergência com o dado real de `freight_order_items`.
8. **Cancelamento exige motivo**.
9. **Autoria** exibida como *Nome #Código* via joins nomeados em `profiles` (padrão global — memory `security/audit-and-authorship`).
10. **Realtime obrigatório** — canal invalida chaves em qualquer alteração das 5 tabelas.

---

## 10. Riscos / Melhorias Futuras

- `nextOfrNumber()` percorre a tabela inteira; candidato a RPC `get_next_ofr_number()` com `SELECT FOR UPDATE` sentinela (padrão `create_billing_order`).
- Query principal traz **todos** os campos + 5 joins de `profiles`; pode migrar para RPCs paginadas (`get_freight_orders_list` por aba) no padrão `docs/rpcBillingOrders.md`.
- Agregação de relatórios é 100% client-side — candidata a `get_freight_reports_metrics` seguindo `get_faturamento_total_metrics`.
- `updateOrder` faz delete+insert de itens em duas chamadas HTTP (não é uma transação SQL única) — se a rede cair entre as duas, o rollback best-effort pode falhar. RPC atômica resolveria.
- `RLS` para role `freteiro` depende do vínculo `freighters.user_id`; se esquecer de vincular, o freteiro não vê nada.

---

## 11. Checklist de Comportamentos Esperados

1. Criar OFR → aparece na aba **Aberto** em todos os clientes conectados (realtime).
2. Iniciar → move para **Frete em curso** com cronômetro rodando.
3. Finalizar sem foto → toast de erro; com foto → move para **Finalizados**, calcula `freight_total`.
4. Cancelar sem motivo → botão bloqueado; com motivo → aba **Cancelados** com auditoria.
5. Editar OFR fora de `open` → botão oculto.
6. Alterar freteiro na edição → novo freteiro passa a ver e recebe push; antigo perde a linha.
7. Dois admins criando ao mesmo tempo → nenhum recebe erro de duplicidade (retry).
8. Excluir empresa de rateio → OFRs antigas seguem exibindo o nome (snapshot).
9. Freteiro sem `user_id` vinculado → não recebe push, mas OFRs criadas ainda aparecem para admins.
10. Aba Relatórios abre com **mês corrente** filtrado; freteiro não vê valores $.
11. Fotos da OFR só carregam via signed URL (nunca link público).

---

_Última atualização: 18/07/2026 — este documento é a fonte de verdade para o módulo Ordem de Frete (OFR). Manter sincronizado com futuras migrações RPC._