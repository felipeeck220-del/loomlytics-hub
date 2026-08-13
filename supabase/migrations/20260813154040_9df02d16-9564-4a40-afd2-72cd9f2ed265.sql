CREATE OR REPLACE FUNCTION public.set_billing_order_delivery_doc(p_company_id uuid, p_id uuid, p_doc_type text, p_doc_number text, p_author_name text, p_author_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_user_id uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  
  -- Tenta pegar o ID do usuário de forma segura para o SECURITY DEFINER
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    SELECT id INTO v_user_id FROM public.profiles WHERE code::text = p_author_code LIMIT 1;
  END IF;

  UPDATE public.billing_orders SET
    delivery_doc_type = p_doc_type::public.billing_delivery_doc_type,
    delivery_doc_number = p_doc_number,
    delivery_doc_set_by = v_user_id,
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
    jsonb_build_object(
      'type', p_doc_type, 
      'number', p_doc_number, 
      'previous_number', v_row.delivery_doc_number,
      'of', v_row.of_number
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;