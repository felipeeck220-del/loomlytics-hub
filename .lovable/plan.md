---
name: Billing Order Stabilization
title: Pente Fino e Estabilização de OF
description: Plano para garantir a integridade do módulo de faturamento.
---

## Problemas Identificados
1. **Erro de Assinatura de Auditoria**: Algumas RPCs ainda tentavam chamar `_of_audit` com 5 argumentos, enquanto a definição canônica exige 6.
2. **Inconsistência de Status**: OFs coletadas as vezes "travavam" na aba anterior devido ao cache do React Query.
3. **Dados Zerados**: Perda de peças/peso ao deletar paletes na coleta sem consolidar no cabeçalho.

## Mudanças Realizadas

### 1. Banco de Dados (Supabase)
- **RPCs Operacionais**: `collect_billing_order`, `link_billing_orders`, `unlink_billing_order_group`, `cancel_billing_order`, `edit_billing_order`, `create_billing_order`, `start_billing_order_separation`, `launch_billing_order_ready`, `set_billing_order_delivery_doc` e `set_billing_order_priority` foram todas sincronizadas para usar a auditoria de 6 argumentos.
- **Trigger de Consolidação**: `handle_billing_order_status_change` agora soma `pieces` e `weight_kg` dos paletes e salva no cabeçalho da OF antes da deleção física.
- **Segurança**: Todas as RPCs utilizam `SECURITY DEFINER` e `SET search_path = public` para evitar falhas de permissão.

### 2. Frontend (React/TS)
- **Cache Invalidation**: O hook `useBillingOrders.ts` agora aguarda explicitamente o refetch de `billing_orders`, `bootstrap` e `list` usando `Promise.all`.
- **Filtro Estrito**: Em `BillingOrders.tsx`, a lógica de filtragem foi reforçada para esconder ordens `collected` de abas operacionais imediatamente.
- **Auditoria**: O envio de `author_name` e `author_code` foi padronizado em todas as chamadas de mutação.

## Validação
- Teste de coleta de OF: movimenta para "Coletadas" e mantém dados de peças/peso.
- Teste de agrupamento (Atrelar): executa sem erro de "function does not exist".
- Teste de cancelamento: libera estoque global corretamente.
