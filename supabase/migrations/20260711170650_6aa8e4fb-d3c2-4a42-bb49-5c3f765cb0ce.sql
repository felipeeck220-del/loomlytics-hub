-- Ensure deleting a needle lot cascades to its transactions so the delete trigger
-- reverses the inventory (previously ON DELETE SET NULL orphaned the rows and
-- left the stock inflated).
ALTER TABLE public.needle_transactions
  DROP CONSTRAINT IF EXISTS needle_transactions_lot_id_fkey;

ALTER TABLE public.needle_transactions
  ADD CONSTRAINT needle_transactions_lot_id_fkey
  FOREIGN KEY (lot_id) REFERENCES public.needle_lots(id) ON DELETE CASCADE;