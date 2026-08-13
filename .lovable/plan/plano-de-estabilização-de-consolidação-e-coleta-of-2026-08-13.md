# Plano de Estabilização de Consolidação e Coleta (OF)

O usuário relatou que algumas Ordens de Faturamento (OF) na aba "Coletadas" estão com o número de peças e peso zerados, e que ordens marcadas como coletadas às vezes permanecem na aba "Pronto para coleta". Este plano visa corrigir a lógica de consolidação de dados e garantir a transição de status instantânea.

## Alterações

### 1. Banco de Dados (Supabase)

- **Correção da Trigger `handle_billing_order_status_change`**:
    - Garantir que a trigger seja executada `BEFORE UPDATE` para que as alterações em `NEW.pieces_real` e `NEW.weight_real` sejam persistidas antes do salvamento da linha.
    - Reforçar a lógica de consolidação: se houver paletes, usar a soma deles; se não houver (ou se forem zerados), manter os valores `pieces_real`/`weight_real` que já podem ter sido preenchidos manualmente ou por fallback.
    - Garantir que a trigger remova os paletes e libere reservas de estoque de forma atômica.
- **Auditoria de Integridade**:
    - Verificar se a trigger está corretamente anexada à tabela `billing_orders`.

### 2. Frontend (React)

- **Otimização do Hook `useBillingOrders.ts`**:
    - Ajustar a mutation `updateStatus` para a ação `collected`.
    - Realizar a limpeza dos paletes localmente (cache) ou garantir que o refetch seja agressivo o suficiente para remover a OF da aba anterior imediatamente.
    - Adicionar logs de depuração para rastrear a resposta da RPC `collect_billing_order`.

## Detalhes Técnicos

- A trigger será recriada como `BEFORE UPDATE` em `public.billing_orders`.
- A lógica de `DELETE FROM public.billing_order_pallets` será mantida dentro da trigger ou na RPC, mas a consolidação de `NEW.pieces_real` DEVE ocorrer antes da deleção se for baseada nos paletes.

## Passos de Verificação

- Simular a coleta de uma OF com paletes e verificar se os dados consolidados aparecem na aba "Coletadas".
- Verificar se a OF desaparece instantaneamente da aba "Pronto para coleta" após a confirmação.
- Validar se as movimentações de estoque de `release` (liberação de reserva) são geradas corretamente.
