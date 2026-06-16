ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS is_second_quality boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_stock_movements_second_quality ON public.stock_movements(company_id, is_second_quality);
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS reversal_quality text;
ALTER TABLE public.billing_orders ADD CONSTRAINT billing_orders_reversal_quality_check CHECK (reversal_quality IS NULL OR reversal_quality IN ('first','second'));