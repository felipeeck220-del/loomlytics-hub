-- [Manual Stock Stabilization - Final Audit & Refinement]
-- Objetivo: Garantir que a reserva global 'reserve' seja SEMPRE refletida no manual stock
-- e que a liberação/estorno não cause duplicidade.

-- 1) Ajuste no Trigger de Espelhamento (mirror_of_to_manual_stock)
-- Garantir que 'reserve' e 'release' globais sejam espelhados sem depender de máquina (machine_id pode ser null)
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
    -- Ignorar segunda qualidade (conforme mestre.md)
    IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
        RETURN NEW;
    END IF;

    -- Buscar metadados da OF se não fornecidos no movimento
    IF NEW.billing_order_id IS NOT NULL THEN
        SELECT client_id, article_id INTO v_client_id, v_article_id
        FROM public.billing_orders WHERE id = NEW.billing_order_id;
    END IF;

    -- Apenas movimentos de OF ou entradas/ajustes
    IF NEW.type::text IN ('reserve', 'release', 'out', 'in', 'adjust_in', 'adjust_out') THEN
        INSERT INTO public.manual_stock_movements (
            company_id, client_id, article_id, machine_id,
            type, weight_kg, pieces, billing_order_id,
            created_at, source_movement_id, reason, created_by, on_machine
        ) VALUES (
            NEW.company_id, 
            COALESCE(NEW.client_id, v_client_id), 
            COALESCE(NEW.article_id, v_article_id), 
            NEW.machine_id,
            NEW.type::text, 
            COALESCE(NEW.weight_kg, 0), 
            COALESCE(NEW.pieces, 0), 
            NEW.billing_order_id,
            NEW.created_at, 
            NEW.id, 
            COALESCE(NEW.reason, 'Sincronização Automática'), 
            NEW.created_by,
            false -- Movimentos espelhados são expedição por padrão
        )
        ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
        DO UPDATE SET
            weight_kg = EXCLUDED.weight_kg,
            pieces = EXCLUDED.pieces,
            type = EXCLUDED.type,
            machine_id = EXCLUDED.machine_id,
            client_id = EXCLUDED.client_id,
            article_id = EXCLUDED.article_id,
            reason = EXCLUDED.reason;
    END IF;

    RETURN NEW;
END;
$fn$;

-- 2) Refinamento da RPC get_manual_stock_estoque (available_rolls fix)
-- Garantir que a reserva não consuma o saldo "Em Maquina" (on_machine).
-- A fórmula correta é: Disponível = Em_Maq + GREATEST(0, Expedicao - Reservas)

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

  WITH base AS (
    SELECT 
      COALESCE(m.client_id, a.client_id) AS client_id,
      m.article_id, m.machine_id, m.type, m.billing_order_id,
      m.created_at,
      COALESCE(m.on_machine, false) AS on_machine,
      (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_month) AS in_month,
      COALESCE(m.weight_kg, 0)::numeric AS kg,
      COALESCE(m.pieces, 0)::numeric AS pc
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  phys_exped AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN (type = 'adjust_in' AND NOT on_machine) OR (type = 'in' AND billing_order_id IS NOT NULL) THEN kg
               WHEN (type = 'adjust_out' AND NOT on_machine) OR (type = 'out') THEN -kg 
               ELSE 0 END) AS stock_kg,
      SUM(CASE WHEN (type = 'adjust_in' AND NOT on_machine) OR (type = 'in' AND billing_order_id IS NOT NULL) THEN pc
               WHEN (type = 'adjust_out' AND NOT on_machine) OR (type = 'out') THEN -pc 
               ELSE 0 END) AS stock_rolls
    FROM base
    GROUP BY 1,2,3
  ),
  phys_machine AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN type = 'adjust_in' THEN kg WHEN type = 'adjust_out' THEN -kg ELSE 0 END) AS machine_kg,
      SUM(CASE WHEN type = 'adjust_in' THEN pc WHEN type = 'adjust_out' THEN -pc ELSE 0 END) AS machine_rolls
    FROM base
    WHERE on_machine
    GROUP BY 1,2,3
  ),
  active_res AS (
    SELECT b.client_id, b.article_id, b.machine_id,
      SUM(CASE WHEN b.type = 'reserve' THEN b.kg WHEN b.type = 'release' THEN -b.kg ELSE 0 END) AS res_kg,
      SUM(CASE WHEN b.type = 'reserve' THEN b.pc WHEN b.type = 'release' THEN -b.pc ELSE 0 END) AS res_pc
    FROM base b
    WHERE b.type IN ('reserve', 'release')
      AND EXISTS (
        SELECT 1 FROM public.billing_orders bo 
        WHERE bo.id = b.billing_order_id AND bo.status NOT IN ('collected', 'cancelled')
      )
    GROUP BY 1,2,3
  ),
  monthly_flow AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN type = 'adjust_in' AND NOT on_machine AND in_month THEN kg ELSE 0 END) AS entrada_kg,
      SUM(CASE WHEN type = 'adjust_in' AND NOT on_machine AND in_month THEN pc ELSE 0 END) AS entrada_rolls,
      SUM(CASE WHEN type = 'out' AND in_month THEN kg ELSE 0 END) AS delivered_kg,
      SUM(CASE WHEN type = 'out' AND in_month THEN pc ELSE 0 END) AS delivered_rolls
    FROM base
    GROUP BY 1,2,3
  ),
  keys AS (
    SELECT client_id, article_id, machine_id FROM phys_exped
    UNION SELECT client_id, article_id, machine_id FROM phys_machine
    UNION SELECT client_id, article_id, machine_id FROM active_res
    UNION SELECT client_id, article_id, machine_id FROM monthly_flow
  ),
  final_agg AS (
    SELECT 
      k.client_id, k.article_id, k.machine_id,
      COALESCE(m.entrada_kg, 0) AS entrada_kg, COALESCE(m.entrada_rolls, 0) AS entrada_rolls,
      COALESCE(m.delivered_kg, 0) AS delivered_kg, COALESCE(m.delivered_rolls, 0) AS delivered_rolls,
      GREATEST(0, COALESCE(e.stock_kg, 0)) AS stock_kg, GREATEST(0, COALESCE(e.stock_rolls, 0)) AS stock_rolls,
      GREATEST(0, COALESCE(pm.machine_kg, 0)) AS machine_kg, GREATEST(0, COALESCE(pm.machine_rolls, 0)) AS machine_rolls,
      GREATEST(0, COALESCE(r.res_kg, 0)) AS reserved_kg, GREATEST(0, COALESCE(r.res_pc, 0)) AS reserved_rolls,
      -- Disponível = Palete na Máquina + Saldo Expedição Livre (Expedicao - Reservas, com trava em zero)
      COALESCE(pm.machine_kg, 0) + GREATEST(0, COALESCE(e.stock_kg, 0) - COALESCE(r.res_kg, 0)) AS available_kg,
      COALESCE(pm.machine_rolls, 0) + GREATEST(0, COALESCE(e.stock_rolls, 0) - COALESCE(r.res_pc, 0)) AS available_rolls
    FROM keys k
    LEFT JOIN phys_exped e USING (client_id, article_id, machine_id)
    LEFT JOIN phys_machine pm USING (client_id, article_id, machine_id)
    LEFT JOIN active_res r USING (client_id, article_id, machine_id)
    LEFT JOIN monthly_flow m USING (client_id, article_id, machine_id)
  ),
  by_machine AS (
    SELECT a.client_id, a.article_id,
      jsonb_agg(
        jsonb_build_object(
          'machineId', a.machine_id,
          'machineName', COALESCE(mac.name, '—'),
          'entradaKg', a.entrada_kg, 'entradaRolls', a.entrada_rolls,
          'deliveredKg', a.delivered_kg, 'deliveredRolls', a.delivered_rolls,
          'reservedKg', a.reserved_kg, 'reservedRolls', a.reserved_rolls,
          'stockKg', a.stock_kg, 'stockRolls', a.stock_rolls,
          'machineKg', a.machine_kg, 'machineRolls', a.machine_rolls,
          'availableKg', a.available_kg, 'availableRolls', a.available_rolls
        ) ORDER BY COALESCE(mac.name, '—')
      ) AS machines
    FROM final_agg a
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
    FROM final_agg a GROUP BY 1,2
  ),
  per_article_json AS (
    SELECT p.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', p.article_id,
          'articleName', COALESCE(art.name, '—'),
          'entradaKg', p.entrada_kg, 'entradaRolls', p.entrada_rolls,
          'deliveredKg', p.delivered_kg, 'deliveredRolls', p.delivered_rolls,
          'reservedKg', p.reserved_kg, 'reservedRolls', p.reserved_rolls,
          'stockKg', p.stock_kg, 'stockRolls', p.stock_rolls,
          'machineKg', p.machine_kg, 'machineRolls', p.machine_rolls,
          'availableKg', p.available_kg, 'availableRolls', p.available_rolls,
          'byMachine', COALESCE((SELECT bm.machines FROM by_machine bm WHERE bm.client_id=p.client_id AND bm.article_id=p.article_id), '[]'::jsonb)
        ) ORDER BY COALESCE(art.name, '—')
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
        'clientName', COALESCE(c.name, '—'),
        'articles', paj.articles,
        'totalEntradaKg', paj.t_entrada_kg,
        'totalDeliveredKg', paj.t_delivered_kg,
        'totalStockKg', paj.t_stock_kg,
        'totalStockRolls', paj.t_stock_rolls,
        'totalReservedKg', paj.t_reserved_kg,
        'totalAvailableKg', paj.t_available_kg
      ) ORDER BY COALESCE(c.name, '—')
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

-- Final Grants
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO service_role;
