-- 1. Corrige a RPC de visualização de estoque manual para garantir que:
--    - Reservas 'SEM MÁQUINA' (machine_id IS NULL) sejam devidamente exibidas.
--    - A soma dos disponíveis por máquina bata com o total do artigo.
--    - O cálculo de saldo físico 'stock_final' absorva as saídas iniciais sem estoque (trava em zero) para que entradas manuais posteriores sejam visíveis.

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
  -- FÍSICO: Entradas e Saídas
  phys_tl AS (
    SELECT client_id, article_id, machine_id, eff_at, id,
      CASE 
        WHEN type IN ('adjust_in','in') THEN kg
        WHEN type IN ('adjust_out','out') THEN -kg
        ELSE 0
      END AS d_kg,
      CASE 
        WHEN type IN ('adjust_in','in') THEN pc
        WHEN type IN ('adjust_out','out') THEN -pc
        ELSE 0
      END AS d_pc
    FROM base
    WHERE client_id IS NOT NULL
  ),
  phys_running AS (
    SELECT client_id, article_id, machine_id, id, d_kg, d_pc,
      SUM(d_kg) OVER w AS pfx_kg,
      SUM(d_pc) OVER w AS pfx_pc
    FROM phys_tl
    WINDOW w AS (PARTITION BY client_id, article_id, machine_id ORDER BY eff_at, (CASE WHEN d_kg + d_pc >= 0 THEN 0 ELSE 1 END), id ROWS UNBOUNDED PRECEDING)
  ),
  phys_final AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(d_kg) - LEAST(0, MIN(pfx_kg))) AS stock_kg,
      GREATEST(0, SUM(d_pc) - LEAST(0, MIN(pfx_pc))) AS stock_pc
    FROM phys_running
    GROUP BY 1,2,3
  ),
  -- MÁQUINA: Lançamentos "em máquina"
  mach AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN kg ELSE -kg END)) AS machine_kg,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN pc ELSE -pc END)) AS machine_pc
    FROM base
    WHERE client_id IS NOT NULL AND on_machine = true AND type IN ('adjust_in','adjust_out')
    GROUP BY 1,2,3
  ),
  -- RESERVAS: Bloqueios ativos
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
  -- KPIS DE MOVIMENTAÇÃO: Apenas do mês filtrado
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
  keys AS (
    SELECT client_id, article_id, machine_id FROM phys_final
    UNION SELECT client_id, article_id, machine_id FROM res
    UNION SELECT client_id, article_id, machine_id FROM mach
  ),
  pre_agg AS (
    SELECT 
      k.client_id, k.article_id, k.machine_id,
      COALESCE(s.stock_kg,0) AS stock_kg, COALESCE(s.stock_pc,0) AS stock_pc,
      COALESCE(m.machine_kg,0) AS machine_kg, COALESCE(m.machine_pc,0) AS machine_pc,
      COALESCE(r.reserved_kg,0) AS reserved_kg, COALESCE(r.reserved_pc,0) AS reserved_pc
    FROM keys k
    LEFT JOIN phys_final s USING (client_id, article_id, machine_id)
    LEFT JOIN mach m USING (client_id, article_id, machine_id)
    LEFT JOIN res r USING (client_id, article_id, machine_id)
  ),
  final_calc AS (
    SELECT 
      *,
      GREATEST(0, stock_kg - machine_kg) AS exped_kg,
      GREATEST(0, stock_pc - machine_pc) AS exped_pc,
      -- O disponível da máquina: Físico - Reservas (com trava em zero)
      -- Importante: se a reserva for global (machine_id null), ela aparecerá em uma linha separada
      machine_kg + GREATEST(0, GREATEST(0, stock_kg - machine_kg) - reserved_kg) AS avail_kg,
      machine_pc + GREATEST(0, GREATEST(0, stock_pc - machine_pc) - reserved_pc) AS avail_pc
    FROM pre_agg
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
      -- Disponível do Artigo deve descontar a reserva TOTAL do saldo TOTAL
      SUM(c.machine_kg) + GREATEST(0, SUM(GREATEST(0, c.stock_kg - c.machine_kg)) - SUM(c.reserved_kg)) AS avail_kg,
      SUM(c.machine_pc) + GREATEST(0, SUM(GREATEST(0, c.stock_pc - c.machine_pc)) - SUM(c.reserved_pc)) AS avail_pc,
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

-- 2. Correção Idempotente no Trigger de Espelhamento ( mirror_of_to_manual_stock )
--    Garante que atualizações em stock_movements (como mudar machine_id) reflitam no estoque manual.
CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_client uuid;
BEGIN
  IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
    -- Se era primeira e virou segunda, deleta do manual
    IF TG_OP = 'UPDATE' AND NOT COALESCE(OLD.is_second_quality, false) THEN
      DELETE FROM public.manual_stock_movements WHERE source_movement_id = OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.type::text IN ('reserve','release','out')
     OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
  THEN
    v_client := NEW.client_id;
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
    ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL 
    DO UPDATE SET
      pieces = EXCLUDED.pieces,
      weight_kg = EXCLUDED.weight_kg,
      machine_id = EXCLUDED.machine_id,
      client_id = EXCLUDED.client_id,
      type = EXCLUDED.type,
      created_at = EXCLUDED.created_at;
  END IF;
  RETURN NEW;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mirror_of_to_manual_stock() TO service_role;
