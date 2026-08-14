-- Adicionar logs detalhados à RPC start_billing_order_separation para depuração
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
  -- Log de entrada
  RAISE NOTICE 'Iniciando start_billing_order_separation para OF ID: %, Company: %', p_id, p_company_id;

  IF v_caller IS NULL THEN
    SELECT company_id INTO v_caller FROM public.profiles WHERE user_id = auth.uid() AND company_id = p_company_id LIMIT 1;
    RAISE NOTICE 'Caller era NULL, buscado no perfil: %', v_caller;
  END IF;

  IF v_caller IS NULL OR v_caller <> p_company_id THEN 
    RAISE WARNING 'Acesso negado: v_caller(%) != p_company_id(%)', v_caller, p_company_id;
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso negado (tenant isolation)'); 
  END IF;

  v_pid := public._of_current_profile_id(p_company_id);
  RAISE NOTICE 'Profile ID: %', v_pid;

  -- Lock pessimista
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  
  IF NOT FOUND THEN 
    RAISE WARNING 'OF não encontrada: ID %', p_id;
    RETURN jsonb_build_object('ok', false, 'error', 'OF não encontrada'); 
  END IF;

  RAISE NOTICE 'Status atual da OF: %', v_row.status;

  -- Se já estiver separando, informa mas considera sucesso (idempotência)
  IF v_row.status = 'separating' THEN
    RAISE NOTICE 'OF já está em separação.';
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_status', v_row.status);
  END IF;

  -- Permite iniciar de 'open' ou 'priority'
  IF v_row.status <> 'open' AND v_row.status <> 'priority' THEN 
    RAISE WARNING 'Status inválido para início: %', v_row.status;
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido: ' || v_row.status); 
  END IF;

  -- Executa o update
  UPDATE public.billing_orders SET 
    status = 'separating', 
    separation_started_by = v_pid, 
    separation_started_at = now(), 
    updated_at = now()
  WHERE id = p_id;
  
  GET DIAGNOSTICS v_pid = ROW_COUNT;
  RAISE NOTICE 'Linhas afetadas pelo UPDATE: %', v_pid;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_start_separation', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number));
  
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Erro na RPC: % %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END; $$;

-- Executar a função manualmente para a OF #626 (ID 8dd5aa93-02c1-4fec-a2c9-ae75ac03b98f)
-- Nota: p_company_id deve ser a664927c-a285-4997-8faa-8c90985c6fac
SELECT public.start_billing_order_separation(
  'a664927c-a285-4997-8faa-8c90985c6fac', 
  '8dd5aa93-02c1-4fec-a2c9-ae75ac03b98f', 
  'Lovable Debug', 
  'AI-001'
);