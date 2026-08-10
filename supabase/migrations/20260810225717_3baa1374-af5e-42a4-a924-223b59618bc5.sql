-- [Manual Stock Reset & Rebuild]
-- Goals: Clear all manual stock history, rebuild reservation/sync logic, and ensure total zero start.

-- 1) Clear all manual stock history
TRUNCATE public.manual_stock_movements CASCADE;

-- 2) Rebuild Mirror Triggers (Sync between OF/Stock Global and Manual Stock)
-- This ensures that OF operations (reserve, release, collect, cancel) are correctly mirrored.

CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_article_id UUID;
    v_client_id UUID;
BEGIN
    -- Only mirror first quality
    IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
        RETURN NEW;
    END IF;

    -- Get OF details
    SELECT client_id, article_id
    INTO v_client_id, v_article_id
    FROM public.billing_orders
    WHERE id = NEW.billing_order_id;

    -- Mirror movements tied to OFs
    IF NEW.type::text IN ('reserve', 'release', 'out') OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL) THEN
        INSERT INTO public.manual_stock_movements (
            company_id, client_id, article_id, machine_id,
            type, weight_kg, pieces, billing_order_id,
            created_at, source_movement_id, reason, created_by, on_machine
        ) VALUES (
            NEW.company_id, 
            COALESCE(v_client_id, NEW.client_id), 
            COALESCE(v_article_id, NEW.article_id), 
            NEW.machine_id,
            NEW.type::text, 
            COALESCE(NEW.weight_kg, 0), 
            COALESCE(NEW.pieces, 0), 
            NEW.billing_order_id,
            NEW.created_at, 
            NEW.id, 
            NEW.reason, 
            NEW.created_by,
            false -- Mirror movements are expeditions by default
        )
        ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
        DO UPDATE SET
            weight_kg = EXCLUDED.weight_kg,
            pieces = EXCLUDED.pieces,
            type = EXCLUDED.type,
            machine_id = EXCLUDED.machine_id,
            client_id = EXCLUDED.client_id,
            article_id = EXCLUDED.article_id;
    END IF;

    RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
    -- Only process movements that are already in manual stock or should be
    IF NEW.billing_order_id IS NULL AND NEW.type::text NOT IN ('in', 'adjust_in') THEN
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
        DELETE FROM public.manual_stock_movements WHERE source_movement_id = NEW.id;
        RETURN NEW;
    END IF;

    INSERT INTO public.manual_stock_movements (
        company_id, article_id, client_id, machine_id, billing_order_id,
        type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
    )
    VALUES (
        NEW.company_id, NEW.article_id, NEW.client_id, NEW.machine_id, NEW.billing_order_id,
        NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
        COALESCE(NEW.reason, 'Sincronização Física'),
        NEW.id, NEW.created_by, NEW.created_at, false
    )
    ON CONFLICT (source_movement_id)
    DO UPDATE SET
        pieces = EXCLUDED.pieces,
        weight_kg = EXCLUDED.weight_kg,
        type = EXCLUDED.type,
        machine_id = EXCLUDED.machine_id,
        client_id = EXCLUDED.client_id,
        article_id = EXCLUDED.article_id;

    RETURN NEW;
END;
$fn$;

-- 3) Backfill Current Reservations from Global Stock to Manual Stock
-- This ensures that even though history is cleared, current open OF reservations are respected.
INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id, billing_order_id,
    type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
)
SELECT 
    sm.company_id, sm.article_id, sm.client_id, sm.machine_id, sm.billing_order_id,
    sm.type::text, COALESCE(sm.pieces, 0), COALESCE(sm.weight_kg, 0),
    sm.reason, sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.billing_orders bo ON bo.id = sm.billing_order_id
WHERE sm.type::text IN ('reserve', 'release')
  AND bo.status NOT IN ('collected', 'cancelled')
  AND COALESCE(sm.is_second_quality, false) = false
ON CONFLICT (source_movement_id) DO NOTHING;

-- 4) Rebuild get_manual_stock_estoque (The Core View Logic)
-- Robust handling of Machine vs Expedition stock and accurate Availability.

CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(
  p_company_id uuid,
  p_month text DEFAULT 'all',
  p_client_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL
)
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
      'kpis', jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'availableKg',0));
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
  -- Physical Stock (Expedition only, Machine stock is separate)
  phys_events AS (
    SELECT client_id, article_id, machine_id, eff_at, id,
      CASE
        WHEN type = 'adjust_in' AND NOT on_machine THEN kg
        WHEN type = 'in' AND billing_order_id IS NOT NULL THEN kg
        WHEN type = 'adjust_out' AND NOT on_machine THEN -kg
        WHEN type = 'out' THEN -kg
        ELSE 0
      END AS d_kg,
      CASE
        WHEN type = 'adjust_in' AND NOT on_machine THEN pc
        WHEN type = 'in' AND billing_order_id IS NOT NULL THEN pc
        WHEN type = 'adjust_out' AND NOT on_machine THEN -pc
        WHEN type = 'out' THEN -pc
        ELSE 0
      END AS d_pc
    FROM base
    WHERE NOT on_machine OR (type = 'out' OR (type = 'in' AND billing_order_id IS NOT NULL))
  ),
  stock_calc AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(d_kg)) AS stock_kg,
      GREATEST(0, SUM(d_pc)) AS stock_rolls
    FROM phys_events
    GROUP BY 1,2,3
  ),
  -- Machine Stock
  machine_calc AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type = 'adjust_in' THEN kg WHEN type = 'adjust_out' THEN -kg ELSE 0 END)) AS machine_kg,
      GREATEST(0, SUM(CASE WHEN type = 'adjust_in' THEN pc WHEN type = 'adjust_out' THEN -pc ELSE 0 END)) AS machine_rolls
    FROM base
    WHERE on_machine
    GROUP BY 1,2,3
  ),
  -- Reservations
  res_calc AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type = 'reserve' THEN kg WHEN type = 'release' THEN -kg ELSE 0 END)) AS reserved_kg,
      GREATEST(0, SUM(CASE WHEN type = 'reserve' THEN pc WHEN type = 'release' THEN -pc ELSE 0 END)) AS reserved_rolls
    FROM base
    WHERE type IN ('reserve', 'release')
      -- Only count active reservations
      AND (billing_order_id IS NULL OR EXISTS (
          SELECT 1 FROM public.billing_orders bo 
          WHERE bo.id = base.billing_order_id AND bo.status NOT IN ('collected', 'cancelled')
      ))
    GROUP BY 1,2,3
  ),
  -- Monthly KPIs
  flow_calc AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN (type = 'adjust_in' AND NOT on_machine) THEN kg ELSE 0 END) AS entrada_kg,
      SUM(CASE WHEN (type = 'adjust_in' AND NOT on_machine) THEN pc ELSE 0 END) AS entrada_rolls,
      SUM(CASE WHEN type = 'out' THEN kg ELSE 0 END) AS delivered_kg,
      SUM(CASE WHEN type = 'out' THEN pc ELSE 0 END) AS delivered_rolls
    FROM base
    WHERE in_month
    GROUP BY 1,2,3
  ),
  keys AS (
    SELECT client_id, article_id, machine_id FROM stock_calc
    UNION SELECT client_id, article_id, machine_id FROM machine_calc
    UNION SELECT client_id, article_id, machine_id FROM res_calc
    UNION SELECT client_id, article_id, machine_id FROM flow_calc
  ),
  agg3 AS (
    SELECT k.client_id, k.article_id, k.machine_id,
      COALESCE(f.entrada_kg,0) AS entrada_kg, COALESCE(f.entrada_rolls,0) AS entrada_rolls,
      COALESCE(f.delivered_kg,0) AS delivered_kg, COALESCE(f.delivered_rolls,0) AS delivered_rolls,
      COALESCE(r.reserved_kg,0) AS reserved_kg, COALESCE(r.reserved_rolls,0) AS reserved_rolls,
      COALESCE(s.stock_kg,0) AS stock_kg, COALESCE(s.stock_rolls,0) AS stock_rolls,
      COALESCE(m.machine_kg,0) AS machine_kg, COALESCE(m.machine_rolls,0) AS machine_rolls,
      -- Available = Stock (Exped) - Reserved + Machine
      GREATEST(0, COALESCE(s.stock_kg,0) - COALESCE(r.reserved_kg,0) + COALESCE(m.machine_kg,0)) AS available_kg,
      GREATEST(0, COALESCE(s.stock_rolls,0) - COALESCE(r.reserved_rolls,0) + COALESCE(m.machine_rolls,0)) AS available_rolls
    FROM keys k
    LEFT JOIN stock_calc s USING (client_id, article_id, machine_id)
    LEFT JOIN machine_calc m USING (client_id, article_id, machine_id)
    LEFT JOIN res_calc r USING (client_id, article_id, machine_id)
    LEFT JOIN flow_calc f USING (client_id, article_id, machine_id)
  ),
  by_machine AS (
    SELECT a.client_id, a.article_id,
      jsonb_agg(
        jsonb_build_object(
          'machineId', a.machine_id,
          'machineName', COALESCE(mac.name,'—'),
          'entradaKg', a.entrada_kg, 'entradaRolls', a.entrada_rolls,
          'deliveredKg', a.delivered_kg, 'deliveredRolls', a.delivered_rolls,
          'reservedKg', a.reserved_kg, 'reservedRolls', a.reserved_rolls,
          'stockKg', a.stock_kg, 'stockRolls', a.stock_rolls,
          'machineKg', a.machine_kg, 'machineRolls', a.machine_rolls,
          'availableKg', a.available_kg, 'availableRolls', a.available_rolls
        ) ORDER BY COALESCE(mac.name,'—')
      ) AS machines
    FROM agg3 a
    LEFT JOIN public.machines mac ON mac.id = a.machine_id
    GROUP BY a.client_id, a.article_id
  ),
  per_article AS (
    SELECT a.client_id, a.article_id,
      SUM(a.entrada_kg) AS entrada_kg, SUM(a.entrada_rolls) AS entrada_rolls,
      SUM(a.delivered_kg) AS delivered_kg, SUM(a.delivered_rolls) AS delivered_rolls,
      SUM(a.reserved_kg) AS reserved_kg, SUM(a.reserved_rolls) AS reserved_rolls,
      SUM(a.stock_kg) AS stock_kg, SUM(a.stock_rolls) AS stock_rolls,
      SUM(a.machine_kg) AS machine_kg, SUM(a.machine_rolls) AS machine_rolls,
      SUM(a.available_kg) AS available_kg, SUM(a.available_rolls) AS available_rolls
    FROM agg3 a GROUP BY 1,2
  ),
  per_article_json AS (
    SELECT p.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', p.article_id,
          'articleName', COALESCE(art.name,'—'),
          'entradaKg', p.entrada_kg, 'entradaRolls', p.entrada_rolls,
          'deliveredKg', p.delivered_kg, 'deliveredRolls', p.delivered_rolls,
          'reservedKg', p.reserved_kg, 'reservedRolls', p.reserved_rolls,
          'stockKg', p.stock_kg, 'stockRolls', p.stock_rolls,
          'machineKg', p.machine_kg, 'machineRolls', p.machine_rolls,
          'availableKg', p.available_kg, 'availableRolls', p.available_rolls,
          'byMachine', COALESCE((SELECT bm.machines FROM by_machine bm WHERE bm.client_id=p.client_id AND bm.article_id=p.article_id), '[]'::jsonb)
        ) ORDER BY COALESCE(art.name,'—')
      ) AS articles,
      SUM(p.entrada_kg) AS t_entrada_kg,
      SUM(p.delivered_kg) AS t_delivered_kg,
      SUM(p.stock_kg) AS t_stock_kg,
      SUM(p.stock_rolls) AS t_stock_rolls,
      SUM(p.reserved_kg) AS t_reserved_kg,
      SUM(p.available_kg) AS t_available_kg
    FROM per_article p
    LEFT JOIN public.articles art ON art.id = p.article_id
    GROUP BY p.client_id
  ),
  groups AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'clientId', paj.client_id,
        'clientName', COALESCE(c.name,'—'),
        'articles', paj.articles,
        'totalEntradaKg', paj.t_entrada_kg,
        'totalDeliveredKg', paj.t_delivered_kg,
        'totalStockKg', paj.t_stock_kg,
        'totalStockRolls', paj.t_stock_rolls,
        'totalReservedKg', paj.t_reserved_kg,
        'totalAvailableKg', paj.t_available_kg
      ) ORDER BY COALESCE(c.name,'—')
    ) AS gs
    FROM per_article_json paj
    LEFT JOIN public.clients c ON c.id = paj.client_id
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(entrada_kg),0) AS entrada_kg,
      COALESCE(SUM(delivered_kg),0) AS delivered_kg,
      COALESCE(SUM(stock_kg),0) AS stock_kg,
      COALESCE(SUM(stock_rolls),0) AS stock_rolls,
      COALESCE(SUM(reserved_kg),0) AS reserved_kg,
      COALESCE(SUM(available_kg),0) AS available_kg
    FROM per_article
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT gs FROM groups), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'entradaKg', (SELECT entrada_kg FROM kpis),
      'deliveredKg', (SELECT delivered_kg FROM kpis),
      'stockKg', (SELECT stock_kg FROM kpis),
      'stockRolls', (SELECT stock_rolls FROM kpis),
      'reservedKg', (SELECT reserved_kg FROM kpis),
      'availableKg', (SELECT available_kg FROM kpis)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

-- 5) Final Grants
REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;
