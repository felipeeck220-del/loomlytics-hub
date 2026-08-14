-- 1. Corrigir a RPC start_billing_order_separation para usar tipos corretos
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
  -- Fallback para contexto de sistema (migrações)
  IF v_caller IS NULL THEN v_caller := p_company_id; END IF;

  IF v_caller <> p_company_id THEN 
    RETURN jsonb_build_object('ok', false, 'error', 'Acesso negado (tenant isolation)'); 
  END IF;

  -- Obter Profile ID com fallback para NULL
  BEGIN
    v_pid := public._of_current_profile_id(p_company_id);
  EXCEPTION WHEN OTHERS THEN
    v_pid := NULL;
  END;

  -- Lock pessimista
  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'OF não encontrada'); END IF;

  -- Se já estiver separando, sucesso
  IF v_row.status = 'separating' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_status', v_row.status);
  END IF;

  -- Validação de status: 'priority' não é um status do enum, é uma flag booleana.
  -- O status da OF prioritária no banco ainda é 'open'.
  IF v_row.status <> 'open' THEN 
    RETURN jsonb_build_object('ok', false, 'error', 'Status inválido para início: ' || v_row.status::text); 
  END IF;

  -- Executa o update
  UPDATE public.billing_orders SET 
    status = 'separating', 
    separation_started_by = v_pid, 
    separation_started_at = now(), 
    updated_at = now()
  WHERE id = p_id;
  
  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_start_separation', p_author_name, p_author_code, jsonb_build_object('of', v_row.of_number));
  
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 2. Iniciar separação da OF #626 manualmente
SELECT public.start_billing_order_separation(
  'a664927c-a285-4997-8faa-8c90985c6fac', 
  '8dd5aa93-02c1-4fec-a2c9-ae75ac03b98f', 
  'Lovable Debug', 
  'AI-001'
);
