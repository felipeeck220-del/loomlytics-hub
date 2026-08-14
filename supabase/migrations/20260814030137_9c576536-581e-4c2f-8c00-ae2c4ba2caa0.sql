-- Script to delete test Billing Orders
DO $$
DECLARE
    target_ids text[] := ARRAY['628', '626', '627', '624', '623', '622', '615', '614', '613', '612', '611', '599', '597', '596', '595', '594', '625', '598', '565', '552', '551', '550', '549', '548', '547', '546', '545', '544', '543', '530', '529', '421'];
BEGIN
    -- Deleta os paletes vinculados
    DELETE FROM public.billing_order_pallets 
    WHERE billing_order_id IN (SELECT id FROM public.billing_orders WHERE of_number = ANY(target_ids));
    
    -- Deleta as ordens de faturamento
    DELETE FROM public.billing_orders 
    WHERE of_number = ANY(target_ids);
    
    RAISE NOTICE 'Deleted test orders and their related data.';
END $$;
