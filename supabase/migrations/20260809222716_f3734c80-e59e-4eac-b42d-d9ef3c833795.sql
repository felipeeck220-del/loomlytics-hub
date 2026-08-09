DROP FUNCTION IF EXISTS public.get_manual_stock_estoque(uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(
    p_company_id uuid,
    p_month text DEFAULT 'all',
    p_client_id uuid DEFAULT NULL,
    p_article_id uuid DEFAULT NULL
)
RETURNS TABLE(
    client_id uuid,
    client_name text,
    article_id uuid,
    article_name text,
    manual_pc bigint,
    manual_kg numeric,
    delivered_pc bigint,
    delivered_kg numeric,
    reserved_pc bigint,
    reserved_kg numeric,
    available_pc bigint,
    available_kg numeric,
    machine_pc bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_first_manual_entry timestamp with time zone;
BEGIN
    -- Identifica a data da primeira entrada manual para ignorar saídas retroativas
    SELECT MIN(created_at) INTO v_first_manual_entry
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id 
      AND type = 'adjust_in';

    -- Se não houver entradas, usa uma data futura para garantir que nada apareça
    IF v_first_manual_entry IS NULL THEN
        v_first_manual_entry := '2099-01-01'::timestamp with time zone;
    END IF;

    RETURN QUERY
    WITH base_movements AS (
        SELECT 
            COALESCE(m.client_id, a.client_id) as m_client_id,
            m.article_id,
            m.type,
            m.pieces,
            m.weight_kg,
            m.created_at,
            COALESCE(m.on_machine, false) as on_machine
        FROM public.manual_stock_movements m
        LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
        WHERE m.company_id = p_company_id
          AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
          AND (p_article_id IS NULL OR m.article_id = p_article_id)
    ),
    manual_totals AS (
        -- Entradas Manuais (Somente na expedição)
        SELECT 
            m_client_id as client_id,
            article_id,
            SUM(pieces) as pc,
            SUM(weight_kg) as kg
        FROM base_movements
        WHERE type = 'adjust_in' AND NOT on_machine
        GROUP BY 1, 2
    ),
    delivered_totals AS (
        -- Saídas Relevantes (Somente após o início do controle manual)
        SELECT 
            m_client_id as client_id,
            article_id,
            SUM(pieces) as pc,
            SUM(weight_kg) as kg
        FROM base_movements
        WHERE type IN ('out', 'adjust_out') AND NOT on_machine
          AND created_at >= v_first_manual_entry
        GROUP BY 1, 2
    ),
    reserved_totals AS (
        -- Reservas Ativas (Somente após o início do controle manual)
        SELECT 
            m_client_id as client_id,
            article_id,
            SUM(CASE WHEN type = 'reserve' THEN pieces ELSE -pieces END) as pc,
            SUM(CASE WHEN type = 'reserve' THEN weight_kg ELSE -weight_kg END) as kg
        FROM base_movements
        WHERE type IN ('reserve', 'release')
          AND created_at >= v_first_manual_entry
        GROUP BY 1, 2
    ),
    machine_totals AS (
        -- Saldo em Máquina (Todo o histórico para consistência de paletes)
        SELECT 
            m_client_id as client_id,
            article_id,
            SUM(CASE WHEN type = 'adjust_in' THEN pieces ELSE -pieces END) as pc
        FROM base_movements
        WHERE on_machine = true
        GROUP BY 1, 2
    ),
    aggregated AS (
        SELECT 
            COALESCE(m.client_id, d.client_id, r.client_id, ma.client_id) as agg_client_id,
            COALESCE(m.article_id, d.article_id, r.article_id, ma.article_id) as agg_article_id,
            COALESCE(m.pc, 0) as m_pc,
            COALESCE(m.kg, 0) as m_kg,
            COALESCE(d.pc, 0) as d_pc,
            COALESCE(d.kg, 0) as d_kg,
            GREATEST(0, COALESCE(r.pc, 0)) as r_pc,
            GREATEST(0, COALESCE(r.kg, 0)) as r_kg,
            COALESCE(ma.pc, 0) as ma_pc
        FROM manual_totals m
        FULL OUTER JOIN delivered_totals d USING (client_id, article_id)
        FULL OUTER JOIN reserved_totals r USING (client_id, article_id)
        FULL OUTER JOIN machine_totals ma USING (client_id, article_id)
    )
    SELECT 
        agg.agg_client_id as client_id,
        c.name as client_name,
        agg.agg_article_id as article_id,
        a.name as article_name,
        agg.m_pc as manual_pc,
        agg.m_kg as manual_kg,
        agg.d_pc as delivered_pc,
        agg.d_kg as delivered_kg,
        agg.r_pc as reserved_pc,
        agg.r_kg as reserved_kg,
        -- Disponível = Em Máquina + Máximo(0, Expedição Físico - Reservas)
        (agg.ma_pc + GREATEST(0, (agg.m_pc - agg.d_pc) - agg.r_pc))::bigint as available_pc,
        GREATEST(0, (agg.m_kg - agg.d_kg) - agg.r_kg)::numeric as available_kg,
        agg.ma_pc::bigint as machine_pc
    FROM aggregated agg
    JOIN public.clients c ON c.id = agg.agg_client_id
    JOIN public.articles a ON a.id = agg.agg_article_id
    WHERE (agg.m_pc > 0 OR agg.ma_pc > 0 OR agg.r_pc > 0 OR agg.d_pc > 0)
    ORDER BY client_name, article_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO service_role;
