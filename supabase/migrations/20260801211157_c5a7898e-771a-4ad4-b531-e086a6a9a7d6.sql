REVOKE INSERT, UPDATE, DELETE ON TABLE public.manual_stock_movements FROM authenticated;
GRANT SELECT ON TABLE public.manual_stock_movements TO authenticated;
GRANT ALL ON TABLE public.manual_stock_movements TO service_role;

DROP POLICY IF EXISTS msm_insert ON public.manual_stock_movements;
DROP POLICY IF EXISTS msm_update ON public.manual_stock_movements;
DROP POLICY IF EXISTS msm_delete ON public.manual_stock_movements;

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

  v_type := COALESCE(p_payload->>'type','adjust_in');
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

  IF v_on_machine AND v_type = 'adjust_out' THEN
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

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
  VALUES
    (v_company_id, v_article, v_client, v_machine, v_type, v_pieces, v_weight, v_reason, v_profile_id, v_on_machine)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_manual_stock_machine_adjust(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_article uuid;
  v_client uuid;
  v_article_client uuid;
  v_machine uuid;
  v_reason text;
  v_profile_id uuid;
  v_profile_role text;
  v_cur_pc numeric;
  v_cur_kg numeric;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_set_pc int;
  v_set_kg numeric;
  v_move_all boolean;
  v_d_pc numeric;
  v_d_kg numeric;
BEGIN
  v_company_id := NULLIF(p_payload->>'company_id','')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_company_id IS NULL OR v_caller <> v_company_id THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT id, role::text INTO v_profile_id, v_profile_role
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_profile_id IS NULL OR v_profile_role NOT IN ('admin','expedicao') THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_article := NULLIF(p_payload->>'article_id','')::uuid;
  v_client := NULLIF(p_payload->>'client_id','')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;

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

  IF NOT (p_payload ? 'set_pieces') AND NOT (p_payload ? 'set_weight_kg') THEN
    RAISE EXCEPTION 'legacy_payload_not_supported';
  END IF;
  v_set_pc := COALESCE(NULLIF(p_payload->>'set_pieces','')::int, 0);
  v_set_kg := COALESCE(NULLIF(p_payload->>'set_weight_kg','')::numeric, 0);
  v_move_all := COALESCE(NULLIF(p_payload->>'move_all','')::boolean, false);
  IF v_set_pc < 0 OR v_set_kg < 0 THEN RAISE EXCEPTION 'invalid_quantities'; END IF;
  IF v_move_all AND v_set_pc <= 0 AND v_set_kg <= 0 THEN RAISE EXCEPTION 'empty_quantities'; END IF;
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), 'Ajuste de palete na máquina');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':' || v_client::text || ':' || v_article::text || ':' || v_machine::text, 0));

  SELECT COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
         COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
    INTO v_cur_pc, v_cur_kg
  FROM public.manual_stock_movements m
  LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
  WHERE m.company_id = v_company_id AND m.article_id = v_article
    AND m.machine_id = v_machine AND m.on_machine = true
    AND m.type IN ('adjust_in','adjust_out')
    AND COALESCE(m.client_id, a.client_id) = v_client;

  v_d_pc := v_set_pc - v_cur_pc;
  v_d_kg := v_set_kg - v_cur_kg;

  IF v_d_pc > 0 OR v_d_kg > 0 THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', GREATEST(0,v_d_pc)::int,
      GREATEST(0,v_d_kg), 'Recontagem do palete na máquina: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF v_d_pc < 0 OR v_d_kg < 0 THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', GREATEST(0,-v_d_pc)::int,
      GREATEST(0,-v_d_kg), 'Recontagem do palete na máquina: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF v_move_all THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_set_pc, v_set_kg,
      'Recebido da máquina: ' || v_reason, v_profile_id, false)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;

    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', v_set_pc, v_set_kg,
      'Transferência p/ expedição: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF array_length(v_ids,1) IS NULL THEN RAISE EXCEPTION 'empty_quantities'; END IF;
  RETURN jsonb_build_object('ok',true,'ids',to_jsonb(v_ids),'mode','set');
END;
$function$;

REVOKE ALL ON FUNCTION public.save_manual_stock_manual_entry(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) TO authenticated, service_role;