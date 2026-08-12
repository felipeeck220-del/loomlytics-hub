-- 1. DROP para sincronizar assinatura de _of_audit
-- A assinatura detectada no erro parece ser _of_audit(uuid,uuid,text,text,text,jsonb)
DROP FUNCTION IF EXISTS public._of_audit(uuid, uuid, text, text, text, jsonb);

-- 2. Recriar _of_audit com parâmetros nomeados corretamente
CREATE OR REPLACE FUNCTION public._of_audit(
    p_company_id uuid,
    p_id uuid,
    p_action text,
    p_author_name text,
    p_author_code text,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.audit_logs (
        company_id,
        user_name,
        user_code,
        action,
        details
    )
    VALUES (
        p_company_id,
        COALESCE(p_author_name, 'Sistema'),
        COALESCE(p_author_code, '0'),
        p_action,
        p_details || jsonb_build_object('of_id', p_id)
    );
END;
$$;

-- 3. Refatoração de collect_billing_order
CREATE OR REPLACE FUNCTION public.collect_billing_order(
    p_company_id uuid,
    p_id uuid,
    p_author_name text DEFAULT NULL,
    p_author_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller uuid := public.get_user_company_id();
    v_row public.billing_orders%ROWTYPE;
BEGIN
    IF v_caller IS NULL OR v_caller <> p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('ok', false, 'error', 'not_found'); 
    END IF;
    
    IF v_row.status = 'collected' THEN
        RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;

    PERFORM public._of_audit(
        p_company_id,
        p_id,
        'billing_order_collected',
        p_author_name,
        p_author_code,
        jsonb_build_object(
            'of', v_row.of_number,
            'prev_status', v_row.status,
            'pieces', v_row.pieces_real,
            'weight', v_row.weight_real
        )
    );

    UPDATE public.billing_orders SET
        status = 'collected',
        collected_by = auth.uid(),
        collected_at = now(),
        updated_at = now()
    WHERE id = p_id;

    DELETE FROM public.billing_order_pallets WHERE billing_order_id = p_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. Refatoração de set_billing_order_priority
CREATE OR REPLACE FUNCTION public.set_billing_order_priority(
    p_company_id uuid,
    p_id uuid,
    p_priority boolean,
    p_reason text DEFAULT NULL,
    p_author_name text DEFAULT NULL,
    p_author_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller uuid := public.get_user_company_id();
    v_row public.billing_orders%ROWTYPE;
BEGIN
    IF v_caller IS NULL OR v_caller <> p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('ok', false, 'error', 'not_found'); 
    END IF;

    UPDATE public.billing_orders SET
        priority = p_priority,
        priority_reason = p_reason,
        priority_at = CASE WHEN p_priority THEN now() ELSE NULL END,
        priority_by = CASE WHEN p_priority THEN auth.uid() ELSE NULL END,
        updated_at = now()
    WHERE id = p_id;

    PERFORM public._of_audit(
        p_company_id,
        p_id,
        'billing_order_set_priority',
        p_author_name,
        p_author_code,
        jsonb_build_object('priority', p_priority, 'reason', p_reason, 'of', v_row.of_number)
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_billing_order TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_billing_order_priority TO authenticated, service_role;