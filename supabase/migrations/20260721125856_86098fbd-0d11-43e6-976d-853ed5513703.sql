
ALTER TABLE public.freight_orders
  ADD COLUMN IF NOT EXISTS priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority_by uuid,
  ADD COLUMN IF NOT EXISTS priority_reason text;

ALTER TABLE public.freight_orders
  DROP CONSTRAINT IF EXISTS freight_orders_priority_by_fkey;

ALTER TABLE public.freight_orders
  ADD CONSTRAINT freight_orders_priority_by_fkey
  FOREIGN KEY (priority_by) REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_freight_orders_priority_open
  ON public.freight_orders (company_id, priority)
  WHERE status = 'open' AND priority = true;
