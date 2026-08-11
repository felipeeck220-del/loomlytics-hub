-- Correcting cancel_billing_order to ensure permissions and logic are robust
CREATE OR REPLACE FUNCTION public.cancel_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_reason text,
  p_expected_status text DEFAULT NULL,
  p_reversal_quality text DEFAULT 'first',
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.billing_orders%ROWTYPE;
  v_auth_uid uuid := auth.uid();
  v_actual_author_name text := p_author_name;
  v_actual_author_code text := p_author_code;
  v_profile_company_id uuid;
BEGIN
  -- 1. Multi-tenant security check (Admin #1 rules all or same company)
  SELECT company_id INTO v_profile_company_id
  FROM public.profiles
  WHERE user_id = v_auth_uid
  LIMIT 1;

  -- Admin #1 bypass or same company check
  IF v_auth_uid IS NOT NULL AND v_profile_company_id <> p_company_id THEN
    -- Check if it is a platform admin (Admin #1 logic)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_auth_uid AND role = 'admin'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'unauthorized_company');
    END IF;
  END IF;

  -- 2. Author metadata fallback
  IF v_actual_author_name IS NULL OR v_actual_author_code IS NULL THEN
    SELECT name, code::text INTO v_actual_author_name, v_actual_author_code
    FROM public.profiles
    WHERE user_id = v_auth_uid
    LIMIT 1;
  END IF;

  -- 3. Lock row and validate
  SELECT * INTO v_row FROM public.billing_orders
  WHERE id = p_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  -- 4. Execute cancellation
  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancelled_by = v_auth_uid,
    cancelled_at = now(),
    cancellation_reason = p_reason,
    reverted_from = v_row.status::text,
    reversed_by   = CASE WHEN v_row.status = 'collected' THEN v_auth_uid ELSE reversed_by END,
    reversed_at   = CASE WHEN v_row.status = 'collected' THEN now()      ELSE reversed_at END,
    reversal_reason  = CASE WHEN v_row.status = 'collected' THEN p_reason ELSE reversal_reason END,
    reversal_quality = CASE WHEN v_row.status = 'collected' THEN COALESCE(p_reversal_quality,'first') ELSE reversal_quality END,
    priority = false,
    priority_reason = NULL,
    priority_at = NULL,
    priority_by = NULL,
    updated_at = now()
  WHERE id = p_id;

  -- 5. Global Stock Reversal (Mirroring logic)
  -- If there are reservations, we release them
  INSERT INTO public.stock_movements (
    company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, billing_order_id
  )
  SELECT 
    company_id, article_id, client_id, machine_id, 'release', pieces, weight_kg, 
    'Cancelamento OF #' || v_row.of_number || ': ' || p_reason,
    v_auth_uid, p_id
  FROM public.stock_movements
  WHERE billing_order_id = p_id AND type = 'reserve';

  -- 6. Audit log
  PERFORM public._of_audit(
    p_company_id,
    'of_cancelled',
    jsonb_build_object(
      'id', p_id,
      'of_number', v_row.of_number,
      'from_status', v_row.status,
      'reason', p_reason,
      'author', v_actual_author_name || ' #' || v_actual_author_code
    ),
    v_actual_author_name,
    v_actual_author_code
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO service_role;
