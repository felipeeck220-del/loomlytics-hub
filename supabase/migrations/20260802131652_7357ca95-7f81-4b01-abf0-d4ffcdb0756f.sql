CREATE OR REPLACE FUNCTION public.save_manual_stock_manual_entry(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_id uuid;
  v_type text;
  v_pieces int;
  v_weight numeric;
  v_reason text;
  v_profile_id uuid;
  v_profile_role text;
  v_on_machine boolean;
  v_article uuid;
  v_machine uuid;
  v_client uuid;
  v_article_client uuid;
  v_cur_pc numeric;
  v_cur_kg numeric;
  v_exp_pc numeric;
  v_exp_kg numeric;
BEGIN
  v_company_id := NULLIF(p_payload->>'company_id','')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_company_id IS NULL OR v_caller <> v_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id, role::text INTO v_profile_id, v_profile_role
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_profile_id IS NULL OR v_profile_role NOT IN ('admin','expedicao') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_type := COALESCE(NULLIF(BTRIM(p_payload->>'type'),''), '');
  IF v_type NOT IN ('adjust_in','adjust_out') THEN RAISE EXCEPTION 'invalid_type'; END IF;

  v_on_machine := COALESCE(NULLIF(p_payload->>'on_machine','')::boolean, false);
  v_article := NULLIF(p_payload->>'article_id','')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;
  v_client := NULLIF(p_payload->>'client_id','')::uuid;

  SELECT client_id INTO v_article_client
  FROM public.articles
  WHERE id = v_article AND company_id = v_company_id;
  IF v_article_client IS NULL THEN RAISE EXCEPTION 'invalid_article'; END IF;
  IF v_client IS NULL THEN v_client := v_article_client; END IF;
  IF v_client <> v_article_client OR NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = v_client AND company_id = v_company_id
  ) THEN RAISE EXCEPTION 'invalid_client'; END IF;
  IF v_machine IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.machines WHERE id = v_machine AND company_id = v_company_id
  ) THEN RAISE EXCEPTION 'invalid_machine'; END IF;

  v_pieces := COALESCE(NULLIF(p_payload->>'pieces','')::int, 0);
  v_weight := COALESCE(NULLIF(p_payload->>'weight_kg','')::numeric, 0);
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''),
    CASE WHEN v_on_machine THEN 'Lançamento manual (palete na máquina)' ELSE 'Lançamento manual' END);
  IF v_weight <= 0 AND v_pieces <= 0 THEN RAISE EXCEPTION 'empty_quantities'; END IF;
  IF v_pieces < 0 OR v_weight < 0 THEN RAISE EXCEPTION 'invalid_quantities'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':' || v_client::text || ':' || v_article::text || ':' || v_machine::text, 0));

  IF v_type = 'adjust_out' AND v_on_machine THEN
    SELECT COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
           COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
      INTO v_cur_pc, v_cur_kg
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
    WHERE m.company_id = v_company_id AND m.article_id = v_article
      AND m.machine_id = v_machine AND m.on_machine = true
      AND m.type IN ('adjust_in','adjust_out')
      AND COALESCE(m.client_id, a.client_id) = v_client;
    IF v_pieces > v_cur_pc OR v_weight > v_cur_kg THEN RAISE EXCEPTION 'insufficient_machine_stock'; END IF;
  END IF;

  IF v_type = 'adjust_out' AND NOT v_on_machine THEN
    -- Saldo físico da expedição com a mesma trava cronológica em zero usada em get_manual_stock_estoque
    WITH res_first AS (
      SELECT r.billing_order_id, MIN(r.created_at) AS first_at
      FROM public.manual_stock_movements r
      WHERE r.company_id = v_company_id AND r.article_id = v_article
        AND r.machine_id = v_machine AND r.type = 'reserve' AND r.billing_order_id IS NOT NULL
      GROUP BY 1
    ),
    ev AS (
      SELECT m.id,
        CASE WHEN m.type = 'out' AND m.billing_order_id IS NOT NULL
             THEN COALESCE(rf.first_at, m.created_at) ELSE m.created_at END AS eff_at,
        CASE
          WHEN m.type = 'adjust_in' THEN COALESCE(m.weight_kg,0)
          WHEN m.type = 'in' AND m.billing_order_id IS NOT NULL THEN COALESCE(m.weight_kg,0)
          WHEN m.type IN ('adjust_out','out') THEN -COALESCE(m.weight_kg,0)
          ELSE 0 END AS d_kg,
        CASE
          WHEN m.type = 'adjust_in' THEN COALESCE(m.pieces,0)
          WHEN m.type = 'in' AND m.billing_order_id IS NOT NULL THEN COALESCE(m.pieces,0)
          WHEN m.type IN ('adjust_out','out') THEN -COALESCE(m.pieces,0)
          ELSE 0 END AS d_pc
      FROM public.manual_stock_movements m
      LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
      LEFT JOIN res_first rf ON rf.billing_order_id = m.billing_order_id
      WHERE m.company_id = v_company_id AND m.article_id = v_article
        AND m.machine_id = v_machine
        AND COALESCE(m.client_id, a.client_id) = v_client
        AND (m.type IN ('adjust_in','adjust_out','out')
             OR (m.type = 'in' AND m.billing_order_id IS NOT NULL))
    ),
    tl AS (
      SELECT d_kg, d_pc,
        SUM(d_kg) OVER w AS p_kg,
        SUM(d_pc) OVER w AS p_pc
      FROM ev
      WINDOW w AS (ORDER BY eff_at, (CASE WHEN d_kg + d_pc >= 0 THEN 0 ELSE 1 END), id ROWS UNBOUNDED PRECEDING)
    )
    SELECT COALESCE(GREATEST(0, SUM(d_pc) - LEAST(0, MIN(p_pc))), 0),
           COALESCE(GREATEST(0, SUM(d_kg) - LEAST(0, MIN(p_kg))), 0)
      INTO v_exp_pc, v_exp_kg
    FROM tl;

    -- desconta o que está alocado ao palete "em máquina"
    SELECT COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
           COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
      INTO v_cur_pc, v_cur_kg
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
    WHERE m.company_id = v_company_id AND m.article_id = v_article
      AND m.machine_id = v_machine AND m.on_machine = true
      AND m.type IN ('adjust_in','adjust_out')
      AND COALESCE(m.client_id, a.client_id) = v_client;

    v_exp_pc := GREATEST(0, v_exp_pc - GREATEST(0, v_cur_pc));
    v_exp_kg := GREATEST(0, v_exp_kg - GREATEST(0, v_cur_kg));

    IF v_pieces > v_exp_pc OR v_weight > v_exp_kg THEN
      RAISE EXCEPTION 'insufficient_stock';
    END IF;
  END IF;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
  VALUES
    (v_company_id, v_article, v_client, v_machine, v_type, v_pieces, v_weight, v_reason, v_profile_id, v_on_machine)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_manual_stock_manual_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;