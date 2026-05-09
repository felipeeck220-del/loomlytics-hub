-- Recreate get_faturamento_total_metrics to be more robust and align with Dashboard's RPC patterns
CREATE OR REPLACE FUNCTION public.get_faturamento_total_metrics(
  p_company_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_prev_start_date DATE DEFAULT NULL,
  p_prev_end_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_malhas DECIMAL;
  v_current_terc DECIMAL;
  v_current_res DECIMAL;
  v_prev_malhas DECIMAL;
  v_prev_terc DECIMAL;
  v_prev_res DECIMAL;
  v_chart_data JSON;
  v_start DATE;
  v_end DATE;
  v_p_start DATE;
  v_p_end DATE;
BEGIN
  -- Handle default dates if null (same as dashboard logic)
  v_start := COALESCE(p_start_date, '2000-01-01'::DATE);
  v_end := COALESCE(p_end_date, CURRENT_DATE);
  v_p_start := COALESCE(p_prev_start_date, v_start - (v_end - v_start + 1));
  v_p_end := COALESCE(p_prev_end_date, v_start - 1);

  -- Totais do Período Atual
  SELECT COALESCE(SUM(revenue), 0) INTO v_current_malhas 
  FROM productions 
  WHERE company_id = p_company_id AND date >= v_start AND date <= v_end;

  SELECT COALESCE(SUM(total_profit), 0) INTO v_current_terc 
  FROM outsource_productions 
  WHERE company_id = p_company_id AND date >= v_start AND date <= v_end;

  SELECT COALESCE(SUM(total), 0) INTO v_current_res 
  FROM residue_sales 
  WHERE company_id = p_company_id AND date >= v_start AND date <= v_end;

  -- Totais do Período Anterior
  SELECT COALESCE(SUM(revenue), 0) INTO v_prev_malhas 
  FROM productions 
  WHERE company_id = p_company_id AND date >= v_p_start AND date <= v_p_end;

  SELECT COALESCE(SUM(total_profit), 0) INTO v_prev_terc 
  FROM outsource_productions 
  WHERE company_id = p_company_id AND date >= v_p_start AND date <= v_p_end;

  SELECT COALESCE(SUM(total), 0) INTO v_prev_res 
  FROM residue_sales 
  WHERE company_id = p_company_id AND date >= v_p_start AND date <= v_p_end;

  -- Dados para o Gráfico (Agrupados por Data)
  WITH all_dates AS (
    SELECT date FROM productions WHERE company_id = p_company_id AND date >= v_start AND date <= v_end
    UNION
    SELECT date FROM outsource_productions WHERE company_id = p_company_id AND date >= v_start AND date <= v_end
    UNION
    SELECT date FROM residue_sales WHERE company_id = p_company_id AND date >= v_start AND date <= v_end
  ),
  daily_metrics AS (
    SELECT 
      ad.date,
      COALESCE((SELECT SUM(revenue) FROM productions WHERE company_id = p_company_id AND date = ad.date), 0) as malhas,
      COALESCE((SELECT SUM(total_profit) FROM outsource_productions WHERE company_id = p_company_id AND date = ad.date), 0) as terceirizado,
      COALESCE((SELECT SUM(total) FROM residue_sales WHERE company_id = p_company_id AND date = ad.date), 0) as residuos
    FROM all_dates ad
    ORDER BY ad.date
  )
  SELECT json_agg(daily_metrics) INTO v_chart_data FROM daily_metrics;

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

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.get_faturamento_total_metrics TO authenticated, anon, service_role;