ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS current_needle_id uuid REFERENCES public.needle_inventory(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_sinker_id uuid REFERENCES public.sinker_inventory(id) ON DELETE SET NULL;