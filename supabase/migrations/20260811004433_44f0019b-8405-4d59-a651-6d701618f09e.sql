-- Migration to synchronize Manual Stock reservations with Global Stock (Source of Truth)
-- Target: etsaleegdpswwsprwyzv

-- 1. Remove manual stock movements (reserve/release) for OFs that are no longer active
DELETE FROM public.manual_stock_movements
WHERE type IN ('reserve', 'release')
  AND billing_order_id IS NOT NULL
  AND billing_order_id NOT IN (
    SELECT id FROM public.billing_orders WHERE status IN ('separating', 'ready')
  );

-- 2. Remove manual stock reservations that don't match the current global stock reality
DELETE FROM public.manual_stock_movements m
WHERE m.type = 'reserve'
  AND m.billing_order_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm 
    WHERE sm.billing_order_id = m.billing_order_id 
      AND sm.article_id = m.article_id 
      AND sm.type = 'reserve'
  );

-- 3. Sync missing reservations from global to manual
INSERT INTO public.manual_stock_movements (
  company_id, client_id, article_id, machine_id, billing_order_id, 
  type, pieces, weight_kg, created_at, created_by, reason
)
SELECT 
  sm.company_id, bo.client_id, sm.article_id, sm.machine_id, sm.billing_order_id,
  'reserve', sm.pieces, sm.weight_kg, sm.created_at, sm.created_by, 'sync_repair'
FROM public.stock_movements sm
JOIN public.billing_orders bo ON bo.id = sm.billing_order_id
WHERE bo.status IN ('separating', 'ready')
  AND sm.type = 'reserve'
  AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements m 
    WHERE m.billing_order_id = sm.billing_order_id 
      AND m.article_id = sm.article_id 
      AND m.type = 'reserve'
  )
ON CONFLICT DO NOTHING;
