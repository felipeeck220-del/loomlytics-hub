# Plan - Restore Independent Manual Stock (Zero Start)

The goal is to restore the "Estoque Malha (Manual)" module with the exact visual style of the reference image (which mirrors the main "Estoque Malha" page), starting with zero stock and no negative values, completely independent of other modules.

## User Review Required

> [!IMPORTANT]
> The new module will be 100% manual. Any past automated movements or leftovers from previous versions of the manual stock will be ignored or cleared to ensure a "zero start".

- Should we delete any existing data in the `manual_stock_movements` table to ensure the "zero start", or just start fresh with new logic? I will assume a fresh start/clear is preferred.

## Proposed Changes

### Database & Backend
- **RPC Refactoring**: Update `get_manual_stock_estoque_independent` to return all the columns shown in the screenshot:
    - Entradas (kg/pc)
    - Entregue (kg/pc) -> Calculated from manual 'out' movements
    - Reservados (kg/pc) -> Will be 0 since it's independent of OFs now
    - Físico (kg)
    - Disponível (kg/pc)
- **Zero Start**: I will add a migration to clear `manual_stock_movements` for the company if needed, or ensure the RPC only counts new movements from this point forward.

### Frontend (UI/UX)
- **Page Design (`src/pages/StockMalhaManual.tsx`)**:
    - Reconstruct the layout to match the screenshot provided.
    - Add the top KPI cards: "Entradas manuais", "Entregue (OF coletadas)" (renamed to "Saídas Manuais"), "Reservado", "Rolos disp.".
    - Implement the collapsible table structure (Client -> Article -> Machine) as seen in `StockMalha.tsx`.
    - Use the `SearchableSelect` for filters (Period, Client, Article).
- **Styling**: Ensure high-contrast colors for balances (green for available, amber for reserved/zero).

## Technical Details
- **RPC `get_manual_stock_estoque_independent`**: Will return a hierarchical JSON matching the UI needs (groups by client and article).
- **RPC `save_manual_stock_entry`**: Already simplified, will remain the source of truth.
- **Independence**: No foreign keys or triggers to `billing_orders` paletes will be added.

## Security
- All RPCs will remain `SECURITY DEFINER` with company isolation.
