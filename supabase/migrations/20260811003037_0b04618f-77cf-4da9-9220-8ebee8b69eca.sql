DO $$
BEGIN
    -- 1. Limpeza total da tabela de movimentos manuais
    DELETE FROM public.manual_stock_movements;
    
    -- 2. Restauração das reservas de OFs ativas
    INSERT INTO public.manual_stock_movements (
        company_id, client_id, article_id, machine_id, 
        type, pieces, weight_kg, reason, billing_order_id, 
        created_at, created_by
    )
    SELECT 
        sm.company_id, sm.client_id, sm.article_id, sm.machine_id,
        sm.type, sm.pieces, sm.weight_kg, sm.reason, sm.billing_order_id,
        sm.created_at, sm.created_by
    FROM public.stock_movements sm
    JOIN public.billing_orders bo ON bo.id = sm.billing_order_id
    WHERE sm.type = 'reserve' 
      AND bo.status IN ('separating', 'ready')
      AND bo.company_id = sm.company_id;

    -- 3. Notificação
    PERFORM pg_notify('manual_stock_changed', 'RESET_COMPLETE');
END $$;
