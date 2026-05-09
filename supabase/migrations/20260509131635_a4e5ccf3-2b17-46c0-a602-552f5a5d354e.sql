CREATE OR REPLACE FUNCTION get_faturamento_total_metrics(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_prev_start_date DATE,
  p_prev_end_date DATE
)
RETURNS JSON AS $$
DECLARE
  v_current_malhas DECIMAL;
  v_current_terc DECIMAL;
  v_current_res DECIMAL;
  v_prev_malhas DECIMAL;
  v_prev_terc DECIMAL;
  v_prev_res DECIMAL;
  v_chart_data JSON;
BEGIN
  -- Totais do Período Atual
  SELECT COALESCE(SUM(revenue), 0) INTO v_current_malhas 
  FROM productions 
  WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date;

  SELECT COALESCE(SUM(total_profit), 0) INTO v_current_terc 
  FROM outsource_productions 
  WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date;

  SELECT COALESCE(SUM(total), 0) INTO v_current_res 
  FROM residue_sales 
  WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date;

  -- Totais do Período Anterior
  SELECT COALESCE(SUM(revenue), 0) INTO v_prev_malhas 
  FROM productions 
  WHERE company_id = p_company_id AND date >= p_prev_start_date AND date <= p_prev_end_date;

  SELECT COALESCE(SUM(total_profit), 0) INTO v_prev_terc 
  FROM outsource_productions 
  WHERE company_id = p_company_id AND date >= p_prev_start_date AND date <= p_prev_end_date;

  SELECT COALESCE(SUM(total), 0) INTO v_prev_res 
  FROM residue_sales 
  WHERE company_id = p_company_id AND date >= p_prev_start_date AND date <= p_prev_end_date;

  -- Dados para o Gráfico (Agrupados por Data)
  WITH all_dates AS (
    SELECT date FROM productions WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date
    UNION
    SELECT date FROM outsource_productions WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date
    UNION
    SELECT date FROM residue_sales WHERE company_id = p_company_id AND date >= p_start_date AND date <= p_end_date
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
    'chart_data', v_chart_data
  );
END;
$$ LANGUAGE plpgsql STABLE;