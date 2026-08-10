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
BEGIN
    SELECT id INTO v_profile_id 
    FROM profiles 
    WHERE user_id = auth.uid() 
      AND company_id = p_company_id;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
    END IF;

    -- Seleciona o status da tabela billing_orders, convertendo explicitamente para text
    SELECT (status)::text, of_number INTO v_current_status, v_of_number 
    FROM billing_orders 
    WHERE id = p_id AND company_id = p_company_id;
    
    IF p_expected_status IS NOT NULL AND v_current_status IS DISTINCT FROM p_expected_status THEN
        RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_current_status);
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
