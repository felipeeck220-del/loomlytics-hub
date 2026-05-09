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
  -- 1. Calcular Totais Gerais para o período e filtros (para cálculo de %)
  SELECT 
    COALESCE(SUM(rolls_produced), 0),
    COALESCE(SUM(weight_kg), 0),
    COALESCE(SUM(revenue), 0)
  INTO v_total_rolls, v_total_kg, v_total_revenue
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND p.date >= p_start_date
    AND p.date <= p_end_date
    AND (p_shift = 'all' OR p.shift = p_shift)
    AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
    AND (p_client_id IS NULL OR EXISTS (
        SELECT 1 FROM public.articles a 
        WHERE a.id = p.article_id AND a.client_id = p_client_id
    ));

  -- 2. Montar o JSON de resposta com todas as agregações
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'total_rolls', v_total_rolls,
        'total_kg', v_total_kg,
        'total_revenue', v_total_revenue,
        'avg_efficiency', COALESCE(AVG(efficiency), 0)
      )
      FROM public.productions p
      WHERE p.company_id = p_company_id 
        AND p.date >= p_start_date 
        AND p.date <= p_end_date
        AND (p_shift = 'all' OR p.shift = p_shift)
        AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
        AND (p_article_id IS NULL OR p.article_id = p_article_id)
        AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        AND rolls_produced > 0
    ),
    
    'by_shift', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT 
          shift as name,
          COALESCE(SUM(rolls_produced), 0) as rolls,
          COALESCE(SUM(weight_kg), 0) as kg,
          COALESCE(SUM(revenue), 0) as revenue,
          COALESCE(AVG(efficiency) FILTER (WHERE rolls_produced > 0), 0) as efficiency,
          CASE WHEN v_total_rolls > 0 THEN (COALESCE(SUM(rolls_produced), 0) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (COALESCE(SUM(weight_kg), 0) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (COALESCE(SUM(revenue), 0) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        WHERE p.company_id = p_company_id 
          AND p.date >= p_start_date 
          AND p.date <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        GROUP BY shift
      ) t
    ),

    'by_machine', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT 
          COALESCE(m.name, p.machine_name) as name,
          COALESCE(SUM(rolls_produced), 0) as rolls,
          COALESCE(SUM(weight_kg), 0) as kg,
          COALESCE(SUM(revenue), 0) as revenue,
          COALESCE(AVG(efficiency) FILTER (WHERE rolls_produced > 0), 0) as efficiency,
          COUNT(*) as records,
          CASE WHEN v_total_rolls > 0 THEN (COALESCE(SUM(rolls_produced), 0) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (COALESCE(SUM(weight_kg), 0) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (COALESCE(SUM(revenue), 0) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        LEFT JOIN public.machines m ON p.machine_id = m.id
        WHERE p.company_id = p_company_id 
          AND p.date >= p_start_date 
          AND p.date <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        GROUP BY COALESCE(m.name, p.machine_name)
        ORDER BY rolls DESC
      ) t
    ),

    'by_client', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT 
          COALESCE(c.name, a.client_name, 'Sem Cliente') as name,
          COALESCE(SUM(rolls_produced), 0) as rolls,
          COALESCE(SUM(weight_kg), 0) as kg,
          COALESCE(SUM(revenue), 0) as revenue,
          COALESCE(AVG(efficiency) FILTER (WHERE rolls_produced > 0), 0) as efficiency,
          CASE WHEN v_total_rolls > 0 THEN (COALESCE(SUM(rolls_produced), 0) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (COALESCE(SUM(weight_kg), 0) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (COALESCE(SUM(revenue), 0) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        JOIN public.articles a ON p.article_id = a.id
        LEFT JOIN public.clients c ON a.client_id = c.id
        WHERE p.company_id = p_company_id 
          AND p.date >= p_start_date 
          AND p.date <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR c.id = p_client_id)
        GROUP BY COALESCE(c.name, a.client_name, 'Sem Cliente')
        ORDER BY revenue DESC
      ) t
    ),

    'by_article', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT 
          COALESCE(a.name, p.article_name) as name,
          COALESCE(c.name, a.client_name, '—') as client_name,
          COALESCE(SUM(rolls_produced), 0) as rolls,
          COALESCE(SUM(weight_kg), 0) as kg,
          COALESCE(SUM(revenue), 0) as revenue,
          COALESCE(AVG(efficiency) FILTER (WHERE rolls_produced > 0), 0) as efficiency,
          CASE WHEN v_total_kg > 0 THEN (COALESCE(SUM(weight_kg), 0) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (COALESCE(SUM(revenue), 0) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        LEFT JOIN public.articles a ON p.article_id = a.id
        LEFT JOIN public.clients c ON a.client_id = c.id
        WHERE p.company_id = p_company_id 
          AND p.date >= p_start_date 
          AND p.date <= p_end_date
          AND (p_shift = 'all' OR p.shift = p_shift)
          AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
          AND (p_article_id IS NULL OR p.article_id = p_article_id)
          AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a2 WHERE a2.id = p.article_id AND a2.client_id = p_client_id))
        GROUP BY COALESCE(a.name, p.article_name), COALESCE(c.name, a.client_name, '—')
        ORDER BY kg DESC
      ) t
    ),

    'evolution', (
      SELECT COALESCE(json_agg(t), '[]'::json) FROM (
        SELECT 
          date,
          COALESCE(SUM(rolls_produced), 0) as rolls,
          COALESCE(SUM(weight_kg), 0) as kg,
          COALESCE(SUM(revenue), 0) as revenue,
          COALESCE(AVG(efficiency) FILTER (WHERE rolls_produced > 0), 0) as efficiency
        FROM public.productions p
        WHERE p.company_id = p_company_id 
          AND p.date >= p_start_date 
          AND p.date <= p_end_date
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