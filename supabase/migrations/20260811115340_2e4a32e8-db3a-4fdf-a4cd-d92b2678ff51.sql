CREATE OR REPLACE FUNCTION public.create_billing_order(p_company_id uuid, p_payload jsonb, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 DECLARE v_caller uuid := public.get_user_company_id(); v_pid uuid; v_id uuid; v_of_num text;
 BEGIN
   IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
   v_pid := public._of_current_profile_id(p_company_id);
   v_of_num := p_payload->>'of_number';
   IF v_of_num IS NULL THEN v_of_num := public.generate_next_of_number(p_company_id); END IF;
   IF EXISTS (SELECT 1 FROM public.billing_orders WHERE of_number = v_of_num AND company_id = p_company_id) THEN RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number'); END IF;
   INSERT INTO public.billing_orders (company_id, of_number, client_id, article_id, machine_id, pieces_expected, weight_expected, piece_weight_target, dyehouse, order_type, status, created_by, admin_notes, multiplier, updated_at)
   VALUES (p_company_id, v_of_num, (p_payload->>'client_id')::uuid, (p_payload->>'article_id')::uuid, (p_payload->>'machine_id')::uuid, (p_payload->>'pieces_expected')::int, (p_payload->>'weight_expected')::numeric, (p_payload->>'piece_weight_target')::numeric, (p_payload->>'dyehouse'), (p_payload->>'order_type'), 'open', v_pid, (p_payload->>'admin_notes'), (p_payload->>'multiplier')::int, now())
   RETURNING id INTO v_id;
   PERFORM public._of_audit(p_company_id, v_id, 'billing_order_create', p_author_name, p_author_code, jsonb_build_object('of', v_of_num));
   RETURN jsonb_build_object('ok', true, 'id', v_id, 'of_number', v_of_num);
 END; $function$;

CREATE OR REPLACE FUNCTION public.edit_billing_order(p_company_id uuid, p_id uuid, p_payload jsonb, p_note text, p_expected_status billing_order_status DEFAULT NULL::billing_order_status, p_revert_to_open boolean DEFAULT false, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 AS $function$
 DECLARE v_caller uuid := public.get_user_company_id(); v_row public.billing_orders%ROWTYPE; v_pid uuid; v_new_status billing_order_status;
 BEGIN
   IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
   v_pid := public._of_current_profile_id(p_company_id);
   SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
   IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status::text THEN
     RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
   END IF;
   IF p_payload ? 'of_number' AND p_payload->>'of_number' <> v_row.of_number THEN
     IF EXISTS (SELECT 1 FROM public.billing_orders WHERE of_number = p_payload->>'of_number' AND company_id = p_company_id AND id <> p_id) THEN
       RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
     END IF;
   END IF;
   v_new_status := v_row.status;
   IF p_revert_to_open THEN v_new_status := 'open'::billing_order_status; END IF;
   UPDATE public.billing_orders SET
     of_number = COALESCE(p_payload->>'of_number', of_number),
     client_id = COALESCE((p_payload->>'client_id')::uuid, client_id),
     article_id = COALESCE((p_payload->>'article_id')::uuid, article_id),
     machine_id = CASE WHEN p_payload ? 'machine_id' THEN (p_payload->>'machine_id')::uuid ELSE machine_id END,
     dyehouse = COALESCE(p_payload->>'dyehouse', dyehouse),
     pieces_expected = CASE WHEN p_payload ? 'pieces_expected' THEN (p_payload->>'pieces_expected')::int ELSE pieces_expected END,
     weight_expected = CASE WHEN p_payload ? 'weight_expected' THEN (p_payload->>'weight_expected')::numeric ELSE weight_expected END,
     piece_weight_target = CASE WHEN p_payload ? 'piece_weight_target' THEN (p_payload->>'piece_weight_target')::numeric ELSE piece_weight_target END,
     order_type = COALESCE(p_payload->>'order_type', order_type),
     admin_notes = CASE WHEN p_payload ? 'admin_notes' THEN p_payload->>'admin_notes' ELSE admin_notes END,
     multiplier = CASE WHEN p_payload ? 'multiplier' THEN (p_payload->>'multiplier')::int ELSE multiplier END,
     status = v_new_status,
     last_edited_by = v_pid,
     last_edited_at = now(),
     edit_note = p_note,
     updated_at = now()
   WHERE id = p_id;
   PERFORM public._of_audit(p_company_id, p_id, 'billing_order_edit', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number, 'note', p_note));
   RETURN jsonb_build_object('ok', true);
 END; $function$;