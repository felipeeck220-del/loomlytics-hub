
-- 1. Mover a OF #547 para cancelada manualmente
DO $$
DECLARE
  v_order_id uuid;
  v_company_id uuid;
  v_of_number text := '547';
BEGIN
  -- Localizar a OF
  SELECT id, company_id INTO v_order_id, v_company_id
  FROM public.billing_orders
  WHERE of_number = v_of_number
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    -- Atualizar status para cancelado
    UPDATE public.billing_orders
    SET 
      status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'Cancelamento manual via sandbox (usuário reportou falha no botão)',
      updated_at = now()
    WHERE id = v_order_id;

    -- Estornar estoque (release)
    INSERT INTO public.stock_movements (
      company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, billing_order_id
    )
    SELECT 
      company_id, article_id, client_id, machine_id, 'release', pieces, weight_kg, 
      'Cancelamento manual OF #' || v_of_number,
      v_order_id
    FROM public.stock_movements
    WHERE billing_order_id = v_order_id AND type = 'reserve';

    -- Registrar auditoria
    INSERT INTO public.audit_logs (company_id, action, details, user_name, user_code)
    VALUES (
      v_company_id,
      'of_cancelled',
      jsonb_build_object(
        'id', v_order_id,
        'of_number', v_of_number,
        'reason', 'Cancelamento manual via sandbox'
      ),
      'System AI',
      '0'
    );
  END IF;
END $$;

-- 2. Recriar cancel_billing_order com SECURITY DEFINER e tratamento de erros
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
SET search_path = public, pg_catalog, auth
AS $$
DECLARE
  v_row public.billing_orders%ROWTYPE;
  v_auth_uid uuid := auth.uid();
  v_actual_author_name text := p_author_name;
  v_actual_author_code text := p_author_code;
BEGIN
  -- Lock row and validate
  SELECT * INTO v_row FROM public.billing_orders
  WHERE id = p_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Metadata fallback
  IF (v_actual_author_name IS NULL OR v_actual_author_code IS NULL) AND v_auth_uid IS NOT NULL THEN
    SELECT name, code::text INTO v_actual_author_name, v_actual_author_code
    FROM public.profiles
    WHERE user_id = v_auth_uid
    LIMIT 1;
  END IF;

  -- Execute cancellation
  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancelled_by = COALESCE(v_auth_uid, cancelled_by),
    cancelled_at = now(),
    cancellation_reason = p_reason,
    reverted_from = v_row.status::text,
    priority = false,
    updated_at = now()
  WHERE id = p_id;

  -- Global Stock Reversal
  INSERT INTO public.stock_movements (
    company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, billing_order_id
  )
  SELECT 
    company_id, article_id, client_id, machine_id, 'release', pieces, weight_kg, 
    'Cancelamento OF #' || v_row.of_number || ': ' || p_reason,
    COALESCE(v_auth_uid, created_by), p_id
  FROM public.stock_movements
  WHERE billing_order_id = p_id AND type = 'reserve';

  -- Audit log
  INSERT INTO public.audit_logs (company_id, action, details, user_name, user_code)
  VALUES (
    p_company_id,
    'of_cancelled',
    jsonb_build_object(
      'id', p_id,
      'of_number', v_row.of_number,
      'reason', p_reason,
      'author', COALESCE(v_actual_author_name, 'System')
    ),
    COALESCE(v_actual_author_name, 'System'),
    COALESCE(v_actual_author_code, '0')
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO authenticated, service_role, anon;
