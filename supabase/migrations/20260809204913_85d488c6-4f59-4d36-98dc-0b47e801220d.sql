-- Adiciona coluna multiplier na tabela billing_orders
ALTER TABLE public.billing_orders ADD COLUMN IF NOT EXISTS multiplier integer;

-- Remove funções antes de recriá-las para evitar erro de parâmetros padrão
DROP FUNCTION IF EXISTS public.create_billing_order(uuid,jsonb,text,text);
DROP FUNCTION IF EXISTS public.edit_billing_order(uuid,uuid,jsonb,text,text,boolean,text,text);

-- Atualiza as RPCs para suportar o novo campo
CREATE OR REPLACE FUNCTION public.create_billing_order(
    p_company_id uuid,
    p_payload jsonb,
    p_author_name text,
    p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_of_number text;
BEGIN
    -- Validação de tenant
    IF (SELECT company_id FROM profiles WHERE user_id = auth.uid()) IS DISTINCT FROM p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
    END IF;

    -- Gera número da OF se não fornecido
    v_of_number := p_payload->>'of_number';
    IF v_of_number IS NULL OR v_of_number = '' THEN
        SELECT LPAD((COALESCE(MAX(of_number::integer), 0) + 1)::text, 3, '0')
        INTO v_of_number
        FROM billing_orders
        WHERE company_id = p_company_id
        AND of_number ~ '^[0-9]+$';
    END IF;

    -- Verifica duplicidade
    IF EXISTS (SELECT 1 FROM billing_orders WHERE company_id = p_company_id AND of_number = v_of_number) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
    END IF;

    INSERT INTO billing_orders (
        company_id, of_number, client_id, article_id, machine_id,
        pieces_expected, weight_expected, piece_weight_target,
        dyehouse, order_type, admin_notes, created_by, multiplier
    )
    VALUES (
        p_company_id,
        v_of_number,
        (p_payload->>'client_id')::uuid,
        (p_payload->>'article_id')::uuid,
        (p_payload->>'machine_id')::uuid,
        (p_payload->>'pieces_expected')::integer,
        (p_payload->>'weight_expected')::numeric,
        (p_payload->>'piece_weight_target')::numeric,
        p_payload->>'dyehouse',
        COALESCE(p_payload->>'order_type', 'pieces'),
        p_payload->>'admin_notes',
        auth.uid(),
        (p_payload->>'multiplier')::integer
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'of_number', v_of_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.edit_billing_order(
    p_company_id uuid,
    p_id uuid,
    p_payload jsonb,
    p_note text,
    p_expected_status text,
    p_revert_to_open boolean,
    p_author_name text,
    p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_status text;
BEGIN
    -- Validação de tenant
    IF (SELECT company_id FROM profiles WHERE user_id = auth.uid()) IS DISTINCT FROM p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
    END IF;

    SELECT status INTO v_current_status FROM billing_orders WHERE id = p_id AND company_id = p_company_id;
    
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
        status = CASE WHEN p_revert_to_open THEN 'open'::text ELSE status END,
        last_edited_by = auth.uid(),
        last_edited_at = now()
    WHERE id = p_id AND company_id = p_company_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- Reaplica permissões revogadas pelo DROP
GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid,uuid,jsonb,text,text,boolean,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid,uuid,jsonb,text,text,boolean,text,text) TO service_role;
