-- 1. Remover movimentos "out" que foram espelhados Retroativamente (Backfill)
-- Esses movimentos estão causando saldo zero porque datam de antes das entradas manuais no histórico manual.
DELETE FROM public.manual_stock_movements
WHERE source_movement_id IS NOT NULL 
  AND type = 'out'
  AND created_at < '2026-08-01'; -- Limite arbitrário para remover o backfill antigo sem afetar movimentos novos reais.

-- 2. Refatorar get_manual_stock_estoque para ser mais tolerante com cronologia
-- Removendo a trava cronológica agressiva (phys_final) que zerava o estoque se ficasse negativo em qualquer ponto do tempo.
-- Agora o saldo é simplesmente a soma, com trava final em zero.

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

  WITH base AS (
    SELECT COALESCE(m.client_id, a.client_id) AS client_id,
           m.article_id, m.machine_id, m.type, m.billing_order_id,
           m.created_at,
           m.id, COALESCE(m.on_machine,false) AS on_machine,
           (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_month) AS in_month,
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  phys_final AS (
    -- Soma simples sem trava cronológica (evita zerar tudo por causa de datas de OF antigas)
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE 
        WHEN type IN ('adjust_in','in') THEN kg 
        WHEN type IN ('adjust_out','out') THEN -kg 
        ELSE 0 END)) AS stock_kg,
      GREATEST(0, SUM(CASE 
        WHEN type IN ('adjust_in','in') THEN pc 
        WHEN type IN ('adjust_out','out') THEN -pc 
        ELSE 0 END)) AS stock_pc
    FROM base
    WHERE client_id IS NOT NULL
    GROUP BY 1,2,3
  ),
  mach AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN kg ELSE -kg END)) AS machine_kg,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN pc ELSE -pc END)) AS machine_pc
    FROM base
    WHERE client_id IS NOT NULL AND on_machine = true AND type IN ('adjust_in','adjust_out')
    GROUP BY 1,2,3
  ),
  res AS (
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
  keys AS (
    SELECT client_id, article_id, machine_id FROM phys_final
    UNION SELECT client_id, article_id, machine_id FROM res
    UNION SELECT client_id, article_id, machine_id FROM mach
  ),
  final_calc AS (
    SELECT 
      k.client_id, k.article_id, k.machine_id,
      COALESCE(s.stock_kg,0) AS stock_kg, COALESCE(s.stock_pc,0) AS stock_pc,
      COALESCE(m.machine_kg,0) AS machine_kg, COALESCE(m.machine_pc,0) AS machine_pc,
      COALESCE(r.reserved_kg,0) AS reserved_kg, COALESCE(r.reserved_pc,0) AS reserved_pc,
      GREATEST(0, COALESCE(s.stock_kg,0) - COALESCE(m.machine_kg,0)) AS exped_kg,
      GREATEST(0, COALESCE(s.stock_pc,0) - COALESCE(m.machine_pc,0)) AS exped_pc,
      COALESCE(m.machine_kg,0) + GREATEST(0, GREATEST(0, COALESCE(s.stock_kg,0) - COALESCE(m.machine_kg,0)) - COALESCE(r.reserved_kg,0)) AS avail_kg,
      COALESCE(m.machine_pc,0) + GREATEST(0, GREATEST(0, COALESCE(s.stock_pc,0) - COALESCE(m.machine_pc,0)) - COALESCE(r.reserved_pc,0)) AS avail_pc
    FROM keys k
    LEFT JOIN phys_final s USING (client_id, article_id, machine_id)
    LEFT JOIN mach m USING (client_id, article_id, machine_id)
    LEFT JOIN res r USING (client_id, article_id, machine_id)
  ),
  flows AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN type='adjust_in' THEN kg WHEN type='adjust_out' THEN -kg ELSE 0 END) AS ent_kg,
      SUM(CASE WHEN type='adjust_in' THEN pc WHEN type='adjust_out' THEN -pc ELSE 0 END) AS ent_pc,
      SUM(CASE WHEN type='out' THEN kg WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg ELSE 0 END) AS del_kg,
      SUM(CASE WHEN type='out' THEN pc WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc ELSE 0 END) AS del_pc
    FROM base
    WHERE client_id IS NOT NULL AND in_month
    GROUP BY 1,2,3
  ),
  by_machine AS (
    SELECT 
      c.client_id, c.article_id,
      jsonb_agg(
        jsonb_build_object(
          'machineId', c.machine_id,
          'machineName', COALESCE(mac.name, CASE WHEN c.machine_id IS NULL THEN 'SEM MÁQUINA' ELSE 'Desconhecida' END),
          'entradaKg', COALESCE(f.ent_kg,0), 'entradaRolls', COALESCE(f.ent_pc,0),
          'deliveredKg', COALESCE(f.del_kg,0), 'deliveredRolls', COALESCE(f.del_pc,0),
          'reservedKg', c.reserved_kg, 'reservedRolls', c.reserved_pc,
          'stockKg', c.stock_kg, 'stockRolls', c.stock_pc,
          'machineKg', c.machine_kg, 'machineRolls', c.machine_pc,
          'availableKg', c.avail_kg, 'availableRolls', c.avail_pc
        ) ORDER BY mac.name NULLS FIRST
      ) AS machines
    FROM final_calc c
    LEFT JOIN public.machines mac ON mac.id = c.machine_id
    LEFT JOIN flows f USING (client_id, article_id, machine_id)
    GROUP BY 1,2
  ),
  per_article AS (
    SELECT 
      c.client_id, c.article_id,
      SUM(c.stock_kg) AS stock_kg, SUM(c.stock_pc) AS stock_pc,
      SUM(c.reserved_kg) AS reserved_kg, SUM(c.reserved_pc) AS reserved_pc,
      SUM(c.machine_kg) AS machine_kg, SUM(c.machine_pc) AS machine_pc,
      SUM(c.avail_kg) AS avail_kg, SUM(c.avail_pc) AS avail_pc,
      SUM(COALESCE(f.ent_kg,0)) AS ent_kg, SUM(COALESCE(f.ent_pc,0)) AS ent_pc,
      SUM(COALESCE(f.del_kg,0)) AS del_kg, SUM(COALESCE(f.del_pc,0)) AS del_pc
    FROM final_calc c
    LEFT JOIN flows f USING (client_id, article_id, machine_id)
    GROUP BY 1,2
  ),
  per_client AS (
    SELECT 
      pa.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', pa.article_id,
          'articleName', COALESCE(art.name, 'Desconhecido'),
          'entradaKg', pa.ent_kg, 'entradaRolls', pa.ent_pc,
          'deliveredKg', pa.del_kg, 'deliveredRolls', pa.del_pc,
          'reservedKg', pa.reserved_kg, 'reservedRolls', pa.reserved_pc,
          'stockKg', pa.stock_kg, 'stockRolls', pa.stock_pc,
          'machineKg', pa.machine_kg, 'machineRolls', pa.machine_pc,
          'availableKg', pa.avail_kg, 'availableRolls', pa.avail_pc,
          'machines', COALESCE(bm.machines, '[]'::jsonb)
        ) ORDER BY art.name
      ) AS articles
    FROM per_article pa
    LEFT JOIN public.articles art ON art.id = pa.article_id
    LEFT JOIN by_machine bm USING (client_id, article_id)
    GROUP BY 1
  ),
  groups AS (
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'clientId', pc.client_id,
          'clientName', COALESCE(cl.name, 'Desconhecido'),
          'articles', pc.articles
        ) ORDER BY cl.name
      ) AS groups_data
    FROM per_client pc
    LEFT JOIN public.clients cl ON cl.id = pc.client_id
  ),
  kpis AS (
    SELECT jsonb_build_object(
      'entradaKg', SUM(ent_kg),
      'deliveredKg', SUM(del_kg),
      'stockKg', SUM(stock_kg),
      'stockRolls', SUM(stock_pc),
      'reservedKg', SUM(reserved_kg),
      'reservedRolls', SUM(reserved_pc),
      'availableKg', SUM(avail_kg),
      'availableRolls', SUM(avail_pc),
      'machineKg', SUM(machine_kg),
      'machineRolls', SUM(machine_pc)
    ) AS kpis_data
    FROM per_article
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT groups_data FROM groups), '[]'::jsonb),
    'kpis', COALESCE((SELECT kpis_data FROM kpis), 
      jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'reservedRolls',0,'availableKg',0,'availableRolls',0,'machineKg',0,'machineRolls',0))
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;
