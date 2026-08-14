-- 1. Refatorar _of_audit para garantir que sempre registre o autor corretamente, mesmo se p_author_name for nulo
CREATE OR REPLACE FUNCTION public._of_audit(
    p_company_id uuid,
    p_id uuid,
    p_action text,
    p_author_name text,
    p_author_code text,
    p_details jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_user_name text;
    v_user_code text;
BEGIN
    -- Busca dados do perfil se não fornecidos
    IF p_author_name IS NULL OR p_author_code IS NULL THEN
        SELECT name, code::text INTO v_user_name, v_user_code
        FROM public.profiles
        WHERE user_id = auth.uid() AND company_id = p_company_id
        LIMIT 1;
    END IF;

    INSERT INTO public.audit_logs (
        company_id,
        user_name,
        user_code,
        action,
        details
    )
    VALUES (
        p_company_id,
        COALESCE(p_author_name, v_user_name, 'Sistema'),
        COALESCE(p_author_code, v_user_code, '0'),
        p_action,
        p_details || jsonb_build_object('of_id', p_id, 'ts', now())
    );
END;
$$;

-- 2. Refatorar start_billing_order_separation para ser mais resiliente
CREATE OR REPLACE FUNCTION public.start_billing_order_separation(
  p_company_id uuid, 
  p_id uuid,
  p_author_name text DEFAULT NULL, 
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_pid uuid;
BEGIN
  -- Fallback de autorização se get_user_company_id() falhar
  IF v_caller IS NULL THEN
    SELECT company_id INTO v_caller FROM public.profiles WHERE user_id = auth.uid() AND company_id = p_company_id LIMIT 1;
  END IF;

  IF v_caller IS NULL OR v_caller <> p_company_id THEN 
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso negado (tenant isolation)'); 
  END IF;

  v_pid := public._of_current_profile_id(p_company_id);

  -- Lock pessimista para evitar double-start
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'OF não encontrada'); END IF;

  -- Permite iniciar de 'open' ou 'priority'
  IF v_row.status <> 'open' AND v_row.status <> 'priority' THEN 
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_status', v_row.status); 
  END IF;

  UPDATE public.billing_orders SET 
    status = 'separating', 
    separation_started_by = v_pid, 
    separation_started_at = now(), 
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_start_separation', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number));
  
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 3. Refatorar collect_billing_order para garantir transição atômica
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
BEGIN
  IF v_caller IS NULL THEN
    SELECT company_id INTO v_caller FROM public.profiles WHERE user_id = auth.uid() AND company_id = p_company_id LIMIT 1;
  END IF;

  IF v_caller IS NULL OR v_caller <> p_company_id THEN 
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso negado'); 
  END IF;

  -- Lock pessimista
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'OF não encontrada'); END IF;
  
  -- Se já coletada, sucesso silencioso (idempotência)
  IF v_row.status = 'collected' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  -- Só permite coletar se estiver pronta (ready)
  IF v_row.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'OF precisa estar no status "Pronto para Coleta" para ser coletada.', 'current_status', v_row.status);
  END IF;

  -- 2. Update status imediato com timestamps explícitos
  UPDATE public.billing_orders SET
    status = 'collected', 
    collected_by = auth.uid(), 
    collected_at = COALESCE(collected_at, now()), 
    updated_at = now()
  WHERE id = p_id;

  -- 3. Auditoria canônica
  PERFORM public._of_audit(
    p_company_id, 
    p_id, 
    'collect', 
    p_author_name, 
    p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'pieces', v_row.pieces_real, 'weight', v_row.weight_real)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4. Refatorar launch_billing_order_ready para garantir consolidação de paletes
CREATE OR REPLACE FUNCTION public.launch_billing_order_ready(
  p_company_id uuid, 
  p_id uuid,
  p_pieces_real int DEFAULT NULL, 
  p_weight_real numeric DEFAULT NULL,
  p_author_name text DEFAULT NULL, 
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_sum_p int; v_sum_w numeric; v_pallet_count int;
  v_pieces int; v_weight numeric;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL THEN
    SELECT company_id INTO v_caller FROM public.profiles WHERE user_id = auth.uid() AND company_id = p_company_id LIMIT 1;
  END IF;
  IF v_caller IS NULL OR v_caller <> p_company_id THEN RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized'); END IF;
  
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'OF not found'); END IF;
  
  -- Se já pronta, apenas retorna ok
  IF v_row.status = 'ready' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  
  -- Consolida dos paletes se existirem
  SELECT COUNT(*), COALESCE(SUM(pieces),0), COALESCE(SUM(weight_kg),0)
    INTO v_pallet_count, v_sum_p, v_sum_w
    FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  IF v_pallet_count > 0 THEN
    v_pieces := v_sum_p; v_weight := v_sum_w;
  ELSE
    -- Se não tem paletes, usa os valores passados ou os esperados como fallback
    v_pieces := COALESCE(p_pieces_real, v_row.pieces_expected, 0);
    v_weight := COALESCE(p_weight_real, v_row.weight_expected, 0);
  END IF;

  UPDATE public.billing_orders SET 
    status = 'ready', 
    pieces_real = v_pieces, 
    weight_real = v_weight,
    weight_avg = CASE WHEN v_pieces > 0 THEN v_weight / v_pieces ELSE 0 END,
    separation_finished_by = v_pid, 
    separation_finished_at = now(),
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_ready', p_author_name, p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'pieces', v_pieces, 'weight', v_weight, 'pallets', v_pallet_count));
    
  RETURN jsonb_build_object('ok', true, 'pieces_real', v_pieces, 'weight_real', v_weight);
END; $$;
