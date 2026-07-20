
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
    SELECT p.id, p.weight_kg, p.rolls, p.client_value_per_kg, p.outsource_value_per_kg, p.freight_per_kg,
           (p.weight_kg * p.client_value_per_kg)::numeric AS calc_revenue,
           (p.weight_kg * p.outsource_value_per_kg)::numeric AS calc_cost,
           (p.weight_kg * COALESCE(p.freight_per_kg,0))::numeric AS calc_freight
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
           'revenue',COALESCE(SUM(calc_revenue),0),
           'cost',COALESCE(SUM(calc_cost),0),
           'weight',COALESCE(SUM(weight_kg),0),
           'rolls',COALESCE(SUM(rolls),0),
           'historical_freight',COALESCE(SUM(calc_freight),0))
  INTO v_count, v_totals FROM base;

  SELECT COALESCE(jsonb_agg(row_to_json(b) ORDER BY b.date DESC, b.id ASC),'[]'::jsonb)
  INTO v_rows FROM (
    SELECT p.id, p.company_id, p.outsource_company_id, p.article_id, p.date, p.weight_kg, p.rolls,
           p.client_value_per_kg, p.outsource_value_per_kg, p.freight_per_kg, p.observations, p.nf_rom,
           p.created_at, p.created_by_name, p.created_by_code,
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
