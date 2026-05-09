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
  v_total_weighted_efficiency NUMERIC := 0;
  v_total_efficiency_count NUMERIC := 0;
  v_result JSON;
BEGIN
  -- 1. Calcular Totais Gerais para o período e filtros (usado para % de participação)
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
  -- A eficiência (avg_efficiency) é calculada como a média da coluna efficiency da tabela productions,
  -- que já contém o cálculo (voltas produzidas / voltas teóricas) realizado no momento do insert no frontend.
  SELECT json_build_object(
    'kpis', (
      SELECT json_build_object(
        'total_rolls', v_total_rolls,
        'total_kg', v_total_kg,
        'total_revenue', v_total_revenue,
        'avg_efficiency', CASE 
            WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
            ELSE 0 
          END
      )
      FROM public.productions p
      WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
        AND (p_shift = 'all' OR p.shift = p_shift)
        AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
        AND (p_article_id IS NULL OR p.article_id = p_article_id)
        AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        AND rolls_produced > 0
    ),
    
    -- Agregação POR TURNO
    'by_shift', (
      SELECT json_agg(t) FROM (
        SELECT 
          shift as name,
          SUM(rolls_produced) as rolls,
          SUM(weight_kg) as kg,
          SUM(revenue) as revenue,
          CASE 
            WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
            ELSE 0 
          END as efficiency,
          CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
        AND (p_shift = 'all' OR p.shift = p_shift)
        AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
        AND (p_article_id IS NULL OR p.article_id = p_article_id)
        AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
        GROUP BY shift
        ORDER BY 
          CASE 
            WHEN shift = 'manha' THEN 1 
            WHEN shift = 'tarde' THEN 2 
            WHEN shift = 'noite' THEN 3 
            ELSE 4 
          END
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
          CASE 
            WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
            ELSE 0 
          END as efficiency,
          COUNT(*) as records,
          CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        LEFT JOIN public.machines m ON p.machine_id = m.id
        WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
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
          CASE 
            WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
            ELSE 0 
          END as efficiency,
          CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        JOIN public.articles a ON p.article_id = a.id
        LEFT JOIN public.clients c ON a.client_id = c.id
        WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
        AND (p_shift = 'all' OR p.shift = p_shift)
        AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
        AND (p_article_id IS NULL OR p.article_id = p_article_id)
        AND (p_client_id IS NULL OR c.id = p_client_id)
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
          CASE 
            WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
            ELSE 0 
          END as efficiency,
          CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
          CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
        FROM public.productions p
        LEFT JOIN public.articles a ON p.article_id = a.id
        LEFT JOIN public.clients c ON a.client_id = c.id
        WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
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
          CASE 
            WHEN SUM(weight_kg) > 0 THEN SUM(efficiency * weight_kg) / SUM(weight_kg) 
            ELSE 0 
          END as efficiency
        FROM public.productions p
        WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
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