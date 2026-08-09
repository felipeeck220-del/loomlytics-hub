# Plan - Pente Fino e Ajustes de Consistência (OF e Estoque Manual)

Pente fino realizado nas seções de Ordem de Faturamento (OF) e Estoque Malha (Manual). Identificada inconsistência no cálculo de saldo disponível quando há sobre-reserva em máquinas específicas e duplicidade de liberações de reserva no frontend.

## Proposed Changes

### Database & RPCs
- **Fix `get_manual_stock_estoque`**:
    - Implementar a redistribuição determinística de reservas excedentes entre máquinas do mesmo artigo para garantir que a soma dos saldos das máquinas seja idêntica ao saldo total do artigo e dos KPIs.
    - Adicionar proteção `GREATEST(0, ...)` no cálculo de reservas líquidas para neutralizar dados inconsistentes (reservas negativas causadas por bugs de duplicidade).
- **Data Cleanup**:
    - Migration para identificar e neutralizar movimentos de `release` duplicados que geraram saldos de reserva negativos em OFs antigas.

### Frontend
- **Fix `BillingOrders.tsx`**:
    - Refatorar a lógica de remoção de paletes "SEM MÁQUINA" para evitar a liberação duplicada de reservas históricas.
    - Garantir que apenas a quantidade líquida reservada seja liberada ao remover um palete.

## Technical Details

### Availability Redistribution Logic
The RPC will:
1. Calculate Article-level `Available` using a global timeline.
2. Calculate Machine-level `PotentialAvailable` (Stock - own reserves).
3. If `Σ(PotentialAvailable) > ArticleAvailable`, the surplus will be deducted from machines starting from the one with the highest machine_id, ensuring `Σ(machine.available) == Article.available`.

### User Permissions
- Maintenance of `SECURITY DEFINER` and `search_path` for all modified RPCs.
- Re-application of `GRANT` statements to `authenticated` and `service_role`.
