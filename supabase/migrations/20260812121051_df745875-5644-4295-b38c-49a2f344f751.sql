-- Mover OF #599 manualmente para coletadas e garantir limpeza de paletes
DO $$
DECLARE
    v_of_id uuid;
    v_company_id uuid;
BEGIN
    SELECT id, company_id INTO v_of_id, v_company_id 
    FROM public.billing_orders 
    WHERE of_number = '599' 
    LIMIT 1;

    IF v_of_id IS NOT NULL THEN
        UPDATE public.billing_orders 
        SET status = 'collected', 
            collected_at = now(),
            updated_at = now()
        WHERE id = v_of_id;
        
        DELETE FROM public.billing_order_pallets WHERE billing_order_id = v_of_id;
    END IF;
END $$;
