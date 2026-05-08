-- Função para obter estatísticas de tendência por dia
CREATE OR REPLACE FUNCTION public.get_production_trend_stats(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_shift text DEFAULT 'all',
  p_article_id uuid DEFAULT NULL
)
RETURNS TABLE(
  date date,
  total_rolls bigint,
  total_weight numeric,
  total_revenue numeric,
  avg_efficiency numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.date,
    COALESCE(SUM(p.rolls_produced), 0)::bigint AS total_rolls,
    COALESCE(SUM(p.weight_kg), 0) AS total_weight,
    COALESCE(SUM(p.revenue), 0) AS total_revenue,
    COALESCE(AVG(NULLIF(p.efficiency, 0)), 0) AS avg_efficiency
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= p_start_date
    AND p.date <= p_end_date
    AND (p_shift = 'all' OR p.shift = p_shift)
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
  GROUP BY p.date
  ORDER BY p.date;
END;
$$;
