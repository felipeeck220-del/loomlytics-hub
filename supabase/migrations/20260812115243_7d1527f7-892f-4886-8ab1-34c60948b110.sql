DO $$ 
DECLARE
    v_order_id uuid;
    v_author_id uuid;
    v_company_id uuid;
BEGIN
    -- Obter IDs necessários para a OF #597
    SELECT id, company_id INTO v_order_id, v_company_id FROM public.billing_orders WHERE of_number = '597' LIMIT 1;
    SELECT id INTO v_author_id FROM public.profiles WHERE code = '832' LIMIT 1;

    IF v_order_id IS NOT NULL THEN
        -- Chamar a RPC collect_billing_order que lida com auditoria, estorno de reserva e mudança de status
        PERFORM public.collect_billing_order(v_company_id, v_order_id, 'Felipe', '832');
        
        -- A RPC collect_billing_order NÃO deleta os paletes (ela faz a saída do estoque).
        -- Para manter a regra de "coletada = sem paletes ativos no faturamento", deletamos aqui.
        DELETE FROM public.billing_order_pallets WHERE billing_order_id = v_order_id;
    END IF;
END $$;