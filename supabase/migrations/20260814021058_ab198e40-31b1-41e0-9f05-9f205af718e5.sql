-- 1. Limpeza total de RPCs legadas que continham lógica de estoque complexa
DROP FUNCTION IF EXISTS public.start_billing_order_separation(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.launch_billing_order_ready(uuid, uuid, integer, numeric, text, text);
DROP FUNCTION IF EXISTS public.revert_billing_order_to_open(uuid, uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.link_billing_orders(uuid, uuid[], text, text);

-- 2. start_billing_order_separation Simplificada
CREATE OR REPLACE FUNCTION public.start_billing_order_separation(
  p_company_id uuid, 
  p_id uuid,
  p_author_name text DEFAULT NULL, 
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF not found'; END IF;
  IF v_row.status <> 'open' AND v_row.status <> 'priority' THEN 
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_status', v_row.status); 
  END IF;

  UPDATE public.billing_orders SET 
    status = 'separating', 
    separation_started_by = v_pid, 
    separation_started_at = now(), 
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_start_separation', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number));
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 3. launch_billing_order_ready Simplificada
CREATE OR REPLACE FUNCTION public.launch_billing_order_ready(
  p_company_id uuid, 
  p_id uuid,
  p_pieces_real int DEFAULT NULL, 
  p_weight_real numeric DEFAULT NULL,
  p_author_name text DEFAULT NULL, 
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_sum_p int; v_sum_w numeric; v_pallet_count int;
  v_pieces int; v_weight numeric;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF not found'; END IF;
  IF v_row.status = 'ready' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  
  -- Consolida dos paletes se existirem
  SELECT COUNT(*), COALESCE(SUM(pieces),0), COALESCE(SUM(weight_kg),0)
    INTO v_pallet_count, v_sum_p, v_sum_w
    FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  IF v_pallet_count > 0 THEN
    v_pieces := v_sum_p; v_weight := v_sum_w;
  ELSE
    v_pieces := COALESCE(p_pieces_real, v_row.pieces_expected, 0);
    v_weight := COALESCE(p_weight_real, v_row.weight_expected, 0);
  END IF;

  UPDATE public.billing_orders SET 
    status = 'ready', 
    pieces_real = v_pieces, 
    weight_real = v_weight,
    weight_avg = CASE WHEN v_pieces > 0 THEN v_weight / v_pieces ELSE 0 END,
    separation_finished_by = v_pid, 
    separation_finished_at = now(),
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_ready', p_author_name, p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'pieces', v_pieces, 'weight', v_weight, 'pallets', v_pallet_count));
    
  RETURN jsonb_build_object('ok', true, 'pieces_real', v_pieces, 'weight_real', v_weight);
END; $$;

-- 4. Revert to open Simplificada
CREATE OR REPLACE FUNCTION public.revert_billing_order_to_open(
  p_company_id uuid, 
  p_id uuid,
  p_reason text DEFAULT NULL,
  p_expected_status text DEFAULT NULL,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF not found'; END IF;
  
  -- Limpa paletes
  DELETE FROM public.billing_order_pallets WHERE billing_order_id = p_id;
  
  -- Limpa dados reais e volta status
  UPDATE public.billing_orders SET
    status = 'open',
    pieces_real = NULL,
    weight_real = NULL,
    weight_avg = NULL,
    separation_started_by = NULL,
    separation_started_at = NULL,
    separation_finished_by = NULL,
    separation_finished_at = NULL,
    delivery_doc_type = NULL,
    delivery_doc_number = NULL,
    delivery_doc_set_by = NULL,
    delivery_doc_set_at = NULL,
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_revert_open', p_author_name, p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true);
END; $$