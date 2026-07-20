
CREATE OR REPLACE FUNCTION public.get_production_shift_stats(p_company_id uuid, p_start_date date, p_end_date date, p_article_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(shift text, total_rolls bigint, total_weight numeric, total_revenue numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.shift,
         COALESCE(SUM(p.rolls_produced),0)::bigint,
         COALESCE(SUM(p.weight_kg),0),
         COALESCE(SUM(p.revenue),0)
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= to_char(p_start_date,'YYYY-MM-DD')
    AND p.date <= to_char(p_end_date,  'YYYY-MM-DD')
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
  GROUP BY p.shift;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_production_machine_stats(p_company_id uuid, p_start_date date, p_end_date date, p_article_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(machine_id uuid, machine_name text, total_rolls bigint, total_weight numeric, avg_efficiency numeric, record_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.machine_id, p.machine_name,
         COALESCE(SUM(p.rolls_produced),0)::bigint,
         COALESCE(SUM(p.weight_kg),0),
         COALESCE(AVG(NULLIF(p.efficiency,0)),0),
         COUNT(*)
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= to_char(p_start_date,'YYYY-MM-DD')
    AND p.date <= to_char(p_end_date,  'YYYY-MM-DD')
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
  GROUP BY p.machine_id, p.machine_name
  ORDER BY total_rolls DESC
  LIMIT p_limit;
END; $function$;

CREATE OR REPLACE FUNCTION public.fetch_productions_page(p_company_id uuid, p_start_date date, p_end_date date, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, company_id uuid, date date, shift text, machine_id uuid, machine_name text, weaver_id uuid, weaver_name text, article_id uuid, article_name text, rpm numeric, rolls_produced numeric, weight_kg numeric, revenue numeric, efficiency numeric, created_at timestamp with time zone, created_by_name text, created_by_code text, total_count bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_s text := to_char(p_start_date,'YYYY-MM-DD');
  v_e text := to_char(p_end_date,  'YYYY-MM-DD');
  v_total bigint;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.productions
  WHERE company_id = p_company_id
    AND date >= v_s AND date <= v_e
    AND (p_shift='all' OR shift=p_shift)
    AND (p_machine_id IS NULL OR machine_id=p_machine_id)
    AND (p_article_id IS NULL OR article_id=p_article_id);

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
  SELECT COUNT(*) INTO v_total FROM public.productions
  WHERE company_id = p_company_id
    AND date >= v_s AND date <= v_e
    AND (p_shift='all' OR shift=p_shift)
    AND (p_machine_id IS NULL OR machine_id=p_machine_id)
    AND (p_article_id IS NULL OR article_id=p_article_id);

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

CREATE OR REPLACE FUNCTION public.get_outsource_productions_list(p_company_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_month text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_offset int := GREATEST(0,(COALESCE(p_page,1)-1)*COALESCE(p_page_size,20));
  v_limit  int := GREATEST(1,COALESCE(p_page_size,20));
  v_search text := NULLIF(TRIM(COALESCE(p_search,'')),'');
  v_s text := CASE WHEN p_start_date IS NULL THEN NULL ELSE to_char(p_start_date,'YYYY-MM-DD') END;
  v_e text := CASE WHEN p_end_date   IS NULL THEN NULL ELSE to_char(p_end_date,  'YYYY-MM-DD') END;
  v_rows jsonb; v_count int; v_totals jsonb;
BEGIN
  WITH base AS (
    SELECT p.*,
           COALESCE(oc.name,'Avulso') AS outsource_company_name,
           a.name AS article_name, c.name AS client_name,
           (p.weight_kg * p.client_value_per_kg)::numeric AS total_revenue,
           (p.weight_kg * p.outsource_value_per_kg)::numeric AS total_cost,
           (p.weight_kg * COALESCE(p.freight_per_kg,0))::numeric AS historical_freight,
           ((p.weight_kg * p.client_value_per_kg) - (p.weight_kg * p.outsource_value_per_kg) - (p.weight_kg * COALESCE(p.freight_per_kg,0)))::numeric AS total_profit
    FROM public.outsource_productions p
    LEFT JOIN public.outsource_companies oc ON oc.id=p.outsource_company_id
    LEFT JOIN public.articles a ON a.id=p.article_id
    LEFT JOIN public.clients c ON c.id=a.client_id
    WHERE p.company_id = p_company_id
      AND (v_s IS NULL OR p.date >= v_s)
      AND (v_e IS NULL OR p.date <= v_e)
      AND (p_month IS NULL OR p.date LIKE p_month || '%')
      AND (v_search IS NULL OR (
           COALESCE(oc.name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(a.name,'')  ILIKE '%'||v_search||'%'
        OR COALESCE(c.name,'')  ILIKE '%'||v_search||'%'
        OR COALESCE(p.nf_rom,'')ILIKE '%'||v_search||'%'))
  )
  SELECT COUNT(*)::int,
         jsonb_build_object(
           'revenue',COALESCE(SUM(total_revenue),0),
           'cost',COALESCE(SUM(total_cost),0),
           'weight',COALESCE(SUM(weight_kg),0),
           'rolls',COALESCE(SUM(rolls),0),
           'historical_freight',COALESCE(SUM(historical_freight),0))
  INTO v_count, v_totals FROM base;

  SELECT COALESCE(jsonb_agg(row_to_json(b) ORDER BY b.date DESC, b.id ASC),'[]'::jsonb)
  INTO v_rows FROM (
    SELECT p.*,
           COALESCE(oc.name,'Avulso') AS outsource_company_name,
           a.name AS article_name, c.name AS client_name,
           (p.weight_kg * p.client_value_per_kg)::numeric AS total_revenue,
           (p.weight_kg * p.outsource_value_per_kg)::numeric AS total_cost,
           ((p.weight_kg * p.client_value_per_kg) - (p.weight_kg * p.outsource_value_per_kg) - (p.weight_kg * COALESCE(p.freight_per_kg,0)))::numeric AS total_profit,
           ((p.client_value_per_kg - p.outsource_value_per_kg) - COALESCE(p.freight_per_kg,0))::numeric AS profit_per_kg
    FROM public.outsource_productions p
    LEFT JOIN public.outsource_companies oc ON oc.id=p.outsource_company_id
    LEFT JOIN public.articles a ON a.id=p.article_id
    LEFT JOIN public.clients c ON c.id=a.client_id
    WHERE p.company_id = p_company_id
      AND (v_s IS NULL OR p.date >= v_s)
      AND (v_e IS NULL OR p.date <= v_e)
      AND (p_month IS NULL OR p.date LIKE p_month || '%')
      AND (v_search IS NULL OR (
           COALESCE(oc.name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(a.name,'')  ILIKE '%'||v_search||'%'
        OR COALESCE(c.name,'')  ILIKE '%'||v_search||'%'
        OR COALESCE(p.nf_rom,'')ILIKE '%'||v_search||'%'))
    ORDER BY p.date DESC, p.id ASC
    OFFSET v_offset LIMIT v_limit
  ) b;

  RETURN jsonb_build_object('rows',v_rows,'total_count',v_count,'totals',v_totals);
END; $function$;
