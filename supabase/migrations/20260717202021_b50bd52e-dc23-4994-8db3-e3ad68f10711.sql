
-- =====================================================================
-- Reports RPCs — padrão FaturamentoTotal (JSON, plpgsql, SECURITY DEFINER)
-- =====================================================================

-- 1) Meses disponíveis
CREATE OR REPLACE FUNCTION public.get_reports_available_months(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSON;
BEGIN
  SELECT COALESCE(json_agg(x ORDER BY x.month_str DESC), '[]'::json)
  INTO v_result
  FROM (
    SELECT DISTINCT substring(p.date, 1, 7) AS month_str
    FROM public.productions p
    WHERE p.company_id = p_company_id
  ) x;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_available_months(UUID)
  TO anon, authenticated, service_role;


-- 2) Métricas consolidadas (KPIs + 4 grupos + evolução)
CREATE OR REPLACE FUNCTION public.get_reports_metrics(
  p_company_id  UUID,
  p_start_date  TEXT,
  p_end_date    TEXT,
  p_shift       TEXT DEFAULT NULL,
  p_machine_id  UUID DEFAULT NULL,
  p_client_id   UUID DEFAULT NULL,
  p_article_id  UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_rolls    NUMERIC := 0;
  v_total_weight   NUMERIC := 0;
  v_total_revenue  NUMERIC := 0;
  v_active_days    INTEGER := 0;
  v_avg_eff        NUMERIC := 0;
  v_by_shift       JSON;
  v_by_machine     JSON;
  v_by_client      JSON;
  v_by_article     JSON;
  v_evolution      JSON;
BEGIN
  -- Base filtrada (CTE reutilizada via subqueries — plpgsql não persiste CTE entre statements,
  -- então usamos uma view temporária baseada em joins repetidos e filtros idênticos).
  --
  -- KPIs
  SELECT
    COALESCE(SUM(p.rolls_produced), 0),
    COALESCE(SUM(p.weight_kg), 0),
    COALESCE(SUM(p.revenue), 0),
    COUNT(DISTINCT p.date),
    COALESCE(
      SUM(p.efficiency * p.weight_kg) FILTER (WHERE p.rolls_produced > 0)
      / NULLIF(SUM(p.weight_kg) FILTER (WHERE p.rolls_produced > 0), 0),
      0
    )
  INTO v_total_rolls, v_total_weight, v_total_revenue, v_active_days, v_avg_eff
  FROM public.productions p
  LEFT JOIN public.articles a ON a.id = p.article_id
  WHERE p.company_id = p_company_id
    AND (p_start_date IS NULL OR p.date >= p_start_date)
    AND (p_end_date   IS NULL OR p.date <= p_end_date)
    AND (p_shift      IS NULL OR p.shift = p_shift)
    AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
    AND (p_client_id  IS NULL OR a.client_id = p_client_id);

  -- by_shift (sempre 3 turnos)
  SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.ord), '[]'::json)
  INTO v_by_shift
  FROM (
    SELECT
      sh.shift,
      CASE sh.shift WHEN 'manha' THEN 1 WHEN 'tarde' THEN 2 ELSE 3 END AS ord,
      COALESCE(SUM(p.rolls_produced), 0)::numeric AS rolos,
      COALESCE(SUM(p.weight_kg), 0)::numeric    AS kg,
      COALESCE(SUM(p.revenue), 0)::numeric      AS faturamento,
      COALESCE(
        SUM(p.efficiency * p.weight_kg) FILTER (WHERE p.rolls_produced > 0)
        / NULLIF(SUM(p.weight_kg) FILTER (WHERE p.rolls_produced > 0), 0),
        0
      )::numeric AS eficiencia,
      CASE WHEN v_total_rolls   > 0 THEN COALESCE(SUM(p.rolls_produced),0) / v_total_rolls   * 100 ELSE 0 END AS pct_rolls,
      CASE WHEN v_total_revenue > 0 THEN COALESCE(SUM(p.revenue),0)        / v_total_revenue * 100 ELSE 0 END AS pct_revenue
    FROM (VALUES ('manha'), ('tarde'), ('noite')) AS sh(shift)
    LEFT JOIN public.productions p
      ON p.shift = sh.shift
     AND p.company_id = p_company_id
     AND (p_start_date IS NULL OR p.date >= p_start_date)
     AND (p_end_date   IS NULL OR p.date <= p_end_date)
     AND (p_shift      IS NULL OR p.shift = p_shift)
     AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
     AND (p_article_id IS NULL OR p.article_id = p_article_id)
    LEFT JOIN public.articles a ON a.id = p.article_id
    WHERE (p_client_id IS NULL OR a.client_id = p_client_id OR p.article_id IS NULL)
    GROUP BY sh.shift
  ) s;

  -- by_machine
  SELECT COALESCE(json_agg(row_to_json(m)), '[]'::json)
  INTO v_by_machine
  FROM (
    SELECT
      p.machine_id,
      COALESCE(MAX(p.machine_name), '') AS name,
      COALESCE(SUM(p.rolls_produced), 0)::numeric AS rolos,
      COALESCE(SUM(p.weight_kg), 0)::numeric    AS kg,
      COALESCE(SUM(p.revenue), 0)::numeric      AS faturamento,
      COALESCE(
        SUM(p.efficiency * p.weight_kg) FILTER (WHERE p.rolls_produced > 0)
        / NULLIF(SUM(p.weight_kg) FILTER (WHERE p.rolls_produced > 0), 0),
        0
      )::numeric AS eficiencia,
      CASE WHEN v_total_rolls   > 0 THEN SUM(p.rolls_produced)::numeric / v_total_rolls   * 100 ELSE 0 END AS pct_rolls,
      CASE WHEN v_total_revenue > 0 THEN SUM(p.revenue)::numeric        / v_total_revenue * 100 ELSE 0 END AS pct_revenue,
      COALESCE(string_agg(DISTINCT p.article_name, ', ' ORDER BY p.article_name), '') AS article_names,
      COALESCE(array_agg(DISTINCT p.article_id) FILTER (WHERE p.article_id IS NOT NULL), '{}') AS article_ids
    FROM public.productions p
    LEFT JOIN public.articles a ON a.id = p.article_id
    WHERE p.company_id = p_company_id
      AND (p_start_date IS NULL OR p.date >= p_start_date)
      AND (p_end_date   IS NULL OR p.date <= p_end_date)
      AND (p_shift      IS NULL OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
      AND (p_client_id  IS NULL OR a.client_id = p_client_id)
    GROUP BY p.machine_id
  ) m;

  -- by_client
  SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.kg DESC), '[]'::json)
  INTO v_by_client
  FROM (
    SELECT
      COALESCE(cl.name, 'Diversos') AS name,
      COALESCE(SUM(p.rolls_produced), 0)::numeric AS rolos,
      COALESCE(SUM(p.weight_kg), 0)::numeric    AS kg,
      COALESCE(SUM(p.revenue), 0)::numeric      AS faturamento,
      CASE WHEN v_total_rolls   > 0 THEN SUM(p.rolls_produced)::numeric / v_total_rolls   * 100 ELSE 0 END AS pct_rolls,
      CASE WHEN v_total_weight  > 0 THEN SUM(p.weight_kg)::numeric      / v_total_weight  * 100 ELSE 0 END AS pct_kg,
      CASE WHEN v_total_revenue > 0 THEN SUM(p.revenue)::numeric        / v_total_revenue * 100 ELSE 0 END AS pct_revenue
    FROM public.productions p
    LEFT JOIN public.articles a ON a.id = p.article_id
    LEFT JOIN public.clients  cl ON cl.id = a.client_id
    WHERE p.company_id = p_company_id
      AND (p_start_date IS NULL OR p.date >= p_start_date)
      AND (p_end_date   IS NULL OR p.date <= p_end_date)
      AND (p_shift      IS NULL OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
      AND (p_client_id  IS NULL OR a.client_id = p_client_id)
    GROUP BY COALESCE(cl.name, 'Diversos')
  ) c;

  -- by_article
  SELECT COALESCE(json_agg(row_to_json(ar) ORDER BY ar.kg DESC), '[]'::json)
  INTO v_by_article
  FROM (
    SELECT
      COALESCE(p.article_id::text, p.article_name) AS id,
      p.article_name AS name,
      COALESCE(cl.name, '') AS client_name,
      COALESCE(SUM(p.rolls_produced), 0)::numeric AS rolos,
      COALESCE(SUM(p.weight_kg), 0)::numeric    AS kg,
      COALESCE(SUM(p.revenue), 0)::numeric      AS faturamento,
      COALESCE(
        SUM(p.efficiency * p.weight_kg) FILTER (WHERE p.rolls_produced > 0)
        / NULLIF(SUM(p.weight_kg) FILTER (WHERE p.rolls_produced > 0), 0),
        0
      )::numeric AS eficiencia,
      CASE WHEN v_total_rolls   > 0 THEN SUM(p.rolls_produced)::numeric / v_total_rolls   * 100 ELSE 0 END AS pct_rolls,
      CASE WHEN v_total_weight  > 0 THEN SUM(p.weight_kg)::numeric      / v_total_weight  * 100 ELSE 0 END AS pct_kg,
      CASE WHEN v_total_revenue > 0 THEN SUM(p.revenue)::numeric        / v_total_revenue * 100 ELSE 0 END AS pct_revenue
    FROM public.productions p
    LEFT JOIN public.articles a ON a.id = p.article_id
    LEFT JOIN public.clients  cl ON cl.id = a.client_id
    WHERE p.company_id = p_company_id
      AND (p_start_date IS NULL OR p.date >= p_start_date)
      AND (p_end_date   IS NULL OR p.date <= p_end_date)
      AND (p_shift      IS NULL OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
      AND (p_client_id  IS NULL OR a.client_id = p_client_id)
    GROUP BY COALESCE(p.article_id::text, p.article_name), p.article_name, COALESCE(cl.name, '')
  ) ar;

  -- evolution (por dia)
  SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.date ASC), '[]'::json)
  INTO v_evolution
  FROM (
    SELECT
      p.date,
      COALESCE(SUM(p.rolls_produced), 0)::numeric AS rolos,
      COALESCE(SUM(p.weight_kg), 0)::numeric    AS kg,
      COALESCE(SUM(p.revenue), 0)::numeric      AS faturamento
    FROM public.productions p
    LEFT JOIN public.articles a ON a.id = p.article_id
    WHERE p.company_id = p_company_id
      AND (p_start_date IS NULL OR p.date >= p_start_date)
      AND (p_end_date   IS NULL OR p.date <= p_end_date)
      AND (p_shift      IS NULL OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
      AND (p_client_id  IS NULL OR a.client_id = p_client_id)
    GROUP BY p.date
  ) e;

  RETURN json_build_object(
    'kpis', json_build_object(
      'total_rolls',    v_total_rolls,
      'total_weight',   v_total_weight,
      'total_revenue',  v_total_revenue,
      'active_days',    v_active_days,
      'avg_efficiency', v_avg_eff
    ),
    'by_shift',   v_by_shift,
    'by_machine', v_by_machine,
    'by_client',  v_by_client,
    'by_article', v_by_article,
    'evolution',  v_evolution
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_metrics(UUID, TEXT, TEXT, TEXT, UUID, UUID, UUID)
  TO anon, authenticated, service_role;


-- 3) Pódio por turno
CREATE OR REPLACE FUNCTION public.get_reports_podio(
  p_company_id UUID,
  p_start_date TEXT,
  p_end_date   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ranking JSON;
  v_daily   JSON;
BEGIN
  -- Ranking global do período
  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.eficiencia DESC), '[]'::json)
  INTO v_ranking
  FROM (
    SELECT
      p.shift AS id,
      p.shift AS name,
      COALESCE(SUM(p.rolls_produced), 0)::numeric AS rolos,
      COALESCE(SUM(p.weight_kg), 0)::numeric    AS kg,
      COALESCE(
        SUM(p.efficiency * p.weight_kg) FILTER (WHERE p.rolls_produced > 0)
        / NULLIF(SUM(p.weight_kg) FILTER (WHERE p.rolls_produced > 0), 0),
        0
      )::numeric AS eficiencia
    FROM public.productions p
    WHERE p.company_id = p_company_id
      AND p.date >= p_start_date
      AND p.date <= p_end_date
    GROUP BY p.shift
  ) r;

  -- Ranking por dia (todos os dias do intervalo, mesmo sem produção)
  SELECT COALESCE(json_agg(row_to_json(d) ORDER BY d.date ASC), '[]'::json)
  INTO v_daily
  FROM (
    SELECT
      to_char(gs::date, 'YYYY-MM-DD') AS date,
      COALESCE((
        SELECT json_agg(row_to_json(x) ORDER BY x.eficiencia DESC)
        FROM (
          SELECT
            p.shift AS id,
            p.shift AS name,
            COALESCE(SUM(p.rolls_produced), 0)::numeric AS rolos,
            COALESCE(SUM(p.weight_kg), 0)::numeric    AS kg,
            COALESCE(
              SUM(p.efficiency * p.weight_kg) FILTER (WHERE p.rolls_produced > 0)
              / NULLIF(SUM(p.weight_kg) FILTER (WHERE p.rolls_produced > 0), 0),
              0
            )::numeric AS eficiencia
          FROM public.productions p
          WHERE p.company_id = p_company_id
            AND p.date = to_char(gs::date, 'YYYY-MM-DD')
          GROUP BY p.shift
        ) x
      ), '[]'::json) AS ranking
    FROM generate_series(p_start_date::date, p_end_date::date, interval '1 day') gs
  ) d;

  RETURN json_build_object(
    'ranking', v_ranking,
    'daily',   v_daily
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reports_podio(UUID, TEXT, TEXT)
  TO anon, authenticated, service_role;
