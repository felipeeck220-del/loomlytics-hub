ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS buyer_name text DEFAULT NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS destination_name text DEFAULT NULL;