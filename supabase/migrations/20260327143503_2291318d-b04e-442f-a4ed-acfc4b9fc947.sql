-- Allow anonymous/public read of company basic info for login page
CREATE POLICY "Anyone can read company basic info"
ON public.companies
FOR SELECT
TO anon, authenticated
USING (true);