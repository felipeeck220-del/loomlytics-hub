# Ordem de Faturamento (OF) — Documentação Técnica de `src/pages/BillingOrders.tsx`

> Rota: `/:slug/billing-orders` · Hook central: `src/hooks/useBillingOrders.ts` · Realtime via canal Postgres.
> Este documento cobre 100% do funcionamento da tela — banco, fluxo, código, permissões, integrações com estoque e PDF.

---

## 1. Propósito

A OF (Ordem de Faturamento) é o documento operacional que liga o Admin (que abre o pedido) ao setor de Expedição (que separa, embala em paletes, aguarda NF/Romaneio e libera para coleta). Cada OF percorre um ciclo de vida rastreável, gera lançamentos automáticos em `stock_movements` (reserva → libera → baixa) e em `own_stock_movements` (quando paletes usam estoque próprio da fábrica), e pode ser cancelada/estornada com integridade do estoque.

Recursos-chave:
- 7 abas visuais (Prioritário, Aberto, Separando, Aguardando NF/ROM, Pronto, Coletadas, Canceladas).
- Paletes independentes por OF com máquina/artigo alternativo/estoque próprio.
- Auto-numeração da OF, detecção de duplicidade e proteção anti-double-click.
- UPDATE condicional (`.eq('status', expectedStatus)`) para resolver corrida entre admins/expedidores.
- Atrelamento de OFs em grupos (`link_group_id`) para coleta conjunta.
- Impressão de PDF da OF (jsPDF) com layout compacto.
- Realtime: qualquer mudança na tabela `billing_orders` reinvalida o cache.

---

## 2. Banco de dados

### 2.1 `billing_orders` (42 colunas)
Campos principais (ver `docs/data/13-ordem-faturamento.md` para tabela completa):

| Grupo | Colunas |
|---|---|
| Identidade | `id`, `company_id`, `of_number`, `client_id`, `article_id`, `machine_id?`, `dyehouse`, `order_type` (`pieces\|weight\|all`) |
| Planejado | `pieces_expected`, `weight_expected`, `piece_weight_target` |
| Real | `pieces_real`, `weight_real`, `weight_avg` (= weight_real/pieces_real) |
| Status | `status` (`open\|separating\|ready\|collected\|cancelled`) |
| Prioridade | `priority`, `priority_reason`, `priority_at`, `priority_by` |
| Auditoria | `created_by/at`, `separated_by`, `collected_by/at`, `cancelled_by/at`, `last_edited_by/at`, `edit_note` |
| Documento | `delivery_doc_type` (nf/romaneio), `delivery_doc_number`, `delivery_doc_set_by/at` |
| Cancelamento/estorno | `cancellation_reason`, `reverted_from`, `reversal_reason`, `reversal_quality` (`first\|second`), `reversed_by/at` |
| Vínculo | `link_group_id` (agrupa OFs para coleta conjunta) |

**RLS:** política `Users can manage their company's billing orders` (`ALL` para authenticated), `company_id = user_active_company.company_id`. Trigger `sync_billing_order_from_pallets()` recalcula os totais reais quando paletes são alterados.

### 2.2 `billing_order_pallets`
Paletes independentes por OF. Colunas: `pallet_number`, `pieces`, `weight_kg`, `machine_id?`, além de `alt_client_id?`/`alt_article_id?` (artigo/cliente alternativos), `own_article_id?`/`own_stock_movement_id?` (paletes vindos do estoque próprio), `reserve_movement_id?` (id do `stock_movements` reserva individual). RLS por tenant (4 políticas).

### 2.3 `stock_movements`
Movimentos gerados automaticamente pelo hook:
- `reserve`: quando OF vai de **separating → ready** (ou palete a palete no modal de Paletes).
- `release`: libera o que estava reservado (edição para Aberto, cancelamento, coleta).
- `out`: baixa efetiva do estoque físico ao **ready → collected**.
- `in`: estorno de **collected → cancelled** (com `is_second_quality` conforme `reversal_quality`).

A distribuição respeita `machine_id`/`article_id`/`client_id` dos paletes; o `netByKey` (soma reserves − releases) evita releases fantasma em OFs legadas sem reserva prévia.

### 2.4 `own_stock_movements` e `own_stock_articles`
Paletes marcados como `own` debitam `own_stock_movements` (tipo `out`) na criação e recebem `in` de volta em cancelamento/reversão/`revertToOpen`. O helper `restoreOwnStockForOrder` percorre todos os paletes com `own_article_id` e devolve o consumo.

---

## 3. Permissões (`usePermissions`)
- **admin**: acesso total — cria, edita, cancela, estorna, atrela, imprime, prioriza.
- **expedicao**: vê apenas as abas operacionais, inicia separação, gerencia paletes, lança NF/Romaneio e marca como coletada. Não cria/edita/cancela.

A visibilidade dos botões usa `isAdmin = role === 'admin'` em blocos condicionais na renderização.

---

## 4. Ciclo de vida (máquina de estados)

```text
           createOrder
  ┌────────────────────────┐
  ▼                        │
 open ──startSep──▶ separating ──finalize──▶ ready
  │                                    (com NF/ROM?)
  │                                     ├─ sem doc → aba "Aguardando NF/ROM"
  │                                     └─ com doc → aba "Pronto"
  │                                                 │
  │                                              collect
  │                                                 ▼
  │                                            collected ──cancel(estorno)──▶ cancelled
  └──editOrder(revertToOpen)──── ready/sep ────┐
                                                │
                            cancel any state ──▶ cancelled
```

Transições implementadas em `updateStatus.mutateAsync({ id, status, expectedStatus, data, reversalQuality? })`:

| De → Para | Chamador | Efeito colateral |
|---|---|---|
| `open → separating` | Botão "Iniciar Separação" (expedicao/admin) | grava `separated_by`; nenhum movimento de estoque |
| `separating → ready` | Botão "Finalizar Separação" no modal Lançar | se houver paletes salvos, `pieces_real/weight_real/weight_avg` = **soma dos paletes** (força consistência com reservas individuais); insere `reserve` no `stock_movements` **apenas** se não houver paletes (paletes já criam reserva individual) |
| `ready → collected` | Botão "Marcar Coletada" | libera saldo líquido de reservas (`release`), gera `out` respeitando distribuição por (article, client, machine); fallback para `pallets` sem reserva; fallback final para o total previsto |
| qualquer → `cancelled` (exceto de `collected`) | Botão "Cancelar" | `release` do saldo líquido de reservas; **apaga paletes** e devolve `own_stock` |
| `collected → cancelled` (estorno) | "Estornar" | `in` no `stock_movements` (1ª ou 2ª qualidade) preservando distribuição por máquina/artigo; `own_stock in` para paletes próprios |
| `revertToOpen` (via `editOrder`) | Botão "Voltar para Aberto" no modal Editar | limpa `pieces_real/weight_real/weight_avg/separated_by/delivery_doc_*`; `release` do saldo líquido; apaga paletes; devolve `own_stock` |

**Concorrência:** todo UPDATE inclui `.eq('status', expectedStatus)` — se outro usuário mudou o status, `rows.length === 0` → lança `Error('CONFLICT')` com `currentStatus`/`actor` e a UI abre `conflictInfo` explicando quem alterou.

---

## 5. Hook `useBillingOrders`

### 5.1 Query principal
`useQuery(['billing_orders', company_id])` — SELECT com joins nomeados (`creator`, `separator`, `collector`, `prioritizer`, `canceller`, `editor`) via FKs específicas (`billing_orders_created_by_fkey` etc.), ordenado por `created_at desc`.

### 5.2 Realtime
Canal `billing_orders_changes_${company_id}` escuta `event: '*'` na tabela e invalida a query. Cleanup em `removeChannel` ao trocar de empresa.

### 5.3 Mutations
- `createOrder`: valida campos obrigatórios por `order_type`, checa duplicidade por `of_number` (SELECT prévio + captura de `23505`), retorna `{ code: 'DUPLICATE_OF' }` para tratamento pelo modal.
- `updateStatus`: implementa toda a máquina de estados descrita em §4, com todos os efeitos colaterais de estoque.
- `editOrder`: aplica `changes` + `edit_note` + `last_edited_by/at`; se `revertToOpen`, limpa reais/doc/separador e libera reservas.

### 5.4 Helpers expostos
- `setDeliveryDoc({ id, type, number })`: UPDATE condicional (`.eq('status', 'ready')`) para evitar setar doc em OF que saiu do estado. Grava `delivery_doc_set_by/at`.
- `getNextOfNumber()`: varre `of_number`, extrai maior número, devolve `{ last, next }` zero-pad 3 dígitos.
- `ofExists(ofNumber)`: checagem síncrona no modal.
- `linkOrders(ids[])`: cria/mescla `link_group_id` (herda grupo existente se algum dos ids já pertencer a um).
- `unlinkGroup(groupId)`: zera `link_group_id` de todo o grupo.
- `removeFromGroup(orderId)`: remove um; se o grupo ficar com 1 OF, desfaz.
- `restoreOwnStockForOrder(orderId, ofNumber, tag)`: privado — devolve `own_stock` de todos os paletes `own` (usado em cancel/revert).

---

## 6. Estrutura da página `BillingOrders.tsx`

### 6.1 Estado local
- `activeTab`: `priority_tab | open | separating | awaiting_doc | ready | collected | cancelled | all`.
- `searchTerm`: filtra por `of_number`, cliente, artigo, tinturaria, número de doc.
- Modais: `showCreateModal`, `showLaunchModal`, `showPriorityModal`, `showCollectConfirm`, `showStartSepConfirm`, `showEditModal`, `showCancelModal`, `showDocModal`, `showPrintChoice`, `showPalletsModal`, `showDetailsModal`, `showLinkModal`.
- `pallets` (edição) e `detailsPallets` (visualização) carregados via SELECT em `billing_order_pallets` ao abrir o modal correspondente.
- `negativeWarning`: bloqueio proativo quando a OF vai deixar o saldo do artigo negativo (consulta a base de estoque no `handleCreate`).
- `conflictInfo`: exibe modal quando `updateStatus`/`editOrder` retornam `CONFLICT`.
- `filterDateRange` + `collectedPage`/`COLLECTED_PAGE_SIZE=10`: filtros e paginação da aba **Coletadas**.

### 6.2 Memos
- `filteredOrders`: aplica busca + filtros por aba. Regras específicas:
  - `priority_tab`: `priority && status IN (open, separating, ready)`.
  - `open`: apenas `status='open'` (prioritárias já saem na aba prioritária).
  - `awaiting_doc`: `status='ready' && !delivery_doc_number`.
  - `ready`: `status='ready' && !!delivery_doc_number`.
  - `collected`: aplica `filterDateRange` sobre `collected_at || updated_at || created_at`.
- `sortedCollected`: ordena por `collected_at` desc.
- `paginatedOrders`: fatia por página apenas na aba `collected`.
- `stats`: contadores por aba (aparecem como badges).
- `linkGroups`: `Map<link_group_id, orders[]>` para exibir badges e companheiros de grupo.

### 6.3 Handlers principais
- `handleCreate`: valida, faz `ofExists`, consulta estoque atual do artigo (para `negativeWarning`), chama `createOrder.mutateAsync`. Trata `DUPLICATE_OF` mostrando `createDupError` inline.
- `handleLaunch`: dispara `separating → ready`; se `confirmFinalizePallets`, ignora inputs manuais e usa soma dos paletes (garante alinhamento com reservas individuais).
- `handlePriority`: `updateStatus({ status: 'priority' })` com `priority_reason`.
- `handleCollect` (via `showCollectConfirm`): `ready → collected`.
- `handleCancel`: distingue cancelamento comum × estorno de `collected` (obrigatório motivo + `reversalQuality`).
- `handleEdit`: aplica alterações; se checkbox "Voltar para Aberto" marcado, invoca `editOrder` com `revertToOpen: true`.
- `handleDoc` (via `showDocModal`): chama `setDeliveryDoc`.
- `handlePrintPdf`: monta PDF com jsPDF (cabeçalho colorido por status, seções KPI, doc, prioridade, paletes, auditoria) — usa `sanitizePdfText` para acentos.

### 6.4 Modal de Paletes
Cada linha adicionada:
1. Insere em `billing_order_pallets` (com `machine_id`, `alt_*` ou `own_*`).
2. Se `own_article_id`: insere `own_stock_movements` (`out`) e grava `own_stock_movement_id`.
3. Senão: insere `stock_movements` (`reserve`) individual e grava `reserve_movement_id` (evita duplicar reserva no `updateStatus`).

Ao **excluir** um palete, faz o caminho inverso: `release` no `stock_movements` ou `in` no `own_stock_movements`.

### 6.5 Modal de Detalhes (olho)
Somente leitura: mostra dados da OF, paletes e histórico de auditoria (criou, separou, coletou, cancelou, editou, definiu doc). Aparece para admins e expedicao.

### 6.6 Modal de Atrelar OFs
Multi-select de OFs abertas/separando/ready. Chama `linkOrders` — atalho visual para coleta agrupada (badge fúcsia `groupLabel` mostra companheiros).

---

## 7. Impressão / PDF
`handlePrintPdf(order)` gera um A4 com:
- Cabeçalho colorido: verde (ready c/ doc), roxo (ready s/ doc), amarelo (separating), vermelho (open), cinza (collected/cancelled).
- Badge de prioridade se ativa e não coletada.
- Seções: Cliente/Artigo, Planejado × Real, Máquina/Tinturaria, NF/ROM (se houver), Paletes (tabela), Auditoria (quem/quando por evento).
- Todo texto passa por `sanitizePdfText` (remoção de caracteres não suportados pela fonte helvética).

O modal `showPrintChoice` permite ao admin escolher **Direto** ou **Com paletes** (com/sem tabela detalhada de paletes).

---

## 8. Integrações externas / Notificações
- **Realtime:** invalida `billing_orders` a cada mudança.
- **Push notifications:** disparadas pelo backend (edge functions) quando OFs mudam de estado — ver `docs/not.md`.
- **Estoque (`StockMalha`):** mutations invalidam `stock_movements_for_stock` e `stock_movements_history` para atualizar KPIs.
- **Auditoria visual:** padrão `docs/auditoria.md` — nome do usuário + `#code` + data/hora abaixo da data.

---

## 9. Regras de negócio críticas
1. **Uma OF nunca tem reserva duplicada.** Se houver paletes com `reserve_movement_id`, o `separating→ready` NÃO gera reserva agregada.
2. **Baixa por máquina.** No `ready→collected`, `stock_movements out` respeita a distribuição por máquina vinda de paletes; para OFs legadas sem paletes, cai para o `machine_id` da OF.
3. **Estorno preserva qualidade.** `collected→cancelled` com `reversalQuality='second'` grava `is_second_quality=true` em `stock_movements in`, alimentando a aba "2ª Qualidade" do StockMalha.
4. **Estoque próprio nunca vai para `stock_movements`.** Paletes com `own_article_id` só transitam em `own_stock_movements`.
5. **Sem release fantasma.** Cancelamentos e reverts calculam o **saldo líquido** de `reserve − release` já existentes; nunca criam release sem contraparte.
6. **UPDATEs condicionais.** Toda mudança de status compara `expectedStatus` para evitar sobrescrita silenciosa por outro usuário.
7. **Duplicidade de `of_number`.** Bloqueada por SELECT prévio + captura de `23505` (unique violation) + `DUPLICATE_OF` tratado no modal.
8. **Doc só na `ready`.** `setDeliveryDoc` usa `.eq('status','ready')` — impossível marcar NF/ROM em OF cancelada, coletada ou revertida.
9. **Grupos de OF (`link_group_id`).** Ao atrelar OFs de grupos diferentes, o hook mescla todos os membros no primeiro `group_id` encontrado.

---

## 10. Pontos de atenção / débito técnico
- **Sem RPC ainda.** Toda a lógica de estoque/estado roda no cliente com múltiplos SELECT/INSERT — candidato futuro a `save_billing_order_transition` (padrão de `docs/rpcInvoices.md`). Riscos atuais: latência multi-round-trip e ausência de transação atômica (se `stock_movements insert` falha após UPDATE, o hook devolve `STOCK_MOVEMENT_FAILED` mas o status já foi persistido).
- **`getNextOfNumber` carrega todos os `of_number`.** Aceitável hoje, mas com escala convém `SELECT MAX(...)` no banco.
- **Filtro por texto** é `.toLowerCase().includes` no cliente — depende de `orders` já carregado (não paginado no banco).
- **Auditoria em `audit_logs`** não é feita por este fluxo hoje — só o carimbo por colunas (`created_by`, `separated_by`, etc.). Se necessário, alinhar com `mem://security/audit-and-authorship`.

---

## 11. Checklist de comportamento esperado
- [x] Admin cria OF; expedicao não vê o botão "Nova OF".
- [x] Ao iniciar separação, `separated_by` é preenchido.
- [x] Paletes criam reservas individuais; finalizar separação **não duplica**.
- [x] Marcar como coletada gera `release` + `out` por máquina.
- [x] Cancelar OF aberta/separando/ready libera reservas e apaga paletes.
- [x] Estornar OF coletada devolve o físico (1ª ou 2ª qualidade) e devolve estoque próprio.
- [x] Voltar para Aberto limpa doc, real e separador; libera reservas.
- [x] NF/Romaneio só pode ser definido em `ready`.
- [x] Conflito de status abre modal explicando quem alterou.
- [x] Realtime atualiza a lista para todos os usuários da empresa.
- [x] PDF imprime com cores e seções conforme status atual.

---

**Arquivos correlatos:** `src/pages/BillingOrders.tsx`, `src/hooks/useBillingOrders.ts`, `docs/of.md`, `docs/ofestoquesaida.md`, `docs/data/13-ordem-faturamento.md`, `docs/stockMalha.md`, `docs/auditoria.md`.