-- 1. DROP function to ensure a clean state for the new signature
DROP FUNCTION IF EXISTS public.set_billing_order_priority(uuid, uuid, boolean, text, text, text);

-- 2. Recriar set_billing_order_priority robusta
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
    v_pid uuid;
BEGIN
    -- Validação de multi-tenant
    IF v_caller IS NULL OR v_caller <> p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
    END IF;

    -- Localizar perfil do autor
    v_pid := public._of_current_profile_id(p_company_id);

    -- Bloquear linha para atualização
    SELECT * INTO v_row FROM public.billing_orders 
    WHERE id = p_id AND company_id = p_company_id 
    FOR UPDATE;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('ok', false, 'error', 'not_found'); 
    END IF;

    -- Atualizar status de prioridade
    UPDATE public.billing_orders SET
        priority = p_priority,
        priority_reason = CASE WHEN p_priority THEN p_reason ELSE NULL END,
        priority_at = CASE WHEN p_priority THEN now() ELSE NULL END,
        priority_by = CASE WHEN p_priority THEN v_pid ELSE NULL END,
        updated_at = now()
    WHERE id = p_id;

    -- Auditoria canônica de 6 argumentos
    PERFORM public._of_audit(
        p_company_id,
        p_id,
        CASE WHEN p_priority THEN 'billing_order_set_priority' ELSE 'billing_order_unset_priority' END,
        p_author_name,
        p_author_code,
        jsonb_build_object(
            'priority', p_priority, 
            'reason', p_reason, 
            'of', v_row.of_number,
            'prev_priority', v_row.priority
        )
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. Grants explícitos
GRANT EXECUTE ON FUNCTION public.set_billing_order_priority TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_billing_order_priority TO anon; -- Mantendo compatibilidade se necessário