
ALTER TABLE public.productions 
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS created_by_code text;

ALTER TABLE public.defect_records 
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS created_by_code text;

ALTER TABLE public.machine_logs 
  ADD COLUMN IF NOT EXISTS started_by_name text,
  ADD COLUMN IF NOT EXISTS started_by_code text,
  ADD COLUMN IF NOT EXISTS ended_by_name text,
  ADD COLUMN IF NOT EXISTS ended_by_code text;
