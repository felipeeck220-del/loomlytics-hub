
-- =====================================================
-- Fase 3 rpcoutsource.md — Relatórios (leitura C, agregação pesada)
-- =====================================================

-- ---------------------------------------------------------------
-- 1) KPIs + lista de clientes disponíveis (para dropdown)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_outsource_report_metrics(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL,
  p_month      text DEFAULT NULL,
  p_outsource_company_id uuid DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_profit_filter text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue numeric := 0;
  v_cost numeric := 0;
  v_weight numeric := 0;
  v_rolls bigint := 0;
  v_hist_freight numeric := 0;
  v_row_count bigint := 0;
  v_freight_new numeric := 0;
  v_clients jsonb;
  v_profit numeric;
  v_final_profit numeric;
  v_total_freight numeric;
  v_loss numeric := 0;
BEGIN
  SELECT
    COALESCE(SUM(p.weight_kg * p.client_value_per_kg), 0),
    COALESCE(SUM(p.weight_kg * p.outsource_value_per_kg), 0),
    COALESCE(SUM(p.weight_kg), 0),
    COALESCE(SUM(p.rolls), 0),
    COALESCE(SUM(p.weight_kg * COALESCE(p.freight_per_kg, 0)), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) < 0
                      THEN (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0)))
                      ELSE 0 END), 0)
  INTO v_revenue, v_cost, v_weight, v_rolls, v_hist_freight, v_row_count, v_loss
  FROM outsource_productions p
  WHERE p.company_id = p_company_id
    AND (p_start_date IS NULL OR p.date >= to_char(p_start_date, 'YYYY-MM-DD'))
    AND (p_end_date   IS NULL OR p.date <= to_char(p_end_date,   'YYYY-MM-DD'))
    AND (COALESCE(p_month,'') = '' OR p.date LIKE p_month || '%')
    AND (p_outsource_company_id IS NULL OR p.outsource_company_id = p_outsource_company_id)
    AND (p_client_name IS NULL OR p_client_name = '_all' OR p.client_name = p_client_name)
    AND (
      p_profit_filter = 'all'
      OR (p_profit_filter = 'profit' AND (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) > 0)
      OR (p_profit_filter = 'loss'   AND (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) < 0)
    );

  SELECT COALESCE(SUM(fr.total_freight), 0)
  INTO v_freight_new
  FROM outsource_freights fr
  WHERE fr.company_id = p_company_id
    AND (p_start_date IS NULL OR fr.date >= p_start_date)
    AND (p_end_date   IS NULL OR fr.date <= p_end_date)
    AND (COALESCE(p_month,'') = '' OR to_char(fr.date,'YYYY-MM') = p_month)
    AND (p_outsource_company_id IS NULL OR fr.outsource_company_id = p_outsource_company_id);

  SELECT COALESCE(jsonb_agg(c ORDER BY c), '[]'::jsonb)
  INTO v_clients
  FROM (
    SELECT DISTINCT client_name AS c
    FROM outsource_productions
    WHERE company_id = p_company_id
      AND client_name IS NOT NULL
      AND client_name <> ''
  ) s;

  v_total_freight := v_hist_freight + v_freight_new;
  v_profit := v_revenue - v_cost;
  v_final_profit := v_revenue - v_cost - v_total_freight;

  RETURN jsonb_build_object(
    'kpis', jsonb_build_object(
      'revenue', v_revenue,
      'cost', v_cost,
      'weight', v_weight,
      'rolls', v_rolls,
      'historical_freight', v_hist_freight,
      'freight_new', v_freight_new,
      'freight', v_total_freight,
      'profit', v_profit,
      'finalProfit', v_final_profit,
      'loss', v_loss,
      'row_count', v_row_count
    ),
    'available_clients', v_clients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outsource_report_metrics(uuid, date, date, text, uuid, text, text)
  TO anon, authenticated, service_role;


-- ---------------------------------------------------------------
-- 2) Lista paginada com todos os campos consumidos pela tabela e pelo PDF
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_outsource_report_list(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL,
  p_month      text DEFAULT NULL,
  p_outsource_company_id uuid DEFAULT NULL,
  p_client_name text DEFAULT NULL,
  p_profit_filter text DEFAULT 'all',
  p_page       int  DEFAULT 1,
  p_page_size  int  DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset int := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 20));
  v_limit  int := GREATEST(1, LEAST(COALESCE(p_page_size, 20), 100000));
  v_total  bigint := 0;
  v_rows   jsonb  := '[]'::jsonb;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM outsource_productions p
  WHERE p.company_id = p_company_id
    AND (p_start_date IS NULL OR p.date >= to_char(p_start_date, 'YYYY-MM-DD'))
    AND (p_end_date   IS NULL OR p.date <= to_char(p_end_date,   'YYYY-MM-DD'))
    AND (COALESCE(p_month,'') = '' OR p.date LIKE p_month || '%')
    AND (p_outsource_company_id IS NULL OR p.outsource_company_id = p_outsource_company_id)
    AND (p_client_name IS NULL OR p_client_name = '_all' OR p.client_name = p_client_name)
    AND (
      p_profit_filter = 'all'
      OR (p_profit_filter = 'profit' AND (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) > 0)
      OR (p_profit_filter = 'loss'   AND (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) < 0)
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.id,
      p.company_id,
      p.outsource_company_id,
      p.article_id,
      p.article_name,
      p.outsource_company_name,
      p.client_name,
      p.date,
      p.weight_kg::numeric AS weight_kg,
      p.rolls,
      p.client_value_per_kg::numeric AS client_value_per_kg,
      p.outsource_value_per_kg::numeric AS outsource_value_per_kg,
      COALESCE(p.freight_per_kg, 0)::numeric AS freight_per_kg,
      (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))::numeric AS profit_per_kg,
      (p.weight_kg * p.client_value_per_kg)::numeric AS total_revenue,
      (p.weight_kg * p.outsource_value_per_kg)::numeric AS total_cost,
      (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0)))::numeric AS total_profit,
      p.observations,
      p.nf_rom,
      p.created_by_name,
      p.created_by_code,
      p.created_at
    FROM outsource_productions p
    WHERE p.company_id = p_company_id
      AND (p_start_date IS NULL OR p.date >= to_char(p_start_date, 'YYYY-MM-DD'))
      AND (p_end_date   IS NULL OR p.date <= to_char(p_end_date,   'YYYY-MM-DD'))
      AND (COALESCE(p_month,'') = '' OR p.date LIKE p_month || '%')
      AND (p_outsource_company_id IS NULL OR p.outsource_company_id = p_outsource_company_id)
      AND (p_client_name IS NULL OR p_client_name = '_all' OR p.client_name = p_client_name)
      AND (
        p_profit_filter = 'all'
        OR (p_profit_filter = 'profit' AND (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) > 0)
        OR (p_profit_filter = 'loss'   AND (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) < 0)
      )
    ORDER BY p.date DESC, p.id ASC
    OFFSET v_offset
    LIMIT v_limit
  ) x;

  RETURN jsonb_build_object('rows', v_rows, 'total_count', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outsource_report_list(uuid, date, date, text, uuid, text, text, int, int)
  TO anon, authenticated, service_role;
