-- 1. Remover triggers que dependem da limpeza de paletes ou integração com estoque
DROP TRIGGER IF EXISTS tr_billing_order_status_change ON public.billing_orders;
DROP TRIGGER IF EXISTS trg_billing_order_status_change ON public.billing_orders;
DROP TRIGGER IF EXISTS tr_billing_order_status_integrity ON public.billing_orders;

-- 2. Atualizar a trigger handle_billing_order_status_change para ser puramente informativa
-- e não tentar mais limpar paletes ou consolidar pesos de tabelas externas.
CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Garante timestamp de coleta
  IF NEW.status = 'collected' AND OLD.status != 'collected' THEN
    IF NEW.collected_at IS NULL THEN
        NEW.collected_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER tr_billing_order_status_change
BEFORE UPDATE ON public.billing_orders
FOR EACH ROW EXECUTE FUNCTION public.handle_billing_order_status_change();

-- 3. Recriar RPC de coleta simplificada (sem limpeza de paletes)
CREATE OR REPLACE FUNCTION public.collect_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.billing_orders%ROWTYPE;
BEGIN
  -- 1. Bloqueio e Verificação
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada'; END IF;
  
  IF v_row.status = 'collected' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  -- 2. Update status imediato
  UPDATE public.billing_orders SET
    status = 'collected', 
    collected_by = auth.uid(), 
    collected_at = now(), 
    updated_at = now()
  WHERE id = p_id;

  -- 3. Auditoria
  PERFORM public._of_audit(
    p_company_id, 
    p_id, 
    'collect', 
    p_author_name, 
    p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'pieces', v_row.pieces_real, 'weight', v_row.weight_real)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. Recriar RPC de cancelamento simplificada (sem estorno de estoque manual/global)
CREATE OR REPLACE FUNCTION public.cancel_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_reason text,
  p_expected_status text DEFAULT NULL,
  p_reversal_quality text DEFAULT 'first',
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.billing_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  
  IF v_row.status = 'cancelled' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  
  IF p_expected_status IS NOT NULL AND v_row.status::text != p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancellation_reason = p_reason,
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_audit(
    p_company_id,
    p_id,
    'cancel',
    p_author_name,
    p_author_code,
    jsonb_build_object('of', v_row.of_number, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
