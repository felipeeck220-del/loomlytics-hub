-- 1. Remover triggers que dependem da limpeza de paletes ou integração com estoque
DROP TRIGGER IF EXISTS tr_billing_order_status_change ON public.billing_orders;
DROP TRIGGER IF EXISTS trg_billing_order_status_change ON public.billing_orders;

-- 2. Atualizar a trigger handle_billing_order_status_change para ser puramente informativa
-- e não tentar mais limpar paletes ou consolidar pesos de tabelas externas,
-- já que agora a OF é a fonte da verdade para o que foi faturado.
CREATE OR REPLACE FUNCTION public.handle_billing_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS \$function\$
BEGIN
  -- Garante timestamp de coleta
  IF NEW.status = 'collected' AND OLD.status != 'collected' THEN
    IF NEW.collected_at IS NULL THEN
        NEW.collected_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
\$function\$;

CREATE TRIGGER tr_billing_order_status_change
BEFORE UPDATE ON public.billing_orders
FOR EACH ROW EXECUTE FUNCTION public.handle_billing_order_status_change();

-- 3. Recriar RPC de coleta simplificada (sem limpeza de paletes e sem auditoria pesada de estoque)
CREATE OR REPLACE FUNCTION public.collect_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS \$\$
DECLARE
  v_row public.billing_orders%ROWTYPE;
BEGIN
  -- 1. Bloqueio e Verificação
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada'; END IF;
  
  IF v_row.status = 'collected' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  -- 2. Update status imediato (sem cálculos extras de paletes)
  UPDATE public.billing_orders SET
    status = 'collected', 
    collected_by = auth.uid(), 
    collected_at = now(), 
    updated_at = now()
  WHERE id = p_id;

  -- 3. Auditoria canônica
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
\$\$;
