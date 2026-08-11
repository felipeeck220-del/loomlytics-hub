
UPDATE public.billing_orders bo
SET 
  pieces_real = sub.total_pieces,
  weight_real = sub.total_weight
FROM (
  SELECT 
    billing_order_id, 
    ABS(SUM(CASE WHEN type = 'out' THEN pieces ELSE 0 END)) as total_pieces,
    ABS(SUM(CASE WHEN type = 'out' THEN weight_kg ELSE 0 END)) as total_weight
  FROM public.stock_movements
  WHERE billing_order_id IS NOT NULL
  GROUP BY billing_order_id
) sub
WHERE bo.id = sub.billing_order_id
  AND bo.status = 'collected'
  AND (bo.pieces_real = 0 OR bo.pieces_real IS NULL);
