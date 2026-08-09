-- Adiciona a lista de máquinas ao bootstrap da mecânica para evitar SELECT separado no cliente
CREATE OR REPLACE FUNCTION public.get_mecanica_bootstrap(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_needle_providers json;
  v_needle_prices json;
  v_needle_lots json;
  v_sinker_providers json;
  v_sinker_prices json;
  v_sinker_lots json;
  v_machines json;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RETURN NULL;
  END IF;

  SELECT json_agg(t) INTO v_needle_providers FROM public.needle_providers t WHERE company_id = p_company_id;
  SELECT json_agg(t) INTO v_needle_prices FROM public.needle_provider_prices t WHERE company_id = p_company_id;
  SELECT json_agg(t) INTO v_needle_lots FROM public.needle_lots t WHERE company_id = p_company_id;
  
  SELECT json_agg(t) INTO v_sinker_providers FROM public.sinker_providers t WHERE company_id = p_company_id;
  SELECT json_agg(t) INTO v_sinker_prices FROM public.sinker_provider_prices t WHERE company_id = p_company_id;
  SELECT json_agg(t) INTO v_sinker_lots FROM public.sinker_lots t WHERE company_id = p_company_id;
  
  -- Inclui máquinas básicas para carregar os cards sem esperar o useCompanyData completo
  SELECT json_agg(t) INTO v_machines 
  FROM (
    SELECT id, name, number, status, article_id, production_mode 
    FROM public.machines 
    WHERE company_id = p_company_id 
    ORDER BY number ASC
  ) t;

  RETURN json_build_object(
    'needle_providers', COALESCE(v_needle_providers, '[]'::json),
    'needle_provider_prices', COALESCE(v_needle_prices, '[]'::json),
    'needle_lots', COALESCE(v_needle_lots, '[]'::json),
    'sinker_providers', COALESCE(v_sinker_providers, '[]'::json),
    'sinker_provider_prices', COALESCE(v_sinker_prices, '[]'::json),
    'sinker_lots', COALESCE(v_sinker_lots, '[]'::json),
    'machines', COALESCE(v_machines, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mecanica_bootstrap(uuid) TO authenticated, service_role;
