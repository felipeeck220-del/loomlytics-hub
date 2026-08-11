-- Migration to fix cancel_billing_order argument count mismatch and multi-tenant issues
-- This version exactly matches the 7 arguments being passed in useBillingOrders.ts

CREATE OR REPLACE FUNCTION public.cancel_billing_order(
  p_company_id uuid, 
  p_id uuid, 
  p_reason text, 
  p_expected_status text DEFAULT NULL::text, 
  p_reversal_quality text DEFAULT 'first'::text, 
  p_author_name text DEFAULT NULL::text, 
  p_author_code text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.billing_orders%ROWTYPE;
  v_is_second boolean := (COALESCE(p_reversal_quality,'first') = 'second');
  v_reason_str text;
  v_auth_uid uuid := auth.uid();
  v_actual_author_name text := p_author_name;
  v_actual_author_code text := p_author_code;
  v_profile_company_id uuid;
BEGIN
  -- Security check: ensure the authenticated user belongs to the company
  -- or has administrative privileges.
  SELECT company_id INTO v_profile_company_id 
  FROM public.profiles 
  WHERE user_id = v_auth_uid 
  LIMIT 1;

  IF v_profile_company_id IS NULL OR v_profile_company_id <> p_company_id THEN
    -- Fallback for service_role or admin bypassing multi-tenant check (if auth.uid() is null)
    IF v_auth_uid IS NOT NULL THEN
       RETURN jsonb_build_object('ok', false, 'error', 'unauthorized_company');
    END IF;
  END IF;

  -- If author info not provided, try to fetch from profile
  IF v_actual_author_name IS NULL OR v_actual_author_code IS NULL THEN
    SELECT name, code::text INTO v_actual_author_name, v_actual_author_code 
    FROM public.profiles 
    WHERE user_id = v_auth_uid 
    LIMIT 1;
  END IF;

  -- Select the row and lock it for update
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.billing_orders WHERE id = p_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'wrong_company_order');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  
  -- If already cancelled, just return success
  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  
  -- Check for status conflict
  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  -- Update the billing order
  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancelled_by = COALESCE(v_auth_uid, cancelled_by), 
    cancelled_at = now(),
    cancellation_reason = p_reason,
    reverted_from = v_row.status::text,
    reversed_by   = CASE WHEN v_row.status = 'collected' THEN COALESCE(v_auth_uid, reversed_by) ELSE reversed_by END,
    reversed_at   = CASE WHEN v_row.status = 'collected' THEN now()      ELSE reversed_at END,
    reversal_reason  = CASE WHEN v_row.status = 'collected' THEN p_reason ELSE reversal_reason END,
    reversal_quality = CASE WHEN v_row.status = 'collected' THEN COALESCE(p_reversal_quality,'first') ELSE reversal_quality END,
    priority = false, 
    priority_reason = NULL, 
    priority_at = NULL, 
    priority_by = NULL,
    updated_at = now()
  WHERE id = p_id;

  -- Record audit log
  PERFORM public._of_audit(
    p_company_id, 
    'of_cancelled', 
    jsonb_build_object(
      'id', p_id,
      'of_number', v_row.of_number,
      'from_status', v_row.status, 
      'reason', p_reason
    ), 
    v_actual_author_name, 
    v_actual_author_code
  );

  -- Handle stock reversal
  IF v_row.status IN ('separating','ready') THEN
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'release', 
           GREATEST(0, SUM(pieces))::int, GREATEST(0, SUM(weight_kg)),
           'OF #' || v_row.of_number || ' cancelada (libera reserva)', v_auth_uid
      FROM public.stock_movements
     WHERE billing_order_id = p_id AND type = 'reserve'
     GROUP BY article_id, client_id, machine_id;

    PERFORM public._of_restore_own_stock_and_wipe_pallets(
      p_company_id, 
      p_id, 
      v_row.of_number,
      '(OF cancelada — devolve estoque próprio)', 
      v_auth_uid, 
      true
    );

  ELSIF v_row.status = 'collected' THEN
    v_reason_str := 'OF #' || v_row.of_number || ' estornada — '
                     || CASE WHEN v_is_second THEN '2ª QUALIDADE' ELSE '1ª qualidade' END
                     || ' — ' || COALESCE(p_reason,'sem motivo');

    INSERT INTO public.own_stock_movements
      (company_id, own_article_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, own_article_id, 'in', pieces, weight_kg,
           'OF #' || v_row.of_number || ' estornada — devolve estoque próprio (Palete ' || pallet_number || ')',
           v_auth_uid
    FROM public.billing_order_pallets
    WHERE billing_order_id = p_id AND own_article_id IS NOT NULL;

    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type,
       pieces, weight_kg, is_second_quality, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'in',
           GREATEST(0, ROUND(SUM(pieces)))::int, GREATEST(0, SUM(weight_kg)),
           v_is_second, v_reason_str, v_auth_uid
      FROM public.billing_order_pallets
     WHERE billing_order_id = p_id AND own_article_id IS NULL
     GROUP BY article_id, client_id, machine_id;

    DELETE FROM public.billing_order_pallets WHERE billing_order_id = p_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO service_role;
