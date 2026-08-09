-- Cleanup historical reserves that are consuming manual stock balance incorrectly
DO $$
BEGIN
    -- Remove reserves/releases from manual stock for orders that are already closed
    DELETE FROM public.manual_stock_movements msm
    USING public.billing_orders bo
    WHERE msm.billing_order_id = bo.id
      AND msm.type IN ('reserve', 'release')
      AND bo.status IN ('collected', 'cancelled');

    -- Remove orphan reserves
    DELETE FROM public.manual_stock_movements
    WHERE type IN ('reserve', 'release')
      AND billing_order_id IS NOT NULL
      AND billing_order_id NOT IN (SELECT id FROM public.billing_orders);
END $$;
