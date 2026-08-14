CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_pieces int;
  v_total_weight numeric(10,3);
BEGIN
  -- Se mudou para collected ou cancelled
  IF NEW.status IN ('collected', 'cancelled') AND OLD.status NOT IN ('collected', 'cancelled') THEN
    
    -- Se for coleta, garante a consolidação ANTES da limpeza (redundância de segurança)
    IF NEW.status = 'collected' THEN
        SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
        INTO v_total_pieces, v_total_weight
        FROM public.billing_order_pallets 
        WHERE billing_order_id = NEW.id;

        IF v_total_pieces > 0 OR v_total_weight > 0 THEN
            NEW.pieces_real := v_total_pieces;
            NEW.weight_real := v_total_weight;
            IF v_total_pieces > 0 THEN
                NEW.weight_avg := v_total_weight / v_total_pieces;
            END IF;
        END IF;
    END IF;

    -- Limpa paletes (se ainda existirem)
    DELETE FROM public.billing_order_pallets WHERE billing_order_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;