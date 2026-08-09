
INSERT INTO public.manual_stock_movements (
    id,
    company_id,
    article_id,
    client_id,
    machine_id,
    billing_order_id,
    type,
    pieces,
    weight_kg,
    reason,
    created_at,
    created_by,
    source_movement_id
)
SELECT 
    gen_random_uuid(),
    sm.company_id,
    sm.article_id,
    sm.client_id,
    sm.machine_id,
    sm.billing_order_id,
    sm.type::text,
    sm.pieces,
    sm.weight_kg,
    sm.reason,
    sm.created_at,
    sm.created_by,
    sm.id
FROM public.stock_movements sm
WHERE sm.company_id = 'a664927c-a285-4997-8faa-8c90985c6fac'
AND sm.type::text IN ('reserve', 'release')
AND sm.reason NOT LIKE 'Correção%' -- Skip the messy corrections
AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements msm 
    WHERE msm.source_movement_id = sm.id
);
