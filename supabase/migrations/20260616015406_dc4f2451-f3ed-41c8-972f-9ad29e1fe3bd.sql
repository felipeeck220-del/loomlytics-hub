
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_delivery_doc_type') THEN
    CREATE TYPE public.billing_delivery_doc_type AS ENUM ('nf','romaneio');
  END IF;
END $$;

ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS delivery_doc_type public.billing_delivery_doc_type,
  ADD COLUMN IF NOT EXISTS delivery_doc_number text,
  ADD COLUMN IF NOT EXISTS delivery_doc_set_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS delivery_doc_set_at timestamptz;
