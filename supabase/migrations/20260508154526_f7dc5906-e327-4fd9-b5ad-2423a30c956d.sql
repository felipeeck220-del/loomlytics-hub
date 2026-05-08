CREATE OR REPLACE FUNCTION public.get_defect_stats(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_shift text DEFAULT 'all'::text,
  p_machine_id uuid DEFAULT NULL::uuid,
  p_article_id uuid DEFAULT NULL::uuid,
  p_weaver_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text
)
RETURNS TABLE(
  total_records bigint,
  total_kg numeric,
  total_metros numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_records,
    COALESCE(SUM(CASE WHEN measure_type = 'kg' THEN measure_value ELSE 0 END), 0) AS total_kg,
    COALESCE(SUM(CASE WHEN measure_type = 'metro' THEN measure_value ELSE 0 END), 0) AS total_metros
  FROM public.defect_records
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date
    AND (p_shift = 'all' OR shift = p_shift)
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_article_id IS NULL OR article_id = p_article_id)
    AND (p_weaver_id IS NULL OR weaver_id = p_weaver_id)
    AND (p_search_term IS NULL OR (
      machine_name ILIKE '%' || p_search_term || '%' OR
      article_name ILIKE '%' || p_search_term || '%' OR
      weaver_name ILIKE '%' || p_search_term || '%' OR
      observations ILIKE '%' || p_search_term || '%'
    ));
END;
$$;