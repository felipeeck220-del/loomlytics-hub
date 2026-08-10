DELETE FROM public.manual_stock_movements
WHERE created_at BETWEEN '2026-08-01 00:00:00+00' AND '2026-08-10 23:59:59+00'
  AND source_movement_id IS NULL
  AND (reason = 'entrada' OR reason = 'Lançamento manual');