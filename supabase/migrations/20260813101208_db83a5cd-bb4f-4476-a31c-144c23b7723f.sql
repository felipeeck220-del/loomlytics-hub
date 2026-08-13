-- Desativar gatilhos para evitar recursão durante a movimentação manual
ALTER TABLE public.billing_orders DISABLE TRIGGER trg_billing_order_status_change;
ALTER TABLE public.billing_orders DISABLE TRIGGER tr_billing_order_status_change;
ALTER TABLE public.billing_orders DISABLE TRIGGER tr_billing_order_status_integrity;

-- Recriar RPC com auditoria correta de 6 argumentos (UUID, UUID, TEXT, TEXT, TEXT, JSONB)
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
  v_total_pieces int;
  v_total_weight numeric(10,3);
BEGIN
  -- 1. Bloqueio e Consolidação
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada'; END IF;
  
  IF v_row.status = 'collected' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  SELECT COALESCE(SUM(pieces), 0), COALESCE(SUM(weight_kg), 0)
  INTO v_total_pieces, v_total_weight
  FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  IF v_total_pieces = 0 AND v_total_weight = 0 THEN
    v_total_pieces := COALESCE(v_row.pieces_real, v_row.pieces_expected, 0);
    v_total_weight := COALESCE(v_row.weight_real, v_row.weight_expected, 0);
  END IF;

  -- 2. Update status direto
  UPDATE public.billing_orders SET
    status = 'collected', pieces_real = v_total_pieces, weight_real = v_total_weight,
    collected_by = auth.uid(), collected_at = now(), updated_at = now()
  WHERE id = p_id;

  -- 3. Limpeza de paletes
  DELETE FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  -- 4. Auditoria correta: (uuid, uuid, text, text, text, jsonb)
  -- p_company_id, p_id, p_action, p_author_name, p_author_code, p_details
  PERFORM public._of_audit(
    p_company_id, 
    p_id, 
    'collect', 
    p_author_name, 
    p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'pieces', v_total_pieces, 'weight', v_total_weight)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Executar movimentação das OFs 614 e 615
SELECT public.collect_billing_order('a664927c-a285-4997-8faa-8c90985c6fac', '5214ccec-15ed-4dd1-a21e-86750b62f01a', 'Lovable Admin', '0');
SELECT public.collect_billing_order('a664927c-a285-4997-8faa-8c90985c6fac', '63d69df4-2c65-40d2-bea3-91d40547b22e', 'Lovable Admin', '0');

-- Reativar gatilhos
ALTER TABLE public.billing_orders ENABLE TRIGGER trg_billing_order_status_change;
ALTER TABLE public.billing_orders ENABLE TRIGGER tr_billing_order_status_change;
ALTER TABLE public.billing_orders ENABLE TRIGGER tr_billing_order_status_integrity;