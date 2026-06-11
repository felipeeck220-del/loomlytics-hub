ALTER TABLE public.client_invoices ADD COLUMN parent_invoice_id UUID REFERENCES public.client_invoices(id) ON DELETE CASCADE;
GRANT ALL ON public.client_invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invoices TO authenticated;