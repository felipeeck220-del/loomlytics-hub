ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS progress_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finish_notes TEXT;