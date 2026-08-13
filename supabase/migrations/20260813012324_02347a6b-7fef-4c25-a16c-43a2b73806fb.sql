
-- 1. Desativar temporariamente a trigger problemática
DROP TRIGGER IF EXISTS trg_billing_order_status_change ON public.billing_orders;

-- 2. Consertar as OFs presas manualmente (já que a trigger não vai rodar agora)
DO $$
DECLARE
    v_id uuid;
    v_pieces int;
    v_weight numeric;
BEGIN
    FOR v_id IN (SELECT id FROM public.billing_orders WHERE of_number IN ('612', '611')) LOOP
        -- Consolidar dados dos paletes antes de deletar
        SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
        INTO v_pieces, v_weight
        FROM public.billing_order_pallets
        WHERE billing_order_id = v_id;

        UPDATE public.billing_orders SET
            status = 'collected',
            pieces_real = CASE WHEN v_pieces > 0 THEN v_pieces ELSE pieces_real END,
            weight_real = CASE WHEN v_weight > 0 THEN v_weight ELSE weight_real END,
            collected_at = COALESCE(collected_at, now()),
            updated_at = now()
        WHERE id = v_id;

        -- Limpeza atômica
        DELETE FROM public.billing_order_pallets WHERE billing_order_id = v_id;
        DELETE FROM public.stock_movements WHERE billing_order_id = v_id AND type = 'reserve';
    END LOOP;
END $$;

-- 3. Recriar a trigger como BEFORE UPDATE, mas simplificada para evitar recursão
-- A falha anterior ocorreu porque a trigger BEFORE UPDATE tentava fazer coisas que conflitavam com a transação atual.
CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pieces int;
  v_weight numeric;
BEGIN
  -- Ao coletar, consolidamos paletes no cabeçalho.
  IF NEW.status = 'collected' AND OLD.status != 'collected' THEN
    
    -- Tenta consolidar a partir dos paletes
    SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
    INTO v_pieces, v_weight
    FROM public.billing_order_pallets
    WHERE billing_order_id = NEW.id;
    
    IF v_pieces > 0 OR v_weight > 0 THEN
      NEW.pieces_real := v_pieces;
      NEW.weight_real := v_weight;
    ELSIF COALESCE(NEW.pieces_real, 0) = 0 AND COALESCE(NEW.weight_real, 0) = 0 THEN
      NEW.pieces_real := COALESCE(OLD.pieces_real, OLD.pieces_expected, 0);
      NEW.weight_real := COALESCE(OLD.weight_real, OLD.weight_expected, 0);
    END IF;

    IF COALESCE(NEW.pieces_real, 0) > 0 THEN
      NEW.weight_avg := NEW.weight_real / NEW.pieces_real;
    END IF;

    -- NÃO FAÇA DELETE AQUI se estiver causando recursão. 
    -- Vamos delegar a limpeza para a RPC collect_billing_order para ser mais seguro.
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_billing_order_status_change
BEFORE UPDATE OF status ON public.billing_orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_billing_order_status_change();

-- 4. Ajustar a RPC collect_billing_order para fazer a limpeza explicitamente APÓS o update
CREATE OR REPLACE FUNCTION public.collect_billing_order(
    p_company_id uuid,
    p_id uuid,
    p_author_name text DEFAULT NULL,
    p_author_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller uuid := public.get_user_company_id();
    v_row public.billing_orders%ROWTYPE;
BEGIN
    IF v_caller IS NULL OR v_caller <> p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
    
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('ok', false, 'error', 'not_found'); 
    END IF;
    
    IF v_row.status = 'collected' THEN
        RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;

    -- O update de status disparará a trigger (consolidação)
    UPDATE public.billing_orders SET
        status = 'collected',
        collected_by = auth.uid(),
        collected_at = now(),
        updated_at = now()
    WHERE id = p_id;

    -- Limpeza explícita dos paletes e reservas APÓS a consolidação ter sido feita pela trigger
    DELETE FROM public.billing_order_pallets WHERE billing_order_id = p_id;
    
    INSERT INTO public.stock_movements (
        company_id, type, article_id, client_id, machine_id, 
        pieces, weight_kg, reason, created_by, billing_order_id
    )
    SELECT 
        company_id, 'release', article_id, client_id, machine_id, 
        pieces, weight_kg, 'Auto-limpeza na coleta', auth.uid(), p_id
    FROM public.stock_movements 
    WHERE billing_order_id = p_id AND type = 'reserve';

    DELETE FROM public.stock_movements WHERE billing_order_id = p_id AND type = 'reserve';

    -- Recarrega para auditoria
    SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id;

    PERFORM public._of_audit(
        p_company_id,
        p_id,
        'billing_order_collected',
        p_author_name,
        p_author_code,
        jsonb_build_object(
            'of', v_row.of_number,
            'pieces', v_row.pieces_real,
            'weight', v_row.weight_real
        )
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;
