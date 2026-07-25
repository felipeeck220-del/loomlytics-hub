-- edit_billing_order: preservar paletes e reservas ao voltar para 'open'
-- Facilita expedição: admin edita OF (que estava em 'separating' ou 'ready') e a OF
-- retorna para "Aberto" mantendo paletes/reservas/estoque próprio intactos, para
-- que a separação já feita não precise ser refeita.
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
  v_has_pallets boolean := false;
  v_sum_p int;
  v_sum_w numeric;
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

  -- Detecta se existem paletes salvos para decidir a preservação na volta para 'open'
  IF p_revert_to_open THEN
    SELECT COUNT(*) > 0, COALESCE(SUM(pieces),0), COALESCE(SUM(weight_kg),0)
      INTO v_has_pallets, v_sum_p, v_sum_w
      FROM public.billing_order_pallets WHERE billing_order_id = p_id;
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
    -- Mantém pieces_real/weight_real quando há paletes preservados (refletem a
    -- separação já feita); zera quando não há paletes.
    pieces_real         = CASE WHEN p_revert_to_open AND NOT v_has_pallets THEN NULL
                               WHEN p_revert_to_open AND v_has_pallets THEN v_sum_p
                               ELSE pieces_real END,
    weight_real         = CASE WHEN p_revert_to_open AND NOT v_has_pallets THEN NULL
                               WHEN p_revert_to_open AND v_has_pallets THEN v_sum_w
                               ELSE weight_real END,
    weight_avg          = CASE WHEN p_revert_to_open AND NOT v_has_pallets THEN NULL
                               WHEN p_revert_to_open AND v_has_pallets AND v_sum_p > 0 THEN v_sum_w / v_sum_p
                               WHEN p_revert_to_open AND v_has_pallets THEN 0
                               ELSE weight_avg END,
    -- Mantém quem separou quando os paletes ficam preservados; zera o resto sempre.
    separated_by        = CASE WHEN p_revert_to_open AND NOT v_has_pallets THEN NULL ELSE separated_by END,
    collected_by        = CASE WHEN p_revert_to_open THEN NULL ELSE collected_by END,
    collected_at        = CASE WHEN p_revert_to_open THEN NULL ELSE collected_at END,
    delivery_doc_type   = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_type END,
    delivery_doc_number = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_number END,
    delivery_doc_set_by = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_set_by END,
    delivery_doc_set_at = CASE WHEN p_revert_to_open THEN NULL ELSE delivery_doc_set_at END
  WHERE id = p_id;

  IF p_revert_to_open AND NOT v_has_pallets THEN
    -- Sem paletes salvos: comportamento anterior — libera reservas globais (do
    -- launch_ready sem paletes) e devolve estoque próprio (se houver algum
    -- resquício). Nada acontece se não houver reservas.
    PERFORM public._of_release_pending_reserves(p_company_id, p_id, COALESCE(v_new_of, v_row.of_number),
      'editada — reserva liberada', v_pid);
    PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, COALESCE(v_new_of, v_row.of_number),
      '(edição volta para Aberto — devolve estoque próprio)', v_pid, true);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_edit',
    jsonb_build_object('of', COALESCE(v_new_of, v_row.of_number), 'prev_of', v_row.of_number,
                       'note', p_note, 'reverted', p_revert_to_open,
                       'pallets_preserved', v_has_pallets,
                       'changes', p_payload),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true, 'pallets_preserved', v_has_pallets);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
END; $$;

GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid,uuid,jsonb,text,text,boolean,text,text) TO anon, authenticated, service_role;