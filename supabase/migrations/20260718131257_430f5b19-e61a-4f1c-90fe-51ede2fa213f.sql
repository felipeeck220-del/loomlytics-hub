CREATE OR REPLACE FUNCTION public.get_outsource_bootstrap(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company jsonb;
  v_companies jsonb;
  v_articles jsonb;
  v_months jsonb;
BEGIN
  SELECT to_jsonb(x) INTO v_company
  FROM (
    SELECT name, logo_url
    FROM public.companies
    WHERE id = p_company_id
  ) x;

  SELECT COALESCE(jsonb_agg(to_jsonb(oc) ORDER BY oc.name), '[]'::jsonb) INTO v_companies
  FROM public.outsource_companies oc
  WHERE oc.company_id = p_company_id;

  SELECT COALESCE(jsonb_agg(row_to_json(a2) ORDER BY a2.name), '[]'::jsonb) INTO v_articles
  FROM (
    SELECT a.*, c.name AS client_name
    FROM public.articles a
    LEFT JOIN public.clients c ON c.id = a.client_id
    WHERE a.company_id = p_company_id
  ) a2;

  SELECT COALESCE(jsonb_agg(m ORDER BY m DESC), '[]'::jsonb) INTO v_months
  FROM (
    SELECT DISTINCT substring(date, 1, 7) AS m
    FROM public.outsource_productions
    WHERE company_id = p_company_id
      AND date >= '2020-01-01'
      AND date <= '2099-12-31'
    UNION
    SELECT DISTINCT to_char(date, 'YYYY-MM') AS m
    FROM public.outsource_freights
    WHERE company_id = p_company_id
      AND date BETWEEN DATE '2020-01-01' AND DATE '2099-12-31'
  ) mm;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, '{}'::jsonb),
    'companies', v_companies,
    'articles', v_articles,
    'available_months', v_months
  );
END;
$function$;