-- 1. Clean up duplicate reserves in the source table that are causing the phantom reserves
-- These were created for collected orders and were mirroring incorrectly.
DELETE FROM public.stock_movements 
WHERE created_at > '2026-08-09 21:00:00+00' 
AND machine_id IS NULL 
AND type = 'reserve'
AND billing_order_id IN (
    SELECT id FROM public.billing_orders 
    WHERE status IN ('collected', 'cancelled')
);
