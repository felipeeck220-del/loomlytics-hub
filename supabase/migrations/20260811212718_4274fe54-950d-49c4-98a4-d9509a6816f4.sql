-- Recuperar dados para OFs coletadas que ficaram zeradas (OF #558 e #566)
-- Buscamos o histórico de 'release' ou 'reserve' para reconstruir o cabeçalho
UPDATE public.billing_orders bo
SET 
  pieces_real = sub.total_pieces,
  weight_real = sub.total_weight
FROM (
  SELECT 
    billing_order_id, 
    SUM(pieces) as total_pieces, 
    SUM(weight_kg) as total_weight
  FROM public.stock_movements
  WHERE type = 'release' AND reason ILIKE '%Auto-limpeza na coleta%'
  GROUP BY billing_order_id
) sub
WHERE bo.id = sub.billing_order_id 
AND bo.status = 'collected' 
AND (bo.pieces_real = 0 OR bo.pieces_real IS NULL);