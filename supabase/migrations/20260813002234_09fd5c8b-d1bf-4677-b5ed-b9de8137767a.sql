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
    IF v_caller IS NOT NULL AND v_caller <> p_company_id THEN
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

GRANT EXECUTE ON FUNCTION public.collect_billing_order TO authenticated, service_role;