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
      CASE WHEN (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0))) < 0
        THEN (p.weight_kg * (p.client_value_per_kg - p.outsource_value_per_kg - COALESCE(p.freight_per_kg,0)))
        ELSE 0 END
    ),0)
  INTO v_revenue, v_cost, v_weight, v_rolls, v_historical_freight, v_loss
  FROM public.outsource_productions p
  WHERE p.company_id = p_company_id
    AND (p_start_date IS NULL OR p.date >= to_char(p_start_date, 'YYYY-MM-DD'))
    AND (p_end_date   IS NULL OR p.date <= to_char(p_end_date,   'YYYY-MM-DD'))
    AND (COALESCE(p_month,'') = '' OR p.date LIKE p_month || '%');

  SELECT COALESCE(SUM(f.total_freight),0)
  INTO v_new_freight
  FROM public.outsource_freights f
  WHERE f.company_id = p_company_id
    AND (p_start_date IS NULL OR f.date >= p_start_date)
    AND (p_end_date IS NULL OR f.date <= p_end_date)
    AND (COALESCE(p_month,'') = '' OR to_char(f.date,'YYYY-MM') = p_month);

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

GRANT EXECUTE ON FUNCTION public.get_outsource_kpis(uuid, date, date, text) TO anon, authenticated, service_role;