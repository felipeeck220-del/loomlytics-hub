ALTER TABLE public.client_invoices ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.client_invoices ADD COLUMN IF NOT EXISTS created_by_code TEXT;

-- Re-grant privileges after schema change
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invoices TO authenticated;
GRANT ALL ON public.client_invoices TO service_role;
