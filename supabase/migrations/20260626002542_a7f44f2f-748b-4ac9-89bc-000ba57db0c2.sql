ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS collected_at timestamptz;
-- Backfill: para registros já coletados, usar updated_at como melhor estimativa
UPDATE public.billing_orders SET collected_at = updated_at WHERE status = 'collected' AND collected_at IS NULL;