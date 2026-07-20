
CREATE OR REPLACE FUNCTION public.fetch_productions_page(p_company_id uuid, p_start_date date, p_end_date date, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, company_id uuid, date date, shift text, machine_id uuid, machine_name text, weaver_id uuid, weaver_name text, article_id uuid, article_name text, rpm numeric, rolls_produced numeric, weight_kg numeric, revenue numeric, efficiency numeric, created_at timestamp with time zone, created_by_name text, created_by_code text, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_s text := to_char(p_start_date,'YYYY-MM-DD');
  v_e text := to_char(p_end_date,  'YYYY-MM-DD');
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.productions pr
  WHERE pr.company_id = p_company_id
    AND pr.date >= v_s AND pr.date <= v_e
    AND (p_shift='all' OR pr.shift=p_shift)
    AND (p_machine_id IS NULL OR pr.machine_id=p_machine_id)
    AND (p_article_id IS NULL OR pr.article_id=p_article_id);

  RETURN QUERY
  SELECT p.id, p.company_id, p.date::date, p.shift, p.machine_id, p.machine_name,
         p.weaver_id, p.weaver_name, p.article_id, p.article_name,
         p.rpm::numeric, p.rolls_produced, p.weight_kg, p.revenue, p.efficiency,
         p.created_at, p.created_by_name, p.created_by_code, v_total
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= v_s AND p.date <= v_e
    AND (p_shift='all' OR p.shift=p_shift)
    AND (p_machine_id IS NULL OR p.machine_id=p_machine_id)
    AND (p_article_id IS NULL OR p.article_id=p_article_id)
  ORDER BY p.date DESC, p.created_at DESC
  LIMIT p_page_size OFFSET (p_page * p_page_size);
END; $function$;

CREATE OR REPLACE FUNCTION public.fetch_productions_page(p_company_id uuid, p_start_date text, p_end_date text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, company_id uuid, date date, shift text, machine_id uuid, machine_name text, weaver_id uuid, weaver_name text, article_id uuid, article_name text, rpm numeric, rolls_produced numeric, weight_kg numeric, revenue numeric, efficiency numeric, created_at timestamp with time zone, created_by_name text, created_by_code text, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_s text := COALESCE(NULLIF(TRIM(p_start_date),''),'0001-01-01');
  v_e text := COALESCE(NULLIF(TRIM(p_end_date),  ''),'9999-12-31');
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.productions pr
  WHERE pr.company_id = p_company_id
    AND pr.date >= v_s AND pr.date <= v_e
    AND (p_shift='all' OR pr.shift=p_shift)
    AND (p_machine_id IS NULL OR pr.machine_id=p_machine_id)
    AND (p_article_id IS NULL OR pr.article_id=p_article_id);

  RETURN QUERY
  SELECT p.id, p.company_id, p.date::date, p.shift, p.machine_id, p.machine_name,
         p.weaver_id, p.weaver_name, p.article_id, p.article_name,
         p.rpm::numeric, p.rolls_produced, p.weight_kg, p.revenue, p.efficiency,
         p.created_at, p.created_by_name, p.created_by_code, v_total
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= v_s AND p.date <= v_e
    AND (p_shift='all' OR p.shift=p_shift)
    AND (p_machine_id IS NULL OR p.machine_id=p_machine_id)
    AND (p_article_id IS NULL OR p.article_id=p_article_id)
  ORDER BY p.date DESC, p.created_at DESC
  LIMIT p_page_size OFFSET (p_page * p_page_size);
END; $function$;
