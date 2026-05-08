-- Atualiza get_production_stats para usar TEXT para datas e evitar erros de coerção
CREATE OR REPLACE FUNCTION public.get_production_stats(
  p_company_id uuid,
  p_start_date text,
  p_end_date text,
  p_shift text DEFAULT 'all',
  p_machine_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL
)
RETURNS TABLE(
  total_weight numeric,
  total_revenue numeric,
  total_rolls bigint,
  avg_efficiency numeric,
  record_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
BEGIN
  -- Tenta converter as strings para datas, tratando erros se o formato for inválido
  BEGIN
    v_start_date := p_start_date::date;
    v_end_date := p_end_date::date;
  EXCEPTION WHEN OTHERS THEN
    v_start_date := '2000-01-01'::date;
    v_end_date := '2100-01-01'::date;
  END;

  RETURN QUERY
  SELECT
    COALESCE(SUM(weight_kg), 0) AS total_weight,
    COALESCE(SUM(revenue), 0) AS total_revenue,
    COALESCE(SUM(rolls_produced), 0) AS total_rolls,
    COALESCE(AVG(efficiency), 0) AS avg_efficiency,
    COUNT(*) AS record_count
  FROM public.productions
  WHERE company_id = p_company_id
    AND date >= v_start_date
    AND date <= v_end_date
    AND (p_shift = 'all' OR shift = p_shift)
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_article_id IS NULL OR article_id = p_article_id);
END;
$$;

-- Atualiza fetch_productions_page para garantir contagem correta e usar TEXT para datas
CREATE OR REPLACE FUNCTION public.fetch_productions_page(
  p_company_id uuid,
  p_start_date text,
  p_end_date text,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_shift text DEFAULT 'all',
  p_machine_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  company_id uuid,
  date date,
  shift text,
  machine_id uuid,
  machine_name text,
  weaver_id uuid,
  weaver_name text,
  article_id uuid,
  article_name text,
  rpm numeric,
  rolls_produced numeric,
  weight_kg numeric,
  revenue numeric,
  efficiency numeric,
  created_at timestamp with time zone,
  created_by_name text,
  created_by_code text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date;
  v_end_date date;
  v_total bigint;
BEGIN
  -- Converter strings para datas
  BEGIN
    v_start_date := p_start_date::date;
    v_end_date := p_end_date::date;
  EXCEPTION WHEN OTHERS THEN
    v_start_date := '2000-01-01'::date;
    v_end_date := '2100-01-01'::date;
  END;

  -- Obter contagem total primeiro
  SELECT COUNT(*) INTO v_total
  FROM public.productions
  WHERE productions.company_id = p_company_id
    AND productions.date >= v_start_date
    AND productions.date <= v_end_date
    AND (p_shift = 'all' OR productions.shift = p_shift)
    AND (p_machine_id IS NULL OR productions.machine_id = p_machine_id)
    AND (p_article_id IS NULL OR productions.article_id = p_article_id);

  RETURN QUERY
  SELECT
    p.id,
    p.company_id,
    p.date,
    p.shift,
    p.machine_id,
    p.machine_name,
    p.weaver_id,
    p.weaver_name,
    p.article_id,
    p.article_name,
    p.rpm,
    p.rolls_produced,
    p.weight_kg,
    p.revenue,
    p.efficiency,
    p.created_at,
    p.created_by_name,
    p.created_by_code,
    v_total AS total_count
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= v_start_date
    AND p.date <= v_end_date
    AND (p_shift = 'all' OR p.shift = p_shift)
    AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
  ORDER BY p.date DESC, p.created_at DESC
  LIMIT p_page_size
  OFFSET (p_page * p_page_size);
END;
$$;