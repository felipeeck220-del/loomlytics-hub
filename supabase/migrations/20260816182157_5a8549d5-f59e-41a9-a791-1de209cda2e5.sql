-- Adiciona a coluna on_machine na tabela manual_stock_movements
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manual_stock_movements' AND column_name = 'on_machine') THEN
    ALTER TABLE public.manual_stock_movements ADD COLUMN on_machine boolean DEFAULT false;
  END IF;
END $$;

-- Atualiza a RPC para retornar kpis e grupos considerando on_machine
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque_independent(
    p_company_id uuid,
    p_client_id uuid DEFAULT NULL,
    p_article_id uuid DEFAULT NULL,
    p_month text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start_date date;
    v_end_date date;
    v_kpis jsonb;
    v_groups jsonb;
BEGIN
    -- Filtro de mês (se necessário)
    IF p_month <> 'all' THEN
        v_start_date := (p_month || '-01')::date;
        v_end_date := (v_start_date + interval '1 month' - interval '1 day')::date;
    END IF;

    -- KPIs Globais
    SELECT jsonb_build_object(
        'inKg', COALESCE(SUM(CASE WHEN type = 'in' AND NOT on_machine THEN weight_kg ELSE 0 END), 0),
        'inPc', COALESCE(SUM(CASE WHEN type = 'in' AND NOT on_machine THEN pieces ELSE 0 END), 0),
        'outKg', COALESCE(SUM(CASE WHEN type = 'out' THEN weight_kg ELSE 0 END), 0),
        'outPc', COALESCE(SUM(CASE WHEN type = 'out' THEN pieces ELSE 0 END), 0),
        'onMachineKg', COALESCE(SUM(CASE WHEN type = 'in' AND on_machine THEN weight_kg ELSE 0 END), 0),
        'onMachinePc', COALESCE(SUM(CASE WHEN type = 'in' AND on_machine THEN pieces ELSE 0 END), 0),
        'stockKg', COALESCE(SUM(CASE WHEN type = 'in' THEN weight_kg ELSE -weight_kg END), 0),
        'stockRolls', COALESCE(SUM(CASE WHEN type = 'in' THEN pieces ELSE -pieces END), 0)
    ) INTO v_kpis
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id
      AND (p_client_id IS NULL OR client_id = p_client_id)
      AND (p_article_id IS NULL OR article_id = p_article_id);

    -- Agrupamento por Cliente -> Artigo -> Máquina
    WITH data_raw AS (
        SELECT 
            m.client_id,
            c.name as client_name,
            m.article_id,
            a.name as article_name,
            m.machine_id,
            mac.name as machine_name,
            SUM(CASE WHEN m.type = 'in' AND NOT m.on_machine THEN m.weight_kg ELSE 0 END) as in_kg,
            SUM(CASE WHEN m.type = 'in' AND NOT m.on_machine THEN m.pieces ELSE 0 END) as in_pc,
            SUM(CASE WHEN m.type = 'out' THEN m.weight_kg ELSE 0 END) as out_kg,
            SUM(CASE WHEN m.type = 'out' THEN m.pieces ELSE 0 END) as out_pc,
            SUM(CASE WHEN m.type = 'in' AND m.on_machine THEN m.weight_kg ELSE 0 END) as on_machine_kg,
            SUM(CASE WHEN m.type = 'in' AND m.on_machine THEN m.pieces ELSE 0 END) as on_machine_pc
        FROM public.manual_stock_movements m
        JOIN public.clients c ON c.id = m.client_id
        JOIN public.articles a ON a.id = m.article_id
        LEFT JOIN public.machines mac ON mac.id = m.machine_id
        WHERE m.company_id = p_company_id
          AND (p_client_id IS NULL OR m.client_id = p_client_id)
          AND (p_article_id IS NULL OR m.article_id = p_article_id)
        GROUP BY 1,2,3,4,5,6
    ),
    machine_summary AS (
        SELECT 
            client_id,
            article_id,
            jsonb_agg(jsonb_build_object(
                'machineId', machine_id,
                'machineName', COALESCE(machine_name, 'Sem máquina'),
                'inKg', in_kg,
                'inPc', in_pc,
                'outKg', out_kg,
                'outPc', out_pc,
                'onMachineKg', on_machine_kg,
                'onMachinePc', on_machine_pc,
                'stockRolls', (in_pc + on_machine_pc - out_pc)
            )) as byMachine,
            SUM(in_kg) as art_in_kg,
            SUM(in_pc) as art_in_pc,
            SUM(out_kg) as art_out_kg,
            SUM(out_pc) as art_out_pc,
            SUM(on_machine_kg) as art_on_machine_kg,
            SUM(on_machine_pc) as art_on_machine_pc
        FROM data_raw
        GROUP BY 1,2
    ),
    article_summary AS (
        SELECT 
            client_id,
            jsonb_agg(jsonb_build_object(
                'articleId', article_id,
                'articleName', (SELECT name FROM public.articles WHERE id = article_id),
                'inKg', art_in_kg,
                'inPc', art_in_pc,
                'outKg', art_out_kg,
                'outPc', art_out_pc,
                'onMachineKg', art_on_machine_kg,
                'onMachinePc', art_on_machine_pc,
                'stockRolls', (art_in_pc + art_on_machine_pc - art_out_pc),
                'byMachine', byMachine
            )) as articles,
            SUM(art_in_kg) as cli_in_kg,
            SUM(art_in_pc) as cli_in_pc,
            SUM(art_on_machine_pc) as cli_on_machine_pc,
            SUM(art_in_pc + art_on_machine_pc - art_out_pc) as cli_stock_rolls
        FROM machine_summary
        GROUP BY 1
    )
    SELECT jsonb_agg(jsonb_build_object(
        'clientId', client_id,
        'clientName', (SELECT name FROM public.clients WHERE id = client_id),
        'totalInKg', cli_in_kg,
        'totalInPc', cli_in_pc,
        'totalOnMachinePc', cli_on_machine_pc,
        'totalStockRolls', cli_stock_rolls,
        'articles', articles
    )) INTO v_groups
    FROM article_summary;

    RETURN jsonb_build_object(
        'kpis', v_kpis,
        'groups', COALESCE(v_groups, '[]'::jsonb)
    );
END;
$$;

-- RPC para ajustar palete (substituir ou lançar para expedição)
CREATE OR REPLACE FUNCTION public.adjust_manual_machine_pallet(
    p_company_id uuid,
    p_author_id uuid,
    p_client_id uuid,
    p_article_id uuid,
    p_machine_id uuid,
    p_pieces integer,
    p_weight_kg numeric,
    p_action text, -- 'substitute' ou 'to_expedition'
    p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_pc integer;
    v_current_kg numeric;
BEGIN
    -- 1. Pega saldo atual NA MÁQUINA para este trio
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'in' AND on_machine THEN pieces ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'in' AND on_machine THEN weight_kg ELSE 0 END), 0)
    INTO v_current_pc, v_current_kg
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id
      AND client_id = p_client_id
      AND article_id = p_article_id
      AND machine_id = p_machine_id;

    -- 2. Zera o saldo atual na máquina com um movimento de saída "on_machine"
    IF v_current_pc > 0 OR v_current_kg > 0 THEN
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'out', v_current_pc, v_current_kg, true, 'Ajuste de palete (zeramento para nova ação)');
    END IF;

    -- 3. Aplica a nova ação
    IF p_action = 'substitute' THEN
        -- Apenas insere o novo valor como entrada "on_machine"
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'in', p_pieces, p_weight_kg, true, COALESCE(p_description, 'Recontagem de palete na máquina'));
    ELSIF p_action = 'to_expedition' THEN
        -- Insere o novo valor como entrada normal (expedição)
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'in', p_pieces, p_weight_kg, false, COALESCE(p_description, 'Palete lançado para expedição'));
    END IF;
END;
$$;
