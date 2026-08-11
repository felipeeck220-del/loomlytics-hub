CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Se a OF foi marcada como coletada, consolidamos os dados dos paletes antes de deletá-los
    IF NEW.status = 'collected' AND OLD.status != 'collected' THEN
        -- 1. Consolidar Peso e Peças dos paletes no cabeçalho da OF
        -- (Evita que a aba Coletadas mostre zeros após a limpeza dos paletes)
        SELECT 
            COALESCE(SUM(pieces), 0), 
            COALESCE(SUM(weight_kg), 0)
        INTO 
            NEW.pieces_real, 
            NEW.weight_real
        FROM public.billing_order_pallets 
        WHERE billing_order_id = NEW.id;

        -- 2. Se a OF não tinha paletes mas tinha valores reais informados, mantém os valores (já estão no NEW)
        -- Caso contrário, se a OF era por peso/unidade sem paletes explícitos, garantimos o fallback
        IF NEW.pieces_real = 0 AND NEW.weight_real = 0 THEN
            NEW.pieces_real := COALESCE(OLD.pieces_real, OLD.pieces_expected, 0);
            NEW.weight_real := COALESCE(OLD.weight_real, OLD.weight_expected, 0);
        END IF;

        -- 3. Remove registros de separação (paletes)
        DELETE FROM public.billing_order_pallets WHERE billing_order_id = NEW.id;
        
        -- 4. Garante que nenhuma reserva fique pendente após a coleta
        INSERT INTO public.stock_movements (
            company_id, type, article_id, client_id, machine_id, 
            pieces, weight_kg, reason, created_by, billing_order_id
        )
        SELECT 
            company_id, 'release', article_id, client_id, machine_id, 
            pieces, weight_kg, 'Auto-limpeza na coleta', NEW.collected_by, NEW.id
        FROM public.stock_movements 
        WHERE billing_order_id = NEW.id AND type = 'reserve';
    END IF;
    RETURN NEW;
END;
$function$;