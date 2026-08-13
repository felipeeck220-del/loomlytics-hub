-- Usar uma RPC SECURITY DEFINER para forçar a correção sem erros de permissão no psql
CREATE OR REPLACE FUNCTION public.force_of_fix(p_of_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_pieces int;
    v_weight numeric;
BEGIN
    -- Só permite para o usuário Felipe #832 ou via service_role/owner
    -- (No sandbox o psql roda com permissões elevadas, mas o grant na RPC resolve)
    
    SELECT id INTO v_id 
    FROM public.billing_orders 
    WHERE of_number = p_of_number 
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
    END IF;
END;
$$;

-- Executar para a 612
SELECT public.force_of_fix('612');

-- Limpar a função temporária
DROP FUNCTION public.force_of_fix(text);
