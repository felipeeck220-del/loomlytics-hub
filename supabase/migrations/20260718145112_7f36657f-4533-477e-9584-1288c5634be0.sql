CREATE OR REPLACE FUNCTION public.get_invoices_bootstrap(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company jsonb;
  v_yarn_types jsonb;
  v_outsource_companies jsonb;
  v_months_invoices jsonb;
  v_months_eft jsonb;
  v_current_month text := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
BEGIN
  SELECT to_jsonb(json_build_object('name', c.name, 'logo_url', c.logo_url))
    INTO v_company
    FROM public.companies c
   WHERE c.id = p_company_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(yt.*) ORDER BY yt.name), '[]'::jsonb)
    INTO v_yarn_types
    FROM public.yarn_types yt
   WHERE yt.company_id = p_company_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', oc.id, 'name', oc.name) ORDER BY oc.name), '[]'::jsonb)
    INTO v_outsource_companies
    FROM public.outsource_companies oc
   WHERE oc.company_id = p_company_id;

  WITH months AS (
    SELECT DISTINCT substring(i.issue_date, 1, 7) AS m
      FROM public.invoices i
     WHERE i.company_id = p_company_id
       AND i.issue_date IS NOT NULL
       AND length(i.issue_date) >= 7
       AND substring(i.issue_date, 1, 4) BETWEEN '2020' AND '2099'
    UNION
    SELECT v_current_month
  )
  SELECT COALESCE(jsonb_agg(m ORDER BY m DESC), jsonb_build_array(v_current_month))
    INTO v_months_invoices
    FROM months
   WHERE m IS NOT NULL;

  WITH months AS (
    SELECT DISTINCT reference_month AS m
      FROM public.outsource_yarn_stock
     WHERE company_id = p_company_id
       AND reference_month IS NOT NULL
       AND reference_month <> ''
    UNION
    SELECT v_current_month
  )
  SELECT COALESCE(jsonb_agg(m ORDER BY m DESC), jsonb_build_array(v_current_month))
    INTO v_months_eft
    FROM months
   WHERE m IS NOT NULL;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, jsonb_build_object('name', null, 'logo_url', null)),
    'yarn_types', v_yarn_types,
    'outsource_companies', v_outsource_companies,
    'available_months_invoices', v_months_invoices,
    'available_months_eft', v_months_eft
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoices_bootstrap(uuid) TO anon, authenticated, service_role;