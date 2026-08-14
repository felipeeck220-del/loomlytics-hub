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
  v_pid uuid;
BEGIN
  -- Obter Profile ID (seguro para SECURITY DEFINER)
  v_pid := public._of_current_profile_id(p_company_id);
  
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  
  IF v_row.status = 'cancelled' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  
  IF p_expected_status IS NOT NULL AND v_row.status::text != p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancellation_reason = p_reason,
    cancelled_by = v_pid,
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