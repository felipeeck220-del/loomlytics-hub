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
  v_machine uuid;
  v_add_pc int;
  v_add_kg numeric;
  v_mv_pc int;
  v_mv_kg numeric;
  v_reason text;
  v_profile_id uuid;
  v_cur_pc numeric;
  v_cur_kg numeric;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_is_set boolean;
  v_set_pc int;
  v_set_kg numeric;
  v_move_all boolean;
  v_d_pc numeric;
  v_d_kg numeric;
BEGIN
  v_company_id := (p_payload->>'company_id')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> v_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_article := (p_payload->>'article_id')::uuid;
  v_client  := NULLIF(p_payload->>'client_id','')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;
  IF v_article IS NULL OR v_machine IS NULL THEN
    RAISE EXCEPTION 'machine_required';
  END IF;

  IF v_client IS NULL THEN
    SELECT client_id INTO v_client FROM public.articles
    WHERE id = v_article AND company_id = v_company_id;
  END IF;

  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), 'Ajuste de palete na máquina');

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;

  v_is_set := (p_payload ? 'set_pieces') OR (p_payload ? 'set_weight_kg');

  -- saldo atual do palete em máquina (article + machine + cliente efetivo)
  SELECT COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
         COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
    INTO v_cur_pc, v_cur_kg
  FROM public.manual_stock_movements m
  LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
  WHERE m.company_id = v_company_id AND m.article_id = v_article
    AND m.machine_id = v_machine AND m.on_machine = true
    AND m.type IN ('adjust_in','adjust_out')
    AND COALESCE(m.client_id, a.client_id) IS NOT DISTINCT FROM v_client;

  IF v_is_set THEN
    -- NOVA SEMÂNTICA: a quantidade informada SUBSTITUI o palete atual (recontagem)
    v_set_pc   := GREATEST(0, COALESCE((p_payload->>'set_pieces')::int, 0));
    v_set_kg   := GREATEST(0, COALESCE((p_payload->>'set_weight_kg')::numeric, 0));
    v_move_all := COALESCE((p_payload->>'move_all')::boolean, false);

    v_d_pc := v_set_pc - v_cur_pc;
    v_d_kg := v_set_kg - v_cur_kg;

    IF v_d_pc > 0 OR v_d_kg > 0 THEN
      INSERT INTO public.manual_stock_movements
        (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
      VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in',
              GREATEST(0, v_d_pc)::int, GREATEST(0, v_d_kg),
              'Recontagem do palete na máquina: ' || v_reason, v_profile_id, true)
      RETURNING id INTO v_id;
      v_ids := v_ids || v_id;
    END IF;

    IF v_d_pc < 0 OR v_d_kg < 0 THEN
      INSERT INTO public.manual_stock_movements
        (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
      VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out',
              GREATEST(0, -v_d_pc)::int, GREATEST(0, -v_d_kg),
              'Recontagem do palete na máquina: ' || v_reason, v_profile_id, true)
      RETURNING id INTO v_id;
      v_ids := v_ids || v_id;
    END IF;

    IF v_move_all AND (v_set_pc > 0 OR v_set_kg > 0) THEN
      -- entrada na expedição primeiro (mesmo instante): evita prefixo negativo no saldo
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

    IF array_length(v_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'empty_quantities';
    END IF;

    RETURN jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'mode', 'set');
  END IF;

  -- LEGADO: soma/transferência incremental
  v_add_pc := GREATEST(0, COALESCE((p_payload->>'add_pieces')::int, 0));
  v_add_kg := GREATEST(0, COALESCE((p_payload->>'add_weight_kg')::numeric, 0));
  v_mv_pc  := GREATEST(0, COALESCE((p_payload->>'move_pieces')::int, 0));
  v_mv_kg  := GREATEST(0, COALESCE((p_payload->>'move_weight_kg')::numeric, 0));

  IF (v_add_pc + v_mv_pc) <= 0 AND (v_add_kg + v_mv_kg) <= 0 THEN
    RAISE EXCEPTION 'empty_quantities';
  END IF;

  IF v_add_pc > 0 OR v_add_kg > 0 THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_add_pc, v_add_kg,
            v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF v_mv_pc > 0 OR v_mv_kg > 0 THEN
    IF v_mv_pc > (v_cur_pc + v_add_pc) OR v_mv_kg > (v_cur_kg + v_add_kg) THEN
      RAISE EXCEPTION 'insufficient_machine_stock';
    END IF;

    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_mv_pc, v_mv_kg,
            'Recebido da máquina: ' || v_reason, v_profile_id, false)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;

    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', v_mv_pc, v_mv_kg,
            'Transferência p/ expedição: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'mode', 'legacy');
END;
$function$;