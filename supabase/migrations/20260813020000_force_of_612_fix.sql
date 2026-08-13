-- Forçar a mudança de status da OF #612 para coletada e consolidar dados
DO $$
DECLARE
    v_id uuid;
    v_company_id uuid;
    v_pieces int;
    v_weight numeric;
BEGIN
    SELECT id, company_id INTO v_id, v_company_id 
    FROM public.billing_orders 
    WHERE of_number = '612' 
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        -- Consolidar dados dos paletes antes de deletar
        SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
        INTO v_pieces, v_weight
        FROM public.billing_order_pallets
        WHERE billing_order_id = v_id;

        UPDATE public.billing_orders SET
            status = 'collected',
            pieces_real = CASE WHEN v_pieces > 0 THEN v_pieces ELSE pieces_real END,
            weight_real = CASE WHEN v_weight > 0 THEN v_weight ELSE weight_real END,
            collected_at = now(),
            updated_at = now()
        WHERE id = v_id;

        -- Limpeza de paletes e movimentos de reserva
        DELETE FROM public.billing_order_pallets WHERE billing_order_id = v_id;
        DELETE FROM public.stock_movements WHERE billing_order_id = v_id AND type = 'reserve';
        
        RAISE NOTICE 'OF #612 fixada com sucesso.';
    END IF;
END $$;
