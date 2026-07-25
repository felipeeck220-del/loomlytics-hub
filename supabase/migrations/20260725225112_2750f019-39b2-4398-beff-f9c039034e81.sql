
-- =====================================================================
-- Fase 3 — RPCs de escrita para Ordens de Faturamento (OF)
-- docs/rpcBillingOrders.md
-- =====================================================================

-- Helper interno: libera reservas "reais" desta OF via netByKey, sem
-- release-fantasma. Emite linhas em stock_movements. Retorna quantas linhas.
CREATE OR REPLACE FUNCTION public._of_release_pending_reserves(
  p_company_id uuid,
  p_order_id uuid,
  p_of_number text,
  p_reason_suffix text,
  p_actor uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH mvs AS (
    SELECT article_id, client_id, machine_id, type, pieces, weight_kg
    FROM public.stock_movements
    WHERE billing_order_id = p_order_id AND type IN ('reserve','release')
  ),
  netted AS (
    SELECT
      article_id,
      client_id,
      machine_id,
      SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END)::numeric AS p_net,
      SUM(CASE WHEN type='reserve' THEN weight_kg ELSE -weight_kg END)::numeric AS w_net
    FROM mvs
    GROUP BY article_id, client_id, machine_id
  ),
  ins AS (
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_order_id, 'release',
           GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net),
           'OF #' || p_of_number || ' ' || p_reason_suffix,
           p_actor
    FROM netted
    WHERE p_net > 0 OR w_net > 0
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;
  RETURN COALESCE(v_count,0);
END;
$$;

REVOKE ALL ON FUNCTION public._of_release_pending_reserves(uuid,uuid,text,text,uuid) FROM PUBLIC;

-- Helper interno: restaura estoque próprio para todos os paletes 'own' desta OF
-- e apaga os paletes. Retorna quantos paletes foram tratados.
CREATE OR REPLACE FUNCTION public._of_restore_own_stock_and_wipe_pallets(
  p_company_id uuid,
  p_order_id uuid,
  p_of_number text,
  p_tag text,
  p_actor uuid,
  p_delete_pallets boolean DEFAULT true
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  WITH own_p AS (
    SELECT id, pallet_number, pieces, weight_kg, own_article_id
    FROM public.billing_order_pallets
    WHERE billing_order_id = p_order_id
      AND own_article_id IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.own_stock_movements
      (company_id, own_article_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, own_article_id, 'in', pieces, weight_kg,
           'OF #' || p_of_number || ' · Palete ' || pallet_number || ' ' || p_tag,
           p_actor
    FROM own_p
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;

  IF p_delete_pallets THEN
    DELETE FROM public.billing_order_pallets WHERE billing_order_id = p_order_id;
  END IF;

  RETURN COALESCE(v_count,0);
END;
$$;

REVOKE ALL ON FUNCTION public._of_restore_own_stock_and_wipe_pallets(uuid,uuid,text,text,uuid,boolean) FROM PUBLIC;

-- Helper interno: audit log
CREATE OR REPLACE FUNCTION public._of_audit(
  p_company_id uuid,
  p_action text,
  p_details jsonb,
  p_author_name text,
  p_author_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, user_name, user_role, user_code, action, details)
  VALUES (p_company_id, auth.uid(), p_author_name, NULL, p_author_code, p_action, COALESCE(p_details, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public._of_audit(uuid,text,jsonb,text,text) FROM PUBLIC;

-- =====================================================================
-- 1) start_billing_order_separation
-- =====================================================================
CREATE OR REPLACE FUNCTION public.start_billing_order_separation(
  p_company_id uuid,
  p_id uuid,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'open' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders
     SET status = 'separating', separated_by = auth.uid(), updated_at = now()
   WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, 'billing_order_start_separation',
    jsonb_build_object('of', v_row.of_number, 'id', p_id), p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_billing_order_separation(uuid,uuid,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 2) set_billing_order_delivery_doc
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_billing_order_delivery_doc(
  p_company_id uuid,
  p_id uuid,
  p_doc_type text,
  p_doc_number text,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_trim text := NULLIF(BTRIM(COALESCE(p_doc_number,'')), '');
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF v_trim IS NULL THEN
    RAISE EXCEPTION 'Informe o número do documento';
  END IF;
  IF p_doc_type NOT IN ('nf','romaneio') THEN
    RAISE EXCEPTION 'Tipo de documento inválido';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_ready', 'current_status', v_row.status);
  END IF;
  IF v_row.delivery_doc_number IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'conflict', jsonb_build_object(
      'current_number', v_row.delivery_doc_number, 'current_type', v_row.delivery_doc_type));
  END IF;

  UPDATE public.billing_orders
     SET delivery_doc_type = p_doc_type::delivery_doc_type,
         delivery_doc_number = v_trim,
         delivery_doc_set_by = auth.uid(),
         delivery_doc_set_at = now(),
         updated_at = now()
   WHERE id = p_id AND status='ready' AND delivery_doc_number IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_set_doc',
    jsonb_build_object('of', v_row.of_number, 'doc_type', p_doc_type, 'doc_number', v_trim),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_billing_order_delivery_doc(uuid,uuid,text,text,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 3) set_billing_order_priority
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_billing_order_priority(
  p_company_id uuid,
  p_id uuid,
  p_priority boolean,
  p_reason text DEFAULT NULL,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF p_priority THEN
    UPDATE public.billing_orders
       SET priority = true, priority_reason = NULLIF(BTRIM(COALESCE(p_reason,'')),''),
           priority_at = now(), priority_by = auth.uid(), updated_at = now()
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_billing_order_priority(uuid,uuid,boolean,text,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 4) link_billing_orders
-- =====================================================================
CREATE OR REPLACE FUNCTION public.link_billing_orders(
  p_company_id uuid,
  p_ids uuid[],
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_group uuid;
  v_all uuid[];
  v_count int;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Selecione pelo menos 2 OFs para atrelar.';
  END IF;

  -- Escolhe menor UUID existente entre os grupos atuais dos alvos (regra plano §8)
  SELECT MIN(link_group_id) INTO v_group
  FROM public.billing_orders
  WHERE company_id = p_company_id AND id = ANY(p_ids) AND link_group_id IS NOT NULL;

  IF v_group IS NULL THEN
    v_group := gen_random_uuid();
  END IF;

  -- Junta ids selecionados + membros de grupos preexistentes que serão mesclados
  SELECT ARRAY(
    SELECT DISTINCT id FROM (
      SELECT unnest(p_ids) AS id
      UNION
      SELECT id FROM public.billing_orders
       WHERE company_id = p_company_id
         AND link_group_id IN (
           SELECT DISTINCT link_group_id FROM public.billing_orders
            WHERE company_id = p_company_id AND id = ANY(p_ids) AND link_group_id IS NOT NULL
         )
    ) x
  ) INTO v_all;

  UPDATE public.billing_orders
     SET link_group_id = v_group, updated_at = now()
   WHERE company_id = p_company_id AND id = ANY(v_all);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public._of_audit(p_company_id, 'billing_order_link',
    jsonb_build_object('group_id', v_group, 'count', v_count, 'ids', to_jsonb(v_all)),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true, 'group_id', v_group, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_billing_orders(uuid,uuid[],text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 5) unlink_billing_order_group
-- =====================================================================
CREATE OR REPLACE FUNCTION public.unlink_billing_order_group(
  p_company_id uuid,
  p_group_id uuid,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_count int;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'Grupo inválido';
  END IF;

  UPDATE public.billing_orders
     SET link_group_id = NULL, updated_at = now()
   WHERE company_id = p_company_id AND link_group_id = p_group_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public._of_audit(p_company_id, 'billing_order_unlink_group',
    jsonb_build_object('group_id', p_group_id, 'count', v_count),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_billing_order_group(uuid,uuid,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 6) remove_from_billing_order_group
-- =====================================================================
CREATE OR REPLACE FUNCTION public.remove_from_billing_order_group(
  p_company_id uuid,
  p_id uuid,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_group uuid;
  v_remaining int;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT link_group_id INTO v_group FROM public.billing_orders
   WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.billing_orders SET link_group_id = NULL, updated_at = now() WHERE id = p_id;

  IF v_group IS NOT NULL THEN
    SELECT COUNT(*) INTO v_remaining FROM public.billing_orders
      WHERE company_id = p_company_id AND link_group_id = v_group;
    IF v_remaining = 1 THEN
      UPDATE public.billing_orders SET link_group_id = NULL, updated_at = now()
       WHERE company_id = p_company_id AND link_group_id = v_group;
    END IF;
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_remove_from_group',
    jsonb_build_object('id', p_id, 'group_id', v_group), p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_from_billing_order_group(uuid,uuid,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 7) edit_billing_order  (inclui revert_to_open)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.edit_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_payload jsonb,
  p_note text,
  p_expected_status text DEFAULT NULL,
  p_revert_to_open boolean DEFAULT false,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders SET
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
    last_edited_by      = auth.uid(),
    last_edited_at      = now(),
    updated_at          = now(),
    -- Revert to open (campos zerados intencionalmente)
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
    PERFORM public._of_release_pending_reserves(p_company_id, p_id, v_row.of_number,
      'editada — reserva liberada', auth.uid());
    PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, v_row.of_number,
      '(edição volta para Aberto — devolve estoque próprio)', auth.uid(), true);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_edit',
    jsonb_build_object('of', v_row.of_number, 'note', p_note, 'reverted', p_revert_to_open,
                       'changes', p_payload),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid,uuid,jsonb,text,text,boolean,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 8) create_billing_order  (transacional, gera of_number quando ausente)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_billing_order(
  p_company_id uuid,
  p_payload jsonb,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_of text := NULLIF(BTRIM(COALESCE(p_payload->>'of_number','')), '');
  v_existing uuid;
  v_next int;
  v_new_id uuid;
  v_order_type text := COALESCE(NULLIF(p_payload->>'order_type',''), 'pieces');
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_payload->>'client_id' IS NULL OR p_payload->>'article_id' IS NULL OR p_payload->>'dyehouse' IS NULL THEN
    RAISE EXCEPTION 'Campos obrigatórios ausentes';
  END IF;

  -- Trava por empresa para gerar of_number sem corrida
  PERFORM pg_advisory_xact_lock(hashtextextended('billing_order_of_number:' || p_company_id::text, 0));

  IF v_of IS NULL THEN
    SELECT COALESCE(MAX(CASE WHEN of_number ~ '^\d+$' THEN of_number::int END), 0) + 1
      INTO v_next
      FROM public.billing_orders
     WHERE company_id = p_company_id;
    v_of := lpad(v_next::text, 3, '0');
  ELSE
    SELECT id INTO v_existing FROM public.billing_orders
      WHERE company_id = p_company_id AND of_number = v_of LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number', 'existing_id', v_existing);
    END IF;
  END IF;

  INSERT INTO public.billing_orders (
    company_id, of_number, client_id, article_id, machine_id,
    pieces_expected, weight_expected, piece_weight_target, dyehouse,
    order_type, admin_notes, status, created_by
  ) VALUES (
    p_company_id, v_of,
    (p_payload->>'client_id')::uuid,
    (p_payload->>'article_id')::uuid,
    NULLIF(p_payload->>'machine_id','')::uuid,
    NULLIF(p_payload->>'pieces_expected','')::int,
    NULLIF(p_payload->>'weight_expected','')::numeric,
    NULLIF(p_payload->>'piece_weight_target','')::numeric,
    p_payload->>'dyehouse',
    v_order_type,
    NULLIF(p_payload->>'admin_notes',''),
    'open',
    auth.uid()
  ) RETURNING id INTO v_new_id;

  PERFORM public._of_audit(p_company_id, 'billing_order_create',
    jsonb_build_object('of', v_of, 'id', v_new_id), p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true, 'id', v_new_id, 'of_number', v_of);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid,jsonb,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 9) launch_billing_order_ready
-- =====================================================================
CREATE OR REPLACE FUNCTION public.launch_billing_order_ready(
  p_company_id uuid,
  p_id uuid,
  p_pieces_real int DEFAULT NULL,
  p_weight_real numeric DEFAULT NULL,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_sum_p int;
  v_sum_w numeric;
  v_pallet_count int;
  v_pieces int;
  v_weight numeric;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'ready' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.status <> 'separating' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(pieces),0), COALESCE(SUM(weight_kg),0)
    INTO v_pallet_count, v_sum_p, v_sum_w
    FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  IF v_pallet_count > 0 THEN
    v_pieces := v_sum_p;
    v_weight := v_sum_w;
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

  -- Reserva global apenas quando NÃO há paletes (paletes geram reservas próprias)
  IF v_pallet_count = 0 AND (v_pieces > 0 OR v_weight > 0) THEN
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'reserve',
            v_pieces, v_weight, 'OF #' || v_row.of_number || ' pronta (reserva)', auth.uid());
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_launch_ready',
    jsonb_build_object('of', v_row.of_number, 'pieces', v_pieces, 'weight', v_weight,
                       'from_pallets', v_pallet_count > 0),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true, 'pieces_real', v_pieces, 'weight_real', v_weight);
END;
$$;

GRANT EXECUTE ON FUNCTION public.launch_billing_order_ready(uuid,uuid,int,numeric,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 10) collect_billing_order  (ready → collected)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.collect_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_had_out boolean := false;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'collected' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders
     SET status = 'collected', collected_by = auth.uid(), collected_at = now(),
         priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL,
         updated_at = now()
   WHERE id = p_id AND status = 'ready';

  -- Netby (article, client, machine) sobre reserve − release já registrados
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
           'OF #' || v_row.of_number || ' coletada (libera reserva)', auth.uid()
    FROM netted WHERE p_net > 0 OR w_net > 0
    RETURNING 1
  ),
  ins_out AS (
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'out',
           GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net),
           'OF #' || v_row.of_number || ' coletada', auth.uid()
    FROM netted WHERE p_net > 0 OR w_net > 0
    RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM ins_out) > 0 INTO v_had_out;

  -- Fallback quando não havia reservas (OFs legadas): baixa via paletes ou total
  IF NOT v_had_out THEN
    IF EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id AND own_article_id IS NULL) THEN
      INSERT INTO public.stock_movements
        (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
      SELECT p_company_id, v_row.article_id, v_row.client_id, machine_id, p_id, 'out',
             GREATEST(0, ROUND(SUM(pieces)))::int, GREATEST(0, SUM(weight_kg)),
             'OF #' || v_row.of_number || ' coletada', auth.uid()
        FROM public.billing_order_pallets
       WHERE billing_order_id = p_id AND own_article_id IS NULL
       GROUP BY machine_id;
    ELSIF (COALESCE(v_row.pieces_real, v_row.pieces_expected, 0) > 0
        OR COALESCE(v_row.weight_real, v_row.weight_expected, 0) > 0) THEN
      -- Se toda a OF é 'own_stock' não inserimos nada em stock_movements
      IF NOT EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id)
         OR EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id AND own_article_id IS NULL) THEN
        INSERT INTO public.stock_movements
          (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
        VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'out',
                GREATEST(0, ROUND(COALESCE(v_row.pieces_real, v_row.pieces_expected, 0)))::int,
                GREATEST(0, COALESCE(v_row.weight_real, v_row.weight_expected, 0)),
                'OF #' || v_row.of_number || ' coletada', auth.uid());
      END IF;
    END IF;
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_collect',
    jsonb_build_object('of', v_row.of_number), p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_billing_order(uuid,uuid,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 11) cancel_billing_order
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cancel_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_reason text,
  p_expected_status text DEFAULT NULL,
  p_reversal_quality text DEFAULT 'first',
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_is_second boolean := (COALESCE(p_reversal_quality,'first') = 'second');
  v_reason_str text;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancelled_by = auth.uid(), cancelled_at = now(),
    cancellation_reason = p_reason,
    reverted_from = v_row.status::text,
    reversed_by   = CASE WHEN v_row.status = 'collected' THEN auth.uid() ELSE reversed_by END,
    reversed_at   = CASE WHEN v_row.status = 'collected' THEN now()      ELSE reversed_at END,
    reversal_reason  = CASE WHEN v_row.status = 'collected' THEN p_reason ELSE reversal_reason END,
    reversal_quality = CASE WHEN v_row.status = 'collected' THEN COALESCE(p_reversal_quality,'first') ELSE reversal_quality END,
    priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL,
    updated_at = now()
  WHERE id = p_id;

  IF v_row.status IN ('separating','ready') THEN
    -- Libera reservas pendentes (net) e apaga paletes/restora estoque próprio
    PERFORM public._of_release_pending_reserves(p_company_id, p_id, v_row.of_number,
      'cancelada (libera reserva pendente)', auth.uid());
    PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, v_row.of_number,
      '(OF cancelada — devolve estoque próprio)', auth.uid(), true);
  ELSIF v_row.status = 'collected' THEN
    v_reason_str := 'OF #' || v_row.of_number || ' estornada — '
                     || CASE WHEN v_is_second THEN '2ª QUALIDADE' ELSE '1ª qualidade' END
                     || ' — ' || COALESCE(p_reason,'sem motivo');

    -- Estorno via paletes: devolve estoque próprio (own_article_id) e 'in' em stock_movements
    INSERT INTO public.own_stock_movements
      (company_id, own_article_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, own_article_id, 'in', pieces, weight_kg,
           'OF #' || v_row.of_number || ' estornada — devolve estoque próprio (Palete ' || pallet_number || ')',
           auth.uid()
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
             v_is_second, v_reason_str, auth.uid()
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
              v_is_second, v_reason_str, auth.uid());
    END IF;
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_cancel',
    jsonb_build_object('of', v_row.of_number, 'from_status', v_row.status,
                       'reversal_quality', p_reversal_quality, 'reason', p_reason),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid,uuid,text,text,text,text,text) TO anon, authenticated, service_role;

-- =====================================================================
-- 12) revert_billing_order_to_open
-- =====================================================================
CREATE OR REPLACE FUNCTION public.revert_billing_order_to_open(
  p_company_id uuid,
  p_id uuid,
  p_reason text DEFAULT NULL,
  p_expected_status text DEFAULT NULL,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'open' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders SET
    status = 'open',
    pieces_real = NULL, weight_real = NULL, weight_avg = NULL,
    separated_by = NULL, collected_by = NULL, collected_at = NULL,
    delivery_doc_type = NULL, delivery_doc_number = NULL,
    delivery_doc_set_by = NULL, delivery_doc_set_at = NULL,
    reverted_from = v_row.status::text,
    reversed_by   = auth.uid(),
    reversed_at   = now(),
    reversal_reason = COALESCE(p_reason, reversal_reason),
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_release_pending_reserves(p_company_id, p_id, v_row.of_number,
    'revertida para Aberto (libera reserva)', auth.uid());
  PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, v_row.of_number,
    '(OF revertida para Aberto — devolve estoque próprio)', auth.uid(), true);

  PERFORM public._of_audit(p_company_id, 'billing_order_revert',
    jsonb_build_object('of', v_row.of_number, 'from_status', v_row.status, 'reason', p_reason),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_billing_order_to_open(uuid,uuid,text,text,text,text) TO anon, authenticated, service_role;
