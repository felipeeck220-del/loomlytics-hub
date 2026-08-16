-- Clear all data from manual_stock_movements to ensure zero start
DELETE FROM public.manual_stock_movements;

-- Update get_manual_stock_estoque_independent to match the desired logic
-- It should return 0 for everything since data was just wiped.
-- The user wants Stock Malha (Manual) to be in pieces (peças) as primary unit.

CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque_independent(
    p_company_id uuid,
    p_client_id uuid DEFAULT NULL,
    p_article_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_groups jsonb;
    v_kpis jsonb;
BEGIN
    -- Aggregate by client, article, and machine
    WITH movement_summary AS (
        SELECT 
            m.client_id,
            c.name as client_name,
            m.article_id,
            a.name as article_name,
            m.machine_id,
            ma.name as machine_name,
            SUM(CASE WHEN m.type = 'in' THEN m.pieces ELSE 0 END) as in_pc,
            SUM(CASE WHEN m.type = 'in' THEN m.weight_kg ELSE 0 END) as in_kg,
            SUM(CASE WHEN m.type = 'out' THEN m.pieces ELSE 0 END) as out_pc,
            SUM(CASE WHEN m.type = 'out' THEN m.weight_kg ELSE 0 END) as out_kg
        FROM public.manual_stock_movements m
        JOIN public.clients c ON m.client_id = c.id
        JOIN public.articles a ON m.article_id = a.id
        LEFT JOIN public.machines ma ON m.machine_id = ma.id
        WHERE m.company_id = p_company_id
          AND (p_client_id IS NULL OR m.client_id = p_client_id)
          AND (p_article_id IS NULL OR m.article_id = p_article_id)
        GROUP BY m.client_id, c.name, m.article_id, a.name, m.machine_id, ma.name
    ),
    article_totals AS (
        SELECT 
            client_id,
            client_name,
            article_id,
            article_name,
            SUM(in_pc) as article_in_pc,
            SUM(in_kg) as article_in_kg,
            SUM(out_pc) as article_out_pc,
            SUM(out_kg) as article_out_kg,
            jsonb_agg(jsonb_build_object(
                'machineId', machine_id,
                'machineName', COALESCE(machine_name, 'N/A'),
                'inPc', in_pc,
                'inKg', in_kg,
                'outPc', out_pc,
                'outKg', out_kg,
                'stockRolls', in_pc - out_pc,
                'stockKg', in_kg - out_kg
            ) ORDER BY machine_name) as by_machine
        FROM movement_summary
        GROUP BY client_id, client_name, article_id, article_name
    ),
    client_groups AS (
        SELECT 
            client_id as "clientId",
            client_name as "clientName",
            SUM(article_in_pc) as "totalInPc",
            SUM(article_in_pc - article_out_pc) as "totalStockRolls",
            jsonb_agg(jsonb_build_object(
                'articleId', article_id,
                'articleName', article_name,
                'inPc', article_in_pc,
                'inKg', article_in_kg,
                'outPc', article_out_pc,
                'outKg', article_out_kg,
                'stockRolls', article_in_pc - article_out_pc,
                'stockKg', article_in_kg - article_out_kg,
                'byMachine', by_machine
            ) ORDER BY article_name) as articles
        FROM article_totals
        GROUP BY client_id, client_name
    )
    SELECT COALESCE(jsonb_agg(g ORDER BY g."clientName"), '[]'::jsonb) INTO v_groups FROM client_groups g;

    -- Global KPIs
    SELECT jsonb_build_object(
        'inPc', COALESCE(SUM(CASE WHEN type = 'in' THEN pieces ELSE 0 END), 0),
        'inKg', COALESCE(SUM(CASE WHEN type = 'in' THEN weight_kg ELSE 0 END), 0),
        'outPc', COALESCE(SUM(CASE WHEN type = 'out' THEN pieces ELSE 0 END), 0),
        'outKg', COALESCE(SUM(CASE WHEN type = 'out' THEN weight_kg ELSE 0 END), 0),
        'stockRolls', COALESCE(SUM(CASE WHEN type = 'in' THEN pieces ELSE -pieces END), 0),
        'stockKg', COALESCE(SUM(CASE WHEN type = 'in' THEN weight_kg ELSE -weight_kg END), 0)
    ) INTO v_kpis
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id;

    RETURN jsonb_build_object('groups', v_groups, 'kpis', v_kpis);
END;
$$;
