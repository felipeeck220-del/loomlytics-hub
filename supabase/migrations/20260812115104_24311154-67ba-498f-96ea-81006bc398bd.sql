DO $$ 
DECLARE
    v_order_id uuid;
    v_author_id uuid;
    v_company_id uuid;
BEGIN
    -- Obter IDs necessários
    SELECT id, company_id INTO v_order_id, v_company_id FROM public.billing_orders WHERE of_number = '597' LIMIT 1;
    SELECT id INTO v_author_id FROM public.profiles WHERE code = '832' LIMIT 1;

    IF v_order_id IS NOT NULL THEN
        -- Chamar RPC de coleta (que já trata auditoria e limpeza de paletes via trigger/lógica interna)
        PERFORM public.collect_billing_order(v_company_id, v_order_id, 'Felipe', '832');
    END IF;
END $$;