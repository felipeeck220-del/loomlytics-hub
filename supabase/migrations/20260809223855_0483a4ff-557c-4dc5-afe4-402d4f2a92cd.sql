
DO $$
DECLARE
    r RECORD;
    v_profile_id uuid;
BEGIN
    FOR r IN 
        WITH bad_orders AS (
            SELECT 
                m.company_id,
                m.client_id,
                m.article_id,
                m.machine_id,
                m.billing_order_id, 
                SUM(CASE WHEN m.type = 'reserve' THEN pieces ELSE -pieces END) as bal_pc,
                SUM(CASE WHEN m.type = 'reserve' THEN weight_kg ELSE -weight_kg END) as bal_kg
            FROM public.manual_stock_movements m
            JOIN public.billing_orders bo ON bo.id = m.billing_order_id
            WHERE bo.status = 'collected'
              AND m.type IN ('reserve', 'release')
            GROUP BY 1, 2, 3, 4, 5
            HAVING SUM(CASE WHEN m.type = 'reserve' THEN pieces ELSE -pieces END) > 0
               OR SUM(CASE WHEN m.type = 'reserve' THEN weight_kg ELSE -weight_kg END) > 0
        )
        SELECT * FROM bad_orders
    LOOP
        SELECT id INTO v_profile_id 
        FROM public.profiles 
        WHERE company_id = r.company_id 
        ORDER BY (role = 'admin') DESC 
        LIMIT 1;

        INSERT INTO public.manual_stock_movements (
            company_id, article_id, client_id, machine_id, billing_order_id,
            type, pieces, weight_kg, reason, created_by, on_machine
        )
        VALUES (
            r.company_id, r.article_id, r.client_id, r.machine_id, r.billing_order_id,
            'release', r.bal_pc, r.bal_kg, 'Correção de reserva residual (OF Coletada)', v_profile_id, false
        );
    END LOOP;
END $$;
