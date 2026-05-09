CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_company_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_shift TEXT DEFAULT NULL,
  p_machine_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stats RECORD;
  v_previous_stats RECORD;
  v_prev_start DATE;
  v_prev_end DATE;
  v_days_count INTEGER;
  v_shift_minutes INTEGER := 1440; -- Default 24h
  v_result JSON;
BEGIN
  -- 1. Definir período anterior para comparação (mesma duração do atual)
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_days_count := (p_end_date - p_start_date) + 1;
    v_prev_end := p_start_date - 1;
    v_prev_start := v_prev_end - (v_days_count - 1);
  END IF;

  -- 2. Estatísticas do período atual
  SELECT 
    COALESCE(SUM(weight_kg), 0) as total_weight,
    COALESCE(SUM(revenue), 0) as total_revenue,
    COALESCE(SUM(rolls_produced), 0) as total_rolls,
    CASE 
      WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
      ELSE 0 
    END as avg_efficiency,
    COUNT(DISTINCT date) as days_with_records
  INTO v_current_stats
  FROM public.productions
  WHERE company_id = p_company_id
    AND (p_start_date IS NULL OR date >= p_start_date)
    AND (p_end_date IS NULL OR date <= p_end_date)
    AND (p_shift IS NULL OR shift = p_shift)
    AND (p_machine_id IS NULL OR machine_id = p_machine_id);

  -- 3. Estatísticas do período anterior
  IF v_prev_start IS NOT NULL THEN
    SELECT 
      COALESCE(SUM(weight_kg), 0) as total_weight,
      COALESCE(SUM(revenue), 0) as total_revenue,
      COALESCE(SUM(rolls_produced), 0) as total_rolls,
      CASE 
        WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
        ELSE 0 
      END as avg_efficiency
    INTO v_previous_stats
    FROM public.productions
    WHERE company_id = p_company_id
      AND date >= v_prev_start
      AND date <= v_prev_end
      AND (p_shift IS NULL OR shift = p_shift)
      AND (p_machine_id IS NULL OR machine_id = p_machine_id);
  END IF;

  -- 4. Cálculo de horas operacionais (calendar_hours)
  -- Se houver turno específico, usa os minutos do turno. Caso contrário 24h por dia com registro.
  IF p_shift IS NOT NULL THEN
    -- Tenta buscar configurações reais da empresa ou usa default (510 min)
    SELECT 
      CASE 
        WHEN p_shift = 'manha' THEN get_shift_minutes(shift_manha_start, shift_manha_end)
        WHEN p_shift = 'tarde' THEN get_shift_minutes(shift_tarde_start, shift_tarde_end)
        WHEN p_shift = 'noite' THEN get_shift_minutes(shift_noite_start, shift_noite_end)
        ELSE 480
      END INTO v_shift_minutes
    FROM public.company_settings
    WHERE company_id = p_company_id;
    
    IF v_shift_minutes IS NULL THEN v_shift_minutes := 510; END IF;
  ELSE
    v_shift_minutes := 1440;
  END IF;

  -- 5. Montar resultado final
  SELECT json_build_object(
    'current_period', json_build_object(
      'total_weight', v_current_stats.total_weight,
      'total_revenue', v_current_stats.total_revenue,
      'total_rolls', v_current_stats.total_rolls,
      'avg_efficiency', v_current_stats.avg_efficiency,
      'days_with_records', v_current_stats.days_with_records,
      'calendar_hours', (v_current_stats.days_with_records * v_shift_minutes / 60.0)
    ),
    'previous_period', CASE WHEN v_previous_stats IS NOT NULL THEN json_build_object(
      'total_weight', v_previous_stats.total_weight,
      'total_revenue', v_previous_stats.total_revenue,
      'total_rolls', v_previous_stats.total_rolls,
      'avg_efficiency', v_previous_stats.avg_efficiency
    ) ELSE NULL END,
    'charts', json_build_object(
      'production_by_shift', (
        SELECT json_agg(t) FROM (
          SELECT shift, SUM(weight_kg) as weight
          FROM public.productions
          WHERE company_id = p_company_id
            AND (p_start_date IS NULL OR date >= p_start_date)
            AND (p_end_date IS NULL OR date <= p_end_date)
          GROUP BY shift
        ) t
      ),
      'top_machines', (
        SELECT json_agg(t) FROM (
          SELECT COALESCE(m.name, p.machine_name) as name, SUM(weight_kg) as weight
          FROM public.productions p
          LEFT JOIN public.machines m ON p.machine_id = m.id
          WHERE p.company_id = p_company_id
            AND (p_start_date IS NULL OR date >= p_start_date)
            AND (p_end_date IS NULL OR date <= p_end_date)
          GROUP BY COALESCE(m.name, p.machine_name)
          ORDER BY weight DESC
          LIMIT 5
        ) t
      ),
      'trend', (
        SELECT json_agg(t) FROM (
          SELECT date, SUM(weight_kg) as weight, SUM(revenue) as revenue
          FROM public.productions
          WHERE company_id = p_company_id
            AND (p_start_date IS NULL OR date >= p_start_date)
            AND (p_end_date IS NULL OR date <= p_end_date)
          GROUP BY date
          ORDER BY date ASC
        ) t
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;