-- Fix: Manual Stock calculation with "SEM MÁQUINA" reserves
-- The previous logic failed because it didn't handle machine_id = NULL correctly in partitions.
-- This new version unifies all machine-level stats and then applies global reserves (from NULL machine_id)
-- proportional to the available stock in each machine, ensuring total consistency.

CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(p_company_id uuid, p_month text DEFAULT 'all'::text, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid;
  v_result jsonb;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('groups','[]'::jsonb,
      'kpis', jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'reservedRolls',0,'availableKg',0,'availableRolls',0,'machineKg',0,'machineRolls',0));
  END IF;

  WITH res_first AS (
    -- First reserve date per BO/Article/Machine to align 'out' events cronologically
    SELECT r.billing_order_id, r.article_id, r.machine_id, MIN(r.created_at) AS first_at
    FROM public.manual_stock_movements r
    WHERE r.company_id = p_company_id AND r.type = 'reserve' AND r.billing_order_id IS NOT NULL
    GROUP BY 1,2,3
  ),
  base AS (
    SELECT COALESCE(m.client_id, a.client_id) AS client_id,
           m.article_id, m.machine_id, m.type, m.billing_order_id,
           m.created_at,
           CASE WHEN m.type = 'out' AND m.billing_order_id IS NOT NULL
                THEN COALESCE(rf.first_at, m.created_at) ELSE m.created_at END AS eff_at,
           m.id, COALESCE(m.on_machine,false) AS on_machine,
           (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_month) AS in_month,
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    LEFT JOIN res_first rf ON rf.billing_order_id = m.billing_order_id
      AND rf.article_id = m.article_id
      AND rf.machine_id IS NOT DISTINCT FROM m.machine_id
    WHERE m.company_id = p_company_id
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  phys AS (
    -- Physical stock movements (entries and exits)
    SELECT client_id, article_id, machine_id, eff_at, id,
      CASE
        WHEN type = 'adjust_in' THEN kg
        WHEN type = 'in' AND billing_order_id IS NOT NULL THEN kg
        WHEN type = 'adjust_out' THEN -kg
        WHEN type = 'out' THEN -kg
        ELSE 0
      END AS d_kg,
      CASE
        WHEN type = 'adjust_in' THEN pc
        WHEN type = 'in' AND billing_order_id IS NOT NULL THEN pc
        WHEN type = 'adjust_out' THEN -pc
        WHEN type = 'out' THEN -pc
        ELSE 0
      END AS d_pc
    FROM base
    WHERE client_id IS NOT NULL
      AND (type IN ('adjust_in','adjust_out','out') OR (type = 'in' AND billing_order_id IS NOT NULL))
      AND machine_id IS NOT NULL -- Stock MUST be in a machine
  ),
  running AS (
    -- Cumulative physical stock per machine to apply the "lock at zero" logic
    SELECT client_id, article_id, machine_id,
      SUM(d_kg) OVER w AS pfx_kg,
      SUM(d_pc) OVER w AS pfx_pc
    FROM phys
    WINDOW w AS (PARTITION BY client_id, article_id, machine_id ORDER BY eff_at, (CASE WHEN d_kg + d_pc >= 0 THEN 0 ELSE 1 END), id ROWS UNBOUNDED PRECEDING)
  ),
  stock_calc AS (
    -- Final physical stock per machine
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(d_kg) - LEAST(0, MIN(pfx_kg))) AS stock_kg,
      GREATEST(0, SUM(d_pc) - LEAST(0, MIN(pfx_pc))) AS stock_pc
    FROM phys
    JOIN running USING (client_id, article_id, machine_id, id)
    GROUP BY 1,2,3
  ),
  mach_stats AS (
    -- Current "On Machine" status (not for expedition)
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN kg ELSE -kg END)) AS machine_kg,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN pc ELSE -pc END)) AS machine_pc
    FROM base
    WHERE client_id IS NOT NULL AND on_machine = true AND type IN ('adjust_in','adjust_out')
      AND machine_id IS NOT NULL
    GROUP BY 1,2,3
  ),
  res_raw AS (
    -- Active reserves (reserves minus releases, excluding collected/cancelled OFs)
    SELECT b.client_id, b.article_id, b.machine_id,
      GREATEST(0, SUM(CASE WHEN b.type='reserve' THEN b.kg ELSE -b.kg END)) AS reserved_kg,
      GREATEST(0, SUM(CASE WHEN b.type='reserve' THEN b.pc ELSE -b.pc END)) AS reserved_pc
    FROM base b
    LEFT JOIN public.billing_orders bo ON bo.id = b.billing_order_id
    WHERE b.client_id IS NOT NULL
      AND b.type IN ('reserve','release')
      AND (b.billing_order_id IS NULL OR COALESCE(bo.status::text,'') NOT IN ('collected','cancelled'))
    GROUP BY 1,2,3
  ),
  machine_list AS (
    -- All machines that have or had stock or reserves for this article
    SELECT client_id, article_id, machine_id FROM stock_calc
    UNION SELECT client_id, article_id, machine_id FROM res_raw WHERE machine_id IS NOT NULL
    UNION SELECT client_id, article_id, machine_id FROM mach_stats
  ),
  final_res AS (
    -- Distribute "global" reserves (machine_id IS NULL) among machines with stock
    WITH global_res AS (
      SELECT client_id, article_id, reserved_kg, reserved_pc FROM res_raw WHERE machine_id IS NULL
    ),
    loc_data AS (
      SELECT ml.client_id, ml.article_id, ml.machine_id,
        COALESCE(sc.stock_kg,0) AS stock_kg, COALESCE(sc.stock_pc,0) AS stock_pc,
        COALESCE(ms.machine_kg,0) AS machine_kg, COALESCE(ms.machine_pc,0) AS machine_pc,
        COALESCE(rr.reserved_kg,0) AS local_res_kg, COALESCE(rr.reserved_pc,0) AS local_res_pc
      FROM machine_list ml
      LEFT JOIN stock_calc sc USING (client_id, article_id, machine_id)
      LEFT JOIN mach_stats ms USING (client_id, article_id, machine_id)
      LEFT JOIN res_raw rr USING (client_id, article_id, machine_id)
    ),
    spill AS (
      SELECT ld.*,
        GREATEST(0, ld.stock_kg - ld.machine_kg - ld.local_res_kg) AS free_exped_kg,
        GREATEST(0, ld.stock_pc - ld.machine_pc - ld.local_res_pc) AS free_exped_pc,
        SUM(GREATEST(0, ld.stock_kg - ld.machine_kg - ld.local_res_kg)) OVER (PARTITION BY ld.client_id, ld.article_id) AS total_free_kg,
        SUM(GREATEST(0, ld.stock_pc - ld.machine_pc - ld.local_res_pc)) OVER (PARTITION BY ld.client_id, ld.article_id) AS total_free_pc,
        COALESCE(gr.reserved_kg,0) AS g_kg, COALESCE(gr.reserved_pc,0) AS g_pc
      FROM loc_data ld
      LEFT JOIN global_res gr USING (client_id, article_id)
    )
    SELECT client_id, article_id, machine_id,
      stock_kg, stock_pc, machine_kg, machine_pc,
      local_res_kg + (CASE WHEN total_free_kg > 0 THEN g_kg * (free_exped_kg / total_free_kg) ELSE 0 END) AS reserved_kg,
      local_res_pc + (CASE WHEN total_free_pc > 0 THEN g_pc * (free_exped_pc / total_free_pc) ELSE 0 END) AS reserved_pc
    FROM spill
  ),
  flows AS (
    -- Current month flows for KPIs
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN type='adjust_in' THEN kg WHEN type='adjust_out' THEN -kg ELSE 0 END) AS ent_kg,
      SUM(CASE WHEN type='adjust_in' THEN pc WHEN type='adjust_out' THEN -pc ELSE 0 END) AS ent_pc,
      SUM(CASE WHEN type='out' THEN kg WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg ELSE 0 END) AS del_kg,
      SUM(CASE WHEN type='out' THEN pc WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc ELSE 0 END) AS del_pc
    FROM base
    WHERE client_id IS NOT NULL AND in_month AND machine_id IS NOT NULL
    GROUP BY 1,2,3
  ),
  agg AS (
    -- Combine everything
    SELECT 
      fr.client_id, fr.article_id, fr.machine_id,
      COALESCE(fl.ent_kg,0) AS entrada_kg, COALESCE(fl.ent_pc,0) AS entrada_pc,
      COALESCE(fl.del_kg,0) AS delivered_kg, COALESCE(fl.del_pc,0) AS delivered_pc,
      fr.reserved_kg, fr.reserved_pc,
      fr.stock_kg, fr.stock_pc,
      fr.machine_kg, fr.machine_pc,
      GREATEST(0, fr.stock_kg - fr.reserved_kg) AS available_kg,
      GREATEST(0, fr.stock_pc - fr.reserved_pc) AS available_pc
    FROM final_res fr
    LEFT JOIN flows fl USING (client_id, article_id, machine_id)
  ),
  by_machine AS (
    SELECT a.client_id, a.article_id,
      jsonb_agg(
        jsonb_build_object(
          'machineId', a.machine_id,
          'machineName', COALESCE(mac.name,'—'),
          'entradaKg', a.entrada_kg, 'entradaRolls', a.entrada_pc,
          'deliveredKg', a.delivered_kg, 'deliveredRolls', a.delivered_pc,
          'reservedKg', a.reserved_kg, 'reservedRolls', a.reserved_pc,
          'stockKg', a.stock_kg, 'stockRolls', a.stock_pc,
          'machineKg', a.machine_kg, 'machineRolls', a.machine_pc,
          'availableKg', a.available_kg, 'availableRolls', a.available_pc
        ) ORDER BY COALESCE(mac.name,'—')
      ) AS machines
    FROM agg a
    LEFT JOIN public.machines mac ON mac.id = a.machine_id
    GROUP BY a.client_id, a.article_id
  ),
  per_article AS (
    SELECT a.client_id, a.article_id,
      SUM(a.entrada_kg) AS entrada_kg, SUM(a.entrada_pc) AS entrada_pc,
      SUM(a.delivered_kg) AS delivered_kg, SUM(a.delivered_pc) AS delivered_pc,
      SUM(a.reserved_kg) AS reserved_kg, SUM(a.reserved_pc) AS reserved_pc,
      SUM(a.stock_kg) AS stock_kg, SUM(a.stock_pc) AS stock_pc,
      SUM(a.machine_kg) AS machine_kg, SUM(a.machine_pc) AS machine_pc,
      SUM(a.available_kg) AS available_kg, SUM(a.available_pc) AS available_pc
    FROM agg a GROUP BY 1,2
  ),
  per_article_json AS (
    SELECT p.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', p.article_id,
          'articleName', COALESCE(art.name,'—'),
          'entradaKg', p.entrada_kg, 'entradaRolls', p.entrada_pc,
          'deliveredKg', p.delivered_kg, 'deliveredRolls', p.delivered_pc,
          'reservedKg', p.reserved_kg, 'reservedRolls', p.reserved_pc,
          'stockKg', p.stock_kg, 'stockRolls', p.stock_pc,
          'machineKg', p.machine_kg, 'machineRolls', p.machine_pc,
          'availableKg', p.available_kg, 'availableRolls', p.available_pc,
          'machines', COALESCE(bm.machines, '[]'::jsonb)
        ) ORDER BY COALESCE(art.name,'—')
      ) AS articles
    FROM per_article p
    LEFT JOIN public.articles art ON art.id = p.article_id
    LEFT JOIN by_machine bm ON bm.client_id = p.client_id AND bm.article_id = p.article_id
    GROUP BY p.client_id
  ),
  groups AS (
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'clientId', paj.client_id,
          'clientName', COALESCE(c.name,'—'),
          'articles', paj.articles
        ) ORDER BY COALESCE(c.name,'—')
      ) as grp
    FROM per_article_json paj
    LEFT JOIN public.clients c ON c.id = paj.client_id
  ),
  kpis AS (
    SELECT jsonb_build_object(
      'entradaKg', COALESCE(SUM(entrada_kg),0),
      'deliveredKg', COALESCE(SUM(delivered_kg),0),
      'stockKg', COALESCE(SUM(stock_kg),0),
      'stockRolls', COALESCE(SUM(stock_pc),0),
      'reservedKg', COALESCE(SUM(reserved_kg),0),
      'reservedRolls', COALESCE(SUM(reserved_pc),0),
      'availableKg', COALESCE(SUM(available_kg),0),
      'availableRolls', COALESCE(SUM(available_pc),0),
      'machineKg', COALESCE(SUM(machine_kg),0),
      'machineRolls', COALESCE(SUM(machine_pc),0)
    ) as kpi
    FROM per_article
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT grp FROM groups), '[]'::jsonb),
    'kpis', COALESCE((SELECT kpi FROM kpis), jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'reservedRolls',0,'availableKg',0,'availableRolls',0,'machineKg',0,'machineRolls',0))
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;
