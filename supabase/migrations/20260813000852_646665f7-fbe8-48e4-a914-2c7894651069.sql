-- Mover OF #591 manualmente para coletadas e garantir limpeza de paletes
DO $$
DECLARE
    v_of_id uuid;
    v_company_id uuid;
BEGIN
    SELECT id, company_id INTO v_of_id, v_company_id 
    FROM public.billing_orders 
    WHERE of_number = '591' 
    LIMIT 1;

    IF v_of_id IS NOT NULL THEN
        -- Consolida peças e peso dos paletes antes de deletar
        UPDATE public.billing_orders 
        SET pieces_real = (SELECT COALESCE(SUM(pieces), 0) FROM public.billing_order_pallets WHERE billing_order_id = v_of_id),
            weight_real = (SELECT COALESCE(SUM(weight_kg), 0) FROM public.billing_order_pallets WHERE billing_order_id = v_of_id),
            status = 'collected', 
            collected_at = now(),
            updated_at = now()
        WHERE id = v_of_id;
        
        -- Auditoria
        PERFORM public._of_audit(
            v_company_id,
            v_of_id,
            'billing_order_collected',
            'Admin Manual',
            '0',
            jsonb_build_object('of', '591', 'manual', true)
        );

        DELETE FROM public.billing_order_pallets WHERE billing_order_id = v_of_id;
    END IF;
END $$;