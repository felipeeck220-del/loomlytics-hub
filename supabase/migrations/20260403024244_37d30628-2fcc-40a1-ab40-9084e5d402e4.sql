ALTER TABLE public.iot_shift_state
  ADD COLUMN rpm_sum numeric NOT NULL DEFAULT 0,
  ADD COLUMN rpm_count integer NOT NULL DEFAULT 0;