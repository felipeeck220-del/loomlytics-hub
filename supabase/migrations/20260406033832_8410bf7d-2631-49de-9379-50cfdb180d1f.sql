
-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payment-receipts bucket
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-receipts');

CREATE POLICY "Anyone can view receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can update own receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can delete own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Add receipt columns to accounts_payable
ALTER TABLE public.accounts_payable
ADD COLUMN receipt_url text NULL,
ADD COLUMN receipt_change_count integer NOT NULL DEFAULT 0;
