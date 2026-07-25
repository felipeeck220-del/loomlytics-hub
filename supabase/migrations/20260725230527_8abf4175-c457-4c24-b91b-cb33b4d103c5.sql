CREATE OR REPLACE FUNCTION public.link_billing_orders(
  p_company_id uuid,
  p_ids uuid[],
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_group uuid;
  v_all uuid[];
  v_count int;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Selecione pelo menos 2 OFs para atrelar.';
  END IF;

  -- Escolhe o menor UUID (como texto) entre os grupos existentes dos alvos
  SELECT link_group_id INTO v_group
  FROM public.billing_orders
  WHERE company_id = p_company_id
    AND id = ANY(p_ids)
    AND link_group_id IS NOT NULL
  ORDER BY link_group_id::text ASC
  LIMIT 1;

  IF v_group IS NULL THEN
    v_group := gen_random_uuid();
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT id FROM (
      SELECT unnest(p_ids) AS id
      UNION
      SELECT id FROM public.billing_orders
       WHERE company_id = p_company_id
         AND link_group_id IN (
           SELECT DISTINCT link_group_id FROM public.billing_orders
            WHERE company_id = p_company_id AND id = ANY(p_ids) AND link_group_id IS NOT NULL
         )
    ) x
  ) INTO v_all;

  UPDATE public.billing_orders
     SET link_group_id = v_group, updated_at = now()
   WHERE company_id = p_company_id AND id = ANY(v_all);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public._of_audit(p_company_id, 'billing_order_link',
    jsonb_build_object('group_id', v_group, 'count', v_count, 'ids', to_jsonb(v_all)),
    p_author_name, p_author_code);

  RETURN jsonb_build_object('ok', true, 'group_id', v_group, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_billing_orders(uuid,uuid[],text,text) TO anon, authenticated, service_role;