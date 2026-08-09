-- 1. IDENTIFICAÇÃO E RESTAURAÇÃO DE ENTRADAS FÍSICAS MESTRE (Lastro para as saídas de OF)
-- O estoque manual estava zerado porque espelhava as SAÍDAS das OFs, mas não as ENTRADAS originais que geraram os rolos.
-- Para que o saldo não fique negativo, precisamos que o estoque manual tenha o lastro físico do sistema principal.

INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id, billing_order_id,
    type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine
)
SELECT 
    sm.company_id, sm.article_id, COALESCE(sm.client_id, a.client_id), sm.machine_id, sm.billing_order_id,
    sm.type::text, COALESCE(sm.pieces, 0), COALESCE(sm.weight_kg, 0),
    'Lastro físico original (sincronização)', sm.id, sm.created_by, sm.created_at, false
FROM public.stock_movements sm
JOIN public.articles a ON a.id = sm.article_id
WHERE a.name IN ('MALHA EXCLUSIVE', 'RIBANA 2x1 EXCLUSIVE')
AND sm.type::text IN ('in', 'adjust_in')
AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements ms 
    WHERE ms.source_movement_id = sm.id
)
ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL DO NOTHING;

-- 2. LIMPEZA DE MOVIMENTOS DE SAÍDA DUPLICADOS OU SEM LASTRO
-- Removemos qualquer movimento espelhado que não tenha mais correspondente íntegro no mestre.
DELETE FROM public.manual_stock_movements
WHERE source_movement_id IS NOT NULL
AND source_movement_id NOT IN (SELECT id FROM public.stock_movements);

-- 3. ESTABILIZAÇÃO DA LÓGICA DE SALDO (RPC)
-- Ajustamos a RPC para que o saldo disponível considere a soma global do artigo por tenant,
-- evitando que reservas "sem máquina" zerem o saldo de máquinas específicas na visualização.
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(
  p_company_id uuid,
  p_month text default 'all',
  p_client_id uuid default null,
  p_article_id uuid default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT r.billing_order_id, r.article_id, MIN(r.created_at) AS first_at
    FROM public.manual_stock_movements r
    WHERE r.company_id = p_company_id AND r.type = 'reserve' AND r.billing_order_id IS NOT NULL
    GROUP BY 1,2
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
    WHERE m.company_id = p_company_id
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  -- Lógica Global: Físico - Reservas (Sem quebra por máquina para evitar o erro de saldo negativo fantasma)
  phys_final AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type IN ('adjust_in','in') THEN kg WHEN type IN ('adjust_out','out') THEN -kg ELSE 0 END)) AS stock_kg,
      GREATEST(0, SUM(CASE WHEN type IN ('adjust_in','in') THEN pc WHEN type IN ('adjust_out','out') THEN -pc ELSE 0 END)) AS stock_pc
    FROM base
    GROUP BY 1,2,3
  ),
  res AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type='reserve' THEN kg WHEN type='release' THEN -kg ELSE 0 END)) AS reserved_kg,
      GREATEST(0, SUM(CASE WHEN type='reserve' THEN pc WHEN type='release' THEN -pc ELSE 0 END)) AS reserved_pc
    FROM base
    LEFT JOIN public.billing_orders bo ON bo.id = base.billing_order_id
    WHERE type IN ('reserve','release')
      AND (billing_order_id IS NULL OR COALESCE(bo.status::text,'') NOT IN ('collected','cancelled'))
    GROUP BY 1,2,3
  ),
  mach AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN kg ELSE -kg END)) AS machine_kg,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN pc ELSE -pc END)) AS machine_pc
    FROM base
    WHERE on_machine = true AND type IN ('adjust_in','adjust_out')
    GROUP BY 1,2,3
  ),
  flows AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN type='adjust_in' THEN kg WHEN type='adjust_out' THEN -kg ELSE 0 END) AS ent_kg,
      SUM(CASE WHEN type='adjust_in' THEN pc WHEN type='adjust_out' THEN -pc ELSE 0 END) AS ent_pc,
      SUM(CASE WHEN type='out' THEN kg WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg ELSE 0 END) AS del_kg,
      SUM(CASE WHEN type='out' THEN pc WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc ELSE 0 END) AS del_pc
    FROM base
    WHERE in_month
    GROUP BY 1,2,3
  ),
  summary AS (
    SELECT 
      k.client_id, k.article_id, k.machine_id,
      COALESCE(p.stock_kg,0) AS stock_kg, COALESCE(p.stock_pc,0) AS stock_pc,
      COALESCE(r.reserved_kg,0) AS reserved_kg, COALESCE(r.reserved_pc,0) AS reserved_pc,
      COALESCE(m.machine_kg,0) AS machine_kg, COALESCE(m.machine_pc,0) AS machine_pc,
      COALESCE(f.ent_kg,0) AS ent_kg, COALESCE(f.ent_pc,0) AS ent_pc,
      COALESCE(f.del_kg,0) AS del_kg, COALESCE(f.del_pc,0) AS del_pc
    FROM (SELECT DISTINCT client_id, article_id, machine_id FROM base) k
    LEFT JOIN phys_final p ON p.client_id=k.client_id AND p.article_id=k.article_id AND p.machine_id IS NOT DISTINCT FROM k.machine_id
    LEFT JOIN res r ON r.client_id=k.client_id AND r.article_id=k.article_id AND r.machine_id IS NOT DISTINCT FROM k.machine_id
    LEFT JOIN mach m ON m.client_id=k.client_id AND m.article_id=k.article_id AND m.machine_id IS NOT DISTINCT FROM k.machine_id
    LEFT JOIN flows f ON f.client_id=k.client_id AND f.article_id=k.article_id AND f.machine_id IS NOT DISTINCT FROM k.machine_id
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_id', g.client_id,
        'client_name', c.name,
        'article_id', g.article_id,
        'article_name', a.name,
        'total_stock_kg', SUM(g.stock_kg),
        'total_stock_pc', SUM(g.stock_pc),
        'total_reserved_kg', SUM(g.reserved_kg),
        'total_reserved_pc', SUM(g.reserved_pc),
        'total_available_kg', SUM(g.machine_kg) + GREATEST(0, SUM(g.stock_kg) - SUM(g.reserved_kg)),
        'total_available_pc', SUM(g.machine_pc) + GREATEST(0, SUM(g.stock_pc) - SUM(g.reserved_pc)),
        'machines', (
          SELECT jsonb_agg(jsonb_build_object(
            'machine_id', m_sub.machine_id,
            'machine_name', mac.name,
            'stock_kg', m_sub.stock_kg,
            'stock_pc', m_sub.stock_pc,
            'reserved_kg', m_sub.reserved_kg,
            'reserved_pc', m_sub.reserved_pc,
            'available_kg', m_sub.machine_kg + GREATEST(0, m_sub.stock_kg - m_sub.reserved_kg),
            'available_pc', m_sub.machine_pc + GREATEST(0, m_sub.stock_pc - m_sub.reserved_pc),
            'on_machine_kg', m_sub.machine_kg,
            'on_machine_pc', m_sub.machine_pc
          ))
          FROM summary m_sub
          LEFT JOIN public.machines mac ON mac.id = m_sub.machine_id
          WHERE m_sub.client_id = g.client_id AND m_sub.article_id = g.article_id AND m_sub.machine_id IS NOT NULL
        )
      ))
      FROM summary g
      JOIN public.clients c ON c.id = g.client_id
      JOIN public.articles a ON a.id = g.article_id
      GROUP BY g.client_id, c.name, g.article_id, a.name
      ORDER BY c.name, a.name
    ), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'entradaKg', SUM(ent_kg),
      'entradaPc', SUM(ent_pc),
      'deliveredKg', SUM(del_kg),
      'deliveredPc', SUM(del_pc),
      'stockKg', SUM(stock_kg),
      'stockRolls', SUM(stock_pc),
      'reservedKg', SUM(reserved_kg),
      'reservedRolls', SUM(reserved_pc),
      'availableKg', SUM(machine_kg) + GREATEST(0, SUM(stock_kg) - SUM(reserved_kg)),
      'availableRolls', SUM(machine_pc) + GREATEST(0, SUM(stock_pc) - SUM(reserved_pc)),
      'machineKg', SUM(machine_kg),
      'machineRolls', SUM(machine_pc)
    )
  ) INTO v_result FROM summary;

  RETURN COALESCE(v_result, jsonb_build_object('groups','[]'::jsonb, 'kpis', jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'reservedRolls',0,'availableKg',0,'availableRolls',0,'machineKg',0,'machineRolls',0)));
END;
$$;
