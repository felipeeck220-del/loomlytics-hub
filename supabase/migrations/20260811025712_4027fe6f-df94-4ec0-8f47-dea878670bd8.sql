WITH latest_pallets AS (
    SELECT 
        p.billing_order_id,
        SUM(p.pieces) as total_pieces,
        SUM(p.weight_kg) as total_weight
    FROM billing_order_pallets p
    GROUP BY p.billing_order_id
)
UPDATE public.billing_orders bo
SET 
    pieces_real = lp.total_pieces,
    weight_real = lp.total_weight
FROM latest_pallets lp
WHERE bo.id = lp.billing_order_id
  AND bo.status = 'collected'
  AND (bo.pieces_real = 0 OR bo.pieces_real IS NULL OR bo.weight_real = 0 OR bo.weight_real IS NULL);