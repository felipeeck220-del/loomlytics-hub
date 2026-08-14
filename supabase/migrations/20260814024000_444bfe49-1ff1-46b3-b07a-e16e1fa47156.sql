
CREATE OR REPLACE FUNCTION public.link_billing_orders(
  p_company_id uuid,
  p_ids uuid[],
  p_author_name text,
  p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_group_id uuid;
  v_count int;
  v_existing_group uuid;
BEGIN
  -- 1. Validação de segurança
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Selecione pelo menos 2 OFs para atrelar.';
  END IF;

  -- 2. Verifica se alguma das OFs já pertence a um grupo
  SELECT link_group_id INTO v_existing_group
    FROM public.billing_orders
   WHERE id = ANY(p_ids) AND company_id = p_company_id AND link_group_id IS NOT NULL
   LIMIT 1;

  -- 3. Define o ID do grupo (usa o existente ou gera novo)
  v_group_id := COALESCE(v_existing_group, gen_random_uuid());

  -- 4. Atualiza todas as OFs para o mesmo grupo
  UPDATE public.billing_orders
     SET link_group_id = v_group_id, updated_at = now()
   WHERE id = ANY(p_ids) AND company_id = p_company_id;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 5. Auditoria de 6 argumentos
  PERFORM public._of_audit(
    p_company_id,
    v_group_id,
    'billing_order_link_group',
    p_author_name,
    p_author_code,
    jsonb_build_object('group_id', v_group_id, 'ids', p_ids, 'count', v_count)
  );

  RETURN jsonb_build_object('ok', true, 'group_id', v_group_id, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_billing_orders(uuid, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_billing_orders(uuid, uuid[], text, text) TO service_role;
