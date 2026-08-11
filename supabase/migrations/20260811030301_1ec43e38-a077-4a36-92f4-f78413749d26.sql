
DROP FUNCTION IF EXISTS public.cancel_billing_order(uuid, uuid, text, public.billing_order_status, text, text, text);
DROP FUNCTION IF EXISTS public.cancel_billing_order(uuid, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.cancel_billing_order(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.cancel_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_reason text,
  p_expected_status public.billing_order_status DEFAULT NULL,
  p_reversal_quality text DEFAULT 'first',
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_of public.billing_orders;
  v_pallet RECORD;
  v_action text;
BEGIN
  -- 1. Lock and Verify
  SELECT * INTO v_of
  FROM public.billing_orders
  WHERE id = p_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_expected_status IS NOT NULL AND v_of.status != p_expected_status THEN
    RETURN json_build_object('ok', false, 'error', 'conflict', 'current_status', v_of.status);
  END IF;

  IF v_of.status = 'collected' THEN
    v_action := 'estorno';
  ELSEIF v_of.status = 'cancelled' THEN
    RETURN json_build_object('ok', true, 'already', true);
  ELSE
    v_action := 'cancelamento';
  END IF;

  -- 2. Process Pallets and Stock Rollback
  FOR v_pallet IN (SELECT * FROM public.billing_order_pallets WHERE billing_order_id = p_id) LOOP
    IF v_pallet.own_stock_movement_id IS NOT NULL THEN
      INSERT INTO public.own_stock_movements (
        company_id, own_article_id, type, pieces, weight_kg, reason, created_by
      ) VALUES (
        p_company_id, 
        v_pallet.own_article_id, 
        'in', 
        v_pallet.pieces, 
        v_pallet.weight_kg, 
        'Estorno ' || v_action || ' OF #' || v_of.of_number,
        (SELECT id FROM public.profiles WHERE code::text = p_author_code LIMIT 1)
      );
    ELSEIF v_pallet.reserve_movement_id IS NOT NULL THEN
      INSERT INTO public.stock_movements (
        company_id, client_id, article_id, machine_id, billing_order_id, 
        type, pieces, weight_kg, is_second_quality, reason, created_by
      ) VALUES (
        p_company_id,
        COALESCE(v_pallet.alt_client_id, v_of.client_id),
        COALESCE(v_pallet.alt_article_id, v_of.article_id),
        v_pallet.machine_id,
        p_id,
        'release',
        v_pallet.pieces,
        v_pallet.weight_kg,
        (p_reversal_quality = 'second'),
        'Estorno ' || v_action || ' OF #' || v_of.of_number,
        (SELECT id FROM public.profiles WHERE code::text = p_author_code LIMIT 1)
      );
    END IF;
  END LOOP;

  INSERT INTO public.stock_movements (
    company_id, client_id, article_id, machine_id, billing_order_id, 
    type, pieces, weight_kg, is_second_quality, reason, created_by
  )
  SELECT 
    p_company_id, client_id, article_id, machine_id, billing_order_id,
    'release', pieces, weight_kg, is_second_quality,
    'Limpeza de reserva órfã (' || v_action || ' OF #' || v_of.of_number || ')',
    (SELECT id FROM public.profiles WHERE code::text = p_author_code LIMIT 1)
  FROM public.stock_movements
  WHERE billing_order_id = p_id 
    AND type = 'reserve'
    AND id NOT IN (SELECT reserve_movement_id FROM public.billing_order_pallets WHERE billing_order_id = p_id AND reserve_movement_id IS NOT NULL);

  -- 4. Delete Pallets
  DELETE FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  -- 5. Update OF Status
  UPDATE public.billing_orders
  SET 
    status = 'cancelled',
    cancellation_reason = p_reason,
    cancelled_by = (SELECT id FROM public.profiles WHERE code::text = p_author_code LIMIT 1),
    cancelled_at = now(),
    updated_at = now(),
    pieces_real = 0,
    weight_real = 0,
    weight_avg = 0
  WHERE id = p_id;

  -- 6. Audit
  PERFORM public._of_audit(
    p_company_id, p_id, v_action, p_author_name, p_author_code, 
    jsonb_build_object('reason', p_reason, 'prev_status', v_of.status)
  );

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_billing_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order TO service_role;
