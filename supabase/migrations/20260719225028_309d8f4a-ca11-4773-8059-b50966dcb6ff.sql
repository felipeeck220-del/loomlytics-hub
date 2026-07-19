
CREATE OR REPLACE FUNCTION public.get_stock_malha_article_export(
  p_company_id uuid,
  p_client_id  uuid,
  p_article_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_cutoff date;
  v_result jsonb;
  v_company jsonb;
  v_client jsonb;
  v_article jsonb;
  v_rows jsonb;
  v_total_rolls numeric := 0;
  v_total_kg numeric := 0;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('company', null, 'client', null, 'article', null, 'rows', '[]'::jsonb,
      'totals', jsonb_build_object('availableRolls', 0, 'availableKg', 0));
  END IF;

  SELECT stock_cutoff_date INTO v_cutoff FROM public.company_settings WHERE company_id = p_company_id;

  SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url) INTO v_company
    FROM public.companies c WHERE c.id = p_company_id;

  SELECT jsonb_build_object('id', cl.id, 'name', cl.name) INTO v_client
    FROM public.clients cl WHERE cl.id = p_client_id AND cl.company_id = p_company_id;

  SELECT jsonb_build_object('id', a.id, 'name', a.name) INTO v_article
    FROM public.articles a WHERE a.id = p_article_id AND a.company_id = p_company_id;

  WITH prod AS (
    SELECT p.machine_id,
           COALESCE(SUM(p.weight_kg), 0)      AS produced_kg,
           COALESCE(SUM(p.rolls_produced), 0) AS produced_rolls
      FROM public.productions p
     WHERE p.company_id = p_company_id
       AND p.article_id = p_article_id
       AND p.machine_id IS NOT NULL
       AND (v_cutoff IS NULL OR p.date >= to_char(v_cutoff, 'YYYY-MM-DD'))
     GROUP BY p.machine_id
  ),
  mv AS (
    SELECT sm.machine_id,
           SUM(CASE
                 WHEN sm.type = 'out' THEN sm.weight_kg
                 WHEN sm.type = 'in' AND sm.billing_order_id IS NOT NULL THEN -sm.weight_kg
                 ELSE 0
               END) AS delivered_kg_total,
           SUM(CASE
                 WHEN sm.type = 'out' THEN sm.pieces
                 WHEN sm.type = 'in' AND sm.billing_order_id IS NOT NULL THEN -sm.pieces
                 ELSE 0
               END) AS delivered_rolls_total,
           SUM(CASE WHEN sm.type = 'reserve' THEN sm.weight_kg
                    WHEN sm.type = 'release' THEN -sm.weight_kg ELSE 0 END) AS reserved_kg,
           SUM(CASE WHEN sm.type = 'reserve' THEN sm.pieces
                    WHEN sm.type = 'release' THEN -sm.pieces ELSE 0 END) AS reserved_rolls
      FROM public.stock_movements sm
     WHERE sm.company_id = p_company_id
       AND sm.article_id = p_article_id
       AND sm.client_id  = p_client_id
       AND sm.machine_id IS NOT NULL
       AND sm.is_second_quality = false
       AND (v_cutoff IS NULL OR (sm.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_cutoff)
     GROUP BY sm.machine_id
  ),
  merged AS (
    SELECT COALESCE(p.machine_id, m.machine_id) AS machine_id,
           COALESCE(p.produced_kg, 0)           AS produced_kg,
           COALESCE(p.produced_rolls, 0)        AS produced_rolls,
           COALESCE(m.delivered_kg_total, 0)    AS delivered_kg_total,
           COALESCE(m.delivered_rolls_total, 0) AS delivered_rolls_total,
           COALESCE(m.reserved_kg, 0)           AS reserved_kg,
           COALESCE(m.reserved_rolls, 0)        AS reserved_rolls
      FROM prod p FULL OUTER JOIN mv m ON m.machine_id = p.machine_id
  ),
  final AS (
    SELECT mac.id AS machine_id,
           mac.number AS machine_number,
           mac.name AS machine_name,
           (merged.produced_rolls - merged.delivered_rolls_total - merged.reserved_rolls)::numeric AS available_rolls,
           (merged.produced_kg - merged.delivered_kg_total - merged.reserved_kg)::numeric        AS available_kg
      FROM merged
      JOIN public.machines mac ON mac.id = merged.machine_id AND mac.company_id = p_company_id
     WHERE (merged.produced_rolls - merged.delivered_rolls_total - merged.reserved_rolls) >= 1
     ORDER BY mac.number NULLS LAST, mac.name
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'machine_id', machine_id,
           'machine_number', machine_number,
           'machine_name', machine_name,
           'available_rolls', available_rolls,
           'available_kg', available_kg
         )), '[]'::jsonb),
         COALESCE(SUM(available_rolls), 0),
         COALESCE(SUM(available_kg), 0)
    INTO v_rows, v_total_rolls, v_total_kg
    FROM final;

  v_result := jsonb_build_object(
    'company', v_company,
    'client', v_client,
    'article', v_article,
    'rows', v_rows,
    'totals', jsonb_build_object('availableRolls', v_total_rolls, 'availableKg', v_total_kg)
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_malha_article_export(uuid, uuid, uuid) TO anon, authenticated, service_role;
