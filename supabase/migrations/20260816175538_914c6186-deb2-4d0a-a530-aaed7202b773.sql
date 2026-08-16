
-- 1. Table manual_stock_movements
CREATE TABLE IF NOT EXISTS public.manual_stock_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
    type text NOT NULL CHECK (type IN ('in', 'out')),
    pieces integer NOT NULL DEFAULT 0,
    weight_kg numeric(12,2) NOT NULL DEFAULT 0,
    description text,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_stock_movements TO authenticated;
GRANT ALL ON public.manual_stock_movements TO service_role;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'Users can see their company manual movements'
    ) THEN
        ALTER TABLE public.manual_stock_movements ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can see their company manual movements" 
        ON public.manual_stock_movements FOR SELECT 
        TO authenticated 
        USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

        CREATE POLICY "Users can insert their company manual movements" 
        ON public.manual_stock_movements FOR INSERT 
        TO authenticated 
        WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
    END IF;
END $$;

-- 2. RPC get_manual_stock_estoque_independent
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque_independent(
    p_company_id uuid, 
    p_client_id uuid DEFAULT NULL::uuid, 
    p_article_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_groups jsonb;
    v_kpis jsonb;
BEGIN
    WITH base_movements AS (
        SELECT 
            m.client_id,
            m.article_id,
            m.machine_id,
            SUM(CASE WHEN m.type = 'in' THEN m.pieces ELSE 0 END) as in_pc,
            SUM(CASE WHEN m.type = 'in' THEN m.weight_kg ELSE 0 END) as in_kg,
            SUM(CASE WHEN m.type = 'out' THEN m.pieces ELSE 0 END) as out_pc,
            SUM(CASE WHEN m.type = 'out' THEN m.weight_kg ELSE 0 END) as out_kg
        FROM public.manual_stock_movements m
        WHERE m.company_id = p_company_id
          AND (p_client_id IS NULL OR m.client_id = p_client_id)
          AND (p_article_id IS NULL OR m.article_id = p_article_id)
        GROUP BY m.client_id, m.article_id, m.machine_id
    ),
    client_agg AS (
        SELECT 
            bm.client_id,
            c.name as client_name,
            jsonb_agg(
                jsonb_build_object(
                    'articleId', bm.article_id,
                    'articleName', a.name,
                    'inKg', SUM(bm.in_kg),
                    'inPc', SUM(bm.in_pc),
                    'outKg', SUM(bm.out_kg),
                    'outPc', SUM(bm.out_pc),
                    'stockKg', GREATEST(0, SUM(bm.in_kg) - SUM(bm.out_kg)),
                    'stockRolls', GREATEST(0, SUM(bm.in_pc) - SUM(bm.out_pc)),
                    'reservedKg', 0,
                    'reservedPc', 0,
                    'byMachine', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'machineId', sub.machine_id,
                                'machineName', COALESCE(mac.name, 'Sem Máquina'),
                                'inKg', sub.in_kg,
                                'inPc', sub.in_pc,
                                'outKg', sub.out_kg,
                                'outPc', sub.out_pc,
                                'stockKg', GREATEST(0, sub.in_kg - sub.out_kg),
                                'stockRolls', GREATEST(0, sub.in_pc - sub.out_pc)
                            )
                        )
                        FROM (
                            SELECT 
                                machine_id,
                                SUM(CASE WHEN type = 'in' THEN weight_kg ELSE 0 END) as in_kg,
                                SUM(CASE WHEN type = 'in' THEN pieces ELSE 0 END) as in_pc,
                                SUM(CASE WHEN type = 'out' THEN weight_kg ELSE 0 END) as out_kg,
                                SUM(CASE WHEN type = 'out' THEN pieces ELSE 0 END) as out_pc
                            FROM public.manual_stock_movements
                            WHERE company_id = p_company_id AND client_id = bm.client_id AND article_id = bm.article_id
                            GROUP BY machine_id
                        ) sub
                        LEFT JOIN public.machines mac ON mac.id = sub.machine_id
                    )
                )
            ) as articles,
            SUM(bm.in_kg) as total_in_kg,
            SUM(bm.in_pc) as total_in_pc,
            SUM(bm.out_kg) as total_out_kg,
            SUM(bm.out_pc) as total_out_pc,
            SUM(GREATEST(0, bm.in_kg - bm.out_kg)) as total_stock_kg,
            SUM(GREATEST(0, bm.in_pc - bm.out_pc)) as total_stock_rolls
        FROM base_movements bm
        JOIN public.clients c ON c.id = bm.client_id
        JOIN public.articles a ON a.id = bm.article_id
        GROUP BY bm.client_id, c.name
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'clientId', ca.client_id,
            'clientName', ca.client_name,
            'articles', ca.articles,
            'totalInKg', ca.total_in_kg,
            'totalInPc', ca.total_in_pc,
            'totalOutKg', ca.total_out_kg,
            'totalOutPc', ca.total_out_pc,
            'totalStockKg', ca.total_stock_kg,
            'totalStockRolls', ca.total_stock_rolls
        )
    ) INTO v_groups
    FROM client_agg ca;

    SELECT jsonb_build_object(
        'stockKg', COALESCE(SUM(GREATEST(0, in_kg - out_kg)), 0),
        'stockRolls', COALESCE(SUM(GREATEST(0, in_pc - out_pc)), 0),
        'inKg', COALESCE(SUM(in_kg), 0),
        'inPc', COALESCE(SUM(in_pc), 0),
        'outKg', COALESCE(SUM(out_kg), 0),
        'outPc', COALESCE(SUM(out_pc), 0)
    ) INTO v_kpis
    FROM (
        SELECT 
            SUM(CASE WHEN type = 'in' THEN weight_kg ELSE 0 END) as in_kg,
            SUM(CASE WHEN type = 'in' THEN pieces ELSE 0 END) as in_pc,
            SUM(CASE WHEN type = 'out' THEN weight_kg ELSE 0 END) as out_kg,
            SUM(CASE WHEN type = 'out' THEN pieces ELSE 0 END) as out_pc
        FROM public.manual_stock_movements
        WHERE company_id = p_company_id
        GROUP BY client_id, article_id, machine_id
    ) sub;

    RETURN jsonb_build_object(
        'groups', COALESCE(v_groups, '[]'::jsonb),
        'kpis', COALESCE(v_kpis, jsonb_build_object('stockKg', 0, 'stockRolls', 0, 'inKg', 0, 'inPc', 0, 'outKg', 0, 'outPc', 0))
    );
END;
$$;
