CREATE OR REPLACE FUNCTION public.get_report_data(
  p_company_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_shift TEXT DEFAULT 'all',
  p_client_id UUID DEFAULT NULL,
  p_article_id UUID DEFAULT NULL,
  p_machine_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_rolls NUMERIC := 0;
  v_total_kg NUMERIC := 0;
  v_total_revenue NUMERIC := 0;
  v_result JSON;
BEGIN
  -- 1. Calcular Totais Gerais para o período e filtros (base para cálculos de %)
  SELECT 
    COALESCE(SUM(rolls_produced), 0),
    COALESCE(SUM(weight_kg), 0),
    COALESCE(SUM(revenue), 0)
  INTO v_total_rolls, v_total_kg, v_total_revenue
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date::DATE >= p_start_date
    AND p.date::DATE <= p_end_date
    AND (p_shift = 'all' OR p.shift = p_shift)
    AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
    AND (p_client_id IS NULL OR EXISTS (
        SELECT 1 FROM public.articles a 
        WHERE a.id = p.article_id AND a.client_id = p_client_id
    ));

  -- 2. Montar o JSON de resposta com todas as agregações solicitadas
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'total_rolls', v_total_rolls,
        'total_kg', v_total_kg,
        'total_revenue', v_total_revenue,
        'avg_efficiency', COALESCE(SUM(efficiency * weight_kg) / NULLIF(SUM(weight_kg), 0), 0)
      )
      FROM public.productions p
      WHERE p.company_id = p_company_id 
        AND p.date::DATE >= p_start_date 
        AND p.date::DATE <= p_end_date
        AND (p_shift = 'all' OR p.shift = p_shift)
        AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
        AND (p_article_id IS NULL OR p.article_id = p_article_id)
        AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
    ),
    
    -- Agregação POR TURNO
    'by_shift', (
      SELECT json_agg(t) FROM (
        SELECT 
          shift as name,
          SUM(rolls_produced) as rolls,
          SUM(weight_kg) as kg,
          SUM(revenue) as revenue,
          COALESCE(SUM(efficiency * weight_kg) / NULLIF(SUM(weight_kg), 0), 0) as efficiency,
          CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        WHERE p.company_id = p_company_id 
          AND p.date::DATE >= p_start_date 
          AND p.date::DATE <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        GROUP BY shift
      ) t
    ),

    -- Agregação POR MÁQUINA
    'by_machine', (
      SELECT json_agg(t) FROM (
        SELECT 
          COALESCE(m.name, p.machine_name) as name,
          SUM(rolls_produced) as rolls,
          SUM(weight_kg) as kg,
          SUM(revenue) as revenue,
          COALESCE(SUM(p.efficiency * p.weight_kg) / NULLIF(SUM(p.weight_kg), 0), 0) as efficiency,
          COUNT(*) as records,
          CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        LEFT JOIN public.machines m ON p.machine_id = m.id
        WHERE p.company_id = p_company_id 
          AND p.date::DATE >= p_start_date 
          AND p.date::DATE <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        GROUP BY COALESCE(m.name, p.machine_name)
        ORDER BY rolls DESC
      ) t
    ),

    -- Agregação POR CLIENTE
    'by_client', (
      SELECT json_agg(t) FROM (
        SELECT 
          COALESCE(c.name, a.client_name, 'Sem Cliente') as name,
          SUM(rolls_produced) as rolls,
          SUM(weight_kg) as kg,
          SUM(revenue) as revenue,
          COALESCE(SUM(p.efficiency * p.weight_kg) / NULLIF(SUM(p.weight_kg), 0), 0) as efficiency,
          CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        LEFT JOIN public.articles a ON p.article_id = a.id
        LEFT JOIN public.clients c ON a.client_id = c.id
        WHERE p.company_id = p_company_id 
          AND p.date::DATE >= p_start_date 
          AND p.date::DATE <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR c.id = p_client_id OR EXISTS (SELECT 1 FROM public.articles a2 WHERE a2.id = p.article_id AND a2.client_id = p_client_id))
        GROUP BY COALESCE(c.name, a.client_name, 'Sem Cliente')
        ORDER BY revenue DESC
      ) t
    ),

    -- Agregação POR ARTIGO
    'by_article', (
      SELECT json_agg(t) FROM (
        SELECT 
          COALESCE(a.name, p.article_name) as name,
          COALESCE(c.name, a.client_name, '—') as client_name,
          SUM(rolls_produced) as rolls,
          SUM(weight_kg) as kg,
          SUM(revenue) as revenue,
          COALESCE(SUM(p.efficiency * p.weight_kg) / NULLIF(SUM(p.weight_kg), 0), 0) as efficiency,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        LEFT JOIN public.articles a ON p.article_id = a.id
        LEFT JOIN public.clients c ON a.client_id = c.id
        WHERE p.company_id = p_company_id 
          AND p.date::DATE >= p_start_date 
          AND p.date::DATE <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a2 WHERE a2.id = p.article_id AND a2.client_id = p_client_id))
        GROUP BY COALESCE(a.name, p.article_name), COALESCE(c.name, a.client_name, '—')
        ORDER BY kg DESC
      ) t
    ),

    -- EVOLUÇÃO (TENDÊNCIA)
    'evolution', (
      SELECT json_agg(t) FROM (
        SELECT 
          date,
          SUM(rolls_produced) as rolls,
          SUM(weight_kg) as kg,
          SUM(revenue) as revenue,
          COALESCE(SUM(efficiency * weight_kg) / NULLIF(SUM(weight_kg), 0), 0) as efficiency
        FROM public.productions p
        WHERE p.company_id = p_company_id 
          AND p.date::DATE >= p_start_date 
          AND p.date::DATE <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        GROUP BY date
        ORDER BY date ASC
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Atualização da RPC get_dashboard_metrics para eficiência ponderada
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_company_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_machine_id UUID DEFAULT NULL,
  p_shift TEXT DEFAULT NULL
)
RETURNS JSON
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

  -- 3. Métricas Período Atual (Eficiência Ponderada por Peso)
  SELECT 
    json_build_object(
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
        'avg_efficiency', COALESCE(SUM(efficiency * weight_kg) / NULLIF(SUM(weight_kg), 0), 0),
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

  -- 6. Gráfico: Top Máquinas (Eficiência Ponderada)
  SELECT json_agg(t) INTO v_chart_top_machines
  FROM (
    SELECT 
      COALESCE(m.name, p.machine_name) as name, 
      COALESCE(SUM(p.efficiency * p.weight_kg) / NULLIF(SUM(p.weight_kg), 0), 0) as efficiency
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

  -- 7. Gráfico: Tendência (Eficiência Ponderada)
  SELECT json_agg(t) INTO v_chart_trend
  FROM (
    SELECT 
      date, 
      SUM(weight_kg) as weight, 
      SUM(revenue) as revenue,
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
$$;