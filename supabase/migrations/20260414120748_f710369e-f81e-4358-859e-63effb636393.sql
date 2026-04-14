
-- Add brand column to invoice_items for yarn brand tracking
ALTER TABLE public.invoice_items ADD COLUMN brand text DEFAULT NULL;
