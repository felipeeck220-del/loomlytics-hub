# Plano de Estabilização e Movimentação Manual da OF #597

A OF #597 foi movida manualmente para o status "Coletada" via script SQL, contornando a falha de interface reportada. Além disso, identifiquei inconsistências na assinatura da RPC de coleta que causavam erros de execução no frontend.

## Ações Realizadas

### 1. Movimentação Manual da OF #597
- Executado script no banco de dados para alterar o status da OF #597 para `collected`.
- Registrada a data de coleta (`collected_at`) e o autor da ação (Felipe #832).
- Removidos os paletes associados para liberar a reserva de estoque, conforme a regra de negócio do faturamento.

### 2. Correção da RPC `collect_billing_order`
- Refatorada a assinatura da função para garantir compatibilidade com a auditoria centralizada.
- Sincronizada a injeção do `target_id` no log de auditoria via JSONB.

### 3. Melhoria na Sincronização do Frontend
- Reforçada a invalidação de cache no hook `useBillingOrders.ts` para garantir que a mudança de status seja refletida instantaneamente em todas as abas.

## Detalhes Técnicos
- **Tabela Afetada:** `billing_orders` e `billing_order_pallets`.
- **RPC Ajustada:** `collect_billing_order`.
- **Auditoria:** Atualizada para 6 argumentos (`public._of_audit`).
