ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS maintenance_interval_days integer,
  ADD COLUMN IF NOT EXISTS maintenance_kg_target numeric;