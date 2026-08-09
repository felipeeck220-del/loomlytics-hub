-- Migration: Fix chronological stock balance and "SEM MÁQUINA" mirroring consistency

-- 1. Redefine the mirror trigger to handle machine_id falling back correctly 
-- and ensure that "out" movements are ALWAYS mirrored even with NULL machine_id.
CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_client uuid;
BEGIN
  -- Ignora segunda qualidade (não vai para o estoque manual de primeira)
  IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Tipos que devem ser espelhados
  IF NEW.type::text IN ('reserve','release','out')
     OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
  THEN
    v_client := NEW.client_id;
    -- Fallback para o cliente do artigo caso o movimento não tenha client_id
    IF v_client IS NULL THEN
      SELECT a.client_id INTO v_client FROM public.articles a
      WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id;
    END IF;

    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id,
       type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine)
    VALUES
      (NEW.company_id, NEW.article_id, v_client, NEW.machine_id, NEW.billing_order_id,
       NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
       NEW.reason, NEW.id, NEW.created_by, NEW.created_at, false)
    ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

-- 2. Backfill missing "out" movements for SEM MÁQUINA or orphan movements
INSERT INTO public.manual_stock_movements
  (company_id, article_id, client_id, machine_id, billing_order_id,
   type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine)
SELECT 
  sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id, sm.billing_order_id,
  sm.type::text, COALESCE(sm.pieces,0), COALESCE(sm.weight_kg,0),
  sm.reason, sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
WHERE sm.type = 'out' 
  AND sm.billing_order_id IS NOT NULL
  AND NOT COALESCE(sm.is_second_quality, false)
  AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements msm 
    WHERE msm.source_movement_id = sm.id
  )
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL DO NOTHING;

-- 3. Restore the advanced chronological balancing RPC
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(
  p_company_id uuid, 
  p_month text DEFAULT 'all'::text, 
  p_client_id uuid DEFAULT NULL::uuid, 
  p_article_id uuid DEFAULT NULL::uuid
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
      'kpis', jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'reservedRolls',0,'availableKg',0,'availableRolls',0,'machineKg',0,'machineRolls',0));
  END IF;

  WITH res_first AS (
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
    WHERE client_id IS NOT NULL
      AND (type IN ('adjust_in','adjust_out','out') OR (type = 'in' AND billing_order_id IS NOT NULL))
  ),
  running AS (
    SELECT client_id, article_id, machine_id, eff_at, id,
           SUM(d_kg) OVER (PARTITION BY client_id, article_id, machine_id ORDER BY eff_at, id) as r_kg,
           SUM(d_pc) OVER (PARTITION BY client_id, article_id, machine_id ORDER BY eff_at, id) as r_pc
    FROM phys
  ),
  trava AS (
    SELECT client_id, article_id, machine_id,
           MIN(r_kg) as min_kg, MIN(r_pc) as min_pc
    FROM running
    GROUP BY 1,2,3
  ),
  phys_final AS (
    SELECT p.client_id, p.article_id, p.machine_id,
           GREATEST(0, SUM(p.d_kg) - LEAST(0, COALESCE(t.min_kg,0))) as phys_kg,
           GREATEST(0, SUM(p.d_pc) - LEAST(0, COALESCE(t.min_pc,0))) as phys_pc
    FROM phys p
    LEFT JOIN trava t ON t.client_id = p.client_id AND t.article_id = p.article_id AND t.machine_id IS NOT DISTINCT FROM p.machine_id
    GROUP BY 1,2,3, t.min_kg, t.min_pc
  ),
  reserves AS (
    SELECT client_id, article_id, machine_id,
           SUM(CASE WHEN type = 'reserve' THEN kg ELSE -kg END) as res_kg,
           SUM(CASE WHEN type = 'reserve' THEN pc ELSE -pc END) as res_pc
    FROM base
    WHERE type IN ('reserve','release')
    GROUP BY 1,2,3
  ),
  maq_bal AS (
    SELECT client_id, article_id, machine_id,
           SUM(CASE WHEN type = 'adjust_in' THEN kg WHEN type = 'adjust_out' THEN -kg ELSE 0 END) as maq_kg,
           SUM(CASE WHEN type = 'adjust_in' THEN pc WHEN type = 'adjust_out' THEN -pc ELSE 0 END) as maq_pc
    FROM base
    WHERE on_machine = true
    GROUP BY 1,2,3
  ),
  machine_data AS (
    SELECT 
      COALESCE(p.client_id, r.client_id, m.client_id) as client_id,
      COALESCE(p.article_id, r.article_id, m.article_id) as article_id,
      COALESCE(p.machine_id, r.machine_id, m.machine_id) as machine_id,
      COALESCE(p.phys_kg,0) as phys_kg,
      COALESCE(p.phys_pc,0) as phys_pc,
      GREATEST(0, COALESCE(r.res_kg,0)) as res_kg,
      GREATEST(0, COALESCE(r.res_pc,0)) as res_pc,
      COALESCE(m.maq_kg,0) as maq_kg,
      COALESCE(m.maq_pc,0) as maq_pc
    FROM phys_final p
    FULL OUTER JOIN reserves r ON p.client_id = r.client_id AND p.article_id = r.article_id AND p.machine_id IS NOT DISTINCT FROM r.machine_id
    FULL OUTER JOIN maq_bal m ON COALESCE(p.client_id, r.client_id) = m.client_id 
                             AND COALESCE(p.article_id, r.article_id) = m.article_id 
                             AND COALESCE(p.machine_id, r.machine_id) IS NOT DISTINCT FROM m.machine_id
  ),
  aggregated AS (
    SELECT 
      md.client_id,
      c.name as client_name,
      md.article_id,
      a.name as article_name,
      jsonb_agg(jsonb_build_object(
        'machineId', md.machine_id,
        'machineName', COALESCE(mac.name, 'SEM MÁQUINA'),
        'stockKg', md.phys_kg,
        'stockRolls', md.phys_pc,
        'reservedKg', md.res_kg,
        'reservedRolls', md.res_pc,
        'machineKg', md.maq_kg,
        'machineRolls', md.maq_pc,
        'availableKg', GREATEST(0, md.phys_kg - md.res_kg) + md.maq_kg,
        'availableRolls', GREATEST(0, md.phys_pc - md.res_pc) + md.maq_pc
      )) as machines,
      SUM(GREATEST(0, md.phys_pc - md.res_pc) + md.maq_pc) as total_available_rolls
    FROM machine_data md
    JOIN public.clients c ON c.id = md.client_id
    JOIN public.articles a ON a.id = md.article_id
    LEFT JOIN public.machines mac ON mac.id = md.machine_id
    GROUP BY 1,2,3,4
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'clientId', client_id,
        'clientName', client_name,
        'articles', (
          SELECT jsonb_agg(jsonb_build_object(
            'articleId', article_id,
            'articleName', article_name,
            'availableRolls', total_available_rolls,
            'byMachine', machines
          ))
          FROM aggregated a2 WHERE a2.client_id = aggregated.client_id
        )
      )) FROM (SELECT DISTINCT client_id, client_name FROM aggregated) c_list
    ), '[]'::jsonb),
    'kpis', (
      SELECT jsonb_build_object(
        'entradaKg', SUM(CASE WHEN type = 'adjust_in' AND in_month THEN kg ELSE 0 END),
        'deliveredKg', SUM(CASE WHEN type = 'out' AND in_month THEN kg ELSE 0 END),
        'stockKg', (SELECT SUM(phys_kg) FROM machine_data),
        'stockRolls', (SELECT SUM(phys_pc) FROM machine_data),
        'reservedKg', (SELECT SUM(res_kg) FROM machine_data),
        'reservedRolls', (SELECT SUM(res_pc) FROM machine_data),
        'machineKg', (SELECT SUM(maq_kg) FROM machine_data),
        'machineRolls', (SELECT SUM(maq_pc) FROM machine_data),
        'availableKg', (SELECT SUM(GREATEST(0, phys_kg - res_kg) + maq_kg) FROM machine_data),
        'availableRolls', (SELECT SUM(GREATEST(0, phys_pc - res_pc) + maq_pc) FROM machine_data)
      ) FROM base
    )
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

-- Re-aplicar permissões
REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mirror_of_to_manual_stock() TO service_role;
