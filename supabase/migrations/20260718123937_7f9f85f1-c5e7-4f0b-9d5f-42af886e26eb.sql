
-- 2.1 Productions list
CREATE OR REPLACE FUNCTION public.get_outsource_productions_list(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_month text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,20));
  v_limit int := GREATEST(1, COALESCE(p_page_size,20));
  v_search text := NULLIF(TRIM(COALESCE(p_search,'')), '');
  v_rows jsonb;
  v_count int;
  v_totals jsonb;
BEGIN
  WITH base AS (
    SELECT
      p.*,
      COALESCE(oc.name, 'Avulso') AS outsource_company_name,
      a.name AS article_name,
      c.name AS client_name,
      (p.weight_kg * p.client_value_per_kg)::numeric AS total_revenue,
      (p.weight_kg * p.outsource_value_per_kg)::numeric AS total_cost,
      (p.weight_kg * COALESCE(p.freight_per_kg,0))::numeric AS historical_freight,
      ((p.client_value_per_kg - p.outsource_value_per_kg) - COALESCE(p.freight_per_kg,0))::numeric AS profit_per_kg_calc,
      ((p.weight_kg * p.client_value_per_kg) - (p.weight_kg * p.outsource_value_per_kg) - (p.weight_kg * COALESCE(p.freight_per_kg,0)))::numeric AS total_profit
    FROM public.outsource_productions p
    LEFT JOIN public.outsource_companies oc ON oc.id = p.outsource_company_id
    LEFT JOIN public.articles a ON a.id = p.article_id
    LEFT JOIN public.clients c ON c.id = a.client_id
    WHERE p.company_id = p_company_id
      AND (p_start_date IS NULL OR p.date >= p_start_date)
      AND (p_end_date IS NULL OR p.date <= p_end_date)
      AND (p_month IS NULL OR to_char(p.date,'YYYY-MM') = p_month)
      AND (v_search IS NULL OR (
        COALESCE(oc.name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(a.name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(c.name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(p.nf_rom,'') ILIKE '%'||v_search||'%'
      ))
  )
  SELECT
    COUNT(*)::int,
    jsonb_build_object(
      'revenue', COALESCE(SUM(total_revenue),0),
      'cost', COALESCE(SUM(total_cost),0),
      'weight', COALESCE(SUM(weight_kg),0),
      'rolls', COALESCE(SUM(rolls),0),
      'historical_freight', COALESCE(SUM(historical_freight),0)
    )
  INTO v_count, v_totals
  FROM base;

  SELECT COALESCE(jsonb_agg(row_to_json(b) ORDER BY b.date DESC, b.id ASC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT * FROM (
      SELECT
        p.*,
        COALESCE(oc.name, 'Avulso') AS outsource_company_name,
        a.name AS article_name,
        c.name AS client_name,
        (p.weight_kg * p.client_value_per_kg)::numeric AS total_revenue,
        (p.weight_kg * p.outsource_value_per_kg)::numeric AS total_cost,
        ((p.weight_kg * p.client_value_per_kg) - (p.weight_kg * p.outsource_value_per_kg) - (p.weight_kg * COALESCE(p.freight_per_kg,0)))::numeric AS total_profit,
        ((p.client_value_per_kg - p.outsource_value_per_kg) - COALESCE(p.freight_per_kg,0))::numeric AS profit_per_kg
      FROM public.outsource_productions p
      LEFT JOIN public.outsource_companies oc ON oc.id = p.outsource_company_id
      LEFT JOIN public.articles a ON a.id = p.article_id
      LEFT JOIN public.clients c ON c.id = a.client_id
      WHERE p.company_id = p_company_id
        AND (p_start_date IS NULL OR p.date >= p_start_date)
        AND (p_end_date IS NULL OR p.date <= p_end_date)
        AND (p_month IS NULL OR to_char(p.date,'YYYY-MM') = p_month)
        AND (v_search IS NULL OR (
          COALESCE(oc.name,'') ILIKE '%'||v_search||'%'
          OR COALESCE(a.name,'') ILIKE '%'||v_search||'%'
          OR COALESCE(c.name,'') ILIKE '%'||v_search||'%'
          OR COALESCE(p.nf_rom,'') ILIKE '%'||v_search||'%'
        ))
      ORDER BY p.date DESC, p.id ASC
      OFFSET v_offset LIMIT v_limit
    ) b
  ) b;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', v_count,
    'totals', v_totals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outsource_productions_list(uuid,date,date,text,text,int,int) TO anon, authenticated, service_role;

-- 2.2 Freights list
CREATE OR REPLACE FUNCTION public.get_outsource_freights_list(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_month text DEFAULT NULL,
  p_outsource_company_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,20));
  v_limit int := GREATEST(1, COALESCE(p_page_size,20));
  v_search text := NULLIF(TRIM(COALESCE(p_search,'')), '');
  v_rows jsonb;
  v_count int;
  v_totals jsonb;
BEGIN
  SELECT COUNT(*)::int,
    jsonb_build_object(
      'total_freight', COALESCE(SUM(f.total_freight),0),
      'total_weight', COALESCE(SUM(f.weight_kg),0)
    )
  INTO v_count, v_totals
  FROM public.outsource_freights f
  LEFT JOIN public.outsource_companies oc ON oc.id = f.outsource_company_id
  WHERE f.company_id = p_company_id
    AND (p_start_date IS NULL OR f.date >= p_start_date)
    AND (p_end_date IS NULL OR f.date <= p_end_date)
    AND (p_month IS NULL OR to_char(f.date,'YYYY-MM') = p_month)
    AND (p_outsource_company_id IS NULL OR f.outsource_company_id = p_outsource_company_id)
    AND (v_search IS NULL OR (
      COALESCE(oc.name,'') ILIKE '%'||v_search||'%'
      OR COALESCE(f.nf_rom,'') ILIKE '%'||v_search||'%'
    ));

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.date DESC, r.id ASC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT f.*, COALESCE(oc.name,'Avulso') AS outsource_company_name
    FROM public.outsource_freights f
    LEFT JOIN public.outsource_companies oc ON oc.id = f.outsource_company_id
    WHERE f.company_id = p_company_id
      AND (p_start_date IS NULL OR f.date >= p_start_date)
      AND (p_end_date IS NULL OR f.date <= p_end_date)
      AND (p_month IS NULL OR to_char(f.date,'YYYY-MM') = p_month)
      AND (p_outsource_company_id IS NULL OR f.outsource_company_id = p_outsource_company_id)
      AND (v_search IS NULL OR (
        COALESCE(oc.name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(f.nf_rom,'') ILIKE '%'||v_search||'%'
      ))
    ORDER BY f.date DESC, f.id ASC
    OFFSET v_offset LIMIT v_limit
  ) r;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_count', v_count,
    'totals', v_totals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outsource_freights_list(uuid,date,date,text,uuid,text,int,int) TO anon, authenticated, service_role;

-- 2.3 Header KPIs
CREATE OR REPLACE FUNCTION public.get_outsource_kpis(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_month text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_revenue numeric := 0;
  v_cost numeric := 0;
  v_weight numeric := 0;
  v_rolls numeric := 0;
  v_historical_freight numeric := 0;
  v_new_freight numeric := 0;
  v_loss numeric := 0;
BEGIN
  SELECT
    COALESCE(SUM(p.weight_kg * p.client_value_per_kg),0),
    COALESCE(SUM(p.weight_kg * p.outsource_value_per_kg),0),
    COALESCE(SUM(p.weight_kg),0),
    COALESCE(SUM(p.rolls),0),
    COALESCE(SUM(p.weight_kg * COALESCE(p.freight_per_kg,0)),0),
    COALESCE(SUM(
      CASE WHEN ((p.weight_kg * p.client_value_per_kg) - (p.weight_kg * p.outsource_value_per_kg) - (p.weight_kg * COALESCE(p.freight_per_kg,0))) < 0
        THEN ((p.weight_kg * p.client_value_per_kg) - (p.weight_kg * p.outsource_value_per_kg) - (p.weight_kg * COALESCE(p.freight_per_kg,0)))
        ELSE 0 END
    ),0)
  INTO v_revenue, v_cost, v_weight, v_rolls, v_historical_freight, v_loss
  FROM public.outsource_productions p
  WHERE p.company_id = p_company_id
    AND (p_start_date IS NULL OR p.date >= p_start_date)
    AND (p_end_date IS NULL OR p.date <= p_end_date)
    AND (p_month IS NULL OR to_char(p.date,'YYYY-MM') = p_month);

  SELECT COALESCE(SUM(f.total_freight),0)
  INTO v_new_freight
  FROM public.outsource_freights f
  WHERE f.company_id = p_company_id
    AND (p_start_date IS NULL OR f.date >= p_start_date)
    AND (p_end_date IS NULL OR f.date <= p_end_date)
    AND (p_month IS NULL OR to_char(f.date,'YYYY-MM') = p_month);

  RETURN jsonb_build_object(
    'totalRevenue', v_revenue,
    'totalCost', v_cost,
    'totalWeight', v_weight,
    'totalRolls', v_rolls,
    'totalFreight', v_historical_freight + v_new_freight,
    'totalProfit', v_revenue - v_cost - (v_historical_freight + v_new_freight),
    'totalLoss', v_loss
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outsource_kpis(uuid,date,date,text) TO anon, authenticated, service_role;
