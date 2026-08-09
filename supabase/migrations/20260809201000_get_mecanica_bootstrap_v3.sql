CREATE OR REPLACE FUNCTION public.get_mecanica_bootstrap(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role public.app_role;
    v_user_cid uuid;
    v_result json;
BEGIN
    -- 1. Identificar usuário e empresa
    SELECT company_id INTO v_user_cid FROM profiles WHERE user_id = auth.uid();
    
    -- 2. Validar isolamento entre empresas
    IF v_user_cid IS DISTINCT FROM p_company_id THEN
        RETURN json_build_object('error', 'Unauthorized');
    END IF;

    -- 3. Identificar papel do usuário para carregamento condicional
    SELECT role INTO v_user_role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;

    -- 4. Construir resposta consolidada (bootstrap)
    -- As máquinas são essenciais para renderizar os cards rapidamente
    -- Fornecedores e Preços são necessários para os selects nos modais
    v_result := json_build_object(
        'machines', (
            SELECT json_agg(m)
            FROM (
                SELECT id, company_id, number, name, status, article_id, 
                       model, diameter, fineness, needle_quantity, feeder_quantity,
                       machine_type, current_needle_id, current_sinker_id
                FROM machines
                WHERE company_id = p_company_id
                ORDER BY number
            ) m
        ),
        'needle_providers', (
            SELECT json_agg(np)
            FROM (SELECT * FROM needle_providers WHERE company_id = p_company_id ORDER BY name) np
        ),
        'needle_provider_prices', (
            SELECT json_agg(npp)
            FROM (SELECT * FROM needle_provider_prices WHERE company_id = p_company_id) npp
        ),
        'sinker_providers', (
            SELECT json_agg(sp)
            FROM (SELECT * FROM sinker_providers WHERE company_id = p_company_id ORDER BY name) sp
        ),
        'sinker_provider_prices', (
            SELECT json_agg(spp)
            FROM (SELECT * FROM sinker_provider_prices WHERE company_id = p_company_id) spp
        )
    );

    -- Lotes só são carregados para quem tem permissão de gerenciar estoque (evita payload pesado desnecessário)
    -- Admin, Líder, Mecânico, Líder Mecânica
    IF v_user_role IN ('admin', 'lider', 'mecanico', 'lider_mecanica', 'lider_noite') THEN
        v_result := v_result::jsonb || jsonb_build_object(
            'needle_lots', (
                SELECT json_agg(nl)
                FROM (SELECT * FROM needle_lots WHERE company_id = p_company_id ORDER BY purchase_date DESC LIMIT 100) nl
            ),
            'sinker_lots', (
                SELECT json_agg(sl)
                FROM (SELECT * FROM sinker_lots WHERE company_id = p_company_id ORDER BY purchase_date DESC LIMIT 100) sl
            )
        );
    END IF;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mecanica_bootstrap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mecanica_bootstrap(uuid) TO service_role;
