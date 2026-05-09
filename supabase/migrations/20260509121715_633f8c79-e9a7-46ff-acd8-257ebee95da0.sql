CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_machine_id UUID DEFAULT NULL,
  p_shift TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_days_diff INTEGER;
  v_prev_start DATE;
  v_prev_end DATE;
  v_current_metrics JSON;
  v_previous_metrics JSON;
  v_chart_production_by_shift JSON;
  v_chart_top_machines JSON;
  v_chart_trend JSON;
  v_calendar_hours NUMERIC;
  v_record_count INTEGER;
BEGIN
  -- 1. Calcular período anterior para comparação
  v_days_diff := p_end_date - p_start_date + 1;
  v_prev_start := p_start_date - v_days_diff;
  v_prev_end := p_start_date - 1;

  -- 2. Calcular Horas de Calendário (Base para Kg/h e Faturamento/h)
  -- Se houver turno, assumimos 8h por dia (480 min), caso contrário 24h
  IF p_shift IS NOT NULL AND p_shift != 'all' THEN
    v_calendar_hours := v_days_diff * 8;
  ELSE
    v_calendar_hours := v_days_diff * 24;
  END IF;

  -- 3. Métricas Período Atual
  SELECT 
    json_build_object(
      'total_weight', COALESCE(SUM(weight_kg), 0),
      'total_revenue', COALESCE(SUM(revenue), 0),
      'total_rolls', COALESCE(SUM(rolls_produced), 0),
      'avg_efficiency', COALESCE(AVG(CASE WHEN rolls_produced > 0 THEN efficiency END), 0),
      'record_count', COUNT(*),
      'calendar_hours', v_calendar_hours
    ) INTO v_current_metrics
  FROM public.productions
  WHERE company_id = p_company_id
    AND date BETWEEN p_start_date AND p_end_date
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_shift IS NULL OR shift = p_shift);

  -- 4. Métricas Período Anterior
  SELECT 
    json_build_object(
      'total_weight', COALESCE(SUM(weight_kg), 0),
      'total_revenue', COALESCE(SUM(revenue), 0),
      'total_rolls', COALESCE(SUM(rolls_produced), 0),
      'avg_efficiency', COALESCE(AVG(CASE WHEN rolls_produced > 0 THEN efficiency END), 0)
    ) INTO v_previous_metrics
  FROM public.productions
  WHERE company_id = p_company_id
    AND date BETWEEN v_prev_start AND v_prev_end
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_shift IS NULL OR shift = p_shift);

  -- 5. Gráfico: Produção por Turno
  SELECT json_agg(t) INTO v_chart_production_by_shift
  FROM (
    SELECT shift, SUM(weight_kg) as weight
    FROM public.productions
    WHERE company_id = p_company_id
      AND date BETWEEN p_start_date AND p_end_date
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR shift = p_shift)
    GROUP BY shift
    ORDER BY shift
  ) t;

  -- 6. Gráfico: Top Máquinas
  SELECT json_agg(t) INTO v_chart_top_machines
  FROM (
    SELECT machine_name as name, SUM(weight_kg) as weight
    FROM public.productions
    WHERE company_id = p_company_id
      AND date BETWEEN p_start_date AND p_end_date
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR shift = p_shift)
    GROUP BY machine_name
    ORDER BY weight DESC
    LIMIT 10
  ) t;

  -- 7. Gráfico: Tendência Diária
  SELECT json_agg(t) INTO v_chart_trend
  FROM (
    SELECT 
      date, 
      SUM(weight_kg) as weight, 
      SUM(revenue) as revenue
    FROM public.productions
    WHERE company_id = p_company_id
      AND date BETWEEN p_start_date AND p_end_date
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR shift = p_shift)
    GROUP BY date
    ORDER BY date
  ) t;

  -- Retorno Consolidado
  RETURN json_build_object(
    'current_period', v_current_metrics,
    'previous_period', v_previous_metrics,
    'charts', json_build_object(
      'production_by_shift', COALESCE(v_chart_production_by_shift, '[]'::json),
      'top_machines', COALESCE(v_chart_top_machines, '[]'::json),
      'trend', COALESCE(v_chart_trend, '[]'::json)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
