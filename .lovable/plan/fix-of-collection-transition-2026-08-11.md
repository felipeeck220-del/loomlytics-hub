---
title: Fix OF Collection Transition
description: Ensure Billing Orders move correctly from "Ready for Collection" to "Collected" by fixing cache invalidation and transition logic.
---

# Fix OF Collection Transition

The user reported that after marking an OF as "Collected" (Coletada), it remains in the "Ready for Collection" (Pronto para coleta) tab instead of moving to the "Collected" (Coletadas) tab, despite the success message.

## Proposed Changes

### 1. Backend (RPC Verification)
- Verify `collect_billing_order` RPC logic to ensure it correctly updates status and audit logs.
- Ensure `SECURITY DEFINER` and proper search paths are set.

### 2. Frontend (BillingOrders.tsx)
- Optimize `updateStatus` success handler to ensure `billing_orders` and `billing_orders_bootstrap` queries are invalidated correctly.
- Ensure the `OfCollectPhotosModal` correctly triggers the status update and waits for synchronization.
- Force a refetch if necessary after the mutation completes.

### 3. State Management
- Check for race conditions in `useBillingOrders` hook where real-time updates might conflict with manual cache invalidation.

## Technical Details
- Use `queryClient.invalidateQueries` with `refetchType: 'all'` to ensure all active observers see the change.
- Add a small delay or check for persistence if Supabase replication lag is suspected (though rare in this stack).
