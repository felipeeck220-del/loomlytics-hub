
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS oc_photos jsonb NOT NULL DEFAULT '[]'::jsonb;
