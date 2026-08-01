CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(
  p_company_id uuid,
  p_month text DEFAULT 'all',
  p_client_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
    SELECT COALESCE(m.client_id, a.client_id) AS client_id,
           m.article_id, m.machine_id, m.type, m.billing_order_id,
           m.created_at, m.id,
           (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_month) AS in_month,
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  -- Movimentos físicos (entradas/saídas) com sinal
  phys AS (
    SELECT client_id, article_id, machine_id, created_at, id,
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
  ),
  -- Saldo corrente travado em zero: saída só consome o que existe no momento.
  -- Saldo final = total - LEAST(0, menor prefixo acumulado)
  running AS (
    SELECT client_id, article_id, machine_id,
      SUM(d_kg) OVER w AS pfx_kg,
      SUM(d_pc) OVER w AS pfx_pc
    FROM phys
    WINDOW w AS (PARTITION BY client_id, article_id, machine_id ORDER BY created_at, id ROWS UNBOUNDED PRECEDING)
  ),
  stock AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, MAX(pfx_kg) FILTER (WHERE true) * 0 + (SUM(0)) ) AS dummy,
      GREATEST(0, (SELECT 0)) AS dummy2,
      MAX(pfx_kg) AS mx_kg,
      MIN(pfx_kg) AS mn_kg,
      MIN(pfx_pc) AS mn_pc
    FROM running GROUP BY 1,2,3
  ),
  totals AS (
    SELECT client_id, article_id, machine_id,
      SUM(d_kg) AS tot_kg, SUM(d_pc) AS tot_pc
    FROM phys GROUP BY 1,2,3
  ),
  stock_final AS (
    SELECT t.client_id, t.article_id, t.machine_id,
      GREATEST(0, t.tot_kg - LEAST(0, s.mn_kg)) AS stock_kg,
      GREATEST(0, t.tot_pc - LEAST(0, s.mn_pc)) AS stock_rolls
    FROM totals t JOIN stock s USING (client_id, article_id, machine_id)
  ),
  -- Reservas apenas de OFs ainda ativas (não coletadas / não canceladas)
  res AS (
    SELECT b.client_id, b.article_id, b.machine_id,
      GREATEST(0, SUM(CASE WHEN b.type='reserve' THEN b.kg ELSE -b.kg END)) AS reserved_kg,
      GREATEST(0, SUM(CASE WHEN b.type='reserve' THEN b.pc ELSE -b.pc END)) AS reserved_rolls
    FROM base b
    LEFT JOIN public.billing_orders bo ON bo.id = b.billing_order_id
    WHERE b.client_id IS NOT NULL
      AND b.type IN ('reserve','release')
      AND (b.billing_order_id IS NULL OR COALESCE(bo.status::text,'') NOT IN ('collected','cancelled'))
    GROUP BY 1,2,3
  ),
  -- Entradas / entregas para exibição (respeitam o filtro de mês)
  flows AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN type='adjust_in' THEN kg WHEN type='adjust_out' THEN -kg ELSE 0 END) AS entrada_kg,
      SUM(CASE WHEN type='adjust_in' THEN pc WHEN type='adjust_out' THEN -pc ELSE 0 END) AS entrada_rolls,
      SUM(CASE WHEN type='out' THEN kg WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg ELSE 0 END) AS delivered_kg,
      SUM(CASE WHEN type='out' THEN pc WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc ELSE 0 END) AS delivered_rolls
    FROM base
    WHERE client_id IS NOT NULL AND in_month
    GROUP BY 1,2,3
  ),
  keys AS (
    SELECT client_id, article_id, machine_id FROM stock_final
    UNION SELECT client_id, article_id, machine_id FROM res
    UNION SELECT client_id, article_id, machine_id FROM flows
  ),
  agg3 AS (
    SELECT k.client_id, k.article_id, k.machine_id,
      COALESCE(f.entrada_kg,0) AS entrada_kg,
      COALESCE(f.entrada_rolls,0) AS entrada_rolls,
      COALESCE(f.delivered_kg,0) AS delivered_kg,
      COALESCE(f.delivered_rolls,0) AS delivered_rolls,
      COALESCE(r.reserved_kg,0) AS reserved_kg,
      COALESCE(r.reserved_rolls,0) AS reserved_rolls,
      COALESCE(s.stock_kg,0) AS stock_kg,
      COALESCE(s.stock_rolls,0) AS stock_rolls,
      COALESCE(s.stock_kg,0) AS available_kg,
      COALESCE(s.stock_rolls,0) AS available_rolls
    FROM keys k
    LEFT JOIN stock_final s USING (client_id, article_id, machine_id)
    LEFT JOIN res r USING (client_id, article_id, machine_id)
    LEFT JOIN flows f USING (client_id, article_id, machine_id)
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
          'stockKg', a.stock_kg,
          'stockRolls', a.stock_rolls,
          'availableKg', a.available_kg,
          'availableRolls', a.available_rolls
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
          'stockKg', p.stock_kg,
          'stockRolls', p.stock_rolls,
          'availableKg', p.available_kg,
          'availableRolls', p.available_rolls,
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

GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;