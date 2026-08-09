
-- 1) Remover TODAS as versões da função para limpar o conflito de assinaturas e tipos de retorno
DROP FUNCTION IF EXISTS public.get_manual_stock_estoque(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_manual_stock_estoque(uuid, text, uuid, uuid);

-- 2) Recriar a função JSONB com nomes de variáveis internas distintos para evitar ambiguidade de coluna
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

  WITH base AS (
    SELECT COALESCE(m.client_id, a.client_id) AS b_client_id,
           m.article_id AS b_article_id, 
           m.machine_id AS b_machine_id, 
           m.type AS b_type, 
           m.billing_order_id AS b_bo_id,
           m.created_at AS b_created_at, 
           m.id AS b_id, 
           COALESCE(m.on_machine,false) AS b_on_machine,
           (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_month) AS in_month,
           COALESCE(m.weight_kg,0)::numeric AS b_kg,
           COALESCE(m.pieces,0)::numeric AS b_pc
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  phys AS (
    SELECT b_client_id, b_article_id, b_machine_id, b_created_at, b_id,
      CASE
        WHEN b_type = 'adjust_in' THEN b_kg
        WHEN b_type = 'in' AND b_bo_id IS NOT NULL THEN b_kg
        WHEN b_type = 'adjust_out' THEN -b_kg
        WHEN b_type = 'out' THEN -b_kg
        ELSE 0
      END AS d_kg,
      CASE
        WHEN b_type = 'adjust_in' THEN b_pc
        WHEN b_type = 'in' AND b_bo_id IS NOT NULL THEN b_pc
        WHEN b_type = 'adjust_out' THEN -b_pc
        WHEN b_type = 'out' THEN -b_pc
        ELSE 0
      END AS d_pc
    FROM base
    WHERE b_client_id IS NOT NULL
      AND (b_type IN ('adjust_in','adjust_out','out') OR (b_type = 'in' AND b_bo_id IS NOT NULL))
  ),
  running AS (
    SELECT b_client_id, b_article_id, b_machine_id,
      SUM(d_kg) OVER w AS pfx_kg,
      SUM(d_pc) OVER w AS pfx_pc
    FROM phys
    WINDOW w AS (PARTITION BY b_client_id, b_article_id, b_machine_id ORDER BY b_created_at, (CASE WHEN d_kg + d_pc >= 0 THEN 0 ELSE 1 END), b_id ROWS UNBOUNDED PRECEDING)
  ),
  stock AS (
    SELECT b_client_id, b_article_id, b_machine_id,
      MIN(pfx_kg) AS mn_kg,
      MIN(pfx_pc) AS mn_pc
    FROM running GROUP BY 1,2,3
  ),
  totals AS (
    SELECT b_client_id, b_article_id, b_machine_id,
      SUM(d_kg) AS tot_kg, SUM(d_pc) AS tot_pc
    FROM phys GROUP BY 1,2,3
  ),
  stock_final AS (
    SELECT t.b_client_id, t.b_article_id, t.b_machine_id,
      GREATEST(0, t.tot_kg - LEAST(0, s.mn_kg)) AS stock_kg,
      GREATEST(0, t.tot_pc - LEAST(0, s.mn_pc)) AS stock_rolls
    FROM totals t JOIN stock s ON t.b_client_id = s.b_client_id AND t.b_article_id = s.b_article_id AND t.b_machine_id = s.b_machine_id
  ),
  mach AS (
    SELECT b_client_id, b_article_id, b_machine_id,
      GREATEST(0, SUM(CASE WHEN b_type='adjust_in' THEN b_kg ELSE -b_kg END)) AS machine_kg,
      GREATEST(0, SUM(CASE WHEN b_type='adjust_in' THEN b_pc ELSE -b_pc END)) AS machine_rolls
    FROM base
    WHERE b_client_id IS NOT NULL AND b_on_machine = true AND b_type IN ('adjust_in','adjust_out')
    GROUP BY 1,2,3
  ),
  res AS (
    SELECT b.b_client_id, b.b_article_id, b.b_machine_id,
      GREATEST(0, SUM(CASE WHEN b.b_type='reserve' THEN b.b_kg ELSE -b.b_kg END)) AS reserved_kg,
      GREATEST(0, SUM(CASE WHEN b.b_type='reserve' THEN b.b_pc ELSE -b.b_pc END)) AS reserved_rolls
    FROM base b
    LEFT JOIN public.billing_orders bo ON bo.id = b.b_bo_id
    WHERE b.b_client_id IS NOT NULL
      AND b.b_type IN ('reserve','release')
      AND (b.b_bo_id IS NULL OR COALESCE(bo.status::text,'') NOT IN ('collected','cancelled'))
    GROUP BY 1,2,3
  ),
  flows AS (
    SELECT b_client_id, b_article_id, b_machine_id,
      SUM(CASE WHEN b_type='adjust_in' THEN b_kg WHEN b_type='adjust_out' THEN -b_kg ELSE 0 END) AS entrada_kg,
      SUM(CASE WHEN b_type='adjust_in' THEN b_pc WHEN b_type='adjust_out' THEN -b_pc ELSE 0 END) AS entrada_rolls,
      SUM(CASE WHEN b_type='out' THEN b_kg WHEN b_type='in' AND b_bo_id IS NOT NULL THEN -b_kg ELSE 0 END) AS delivered_kg,
      SUM(CASE WHEN b_type='out' THEN b_pc WHEN b_type='in' AND b_bo_id IS NOT NULL THEN -b_pc ELSE 0 END) AS delivered_rolls
    FROM base
    WHERE b_client_id IS NOT NULL AND in_month
    GROUP BY 1,2,3
  ),
  keys AS (
    SELECT b_client_id, b_article_id, b_machine_id FROM stock_final
    UNION SELECT b_client_id, b_article_id, b_machine_id FROM res
    UNION SELECT b_client_id, b_article_id, b_machine_id FROM flows
    UNION SELECT b_client_id, b_article_id, b_machine_id FROM mach
  ),
  pre AS (
    SELECT k.b_client_id, k.b_article_id, k.b_machine_id,
      COALESCE(f.entrada_kg,0) AS entrada_kg,
      COALESCE(f.entrada_rolls,0) AS entrada_rolls,
      COALESCE(f.delivered_kg,0) AS delivered_kg,
      COALESCE(f.delivered_rolls,0) AS delivered_rolls,
      COALESCE(r.reserved_kg,0) AS reserved_kg,
      COALESCE(r.reserved_rolls,0) AS reserved_rolls,
      COALESCE(s.stock_kg,0) AS stock_kg,
      COALESCE(s.stock_rolls,0) AS stock_rolls,
      LEAST(COALESCE(mm.machine_kg,0), COALESCE(s.stock_kg,0)) AS machine_kg,
      LEAST(COALESCE(mm.machine_rolls,0), COALESCE(s.stock_rolls,0)) AS machine_rolls
    FROM keys k
    LEFT JOIN stock_final s ON k.b_client_id = s.b_client_id AND k.b_article_id = s.b_article_id AND k.b_machine_id = s.b_machine_id
    LEFT JOIN res r ON k.b_client_id = r.b_client_id AND k.b_article_id = r.b_article_id AND k.b_machine_id = r.b_machine_id
    LEFT JOIN flows f ON k.b_client_id = f.b_client_id AND k.b_article_id = f.b_article_id AND k.b_machine_id = f.b_machine_id
    LEFT JOIN mach mm ON k.b_client_id = mm.b_client_id AND k.b_article_id = mm.b_article_id AND k.b_machine_id = mm.b_machine_id
  ),
  exp_calc AS (
    SELECT p.*,
      GREATEST(0, p.stock_kg - p.machine_kg) AS exped_kg,
      GREATEST(0, p.stock_rolls - p.machine_rolls) AS exped_rolls
    FROM pre p
  ),
  ev_exp AS (
    SELECT b.b_client_id, b.b_article_id, b.b_machine_id, b.b_created_at, b.b_id,
      CASE
        WHEN b.b_type = 'adjust_in'  AND b.b_on_machine = false THEN b.b_kg
        WHEN b.b_type = 'in'  AND b.b_bo_id IS NOT NULL THEN b.b_kg
        WHEN b.b_type = 'adjust_out' AND b.b_on_machine = false THEN -b.b_kg
        WHEN b.b_type = 'out' THEN -b.b_kg
        WHEN b.b_type = 'reserve' THEN -b.b_kg
        WHEN b.b_type = 'release' THEN b.b_kg
        ELSE 0
      END AS d_kg,
      CASE
        WHEN b.b_type = 'adjust_in'  AND b.b_on_machine = false THEN b.b_pc
        WHEN b.b_type = 'in'  AND b.b_bo_id IS NOT NULL THEN b.b_pc
        WHEN b.b_type = 'adjust_out' AND b.b_on_machine = false THEN -b.b_pc
        WHEN b.b_type = 'out' THEN -b.b_pc
        WHEN b.b_type = 'reserve' THEN -b.b_pc
        WHEN b.b_type = 'release' THEN b.b_pc
        ELSE 0
      END AS d_pc
    FROM base b
    LEFT JOIN public.billing_orders bo ON bo.id = b.b_bo_id
    WHERE b.b_client_id IS NOT NULL
      AND (
        b.b_type IN ('adjust_in','adjust_out','out')
        OR (b.b_type = 'in' AND b.b_bo_id IS NOT NULL)
        OR (b.b_type IN ('reserve','release')
            AND (b.b_bo_id IS NULL OR COALESCE(bo.status::text,'') NOT IN ('collected','cancelled')))
      )
  ),
  exp_tl AS (
    SELECT b_client_id, b_article_id, b_machine_id, d_kg, d_pc,
      SUM(d_kg) OVER w AS p_kg,
      SUM(d_pc) OVER w AS p_pc
    FROM ev_exp
    WINDOW w AS (PARTITION BY b_client_id, b_article_id, b_machine_id ORDER BY b_created_at, (CASE WHEN d_kg + d_pc >= 0 THEN 0 ELSE 1 END), b_id ROWS UNBOUNDED PRECEDING)
  ),
  exp_avail AS (
    SELECT b_client_id, b_article_id, b_machine_id,
      GREATEST(0, SUM(d_kg) - LEAST(0, MIN(p_kg))) AS av_kg,
      GREATEST(0, SUM(d_pc) - LEAST(0, MIN(p_pc))) AS av_pc
    FROM exp_tl GROUP BY 1,2,3
  ),
  agg3 AS (
    SELECT p.*,
      p.machine_kg    + LEAST(COALESCE(ea.av_kg,0), p.exped_kg)    AS available_kg,
      p.machine_rolls + LEAST(COALESCE(ea.av_pc,0), p.exped_rolls) AS available_rolls
    FROM exp_calc p
    LEFT JOIN exp_avail ea ON p.b_client_id = ea.b_client_id AND p.b_article_id = ea.b_article_id AND p.b_machine_id = ea.b_machine_id
  ),
  by_machine AS (
    SELECT a.b_client_id, a.b_article_id,
      jsonb_agg(
        jsonb_build_object(
          'machineId', a.b_machine_id,
          'machineName', COALESCE(mac.name,'—'),
          'entradaKg', a.entrada_kg, 'entradaRolls', a.entrada_rolls,
          'deliveredKg', a.delivered_kg, 'deliveredRolls', a.delivered_rolls,
          'reservedKg', a.reserved_kg, 'reservedRolls', a.reserved_rolls,
          'stockKg', a.stock_kg,
          'stockRolls', a.stock_rolls,
          'machineKg', a.machine_kg,
          'machineRolls', a.machine_rolls,
          'availableKg', a.available_kg,
          'availableRolls', a.available_rolls
        ) ORDER BY COALESCE(mac.name,'—')
      ) AS machines
    FROM agg3 a
    LEFT JOIN public.machines mac ON mac.id = a.b_machine_id
    GROUP BY a.b_client_id, a.b_article_id
  ),
  per_article AS (
    SELECT a.b_client_id, a.b_article_id,
      SUM(a.entrada_kg) AS entrada_kg, SUM(a.entrada_rolls) AS entrada_rolls,
      SUM(a.delivered_kg) AS delivered_kg, SUM(a.delivered_rolls) AS delivered_rolls,
      SUM(a.reserved_kg) AS reserved_kg, SUM(a.reserved_rolls) AS reserved_rolls,
      SUM(a.stock_kg) AS stock_kg, SUM(a.stock_rolls) AS stock_rolls,
      SUM(a.machine_kg) AS machine_kg, SUM(a.machine_rolls) AS machine_rolls,
      SUM(a.available_kg) AS available_kg,
      SUM(a.available_rolls) AS available_rolls
    FROM agg3 a GROUP BY 1,2
  ),
  per_article_json AS (
    SELECT p.b_client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', p.b_article_id,
          'articleName', COALESCE(art.name,'—'),
          'entradaKg', p.entrada_kg, 'entradaRolls', p.entrada_rolls,
          'deliveredKg', p.delivered_kg, 'deliveredRolls', p.delivered_rolls,
          'reservedKg', p.reserved_kg, 'reservedRolls', p.reserved_rolls,
          'stockKg', p.stock_kg,
          'stockRolls', p.stock_rolls,
          'machineKg', p.machine_kg,
          'machineRolls', p.machine_rolls,
          'availableKg', p.available_kg,
          'availableRolls', p.available_rolls,
          'byMachine', COALESCE((SELECT bm.machines FROM by_machine bm WHERE bm.b_client_id=p.b_client_id AND bm.b_article_id=p.b_article_id), '[]'::jsonb)
        ) ORDER BY COALESCE(art.name,'—')
      ) AS articles,
      SUM(p.entrada_kg) AS t_entrada_kg,
      SUM(p.delivered_kg) AS t_delivered_kg,
      SUM(p.stock_kg) AS t_stock_kg,
      SUM(p.stock_rolls) AS t_stock_rolls,
      SUM(p.reserved_kg) AS t_reserved_kg,
      SUM(p.machine_kg) AS t_machine_kg,
      SUM(p.machine_rolls) AS t_machine_rolls,
      SUM(p.available_kg) AS t_available_kg
    FROM per_article p
    LEFT JOIN public.articles art ON art.id = p.b_article_id
    GROUP BY p.b_client_id
  ),
  groups AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'clientId', paj.b_client_id,
        'clientName', COALESCE(c.name,'—'),
        'articles', paj.articles,
        'totalEntradaKg', paj.t_entrada_kg,
        'totalDeliveredKg', paj.t_delivered_kg,
        'totalStockKg', paj.t_stock_kg,
        'totalStockRolls', paj.t_stock_rolls,
        'totalReservedKg', paj.t_reserved_kg,
        'totalMachineKg', paj.t_machine_kg,
        'totalMachineRolls', paj.t_machine_rolls,
        'totalAvailableKg', paj.t_available_kg
      ) ORDER BY COALESCE(c.name,'—')
    ) AS gs
    FROM per_article_json paj
    LEFT JOIN public.clients c ON c.id = paj.b_client_id
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(entrada_kg),0) AS entrada_kg,
      COALESCE(SUM(delivered_kg),0) AS delivered_kg,
      COALESCE(SUM(stock_kg),0) AS stock_kg,
      COALESCE(SUM(stock_rolls),0) AS stock_rolls,
      COALESCE(SUM(reserved_kg),0) AS reserved_kg,
      COALESCE(SUM(reserved_rolls),0) AS reserved_rolls,
      COALESCE(SUM(machine_kg),0) AS machine_kg,
      COALESCE(SUM(machine_rolls),0) AS machine_rolls,
      COALESCE(SUM(available_kg),0) AS available_kg,
      COALESCE(SUM(available_rolls),0) AS available_rolls
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
      'reservedRolls', (SELECT reserved_rolls FROM kpis),
      'machineKg', (SELECT machine_kg FROM kpis),
      'machineRolls', (SELECT machine_rolls FROM kpis),
      'availableKg', (SELECT available_kg FROM kpis),
      'availableRolls', (SELECT available_rolls FROM kpis)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid,text,uuid,uuid) TO authenticated, service_role;
