# Plano de Pente Fino e Estabilização das Ordens de Faturamento (OF)

O objetivo é realizar um pente fino completo no módulo de faturamento (OF), corrigindo inconsistências de banco de dados, interface e sincronização detectadas nos registros históricos e no uso recente.

## Mudanças Técnicas

### Banco de Dados (RPCs e Triggers)
- **Sincronização de Auditoria:** Garantir que 100% das funções que usam `_of_audit` passem os 6 argumentos corretos: `p_id`, `p_old_status`, `p_new_data`, `p_author_name`, `p_author_code` e `p_target_id` (via JSONB).
- **Segurança e Isolamento:** Validar `SECURITY DEFINER` e `search_path = public` em todas as RPCs operacionais para evitar falhas de permissão em contextos multi-tenant.
- **RPC `cancel_billing_order`:** Reforçar a lógica de estorno de estoque para que ordens em status `open` (apenas reservadas) façam o `release` correto, e ordens `ready/collected` (já baixadas) façam a devolução respeitando a qualidade selecionada.
- **RPC `get_billing_orders_bootstrap`:** Otimizar a contagem de stats para refletir fielmente as abas do frontend (incluindo "Atraso na Coleta" para admins).

### Frontend (Hooks e Páginas)
- **Invalidação Agressiva:** Refatorar `useBillingOrders.ts` para que toda transição de status aguarde `Promise.all` de `refetchQueries` com `exact: false`, garantindo que filtros de página ou empresa não "congelem" o estado anterior da OF.
- **Filtro de Status em Tempo Real:** Ajustar o `useMemo` de filtragem em `BillingOrders.tsx` para que a mudança de status local (via React Query cache) oculte a OF da aba atual instantaneamente, eliminando o efeito "fantasma" antes da conclusão do refetch.
- **Estabilização de Paginação:** Garantir que a troca de abas ou filtros resetem o `collectedPage` para 1, evitando listas vazias ao mudar para períodos com menos dados.

### Mecânica (Otimização)
- **Bootstrap de Dados:** Validar a integridade da RPC `get_mecanica_bootstrap` para garantir que máquinas e inventários carreguem em uma única viagem de rede.
- **Skeletons:** Confirmar que `OrderCardSkeleton` é exibido corretamente enquanto as junções de dados (máquina/artigo) estão sendo resolvidas no frontend.

## Verificação e Auditoria
- Registro de todas as estabilizações no histórico do `docs/mestre.md`.
- Teste de fluxo completo: Criação -> Separação -> Finalização -> NF/Romaneio -> Coleta.
- Verificação de logs de auditoria para confirmar autoria em todas as etapas.
