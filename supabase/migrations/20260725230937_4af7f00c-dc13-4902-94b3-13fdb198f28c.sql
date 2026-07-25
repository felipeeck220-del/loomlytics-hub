CREATE OR REPLACE FUNCTION public.create_billing_order(
  p_company_id uuid,
  p_payload jsonb,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_of text := NULLIF(BTRIM(COALESCE(p_payload->>'of_number','')), '');
  v_existing uuid;
  v_next int;
  v_new_id uuid;
  v_order_type text := COALESCE(NULLIF(p_payload->>'order_type',''), 'pieces');
  v_profile_id uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_payload->>'client_id' IS NULL OR p_payload->>'article_id' IS NULL OR p_payload->>'dyehouse' IS NULL THEN
    RAISE EXCEPTION 'Campos obrigatórios ausentes';
  END IF;

  SELECT id INTO v_profile_id
    FROM public.profiles
   WHERE user_id = auth.uid() AND company_id = p_company_id
   LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil do usuário não encontrado nesta empresa' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('billing_order_of_number:' || p_company_id::text, 0));

  IF v_of IS NULL THEN
    SELECT COALESCE(MAX(CASE WHEN of_number ~ '^\d+$' THEN of_number::int END), 0) + 1
      INTO v_next
      FROM public.billing_orders
     WHERE company_id = p_company_id;
    v_of := lpad(v_next::text, 3, '0');
  ELSE
    SELECT id INTO v_existing FROM public.billing_orders
      WHERE company_id = p_company_id AND of_number = v_of LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number', 'existing_id', v_existing);
    END IF;
  END IF;

  INSERT INTO public.billing_orders (
    company_id, of_number, client_id, article_id, machine_id,
    pieces_expected, weight_expected, piece_weight_target, dyehouse,
    order_type, admin_notes, status, created_by
  ) VALUES (
    p_company_id, v_of,
    (p_payload->>'client_id')::uuid,
    (p_payload->>'article_id')::uuid,
    NULLIF(p_payload->>'machine_id','')::uuid,
    NULLIF(p_payload->>'pieces_expected','')::int,
    NULLIF(p_payload->>'weight_expected','')::numeric,
    NULLIF(p_payload->>'piece_weight_target','')::numeric,
    p_payload->>'dyehouse',
    v_order_type,
    NULLIF(p_payload->>'admin_notes',''),
    'open',
    v_profile_id
  ) RETURNING id INTO v_new_id;

  PERFORM public._of_audit(p_company_id, 'billing_order_create',
    jsonb_build_object('of', v_of, 'id', v_new_id), p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true, 'id', v_new_id, 'of_number', v_of);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid,jsonb,text,text) TO anon, authenticated, service_role;