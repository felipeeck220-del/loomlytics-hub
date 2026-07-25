CREATE OR REPLACE FUNCTION public.set_billing_order_delivery_doc(
  p_company_id uuid,
  p_id uuid,
  p_doc_type text,
  p_doc_number text,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_trim text := NULLIF(BTRIM(COALESCE(p_doc_number,'')), '');
  v_profile_id uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF v_trim IS NULL THEN
    RAISE EXCEPTION 'Informe o número do documento';
  END IF;
  IF p_doc_type NOT IN ('nf','romaneio') THEN
    RAISE EXCEPTION 'Tipo de documento inválido';
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles
   WHERE user_id = auth.uid() AND company_id = p_company_id LIMIT 1;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_ready', 'current_status', v_row.status);
  END IF;
  IF v_row.delivery_doc_number IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'conflict', jsonb_build_object(
      'current_number', v_row.delivery_doc_number, 'current_type', v_row.delivery_doc_type));
  END IF;

  UPDATE public.billing_orders
     SET delivery_doc_type = p_doc_type::public.billing_delivery_doc_type,
         delivery_doc_number = v_trim,
         delivery_doc_set_by = v_profile_id,
         delivery_doc_set_at = now(),
         updated_at = now()
   WHERE id = p_id AND status='ready' AND delivery_doc_number IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_set_doc',
    jsonb_build_object('of', v_row.of_number, 'doc_type', p_doc_type, 'doc_number', v_trim),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_billing_order_delivery_doc(uuid,uuid,text,text,text,text) TO anon, authenticated, service_role;