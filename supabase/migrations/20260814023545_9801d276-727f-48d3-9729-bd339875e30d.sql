-- Refatorar collect_billing_order para garantir que collected_by use o ID do PROFILE e não o do USUÁRIO (auth.uid())
CREATE OR REPLACE FUNCTION public.collect_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.billing_orders%ROWTYPE;
  v_caller uuid := public.get_user_company_id();
  v_pid uuid;
BEGIN
  -- 1. Identificação do Tenant e Autorização
  IF v_caller IS NULL THEN
    v_caller := p_company_id;
  END IF;

  IF v_caller <> p_company_id THEN 
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso negado (tenant isolation)'); 
  END IF;

  -- 2. Obter o PROFILE ID (a constraint FK exige o ID da tabela public.profiles)
  -- Se p_author_code for fornecido, buscamos por ele, senão pelo auth.uid()
  IF p_author_code IS NOT NULL THEN
    SELECT id INTO v_pid FROM public.profiles 
    WHERE code::text = p_author_code AND company_id = p_company_id LIMIT 1;
  END IF;

  IF v_pid IS NULL THEN
    SELECT id INTO v_pid FROM public.profiles 
    WHERE user_id = auth.uid() AND company_id = p_company_id LIMIT 1;
  END IF;

  -- 3. Lock pessimista
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('ok', false, 'error', 'OF não encontrada'); 
  END IF;

  -- 4. Idempotência
  IF v_row.status = 'collected' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- 5. Validação de status
  IF v_row.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido para coleta: ' || v_row.status::text); 
  END IF;

  -- 6. Update status - AQUI ESTAVA O ERRO: usando auth.uid() em vez de v_pid
  UPDATE public.billing_orders SET
    status = 'collected', 
    collected_by = v_pid, -- Usando o Profile ID (UUID da tabela profiles)
    collected_at = COALESCE(collected_at, now()), 
    updated_at = now()
  WHERE id = p_id;
  
  -- 7. Auditoria
  PERFORM public._of_audit(
    p_company_id, 
    p_id, 
    'collect', 
    p_author_name, 
    p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'pieces', v_row.pieces_real, 'weight', v_row.weight_real)
  );

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
