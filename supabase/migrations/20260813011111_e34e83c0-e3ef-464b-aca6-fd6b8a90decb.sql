-- Estabilização da Consolidação de Dados na Coleta (OF)
-- Este script garante que a trigger de consolidação de peças/peso ocorra ANTES do update de status,
-- evitando que os dados se percam quando os paletes são deletados.

-- 1. Recriar a função da trigger com lógica de consolidação robusta
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
  -- Ao coletar, consolidamos paletes no cabeçalho antes de qualquer limpeza.
  -- Usamos BEFORE UPDATE para que as alterações em NEW sejam persistidas.
  IF NEW.status = 'collected' AND OLD.status != 'collected' THEN
    
    -- Tenta consolidar a partir dos paletes
    SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
    INTO v_pieces, v_weight
    FROM public.billing_order_pallets
    WHERE billing_order_id = NEW.id;

    -- Prioridade de consolidação:
    -- 1. Se houver paletes com dados, eles são a fonte da verdade.
    -- 2. Se não houver paletes, mantém o que já está no NEW (pode ter vindo da separação manual).
    -- 3. Se ainda assim estiver zerado, tenta fallback para o OLD ou expected.
    
    IF v_pieces > 0 OR v_weight > 0 THEN
      NEW.pieces_real := v_pieces;
      NEW.weight_real := v_weight;
    ELSIF COALESCE(NEW.pieces_real, 0) = 0 AND COALESCE(NEW.weight_real, 0) = 0 THEN
      NEW.pieces_real := COALESCE(OLD.pieces_real, OLD.pieces_expected, 0);
      NEW.weight_real := COALESCE(OLD.weight_real, OLD.weight_expected, 0);
    END IF;

    -- Cálculo da média
    IF COALESCE(NEW.pieces_real, 0) > 0 THEN
      NEW.weight_avg := NEW.weight_real / NEW.pieces_real;
    END IF;

    -- Limpeza de paletes e estorno de reservas (Auto-limpeza)
    -- Isso agora acontece dentro da trigger para garantir atomicidade.
    DELETE FROM public.billing_order_pallets WHERE billing_order_id = NEW.id;
    
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

-- 2. Garantir que a trigger esteja anexada corretamente como BEFORE UPDATE
DROP TRIGGER IF EXISTS trg_billing_order_status_change ON public.billing_orders;
CREATE TRIGGER trg_billing_order_status_change
BEFORE UPDATE OF status ON public.billing_orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_billing_order_status_change();

-- 3. Ajustar a RPC collect_billing_order para não deletar os paletes nela (deixar para a trigger)
-- Isso evita condições de corrida onde os paletes são deletados antes da trigger consolidar.
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

    -- O update de status disparará a trigger handle_billing_order_status_change (BEFORE UPDATE)
    UPDATE public.billing_orders SET
        status = 'collected',
        collected_by = auth.uid(),
        collected_at = now(),
        updated_at = now()
    WHERE id = p_id;

    -- Auditoria canônica de 6 argumentos
    -- Pegamos os dados ATUALIZADOS da tabela após o update (trigger já rodou)
    SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id;

    PERFORM public._of_audit(
        p_company_id,
        p_id,
        'billing_order_collected',
        p_author_name,
        p_author_code,
        jsonb_build_object(
            'of', v_row.of_number,
            'prev_status', v_row.status,
            'pieces', v_row.pieces_real,
            'weight', v_row.weight_real
        )
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;