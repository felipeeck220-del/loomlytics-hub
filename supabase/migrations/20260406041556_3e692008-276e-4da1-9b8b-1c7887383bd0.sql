
-- Add short_id and paid_amount columns
ALTER TABLE public.accounts_payable
ADD COLUMN short_id text,
ADD COLUMN paid_amount numeric;

-- Function to generate next sequential 4-digit short_id per company
CREATE OR REPLACE FUNCTION public.generate_account_short_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(short_id::integer), 0) + 1
  INTO next_num
  FROM public.accounts_payable
  WHERE company_id = NEW.company_id
  AND short_id IS NOT NULL
  AND short_id ~ '^\d+$';

  NEW.short_id := LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate short_id on insert
CREATE TRIGGER trigger_generate_account_short_id
BEFORE INSERT ON public.accounts_payable
FOR EACH ROW
WHEN (NEW.short_id IS NULL)
EXECUTE FUNCTION public.generate_account_short_id();

-- Unique constraint per company
ALTER TABLE public.accounts_payable
ADD CONSTRAINT accounts_payable_company_short_id_unique UNIQUE (company_id, short_id);

-- Backfill existing records with sequential short_ids per company
WITH numbered AS (
  SELECT id, company_id,
    ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at ASC) as rn
  FROM public.accounts_payable
  WHERE short_id IS NULL
)
UPDATE public.accounts_payable ap
SET short_id = LPAD(n.rn::text, 4, '0')
FROM numbered n
WHERE ap.id = n.id;
