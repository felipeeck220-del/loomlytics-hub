-- 1. Refatorar collect_billing_order com logs de depuração detalhados
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
  v_count int;
BEGIN
  -- Log de entrada
  RAISE NOTICE 'Iniciando collect_billing_order para OF ID: %, Company: %', p_id, p_company_id;

  -- Fallback para contexto de sistema (migrações)
  IF v_caller IS NULL THEN
    v_caller := p_company_id;
    RAISE NOTICE 'Contexto de sistema detectado, usando p_company_id: %', v_caller;
  END IF;

  IF v_caller <> p_company_id THEN 
    RAISE WARNING 'Acesso negado: v_caller(%) != p_company_id(%)', v_caller, p_company_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso negado (tenant isolation)'); 
  END IF;

  -- Lock pessimista para garantir atomicidade
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  
  IF NOT FOUND THEN 
    RAISE WARNING 'OF não encontrada: ID %', p_id;
    RETURN jsonb_build_object('ok', false, 'error', 'OF não encontrada'); 
  END IF;

  RAISE NOTICE 'Status atual da OF: %', v_row.status;

  -- Se já estiver coletada, sucesso (idempotência)
  IF v_row.status = 'collected' THEN
    RAISE NOTICE 'OF já está marcada como coletada.';
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  -- Validação de status: deve estar pronta
  IF v_row.status <> 'ready' THEN
    RAISE WARNING 'Status inválido para coleta: %', v_row.status;
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido: ' || v_row.status::text); 
  END IF;

  -- 2. Update status imediato
  UPDATE public.billing_orders SET
    status = 'collected', 
    collected_by = auth.uid(), 
    collected_at = COALESCE(collected_at, now()), 
    updated_at = now()
  WHERE id = p_id;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Linhas afetadas pelo UPDATE: %', v_count;

  -- 3. Auditoria
  PERFORM public._of_audit(
    p_company_id, 
    p_id, 
    'collect', 
    p_author_name, 
    p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'pieces', v_row.pieces_real, 'weight', v_row.weight_real, 'manual_debug', true)
  );

  RAISE NOTICE 'Coleta concluída com sucesso para OF #%', v_row.of_number;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Erro na RPC: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 2. Executar a coleta manualmente para a OF #481 (ID a2c4d01e-6e0b-4997-b7ad-32afcfa28005)
SELECT public.collect_billing_order(
  'a664927c-a285-4997-8faa-8c90985c6fac', 
  'a2c4d01e-6e0b-4997-b7ad-32afcfa28005', 
  'Lovable Debug', 
  'AI-001'
);