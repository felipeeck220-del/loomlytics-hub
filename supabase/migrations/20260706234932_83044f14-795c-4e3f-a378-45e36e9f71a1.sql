DROP VIEW IF EXISTS public.companies_public;

CREATE OR REPLACE FUNCTION public.get_company_public_by_slug(_slug text)
RETURNS TABLE(id uuid, name text, slug text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.slug, c.logo_url
  FROM public.companies c
  WHERE c.slug = _slug
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_company_public_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_public_by_slug(text) TO anon, authenticated;