
CREATE OR REPLACE FUNCTION public.get_stock_malha_bootstrap(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_company jsonb;
  v_cutoff  text;
  v_months  jsonb;
  v_own     jsonb;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object(
      'company', NULL,
      'cutoff_date', NULL,
      'available_months', '[]'::jsonb,
      'own_articles', '[]'::jsonb
    );
  END IF;

  SELECT to_jsonb(c) FROM (
    SELECT name, logo_url FROM public.companies WHERE id = p_company_id
  ) c INTO v_company;

  SELECT stock_cutoff_date INTO v_cutoff
  FROM public.company_settings
  WHERE company_id = p_company_id
  LIMIT 1;

  WITH m AS (
    SELECT DISTINCT substring(issue_date, 1, 7) AS ym
    FROM public.invoices
    WHERE company_id = p_company_id
      AND issue_date IS NOT NULL
      AND length(issue_date) >= 7
    UNION
    SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM')
  )
  SELECT COALESCE(jsonb_agg(ym ORDER BY ym DESC), '[]'::jsonb)
  INTO v_months
  FROM m
  WHERE ym IS NOT NULL;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'observations', observations,
      'created_at', created_at
    ) ORDER BY name
  ), '[]'::jsonb)
  INTO v_own
  FROM public.own_stock_articles
  WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'company', v_company,
    'cutoff_date', v_cutoff,
    'available_months', v_months,
    'own_articles', v_own
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_malha_bootstrap(uuid) TO anon, authenticated, service_role;
