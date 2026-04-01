
ALTER TABLE public.company_settings 
ADD COLUMN tv_code text UNIQUE DEFAULT NULL;

-- Create index for fast lookup by tv_code
CREATE INDEX idx_company_settings_tv_code ON public.company_settings(tv_code) WHERE tv_code IS NOT NULL;

-- Allow anonymous users to read company_settings by tv_code (for TV mode without login)
CREATE POLICY "Anon can read company by tv_code"
ON public.company_settings
FOR SELECT
TO anon
USING (tv_code IS NOT NULL);
