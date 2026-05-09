CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
    p_company_id uuid,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL,
    p_machine_id uuid DEFAULT NULL,
    p_shift text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_real_start DATE;
  v_real_end DATE;
  v_days_worked INTEGER;
  v_calendar_days INTEGER;
  v_prev_start DATE;
  v_prev_end DATE;
  v_current_metrics JSON;
  v_previous_metrics JSON;
  v_chart_production_by_shift JSON;
  v_chart_top_machines JSON;
  v_chart_trend JSON;
  v_calendar_hours NUMERIC;
BEGIN
  -- 1. Determinar intervalo real para busca
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    SELECT MIN(date), MAX(date) INTO v_real_start, v_real_end
    FROM public.productions
    WHERE company_id = p_company_id;
    
    -- Se não houver produções, usa hoje como fallback
    v_real_start := COALESCE(v_real_start, CURRENT_DATE);
    v_real_end := COALESCE(v_real_end, CURRENT_DATE);
  ELSE
    v_real_start := p_start_date;
    v_real_end := p_end_date;
  END IF;

  -- 1.1 Calcular dias TRABALHADOS (dias com registros)
  SELECT COUNT(DISTINCT date) INTO v_days_worked
  FROM public.productions
  WHERE company_id = p_company_id
    AND date BETWEEN v_real_start AND v_real_end
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);

  -- Se v_days_worked for 0 (período sem dados), usamos 1 para evitar divisão por zero
  v_days_worked := GREATEST(v_days_worked, 1);

  -- Intervalo de calendário (apenas para calcular o período anterior comparativo)
  v_calendar_days := v_real_end - v_real_start + 1;
  v_prev_start := v_real_start - v_calendar_days;
  v_prev_end := v_real_start - 1;

  -- 2. Calcular Horas (Base para Kg/h e R$/h) baseado nos dias trabalhados
  IF p_shift IS NOT NULL AND p_shift != 'all' THEN
    v_calendar_hours := v_days_worked * 8; -- Considerando 8h por turno
  ELSE
    v_calendar_hours := v_days_worked * 24; -- Considerando 24h por dia (3 turnos)
  END IF;

  -- 3. Métricas Período Atual
  SELECT 
    json_build_object(
      'total_weight', COALESCE(SUM(weight_kg), 0),
      'total_revenue', COALESCE(SUM(revenue), 0),
      'total_rolls', COALESCE(SUM(rolls_produced), 0),
      'avg_efficiency', COALESCE(AVG(CASE WHEN rolls_produced > 0 THEN efficiency END), 0),
      'record_count', COUNT(*),
      'calendar_hours', v_calendar_hours,
      'start_date', v_real_start,
      'end_date', v_real_end,
      'days_worked', v_days_worked
    ) INTO v_current_metrics
  FROM public.productions
  WHERE company_id = p_company_id
    AND date BETWEEN v_real_start AND v_real_end
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);

  -- 4. Métricas Período Anterior (Comparativo)
  -- Nota: Para o período anterior, também usamos dias trabalhados se quisermos consistência
  DECLARE
    v_prev_days_worked INTEGER;
    v_prev_calendar_hours NUMERIC;
  BEGIN
    SELECT COUNT(DISTINCT date) INTO v_prev_days_worked
    FROM public.productions
    WHERE company_id = p_company_id
      AND date BETWEEN v_prev_start AND v_prev_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);
    
    v_prev_days_worked := GREATEST(v_prev_days_worked, 1);
    
    IF p_shift IS NOT NULL AND p_shift != 'all' THEN
      v_prev_calendar_hours := v_prev_days_worked * 8;
    ELSE
      v_prev_calendar_hours := v_prev_days_worked * 24;
    END IF;

    SELECT 
      json_build_object(
        'total_weight', COALESCE(SUM(weight_kg), 0),
        'total_revenue', COALESCE(SUM(revenue), 0),
        'total_rolls', COALESCE(SUM(rolls_produced), 0),
        'avg_efficiency', COALESCE(AVG(CASE WHEN rolls_produced > 0 THEN efficiency END), 0),
        'calendar_hours', v_prev_calendar_hours
      ) INTO v_previous_metrics
    FROM public.productions
    WHERE company_id = p_company_id
      AND date BETWEEN v_prev_start AND v_prev_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);
  END;

  -- 5. Gráfico: Produção por Turno
  SELECT json_agg(t) INTO v_chart_production_by_shift
  FROM (
    SELECT shift, SUM(weight_kg) as weight
    FROM public.productions
    WHERE company_id = p_company_id
      AND date BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
    GROUP BY shift
    ORDER BY shift
  ) t;

  -- 6. Gráfico: Top Máquinas
  SELECT json_agg(t) INTO v_chart_top_machines
  FROM (
    SELECT machine_name as name, SUM(weight_kg) as weight
    FROM public.productions
    WHERE company_id = p_company_id
      AND date BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
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
      AND date BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
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
$$;