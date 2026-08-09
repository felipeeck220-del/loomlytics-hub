-- 1. Remove phantom machine-less movements that zeroed out the stock
DELETE FROM public.manual_stock_movements 
WHERE created_at > '2026-08-09 21:00:00+00' 
AND machine_id IS NULL 
AND type IN ('reserve', 'release')
AND billing_order_id IN (
    SELECT id FROM public.billing_orders 
    WHERE status IN ('collected', 'cancelled')
);

-- 2. Update trigger to prevent mirroring for non-active orders
CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_article_id UUID;
    v_client_id UUID;
    v_status TEXT;
BEGIN
    -- Check order status first
    SELECT client_id, article_id, status 
    INTO v_client_id, v_article_id, v_status
    FROM public.billing_orders
    WHERE id = NEW.billing_order_id;

    -- ONLY mirror if it's a valid active order (not collected, not cancelled)
    -- This prevents old history or remaps from flooding the manual stock
    IF v_status NOT IN ('open', 'in_separation', 'separated', 'awaiting_collection') THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.manual_stock_movements (
            company_id, client_id, article_id, machine_id,
            type, weight_kg, pieces, billing_order_id,
            created_at
        ) VALUES (
            NEW.company_id, v_client_id, v_article_id, NEW.machine_id,
            NEW.type, NEW.weight_kg, NEW.pieces, NEW.billing_order_id,
            NEW.created_at
        )
        ON CONFLICT (billing_order_id, type, COALESCE(machine_id, '00000000-0000-0000-0000-000000000000'::uuid), created_at)
        DO UPDATE SET
            weight_kg = EXCLUDED.weight_kg,
            pieces = EXCLUDED.pieces;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
