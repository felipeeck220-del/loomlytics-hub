-- RECONSTRUÇÃO TOTAL DE ORDEM DE FATURAMENTO (OF)
-- Este script limpa funções duplicadas e reinicia a auditoria sincronizada

DROP FUNCTION IF EXISTS public.collect_billing_order(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.start_billing_order_separation(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.launch_billing_order_ready(uuid, uuid, integer, numeric, text, text);
DROP FUNCTION IF EXISTS public.set_billing_order_priority(uuid, uuid, boolean, text, text, text);
DROP FUNCTION IF EXISTS public.edit_billing_order(uuid, uuid, jsonb, text, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.edit_billing_order(uuid, uuid, jsonb, text, billing_order_status, boolean, text, text);
DROP FUNCTION IF EXISTS public.create_billing_order(uuid, jsonb, text, text);

-- 1. Coletar
CREATE OR REPLACE FUNCTION public.collect_billing_order(p_company_id uuid, p_id uuid, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_pid uuid;
  v_had_out boolean := false;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'collected' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_row.status <> 'ready' THEN RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status); END IF;
  
  UPDATE public.billing_orders SET status = 'collected', collected_by = v_pid, collected_at = now(), priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL, updated_at = now() WHERE id = p_id AND status = 'ready';
  
  WITH netted AS (
    SELECT article_id, client_id, machine_id, 
      SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END)::numeric AS p_net,
      SUM(CASE WHEN type='reserve' THEN weight_kg ELSE -weight_kg END)::numeric AS w_net
    FROM public.stock_movements WHERE billing_order_id = p_id AND type IN ('reserve','release')
    GROUP BY article_id, client_id, machine_id
  ),
  ins_rel AS (
    INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'release', GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net), 'OF #' || v_row.of_number || ' coletada (libera reserva)', v_pid
    FROM netted WHERE p_net > 0 OR w_net > 0 RETURNING 1
  ),
  ins_out AS (
    INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'out', GREATEST(0, ROUND(p_net))::int, GREATEST(0, w_net), 'OF #' || v_row.of_number || ' coletada', v_pid
    FROM netted WHERE p_net > 0 OR w_net > 0 RETURNING 1
  )
  SELECT (SELECT COUNT(*) FROM ins_out) > 0 INTO v_had_out;

  IF NOT v_had_out THEN
    IF EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id AND own_article_id IS NULL) THEN
      INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
      SELECT p_company_id, v_row.article_id, v_row.client_id, machine_id, p_id, 'out', GREATEST(0, ROUND(SUM(pieces)))::int, GREATEST(0, SUM(weight_kg)), 'OF #' || v_row.of_number || ' coletada', v_pid
      FROM public.billing_order_pallets WHERE billing_order_id = p_id AND own_article_id IS NULL GROUP BY machine_id;
    ELSIF (COALESCE(v_row.pieces_real, v_row.pieces_expected, 0) > 0) THEN
      INSERT INTO public.stock_movements (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
      VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'out', GREATEST(0, ROUND(COALESCE(v_row.pieces_real, v_row.pieces_expected, 0)))::int, GREATEST(0, COALESCE(v_row.weight_real, v_row.weight_expected, 0)), 'OF #' || v_row.of_number || ' coletada', v_pid);
    END IF;
  END IF;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_collect', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number));
  RETURN jsonb_build_object('ok', true);
END; $function$;

-- 2. Iniciar Separação
CREATE OR REPLACE FUNCTION public.start_billing_order_separation(p_company_id uuid, p_id uuid, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller uuid := public.get_user_company_id(); v_row public.billing_orders%ROWTYPE; v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'separating' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_row.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status); END IF;
  UPDATE public.billing_orders SET status = 'separating', separation_started_by = v_pid, separation_started_at = now(), updated_at = now() WHERE id = p_id AND status = 'open';
  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_start_separation', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number));
  RETURN jsonb_build_object('ok', true);
END; $function$;

-- 3. Finalizar Separação
CREATE OR REPLACE FUNCTION public.launch_billing_order_ready(p_company_id uuid, p_id uuid, p_pieces_real integer DEFAULT NULL, p_weight_real numeric DEFAULT NULL, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller uuid := public.get_user_company_id(); v_row public.billing_orders%ROWTYPE; v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'ready' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_row.status <> 'separating' THEN RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status); END IF;
  UPDATE public.billing_orders SET status = 'ready', pieces_real = p_pieces_real, weight_real = p_weight_real, weight_avg = CASE WHEN p_pieces_real > 0 THEN (p_weight_real / p_pieces_real) ELSE 0 END, separation_finished_by = v_pid, separation_finished_at = now(), updated_at = now() WHERE id = p_id AND status = 'separating';
  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_ready', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number, 'pieces', p_pieces_real, 'weight', p_weight_real));
  RETURN jsonb_build_object('ok', true);
END; $function$;

-- 4. Criar
CREATE OR REPLACE FUNCTION public.create_billing_order(p_company_id uuid, p_payload jsonb, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller uuid := public.get_user_company_id(); v_pid uuid; v_id uuid; v_of_num text;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);
  v_of_num := p_payload->>'of_number';
  IF v_of_num IS NULL THEN v_of_num := public.generate_next_of_number(p_company_id); END IF;
  IF EXISTS (SELECT 1 FROM public.billing_orders WHERE of_number = v_of_num AND company_id = p_company_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number'); END IF;
  INSERT INTO public.billing_orders (company_id, of_number, client_id, article_id, machine_id, pieces_expected, weight_expected, piece_weight_target, dyehouse, order_type, status, created_by, admin_notes, multiplier, updated_at)
  VALUES (p_company_id, v_of_num, (p_payload->>'client_id')::uuid, (p_payload->>'article_id')::uuid, (p_payload->>'machine_id')::uuid, (p_payload->>'pieces_expected')::int, (p_payload->>'weight_expected')::numeric, (p_payload->>'piece_weight_target')::numeric, (p_payload->>'dyehouse'), (p_payload->>'order_type')::billing_order_type, 'open', v_pid, (p_payload->>'admin_notes'), (p_payload->>'multiplier')::int, now())
  RETURNING id INTO v_id;
  PERFORM public._of_audit(p_company_id, v_id, 'billing_order_create', p_author_name, p_author_code, jsonb_build_object('of', v_of_num));
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'of_number', v_of_num);
END; $function$;

-- 5. Editar
CREATE OR REPLACE FUNCTION public.edit_billing_order(p_company_id uuid, p_id uuid, p_payload jsonb, p_note text, p_expected_status billing_order_status DEFAULT NULL::billing_order_status, p_revert_to_open boolean DEFAULT false, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller uuid := public.get_user_company_id(); v_row public.billing_orders%ROWTYPE; v_pid uuid; v_new_status billing_order_status;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF p_expected_status IS NOT NULL AND v_row.status <> p_expected_status THEN RETURN jsonb_build_object('ok', false, 'error', 'conflict'); END IF;
  IF p_revert_to_open THEN v_new_status := 'open'::billing_order_status; ELSE v_new_status := v_row.status; END IF;
  UPDATE public.billing_orders SET of_number = COALESCE((p_payload->>'of_number'), of_number), client_id = COALESCE((p_payload->>'client_id')::uuid, client_id), article_id = COALESCE((p_payload->>'article_id')::uuid, article_id), machine_id = (p_payload->>'machine_id')::uuid, pieces_expected = (p_payload->>'pieces_expected')::int, weight_expected = (p_payload->>'weight_expected')::numeric, piece_weight_target = (p_payload->>'piece_weight_target')::numeric, dyehouse = COALESCE((p_payload->>'dyehouse'), dyehouse), order_type = COALESCE((p_payload->>'order_type')::billing_order_type, order_type), admin_notes = (p_payload->>'admin_notes'), status = v_new_status, multiplier = (p_payload->>'multiplier')::int, last_edited_by = v_pid, last_edited_at = now(), edit_note = p_note, updated_at = now() WHERE id = p_id;
  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_edit', p_author_name, p_author_code, jsonb_build_object('changes', p_payload, 'note', p_note));
  RETURN jsonb_build_object('ok', true);
END; $function$;

-- Grants
GRANT EXECUTE ON FUNCTION public.collect_billing_order TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_billing_order_separation TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.launch_billing_order_ready TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_billing_order TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.edit_billing_order TO authenticated, service_role;
