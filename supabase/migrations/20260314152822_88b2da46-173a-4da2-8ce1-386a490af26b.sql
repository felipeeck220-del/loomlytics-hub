
-- Add logo_url column to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url text;

-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their company folder
CREATE POLICY "Users can upload company logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
);

-- Allow authenticated users to update their company logos
CREATE POLICY "Users can update company logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
);

-- Allow authenticated users to delete their company logos
CREATE POLICY "Users can delete company logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = (SELECT company_id::text FROM public.profiles WHERE id = auth.uid())
);

-- Allow public read access (logos are public)
CREATE POLICY "Anyone can read company logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-logos');
