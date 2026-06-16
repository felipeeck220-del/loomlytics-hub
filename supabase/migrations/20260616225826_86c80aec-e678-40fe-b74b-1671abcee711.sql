CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_company_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_machine_id uuid DEFAULT NULL::uuid, p_shift text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    SELECT MIN(date::DATE), MAX(date::DATE) INTO v_real_start, v_real_end
    FROM public.productions
    WHERE company_id = p_company_id;
    v_real_start := COALESCE(v_real_start, CURRENT_DATE);
    v_real_end := COALESCE(v_real_end, CURRENT_DATE);
  ELSE
    v_real_start := p_start_date;
    v_real_end := p_end_date;
  END IF;

  SELECT COUNT(DISTINCT date) INTO v_days_worked
  FROM public.productions
  WHERE company_id = p_company_id
    AND date::DATE BETWEEN v_real_start AND v_real_end
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);

  v_days_worked := GREATEST(v_days_worked, 1);
  v_calendar_days := v_real_end - v_real_start + 1;
  v_prev_start := v_real_start - v_calendar_days;
  v_prev_end := v_real_start - 1;

  IF p_shift IS NOT NULL AND p_shift != 'all' THEN
    v_calendar_hours := v_days_worked * 8;
  ELSE
    v_calendar_hours := v_days_worked * 24;
  END IF;

  SELECT json_build_object(
    'total_weight', COALESCE(SUM(weight_kg), 0),
    'total_revenue', COALESCE(SUM(revenue), 0),
    'total_rolls', COALESCE(SUM(rolls_produced), 0),
    'avg_efficiency', COALESCE(SUM(efficiency * weight_kg) / NULLIF(SUM(weight_kg), 0), 0),
    'record_count', COUNT(*),
    'calendar_hours', v_calendar_hours,
    'start_date', v_real_start,
    'end_date', v_real_end,
    'days_worked', v_days_worked
  ) INTO v_current_metrics
  FROM public.productions
  WHERE company_id = p_company_id
    AND date::DATE BETWEEN v_real_start AND v_real_end
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);

  DECLARE
    v_prev_days_worked INTEGER;
    v_prev_calendar_hours NUMERIC;
  BEGIN
    SELECT COUNT(DISTINCT date) INTO v_prev_days_worked
    FROM public.productions
    WHERE company_id = p_company_id
      AND date::DATE BETWEEN v_prev_start AND v_prev_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);
    v_prev_days_worked := GREATEST(v_prev_days_worked, 1);
    IF p_shift IS NOT NULL AND p_shift != 'all' THEN
      v_prev_calendar_hours := v_prev_days_worked * 8;
    ELSE
      v_prev_calendar_hours := v_prev_days_worked * 24;
    END IF;
    SELECT json_build_object(
      'total_weight', COALESCE(SUM(weight_kg), 0),
      'total_revenue', COALESCE(SUM(revenue), 0),
      'total_rolls', COALESCE(SUM(rolls_produced), 0),
      'avg_efficiency', COALESCE(SUM(efficiency * weight_kg) / NULLIF(SUM(weight_kg), 0), 0),
      'calendar_hours', v_prev_calendar_hours
    ) INTO v_previous_metrics
    FROM public.productions
    WHERE company_id = p_company_id
      AND date::DATE BETWEEN v_prev_start AND v_prev_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);
  END;

  -- Produção por Turno: agora com rolls e revenue
  SELECT json_agg(t) INTO v_chart_production_by_shift
  FROM (
    SELECT
      shift,
      SUM(weight_kg) as weight,
      SUM(rolls_produced) as rolls,
      SUM(revenue) as revenue
    FROM public.productions
    WHERE company_id = p_company_id
      AND date::DATE BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
    GROUP BY shift
  ) t;

  -- Top Máquinas: agora com rolls, weight e revenue
  SELECT json_agg(t) INTO v_chart_top_machines
  FROM (
    SELECT
      COALESCE(m.name, p.machine_name) as name,
      COALESCE(SUM(p.efficiency * p.weight_kg) / NULLIF(SUM(p.weight_kg), 0), 0) as efficiency,
      SUM(p.rolls_produced) as rolls,
      SUM(p.weight_kg) as weight,
      SUM(p.revenue) as revenue
    FROM public.productions p
    LEFT JOIN public.machines m ON p.machine_id = m.id
    WHERE p.company_id = p_company_id
      AND p.date::DATE BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
    GROUP BY COALESCE(m.name, p.machine_name)
    ORDER BY SUM(weight_kg) DESC
    LIMIT 10
  ) t;

  -- Tendência: agora com rolls
  SELECT json_agg(t) INTO v_chart_trend
  FROM (
    SELECT
      date,
      SUM(weight_kg) as weight,
      SUM(revenue) as revenue,
      SUM(rolls_produced) as rolls,
      COALESCE(SUM(efficiency * weight_kg) / NULLIF(SUM(weight_kg), 0), 0) as efficiency
    FROM public.productions
    WHERE company_id = p_company_id
      AND date::DATE BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
    GROUP BY date
    ORDER BY date ASC
  ) t;

  RETURN json_build_object(
    'current_period', v_current_metrics,
    'previous_period', v_previous_metrics,
    'charts', json_build_object(
      'production_by_shift', v_chart_production_by_shift,
      'top_machines', v_chart_top_machines,
      'trend', v_chart_trend
    )
  );
END;
$function$;