-- Remove policy that exposed PII (admin_email, admin_name, whatsapp) to anon
DROP POLICY IF EXISTS "Anyone can read company basic info" ON public.companies;

-- Public safe view: only non-sensitive fields needed for slug-based routing / login screen
CREATE OR REPLACE VIEW public.companies_public
WITH (security_invoker = off) AS
SELECT id, name, slug, logo_url
FROM public.companies;

GRANT SELECT ON public.companies_public TO anon, authenticated;