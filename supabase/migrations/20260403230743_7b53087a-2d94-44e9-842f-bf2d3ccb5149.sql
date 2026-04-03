
ALTER TABLE public.residue_sales 
ADD COLUMN IF NOT EXISTS created_by_name text,
ADD COLUMN IF NOT EXISTS created_by_code text;

ALTER TABLE public.outsource_productions
ADD COLUMN IF NOT EXISTS created_by_name text,
ADD COLUMN IF NOT EXISTS created_by_code text;
