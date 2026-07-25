-- Helper: resolve profiles.id do usuário atual na empresa alvo
CREATE OR REPLACE FUNCTION public._of_current_profile_id(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles
   WHERE user_id = auth.uid() AND company_id = p_company_id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._of_current_profile_id(uuid) FROM PUBLIC;

-- 1) start_billing_order_separation
CREATE OR REPLACE FUNCTION public.start_billing_order_separation(
  p_company_id uuid, p_id uuid,
  p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status <> 'open' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders
     SET status = 'separating', separated_by = v_pid, updated_at = now()
   WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, 'billing_order_start_separation',
    jsonb_build_object('of', v_row.of_number, 'id', p_id), p_author_name, p_author_code);
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.start_billing_order_separation(uuid,uuid,text,text) TO anon, authenticated, service_role;

-- 3) set_billing_order_priority
CREATE OR REPLACE FUNCTION public.set_billing_order_priority(
  p_company_id uuid, p_id uuid, p_priority boolean,
  p_reason text DEFAULT NULL, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;

  IF p_priority THEN
    UPDATE public.billing_orders
       SET priority = true, priority_reason = NULLIF(BTRIM(COALESCE(p_reason,'')),''),
           priority_at = now(), priority_by = v_pid, updated_at = now()
     WHERE id = p_id;
  ELSE
    UPDATE public.billing_orders
       SET priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL, updated_at = now()
     WHERE id = p_id;
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_set_priority',
    jsonb_build_object('of', v_row.of_number, 'priority', p_priority, 'reason', p_reason),
    p_author_name, p_author_code);
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_billing_order_priority(uuid,uuid,boolean,text,text,text) TO anon, authenticated, service_role;

-- 7) edit_billing_order (mantém aceitar of_number)
CREATE OR REPLACE FUNCTION public.edit_billing_order(
  p_company_id uuid, p_id uuid, p_payload jsonb, p_note text,
  p_expected_status text DEFAULT NULL,
  p_revert_to_open boolean DEFAULT false,
  p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_new_of text;
  v_existing uuid;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;

  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  IF p_payload ? 'of_number' THEN
    v_new_of := NULLIF(BTRIM(p_payload->>'of_number'), '');
    IF v_new_of IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_of_number');
    END IF;
    IF v_new_of <> v_row.of_number THEN
      SELECT id INTO v_existing FROM public.billing_orders
        WHERE company_id = p_company_id AND of_number = v_new_of AND id <> p_id LIMIT 1;
      IF v_existing IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number', 'existing_id', v_existing);
      END IF;
    END IF;
  END IF;

  UPDATE public.billing_orders SET
    of_number           = COALESCE(v_new_of, of_number),
    client_id           = COALESCE((p_payload->>'client_id')::uuid, client_id),
    article_id          = COALESCE((p_payload->>'article_id')::uuid, article_id),
    machine_id          = CASE WHEN p_payload ? 'machine_id'
                                 THEN NULLIF(p_payload->>'machine_id','')::uuid ELSE machine_id END,
    dyehouse            = COALESCE(NULLIF(p_payload->>'dyehouse',''), dyehouse),
    pieces_expected     = CASE WHEN p_payload ? 'pieces_expected'
                                 THEN NULLIF(p_payload->>'pieces_expected','')::int ELSE pieces_expected END,
    weight_expected     = CASE WHEN p_payload ? 'weight_expected'
                                 THEN NULLIF(p_payload->>'weight_expected','')::numeric ELSE weight_expected END,
    piece_weight_target = CASE WHEN p_payload ? 'piece_weight_target'
                                 THEN NULLIF(p_payload->>'piece_weight_target','')::numeric ELSE piece_weight_target END,
    order_type          = COALESCE(NULLIF(p_payload->>'order_type',''), order_type),
    admin_notes         = CASE WHEN p_payload ? 'admin_notes'
                                 THEN NULLIF(p_payload->>'admin_notes','') ELSE admin_notes END,
    priority            = COALESCE((p_payload->>'priority')::boolean, priority),
    priority_reason     = CASE WHEN p_payload ? 'priority_reason'
                                 THEN NULLIF(p_payload->>'priority_reason','') ELSE priority_reason END,
    edit_note           = p_note,
    last_edited_by      = v_pid,
    last_edited_at      = now(),
    updated_at          = now(),
    status              = CASE WHEN p_revert_to_open THEN 'open'::billing_order_status ELSE status END,
    pieces_real         = CASE WHEN p_revert_to_open THEN NULL ELSE pieces_real END,
    weight_real         = CASE WHEN p_revert_to_open THEN NULL ELSE weight_real END,
    weight_avg          = CASE WHEN p_revert_to_open THEN NULL ELSE weight_avg END,
    separated_by        = CASE WHEN p_revert_to_open THEN NULL ELSE separated_by END,
    collected_by        = CASE WHEN p_revert_to_open THEN NULL ELSE collected_by END,
    collected_at        = CASE WHEN p_revert_to_open THEN NULL ELSE collected_at END,
    delivery_doc_type   = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_type END,
    delivery_doc_number = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_number END,
    delivery_doc_set_by = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_set_by END,
    delivery_doc_set_at = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_set_at END
  WHERE id = p_id;

  IF p_revert_to_open THEN
    PERFORM public._of_release_pending_reserves(p_company_id, p_id, COALESCE(v_new_of, v_row.of_number),
      'editada — reserva liberada', v_pid);
    PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, COALESCE(v_new_of, v_row.of_number),
      '(edição volta para Aberto — devolve estoque próprio)', v_pid, true);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_edit',
    jsonb_build_object('of', COALESCE(v_new_of, v_row.of_number), 'prev_of', v_row.of_number,
                       'note', p_note, 'reverted', p_revert_to_open, 'changes', p_payload),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
END; $$;
GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid,uuid,jsonb,text,text,boolean,text,text) TO anon, authenticated, service_role;

-- 9) launch_billing_order_ready
CREATE OR REPLACE FUNCTION public.launch_billing_order_ready(
  p_company_id uuid, p_id uuid,
  p_pieces_real int DEFAULT NULL, p_weight_real numeric DEFAULT NULL,
  p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_sum_p int; v_sum_w numeric; v_pallet_count int;
  v_pieces int; v_weight numeric;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'ready' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_row.status <> 'separating' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(pieces),0), COALESCE(SUM(weight_kg),0)
    INTO v_pallet_count, v_sum_p, v_sum_w
    FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  IF v_pallet_count > 0 THEN
    v_pieces := v_sum_p; v_weight := v_sum_w;
  ELSE
    v_pieces := GREATEST(0, COALESCE(p_pieces_real, v_row.pieces_expected, 0));
    v_weight := GREATEST(0, COALESCE(p_weight_real, v_row.weight_expected, 0));
  END IF;

  UPDATE public.billing_orders
     SET status = 'ready', pieces_real = v_pieces, weight_real = v_weight,
         weight_avg = CASE WHEN v_pieces > 0 THEN v_weight / v_pieces ELSE 0 END,
         priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL,
         updated_at = now()
   WHERE id = p_id AND status = 'separating';

  IF v_pallet_count = 0 AND (v_pieces > 0 OR v_weight > 0) THEN
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'reserve',
            v_pieces, v_weight, 'OF #' || v_row.of_number || ' pronta (reserva)', v_pid);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_launch_ready',
    jsonb_build_object('of', v_row.of_number, 'pieces', v_pieces, 'weight', v_weight,
                       'from_pallets', v_pallet_count > 0),
    p_author_name, p_author_code);
  RETURN jsonb_build_object('ok', true, 'pieces_real', v_pieces, 'weight_real', v_weight);
END; $$;
GRANT EXECUTE ON FUNCTION public.launch_billing_order_ready(uuid,uuid,int,numeric,text,text) TO anon, authenticated, service_role;

-- 10) collect_billing_order
CREATE OR REPLACE FUNCTION public.collect_billing_order(
  p_company_id uuid, p_id uuid,
  p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_had_out boolean := false;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'collected' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_row.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders
     SET status = 'collected', collected_by = v_pid, collected_at = now(),
         priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL,
         updated_at = now()
   WHERE id = p_id AND status = 'ready';

  WITH mvs AS (
    SELECT article_id, client_id, machine_id, type, pieces, weight_kg
    FROM public.stock_movements
    WHERE billing_order_id = p_id AND type IN ('reserve','release')
  ),
  netted AS (
    SELECT article_id, client_id, machine_id,
      SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END)::numeric AS p_net,
      SUM(CASE WHEN type='reserve' THEN weight_kg ELSE -weight_kg END)::numeric AS w_net
    FROM mvs GROUP BY article_id, client_id, machine_id
  ),
  ins_rel AS (
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'release',
           GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net),
           'OF #' || v_row.of_number || ' coletada (libera reserva)', v_pid
    FROM netted WHERE p_net > 0 OR w_net > 0
    RETURNING 1
  ),
  ins_out AS (
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'out',
           GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net),
           'OF #' || v_row.of_number || ' coletada', v_pid
    FROM netted WHERE p_net > 0 OR w_net > 0
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM ins_out) > 0 INTO v_had_out;

  IF NOT v_had_out THEN
    IF EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id AND own_article_id IS NULL) THEN
      INSERT INTO public.stock_movements
        (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
      SELECT p_company_id, v_row.article_id, v_row.client_id, machine_id, p_id, 'out',
             GREATEST(0, ROUND(SUM(pieces)))::int, GREATEST(0, SUM(weight_kg)),
             'OF #' || v_row.of_number || ' coletada', v_pid
        FROM public.billing_order_pallets
       WHERE billing_order_id = p_id AND own_article_id IS NULL
       GROUP BY machine_id;
    ELSIF (COALESCE(v_row.pieces_real, v_row.pieces_expected, 0) > 0
        OR COALESCE(v_row.weight_real, v_row.weight_expected, 0) > 0) THEN
      IF NOT EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id)
         OR EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id AND own_article_id IS NULL) THEN
        INSERT INTO public.stock_movements
          (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
        VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'out',
                GREATEST(0, ROUND(COALESCE(v_row.pieces_real, v_row.pieces_expected, 0)))::int,
                GREATEST(0, COALESCE(v_row.weight_real, v_row.weight_expected, 0)),
                'OF #' || v_row.of_number || ' coletada', v_pid);
      END IF;
    END IF;
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_collect',
    jsonb_build_object('of', v_row.of_number), p_author_name, p_author_code);
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.collect_billing_order(uuid,uuid,text,text) TO anon, authenticated, service_role;

-- 11) cancel_billing_order
CREATE OR REPLACE FUNCTION public.cancel_billing_order(
  p_company_id uuid, p_id uuid, p_reason text,
  p_expected_status text DEFAULT NULL,
  p_reversal_quality text DEFAULT 'first',
  p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_is_second boolean := (COALESCE(p_reversal_quality,'first') = 'second');
  v_reason_str text;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'cancelled' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancelled_by = v_pid, cancelled_at = now(),
    cancellation_reason = p_reason,
    reverted_from = v_row.status::text,
    reversed_by   = CASE WHEN v_row.status = 'collected' THEN v_pid ELSE reversed_by END,
    reversed_at   = CASE WHEN v_row.status = 'collected' THEN now()  ELSE reversed_at END,
    reversal_reason  = CASE WHEN v_row.status = 'collected' THEN p_reason ELSE reversal_reason END,
    reversal_quality = CASE WHEN v_row.status = 'collected' THEN COALESCE(p_reversal_quality,'first') ELSE reversal_quality END,
    priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL,
    updated_at = now()
  WHERE id = p_id;

  IF v_row.status IN ('separating','ready') THEN
    PERFORM public._of_release_pending_reserves(p_company_id, p_id, v_row.of_number,
      'cancelada (libera reserva pendente)', v_pid);
    PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, v_row.of_number,
      '(OF cancelada — devolve estoque próprio)', v_pid, true);
  ELSIF v_row.status = 'collected' THEN
    v_reason_str := 'OF #' || v_row.of_number || ' estornada — '
                     || CASE WHEN v_is_second THEN '2ª QUALIDADE' ELSE '1ª qualidade' END
                     || ' — ' || COALESCE(p_reason,'sem motivo');

    INSERT INTO public.own_stock_movements
      (company_id, own_article_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, own_article_id, 'in', pieces, weight_kg,
           'OF #' || v_row.of_number || ' estornada — devolve estoque próprio (Palete ' || pallet_number || ')',
           v_pid
    FROM public.billing_order_pallets
    WHERE billing_order_id = p_id AND own_article_id IS NOT NULL;

    IF EXISTS (SELECT 1 FROM public.billing_order_pallets
                WHERE billing_order_id = p_id AND own_article_id IS NULL) THEN
      INSERT INTO public.stock_movements
        (company_id, article_id, client_id, machine_id, billing_order_id, type,
         pieces, weight_kg, is_second_quality, reason, created_by)
      SELECT p_company_id,
             COALESCE(alt_article_id, v_row.article_id),
             COALESCE(alt_client_id, v_row.client_id),
             machine_id, p_id, 'in',
             GREATEST(0, ROUND(SUM(pieces)))::int,
             GREATEST(0, SUM(weight_kg)),
             v_is_second, v_reason_str, v_pid
        FROM public.billing_order_pallets
       WHERE billing_order_id = p_id AND own_article_id IS NULL
       GROUP BY COALESCE(alt_article_id, v_row.article_id),
                COALESCE(alt_client_id, v_row.client_id),
                machine_id;
    ELSIF NOT EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id)
        AND (COALESCE(v_row.pieces_real,0) > 0 OR COALESCE(v_row.weight_real,0) > 0) THEN
      INSERT INTO public.stock_movements
        (company_id, article_id, client_id, machine_id, billing_order_id, type,
         pieces, weight_kg, is_second_quality, reason, created_by)
      VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'in',
              GREATEST(0, ROUND(v_row.pieces_real))::int, GREATEST(0, v_row.weight_real),
              v_is_second, v_reason_str, v_pid);
    END IF;
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_cancel',
    jsonb_build_object('of', v_row.of_number, 'from_status', v_row.status,
                       'reversal_quality', p_reversal_quality, 'reason', p_reason),
    p_author_name, p_author_code);
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid,uuid,text,text,text,text,text) TO anon, authenticated, service_role;

-- 12) revert_billing_order_to_open (mantém estorno de 'out' quando vem de collected)
CREATE OR REPLACE FUNCTION public.revert_billing_order_to_open(
  p_company_id uuid, p_id uuid,
  p_reason text DEFAULT NULL,
  p_expected_status text DEFAULT NULL,
  p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_reason_str text;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'open' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  IF v_row.status = 'collected' THEN
    v_reason_str := 'OF #' || v_row.of_number || ' revertida para Aberto — devolve estoque';

    INSERT INTO public.own_stock_movements
      (company_id, own_article_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, own_article_id, 'in', pieces, weight_kg,
           'OF #' || v_row.of_number || ' revertida — devolve estoque próprio (Palete ' || pallet_number || ')',
           v_pid
    FROM public.billing_order_pallets
    WHERE billing_order_id = p_id AND own_article_id IS NOT NULL;

    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type,
       pieces, weight_kg, is_second_quality, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'in',
           GREATEST(0, ROUND(SUM(CASE WHEN type='out' THEN pieces ELSE -pieces END)))::int,
           GREATEST(0, SUM(CASE WHEN type='out' THEN weight_kg ELSE -weight_kg END)),
           COALESCE(is_second_quality, false), v_reason_str, v_pid
      FROM public.stock_movements
     WHERE billing_order_id = p_id AND type IN ('out','in')
     GROUP BY article_id, client_id, machine_id, COALESCE(is_second_quality, false)
    HAVING SUM(CASE WHEN type='out' THEN weight_kg ELSE -weight_kg END) > 0
        OR SUM(CASE WHEN type='out' THEN pieces ELSE -pieces END) > 0;
  END IF;

  UPDATE public.billing_orders SET
    status = 'open',
    pieces_real = NULL, weight_real = NULL, weight_avg = NULL,
    separated_by = NULL, collected_by = NULL, collected_at = NULL,
    delivery_doc_type = NULL, delivery_doc_number = NULL,
    delivery_doc_set_by = NULL, delivery_doc_set_at = NULL,
    reverted_from = v_row.status::text,
    reversed_by   = v_pid,
    reversed_at   = now(),
    reversal_reason = COALESCE(p_reason, reversal_reason),
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_release_pending_reserves(p_company_id, p_id, v_row.of_number,
    'revertida para Aberto (libera reserva)', v_pid);
  PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, v_row.of_number,
    '(OF revertida para Aberto — devolve estoque próprio)', v_pid, true);

  PERFORM public._of_audit(p_company_id, 'billing_order_revert',
    jsonb_build_object('of', v_row.of_number, 'from_status', v_row.status, 'reason', p_reason),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.revert_billing_order_to_open(uuid,uuid,text,text,text,text) TO anon, authenticated, service_role;