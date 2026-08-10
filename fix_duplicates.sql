DO $$
BEGIN
    DELETE FROM manual_stock_movements
    WHERE created_at BETWEEN '2026-08-01' AND '2026-08-10'
      AND source_movement_id IS NULL
      AND (reason = 'entrada' OR reason = 'Lançamento manual');
END $$;
