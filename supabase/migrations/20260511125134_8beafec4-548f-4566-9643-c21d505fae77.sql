DROP FUNCTION IF EXISTS public.get_report_kpis(uuid, date, date, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_report_kpis(
    p_company_id uuid, 
    p_date_from date DEFAULT NULL::date, 
    p_date_to date DEFAULT NULL::date, 
    p_shift text DEFAULT 'all'::text, 
    p_machine_id uuid DEFAULT NULL::uuid, 
    p_client_id uuid DEFAULT NULL::uuid, 
    p_article_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    total_rolls bigint, 
    total_weight numeric, 
    total_revenue numeric, 
    avg_efficiency numeric,
    active_days bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(p.rolls_produced), 0)::BIGINT as total_rolls,
        COALESCE(SUM(p.weight_kg), 0)::NUMERIC as total_weight,
        COALESCE(SUM(p.revenue), 0)::NUMERIC as total_revenue,
        CASE 
            WHEN SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END) > 0 
            THEN SUM(p.efficiency * p.weight_kg) / SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END)
            ELSE 0 
        END::NUMERIC as avg_efficiency,
        COUNT(DISTINCT p.date)::BIGINT as active_days
    FROM public.productions p
    LEFT JOIN public.articles a ON p.article_id = a.id
    WHERE p.company_id = p_company_id
      AND (p_date_from IS NULL OR p.date >= p_date_from)
      AND (p_date_to IS NULL OR p.date <= p_date_to)
      AND (p_shift = 'all' OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id);
END;
$function$;