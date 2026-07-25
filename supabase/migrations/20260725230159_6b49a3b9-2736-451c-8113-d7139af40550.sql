
-- Pente fino OF Fases 1-4: correções pontuais

-- 1) edit_billing_order agora aceita of_number no payload (com validação de unicidade)
--    Bug: modal de edição permite alterar OF nº, mas o RPC ignorava silenciosamente.
CREATE OR REPLACE FUNCTION public.edit_billing_order(
  p_company_id uuid, p_id uuid, p_payload jsonb, p_note text,
  p_expected_status text DEFAULT NULL::text,
  p_revert_to_open boolean DEFAULT false,
  p_author_name text DEFAULT NULL::text,
  p_author_code text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_new_of text;
  v_existing uuid;
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

  -- Validar of_number quando fornecido no payload
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
    last_edited_by      = auth.uid(),
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
      'editada — reserva liberada', auth.uid());
    PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, COALESCE(v_new_of, v_row.of_number),
      '(edição volta para Aberto — devolve estoque próprio)', auth.uid(), true);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_edit',
    jsonb_build_object('of', COALESCE(v_new_of, v_row.of_number), 'prev_of', v_row.of_number,
                       'note', p_note, 'reverted', p_revert_to_open, 'changes', p_payload),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
END;
$function$;

-- 2) revert_billing_order_to_open agora também estorna 'out' quando vem de 'collected'.
--    Bug latente: RPC só liberava reservas, deixando saída física ('out') no estoque
--    caso alguma UI/rotina futura invoque revert direto de 'collected'.
CREATE OR REPLACE FUNCTION public.revert_billing_order_to_open(
  p_company_id uuid, p_id uuid,
  p_reason text DEFAULT NULL::text,
  p_expected_status text DEFAULT NULL::text,
  p_author_name text DEFAULT NULL::text,
  p_author_code text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_reason_str text;
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

  -- Se veio de 'collected', devolve o estoque físico (equivalente ao branch de cancel).
  IF v_row.status = 'collected' THEN
    v_reason_str := 'OF #' || v_row.of_number || ' revertida para Aberto — devolve estoque';

    -- Estoque próprio (own_stock) por palete
    INSERT INTO public.own_stock_movements
      (company_id, own_article_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, own_article_id, 'in', pieces, weight_kg,
           'OF #' || v_row.of_number || ' revertida — devolve estoque próprio (Palete ' || pallet_number || ')',
           auth.uid()
    FROM public.billing_order_pallets
    WHERE billing_order_id = p_id AND own_article_id IS NOT NULL;

    -- Estoque padrão: reverte a soma líquida de 'out' - 'in' já registrada no billing_order
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type,
       pieces, weight_kg, is_second_quality, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'in',
           GREATEST(0, ROUND(SUM(CASE WHEN type='out' THEN pieces ELSE -pieces END)))::int,
           GREATEST(0, SUM(CASE WHEN type='out' THEN weight_kg ELSE -weight_kg END)),
           COALESCE(is_second_quality, false), v_reason_str, auth.uid()
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
$function$;
