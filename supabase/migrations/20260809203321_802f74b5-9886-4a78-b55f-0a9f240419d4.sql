
CREATE OR REPLACE FUNCTION public.get_mecanica_bootstrap(p_company_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_role text;
    v_user_cid uuid;
    v_result json;
BEGIN
    -- 1. Identificar usuário e empresa usando o ID do usuário autenticado (coluna user_id na tabela profiles que referencia auth.users(id))
    SELECT company_id, role INTO v_user_cid, v_user_role FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

    -- 2. Validar isolamento entre empresas
    IF v_user_cid IS DISTINCT FROM p_company_id THEN
        -- Retornar erro detalhado se for a mesma empresa mas o role for nulo ou algo assim
        IF v_user_cid IS NULL THEN
            RETURN json_build_object('error', 'Unauthorized', 'detail', 'Profile not found or company_id is null');
        END IF;
        RETURN json_build_object('error', 'Unauthorized', 'detail', 'Company mismatch');
    END IF;

    -- 3. Construir resposta consolidada (bootstrap)
    v_result := json_build_object(
        'machines', (
            SELECT json_agg(m)
            FROM (
                SELECT id, company_id, number, name, status, article_id,
                       model, diameter, fineness, needle_quantity, feeder_quantity,
                       machine_type, current_needle_id, current_sinker_id
                FROM public.machines
                WHERE company_id = p_company_id
                ORDER BY number
            ) m
        ),
        'needle_providers', (
            SELECT json_agg(np)
            FROM (SELECT * FROM public.needle_providers WHERE company_id = p_company_id ORDER BY name) np
        ),
        'needle_provider_prices', (
            SELECT json_agg(npp)
            FROM (SELECT * FROM public.needle_provider_prices WHERE company_id = p_company_id) npp
        ),
        'sinker_providers', (
            SELECT json_agg(sp)
            FROM (SELECT * FROM public.sinker_providers WHERE company_id = p_company_id ORDER BY name) sp
        ),
        'sinker_provider_prices', (
            SELECT json_agg(spp)
            FROM (SELECT * FROM public.sinker_provider_prices WHERE company_id = p_company_id) spp
        )
    );

    -- Lotes só são carregados para quem tem permissão de gerenciar estoque
    IF v_user_role IN ('admin', 'lider', 'mecanico', 'lider_mecanica', 'lider_noite') THEN
        v_result := v_result::jsonb || jsonb_build_object(
            'needle_lots', (
                SELECT json_agg(nl)
                FROM (SELECT * FROM public.needle_lots WHERE company_id = p_company_id ORDER BY purchase_date DESC LIMIT 100) nl
            ),
            'sinker_lots', (
                SELECT json_agg(sl)
                FROM (SELECT * FROM public.sinker_lots WHERE company_id = p_company_id ORDER BY purchase_date DESC LIMIT 100) sl
            )
        );
    END IF;

    RETURN v_result;
END;
$function$;
