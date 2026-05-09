-- 1. Refatorar get_dashboard_metrics para maior consistência
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
    p_company_id uuid, 
    p_start_date date DEFAULT NULL::date, 
    p_end_date date DEFAULT NULL::date, 
    p_machine_id uuid DEFAULT NULL::uuid, 
    p_shift text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  -- 1. Determinar intervalo real
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

  -- 1.1 Calcular dias TRABALHADOS
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
    AND date::DATE BETWEEN v_real_start AND v_real_end
    AND (p_machine_id IS NULL OR machine_id = p_machine_id)
    AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);

  -- 4. Métricas Período Anterior
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
      AND date::DATE BETWEEN v_prev_start AND v_prev_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift);
  END;

  -- 5. Gráfico: Produção por Turno
  SELECT json_agg(t) INTO v_chart_production_by_shift
  FROM (
    SELECT shift, SUM(weight_kg) as weight
    FROM public.productions
    WHERE company_id = p_company_id
      AND date::DATE BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
    GROUP BY shift
  ) t;

  -- 6. Gráfico: Top Máquinas
  SELECT json_agg(t) INTO v_chart_top_machines
  FROM (
    SELECT 
      COALESCE(m.name, p.machine_name) as name, 
      AVG(CASE WHEN rolls_produced > 0 THEN efficiency END) as efficiency
    FROM public.productions p
    LEFT JOIN public.machines m ON p.machine_id = m.id
    WHERE p.company_id = p_company_id
      AND p.date::DATE BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
    GROUP BY COALESCE(m.name, p.machine_name)
    ORDER BY efficiency DESC
    LIMIT 5
  ) t;

  -- 7. Gráfico: Tendência Diária
  SELECT json_agg(t) INTO v_chart_trend
  FROM (
    SELECT date, SUM(weight_kg) as weight, SUM(revenue) as revenue
    FROM public.productions
    WHERE company_id = p_company_id
      AND date::DATE BETWEEN v_real_start AND v_real_end
      AND (p_machine_id IS NULL OR machine_id = p_machine_id)
      AND (p_shift IS NULL OR p_shift = 'all' OR shift = p_shift)
    GROUP BY date
    ORDER BY date::DATE ASC
  ) t;

  RETURN json_build_object(
    'current_metrics', v_current_metrics,
    'previous_metrics', v_previous_metrics,
    'chart_production_by_shift', COALESCE(v_chart_production_by_shift, '[]'::json),
    'chart_top_machines', COALESCE(v_chart_top_machines, '[]'::json),
    'chart_trend', COALESCE(v_chart_trend, '[]'::json)
  );
END;
$function$;

-- 2. Refatorar get_faturamento_total_metrics para melhor performance e consistência
CREATE OR REPLACE FUNCTION public.get_faturamento_total_metrics(
    p_company_id uuid, 
    p_start_date date, 
    p_end_date date, 
    p_prev_start_date date, 
    p_prev_end_date date
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_malhas NUMERIC;
  v_current_terc NUMERIC;
  v_current_res NUMERIC;
  v_prev_malhas NUMERIC;
  v_prev_terc NUMERIC;
  v_prev_res NUMERIC;
  v_chart_data JSON;
BEGIN
  -- Current Period Totals
  SELECT COALESCE(SUM(t.revenue), 0) INTO v_current_malhas 
  FROM public.productions t 
  WHERE t.company_id = p_company_id AND t.date::DATE BETWEEN p_start_date AND p_end_date;
  
  SELECT COALESCE(SUM(t.total_profit), 0) INTO v_current_terc 
  FROM public.outsource_productions t 
  WHERE t.company_id = p_company_id AND t.date::DATE BETWEEN p_start_date AND p_end_date;
  
  SELECT COALESCE(SUM(t.total), 0) INTO v_current_res 
  FROM public.residue_sales t 
  WHERE t.company_id = p_company_id AND t.date::DATE BETWEEN p_start_date AND p_end_date;

  -- Previous Period Totals
  SELECT COALESCE(SUM(t.revenue), 0) INTO v_prev_malhas 
  FROM public.productions t 
  WHERE t.company_id = p_company_id AND t.date::DATE BETWEEN p_prev_start_date AND p_prev_end_date;
  
  SELECT COALESCE(SUM(t.total_profit), 0) INTO v_prev_terc 
  FROM public.outsource_productions t 
  WHERE t.company_id = p_company_id AND t.date::DATE BETWEEN p_prev_start_date AND p_prev_end_date;
  
  SELECT COALESCE(SUM(t.total), 0) INTO v_prev_res 
  FROM public.residue_sales t 
  WHERE t.company_id = p_company_id AND t.date::DATE BETWEEN p_prev_start_date AND p_prev_end_date;

  -- Chart Data (Grouped by Date) - Refatorado para evitar subqueries
  WITH dates AS (
    SELECT DISTINCT date FROM public.productions WHERE company_id = p_company_id AND date::DATE BETWEEN p_start_date AND p_end_date
    UNION
    SELECT DISTINCT date FROM public.outsource_productions WHERE company_id = p_company_id AND date::DATE BETWEEN p_start_date AND p_end_date
    UNION
    SELECT DISTINCT date FROM public.residue_sales WHERE company_id = p_company_id AND date::DATE BETWEEN p_start_date AND p_end_date
  ),
  malhas_daily AS (
    SELECT date, SUM(revenue) as val FROM public.productions WHERE company_id = p_company_id AND date::DATE BETWEEN p_start_date AND p_end_date GROUP BY date
  ),
  terceirizado_daily AS (
    SELECT date, SUM(total_profit) as val FROM public.outsource_productions WHERE company_id = p_company_id AND date::DATE BETWEEN p_start_date AND p_end_date GROUP BY date
  ),
  residuos_daily AS (
    SELECT date, SUM(total) as val FROM public.residue_sales WHERE company_id = p_company_id AND date::DATE BETWEEN p_start_date AND p_end_date GROUP BY date
  )
  SELECT json_agg(daily) INTO v_chart_data FROM (
    SELECT 
      d.date,
      COALESCE(m.val, 0) as malhas,
      COALESCE(t.val, 0) as terceirizado,
      COALESCE(r.val, 0) as residuos
    FROM dates d
    LEFT JOIN malhas_daily m ON d.date = m.date
    LEFT JOIN terceirizado_daily t ON d.date = t.date
    LEFT JOIN residuos_daily r ON d.date = r.date
    ORDER BY d.date::DATE ASC
  ) daily;

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
$function$;
