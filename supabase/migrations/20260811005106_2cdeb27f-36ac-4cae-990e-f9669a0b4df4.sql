CREATE OR REPLACE FUNCTION public.edit_billing_order(p_company_id uuid, p_id uuid, p_payload jsonb, p_note text, p_expected_status text, p_revert_to_open boolean, p_author_name text, p_author_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_current_status text;
    v_profile_id uuid;
    v_of_number text;
    v_old_client_id uuid;
    v_old_article_id uuid;
BEGIN
    SELECT id INTO v_profile_id 
    FROM profiles 
    WHERE user_id = auth.uid() 
      AND company_id = p_company_id;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
    END IF;

    -- Seleciona os dados atuais para detecção de mudança de alvo
    SELECT (status)::text, of_number, client_id, article_id 
    INTO v_current_status, v_of_number, v_old_client_id, v_old_article_id 
    FROM billing_orders 
    WHERE id = p_id AND company_id = p_company_id;
    
    IF p_expected_status IS NOT NULL AND v_current_status IS DISTINCT FROM p_expected_status THEN
        RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_current_status);
    END IF;

    -- Se o status mudou para 'open' (via p_revert_to_open) OU se o cliente/artigo mudou no payload, 
    -- limpa as reservas e paletes antigos para evitar inconsistências de estoque.
    IF p_revert_to_open OR 
       (p_payload->>'client_id' IS NOT NULL AND (p_payload->>'client_id')::uuid <> v_old_client_id) OR
       (p_payload->>'article_id' IS NOT NULL AND (p_payload->>'article_id')::uuid <> v_old_article_id) 
    THEN
        -- 1) Devolve reservas 'reserve' (Source of Truth) via liberação real 'release'
        PERFORM public._of_release_pending_reserves(p_company_id, p_id, v_of_number, '· Estorno por Edição Admin', v_profile_id);
        
        -- 2) Restaura estoque próprio se houver e limpa a tabela billing_order_pallets
        PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, v_of_number, '· Estorno por Edição Admin', v_profile_id, true);
        
        -- 3) Limpa dados de separação e real
        UPDATE billing_orders SET
            pieces_real = NULL,
            weight_real = NULL,
            weight_avg = NULL,
            delivery_doc_type = NULL,
            delivery_doc_number = NULL,
            delivery_doc_set_by = NULL,
            delivery_doc_set_at = NULL,
            separated_by = NULL,
            separation_started_by = NULL,
            separation_started_at = NULL,
            separation_finished_by = NULL,
            separation_finished_at = NULL,
            collected_by = NULL,
            collected_at = NULL
        WHERE id = p_id;
    END IF;

    UPDATE billing_orders
    SET
        of_number = COALESCE(p_payload->>'of_number', of_number),
        client_id = COALESCE((p_payload->>'client_id')::uuid, client_id),
        article_id = COALESCE((p_payload->>'article_id')::uuid, article_id),
        machine_id = CASE WHEN p_payload ? 'machine_id' THEN (p_payload->>'machine_id')::uuid ELSE machine_id END,
        pieces_expected = CASE WHEN p_payload ? 'pieces_expected' THEN (p_payload->>'pieces_expected')::integer ELSE pieces_expected END,
        weight_expected = CASE WHEN p_payload ? 'weight_expected' THEN (p_payload->>'weight_expected')::numeric ELSE weight_expected END,
        piece_weight_target = CASE WHEN p_payload ? 'piece_weight_target' THEN (p_payload->>'piece_weight_target')::numeric ELSE piece_weight_target END,
        dyehouse = COALESCE(p_payload->>'dyehouse', dyehouse),
        order_type = COALESCE(p_payload->>'order_type', order_type),
        admin_notes = CASE WHEN p_payload ? 'admin_notes' THEN p_payload->>'admin_notes' ELSE admin_notes END,
        multiplier = CASE WHEN p_payload ? 'multiplier' THEN (p_payload->>'multiplier')::integer ELSE multiplier END,
        status = CASE WHEN p_revert_to_open THEN 'open'::billing_order_status ELSE status END,
        last_edited_by = v_profile_id,
        last_edited_at = now()
    WHERE id = p_id AND company_id = p_company_id;

    -- Audit
    PERFORM public._of_audit(p_company_id, 'billing_order_edit', 
        jsonb_build_object('id', p_id, 'of_number', v_of_number, 'note', p_note, 'revert', p_revert_to_open),
        p_author_name, p_author_code);

    RETURN jsonb_build_object('ok', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid, uuid, jsonb, text, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid, uuid, jsonb, text, text, boolean, text, text) TO service_role;