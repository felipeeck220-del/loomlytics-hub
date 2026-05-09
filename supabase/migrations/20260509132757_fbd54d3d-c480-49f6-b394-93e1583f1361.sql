CREATE OR REPLACE FUNCTION public.get_faturamento_total_metrics(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_prev_start_date DATE,
  p_prev_end_date DATE
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_malhas NUMERIC;
  v_current_terc NUMERIC;
  v_current_res NUMERIC;
  v_prev_malhas NUMERIC;
  v_prev_terc NUMERIC;
  v_prev_res NUMERIC;
  v_chart_data JSON;
BEGIN
  -- Current Period Totals with explicit table aliases to avoid parameter name ambiguity
  SELECT COALESCE(SUM(t.revenue), 0) INTO v_current_malhas FROM public.productions t WHERE t.company_id = p_company_id AND t.date >= p_start_date AND t.date <= p_end_date;
  SELECT COALESCE(SUM(t.total_profit), 0) INTO v_current_terc FROM public.outsource_productions t WHERE t.company_id = p_company_id AND t.date >= p_start_date AND t.date <= p_end_date;
  SELECT COALESCE(SUM(t.total), 0) INTO v_current_res FROM public.residue_sales t WHERE t.company_id = p_company_id AND t.date >= p_start_date AND t.date <= p_end_date;

  -- Previous Period Totals
  SELECT COALESCE(SUM(t.revenue), 0) INTO v_prev_malhas FROM public.productions t WHERE t.company_id = p_company_id AND t.date >= p_prev_start_date AND t.date <= p_prev_end_date;
  SELECT COALESCE(SUM(t.total_profit), 0) INTO v_prev_terc FROM public.outsource_productions t WHERE t.company_id = p_company_id AND t.date >= p_prev_start_date AND t.date <= p_prev_end_date;
  SELECT COALESCE(SUM(t.total), 0) INTO v_prev_res FROM public.residue_sales t WHERE t.company_id = p_company_id AND t.date >= p_prev_start_date AND t.date <= p_prev_end_date;

  -- Chart Data (Grouped by Date)
  WITH dates AS (
    SELECT date FROM public.productions WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date
    UNION
    SELECT date FROM public.outsource_productions WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date
    UNION
    SELECT date FROM public.residue_sales WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date
  ),
  daily AS (
    SELECT 
      d.date,
      COALESCE((SELECT SUM(revenue) FROM public.productions WHERE company_id = p_company_id AND date = d.date), 0) as malhas,
      COALESCE((SELECT SUM(total_profit) FROM public.outsource_productions WHERE company_id = p_company_id AND date = d.date), 0) as terceirizado,
      COALESCE((SELECT SUM(total) FROM public.residue_sales WHERE company_id = p_company_id AND date = d.date), 0) as residuos
    FROM dates d
    ORDER BY d.date
  )
  SELECT json_agg(daily) INTO v_chart_data FROM daily;

  RETURN json_build_object(
    'current_period', json_build_object(
      'malhas', v_current_malhas,
      'terceirizado', v_current_terc,
      'residuos', v_current_res,
      'total', v_current_malhas + v_current_terc + v_current_res
    ),
    'previous_period', json_build_object(
      'malhas', v_prev_malhas,
      'terceirizado', v_prev_terc,
      'residuos', v_prev_res,
      'total', v_prev_malhas + v_prev_terc + v_prev_res
    ),
    'chart_data', COALESCE(v_chart_data, '[]'::json)
  );
END;
$$;