
-- 1. Clean up "Correção de reserva residual" and "Correção de saldo de reserva"
-- These were added automatically but seem to have corrupted the balance by releasing more than was reserved or neutralizing excessively.
DELETE FROM public.manual_stock_movements 
WHERE company_id = 'a664927c-a285-4997-8faa-8c90985c6fac' 
AND article_id IN (SELECT id FROM public.articles WHERE name ILIKE '%MALHA EXCLUSIVE%' OR name ILIKE '%RIBANA 2x1 EXCLUSIVE%')
AND (reason LIKE 'Correção de reserva residual%' OR reason LIKE 'Correção de saldo de reserva%');

-- 2. Clean up specific ghost reserves created for OF #530 (since August 9th)
-- I observed redundant reserves for this specific order that were skewing the balance.
DELETE FROM public.manual_stock_movements 
WHERE company_id = 'a664927c-a285-4997-8faa-8c90985c6fac' 
AND article_id IN (SELECT id FROM public.articles WHERE name ILIKE '%MALHA EXCLUSIVE%')
AND created_at >= '2026-08-09' 
AND (reason LIKE 'OF #530 %reserva%' OR reason LIKE 'OF #530 %liberação%');

-- 3. Restore mirrored physical movements (adjust_in, adjust_out, out, in)
-- Ensure all historical physical movements from the main stock table are present in the manual stock table.
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
    sm.type::text, -- Cast enum to text
    sm.pieces,
    sm.weight_kg,
    sm.reason,
    sm.created_at,
    sm.created_by,
    sm.id
FROM public.stock_movements sm
WHERE sm.company_id = 'a664927c-a285-4997-8faa-8c90985c6fac'
AND sm.type::text IN ('adjust_in', 'adjust_out', 'out', 'in')
AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements msm 
    WHERE msm.source_movement_id = sm.id
);
