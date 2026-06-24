ALTER TABLE public.iot_shift_state
  ADD COLUMN IF NOT EXISTS production_id uuid REFERENCES public.productions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_iot_shift_state_production_id ON public.iot_shift_state(production_id);