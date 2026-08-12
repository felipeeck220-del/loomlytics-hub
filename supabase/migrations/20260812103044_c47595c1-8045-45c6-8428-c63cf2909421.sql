
-- PENTE FINO E ESTABILIZAÇÃO DEFINITIVA DE ORDEM DE FATURAMENTO (OF)
-- Garantindo assinaturas de 6 argumentos e consolidação de dados na coleta.

-- 1. Assegurar trigger de consolidação robusta
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
  -- Ao coletar, consolidamos paletes no cabeçalho antes de qualquer limpeza
  IF NEW.status = 'collected' AND OLD.status = 'ready' THEN
    SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
    INTO v_pieces, v_weight
    FROM public.billing_order_pallets
    WHERE billing_order_id = NEW.id;

    -- Só sobrescrevemos se os paletes tiverem dados (preservando o que veio da separação se estiver vazio)
    IF v_pieces > 0 OR v_weight > 0 THEN
      NEW.pieces_real := v_pieces;
      NEW.weight_real := v_weight;
      IF v_pieces > 0 THEN
        NEW.weight_avg := v_weight / v_pieces;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Refatoração de set_billing_order_delivery_doc (Corrigindo erro de 5 argumentos)
CREATE OR REPLACE FUNCTION public.set_billing_order_delivery_doc(
  p_company_id uuid,
  p_id uuid,
  p_doc_type text,
  p_doc_number text,
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
  
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  
  -- Já tem doc?
  IF v_row.delivery_doc_number IS NOT NULL AND v_row.delivery_doc_number <> p_doc_number THEN
    RETURN jsonb_build_object('ok', false, 'already', true, 'conflict', jsonb_build_object('current_number', v_row.delivery_doc_number));
  END IF;

  UPDATE public.billing_orders SET
    delivery_doc_type = p_doc_type::text,
    delivery_doc_number = p_doc_number,
    delivery_doc_set_by = auth.uid(),
    delivery_doc_set_at = now(),
    updated_at = now()
  WHERE id = p_id;

  -- Auditoria de 6 argumentos
  PERFORM public._of_audit(
    p_company_id,
    p_id,
    'billing_order_set_doc',
    p_author_name,
    p_author_code,
    jsonb_build_object('type', p_doc_type, 'number', p_doc_number, 'of', v_row.of_number)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. Refatoração de set_billing_order_priority (Corrigindo assinatura)
CREATE OR REPLACE FUNCTION public.set_billing_order_priority(
  p_company_id uuid,
  p_id uuid,
  p_priority boolean,
  p_reason text DEFAULT NULL,
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
  
  UPDATE public.billing_orders SET
    priority = p_priority,
    priority_reason = p_reason,
    priority_at = CASE WHEN p_priority THEN now() ELSE NULL END,
    priority_by = CASE WHEN p_priority THEN auth.uid() ELSE NULL END,
    updated_at = now()
  WHERE id = p_id;

  -- Auditoria de 6 argumentos
  PERFORM public._of_audit(
    p_company_id,
    p_id,
    'billing_order_set_priority',
    p_author_name,
    p_author_code,
    jsonb_build_object('priority', p_priority, 'reason', p_reason, 'of', v_row.of_number)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Garantindo Grants
GRANT EXECUTE ON FUNCTION public.set_billing_order_delivery_doc TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_billing_order_priority TO authenticated, service_role;
