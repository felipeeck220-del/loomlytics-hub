-- Função para obter estatísticas de produção por turno
CREATE OR REPLACE FUNCTION public.get_production_shift_stats(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_article_id uuid DEFAULT NULL
)
RETURNS TABLE(
  shift text,
  total_rolls bigint,
  total_weight numeric,
  total_revenue numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.shift,
    COALESCE(SUM(p.rolls_produced), 0)::bigint AS total_rolls,
    COALESCE(SUM(p.weight_kg), 0) AS total_weight,
    COALESCE(SUM(p.revenue), 0) AS total_revenue
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= p_start_date
    AND p.date <= p_end_date
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
  GROUP BY p.shift;
END;
$$;

-- Função para obter estatísticas de produção por máquina (Top Máquinas)
CREATE OR REPLACE FUNCTION public.get_production_machine_stats(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_article_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  machine_id uuid,
  machine_name text,
  total_rolls bigint,
  total_weight numeric,
  avg_efficiency numeric,
  record_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.machine_id,
    p.machine_name,
    COALESCE(SUM(p.rolls_produced), 0)::bigint AS total_rolls,
    COALESCE(SUM(p.weight_kg), 0) AS total_weight,
    COALESCE(AVG(NULLIF(p.efficiency, 0)), 0) AS avg_efficiency,
    COUNT(*) AS record_count
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= p_start_date
    AND p.date <= p_end_date
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
  GROUP BY p.machine_id, p.machine_name
  ORDER BY total_rolls DESC
  LIMIT p_limit;
END;
$$;
