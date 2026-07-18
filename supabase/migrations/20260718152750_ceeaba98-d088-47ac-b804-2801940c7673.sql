
CREATE OR REPLACE FUNCTION public.get_client_invoices_bootstrap(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company jsonb;
  v_months jsonb;
BEGIN
  SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url)
    INTO v_company
    FROM public.companies c
   WHERE c.id = p_company_id;

  WITH months AS (
    SELECT DISTINCT to_char(issue_date, 'YYYY-MM') AS ym
      FROM public.client_invoices
     WHERE company_id = p_company_id
       AND issue_date IS NOT NULL
    UNION
    SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
  )
  SELECT COALESCE(jsonb_agg(ym ORDER BY ym DESC), '[]'::jsonb)
    INTO v_months
    FROM months;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, jsonb_build_object('name', '', 'logo_url', null)),
    'available_months', v_months
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_invoices_bootstrap(uuid) TO anon, authenticated, service_role;
