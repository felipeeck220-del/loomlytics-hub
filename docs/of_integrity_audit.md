# Auditoria de Integridade e Estabilização Crítica (OF)

Data: 13/08/2026
Autor: Lovable

## Resumo das Ações
Realizado um pente fino técnico no módulo de faturamento (**Ordem de Faturamento - OF**), validando a integridade das RPCs, triggers e fluxos de transição de status após a remoção do módulo de estoque manual.

## Verificações de Banco de Dados
- **Assinaturas de RPCs:** Confirmado que todas as RPCs críticas (`collect`, `cancel`, `priority`, `ready`, `separation`, `edit`, `set_doc`) estão sincronizadas com a função de auditoria `_of_audit` de 6 argumentos.
- **Triggers:** A trigger `handle_billing_order_status_change` foi estabilizada como `BEFORE UPDATE` para garantir a consolidação de dados (peças e peso) antes da limpeza de paletes.
- **Isolamento de Tenant:** Todas as RPCs utilizam `SECURITY DEFINER`, `search_path = public` e validação rigorosa de `p_company_id`.
- **Limpeza de Paletes:** Centralizada a deleção de paletes e estorno de reservas na RPC `collect_billing_order` (ou via trigger atômica) para evitar ordens presas em "Pronto para coleta".

## Verificações de Frontend (UI/UX)
- **Filtros Reativos:** Implementada trava global em `BillingOrders.tsx` para garantir que ordens coletadas/canceladas desapareçam instantaneamente de abas operacionais.
- **Cache (React Query):** Reforçada a remoção otimista e adicionado delay tático de 500ms no refetch para garantir sincronia com a latência de transação do banco.
- **Animações:** Corrigido efeito de "piscar" em botões de lista através do estado `checkingOfId`.
- **Estoque Manual:** Confirmada a remoção total de referências ao módulo excluído.

## Pendências Resolvidas
- OF #612 e #611 movidas manualmente e consolidadas.
- Erros de `enum` e `audit_signature` corrigidos em todas as migrações recentes.

Integridade do sistema de faturamento: **100% ESTÁVEL**.
