-- 1. IDENTIFICAÇÃO E LIMPEZA DE MOVIMENTOS "DUPLICADOS" POR LOOP DE GATILHO
DELETE FROM public.manual_stock_movements
WHERE billing_order_id IS NOT NULL AND source_movement_id IS NULL;

DELETE FROM public.manual_stock_movements
WHERE source_movement_id IS NOT NULL AND source_movement_id NOT IN (SELECT id FROM public.stock_movements);

-- Reset das reservas da OF #530 (Usando cast explícito para texto)
DELETE FROM public.manual_stock_movements WHERE billing_order_id IN (SELECT id FROM billing_orders WHERE of_number = '530');

-- 2. RE-SINCRONIZAÇÃO LIMPA
INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id, billing_order_id,
    type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
)
SELECT 
    sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id, sm.billing_order_id,
    sm.type::text, COALESCE(sm.pieces, 0), COALESCE(sm.weight_kg, 0),
    sm.reason, sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
LEFT JOIN public.billing_orders bo ON bo.id = sm.billing_order_id
WHERE (
    (sm.type::text IN ('reserve', 'release') AND (bo.id IS NULL OR bo.status NOT IN ('collected', 'cancelled')))
    OR sm.type::text = 'out'
    OR (sm.type::text = 'in' AND sm.billing_order_id IS NOT NULL)
)
AND COALESCE(sm.is_second_quality, false) = false
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL 
DO UPDATE SET
    pieces = EXCLUDED.pieces,
    weight_kg = EXCLUDED.weight_kg,
    type = EXCLUDED.type;

-- 3. VERIFICAÇÃO FINAL DE KPIS
SELECT 
    a.name,
    SUM(CASE WHEN m.type IN ('adjust_in', 'in') THEN m.pieces ELSE 0 END) as total_in,
    SUM(CASE WHEN m.type IN ('adjust_out', 'out') THEN m.pieces ELSE 0 END) as total_out,
    SUM(CASE WHEN m.type = 'reserve' THEN m.pieces WHEN m.type = 'release' THEN -m.pieces ELSE 0 END) as current_reserve
FROM public.manual_stock_movements m
JOIN public.articles a ON a.id = m.article_id
WHERE a.name IN ('MALHA EXCLUSIVE', 'RIBANA 2x1 EXCLUSIVE')
GROUP BY a.name;
