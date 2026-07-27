CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(p_company_id uuid, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid, p_month text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_month)
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  agg AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE WHEN type='adjust_in' THEN kg WHEN type='adjust_out' THEN -kg ELSE 0 END) AS entrada_kg,
      SUM(CASE WHEN type='adjust_in' THEN pc WHEN type='adjust_out' THEN -pc ELSE 0 END) AS entrada_rolls,
      SUM(CASE WHEN type='out' THEN kg WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg ELSE 0 END) AS delivered_kg,
      SUM(CASE WHEN type='out' THEN pc WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc ELSE 0 END) AS delivered_rolls,
      GREATEST(0, SUM(CASE WHEN type='reserve' THEN kg WHEN type='release' THEN -kg ELSE 0 END)) AS reserved_kg,
      GREATEST(0, SUM(CASE WHEN type='reserve' THEN pc WHEN type='release' THEN -pc ELSE 0 END)) AS reserved_rolls
    FROM base
    WHERE client_id IS NOT NULL
    GROUP BY 1,2,3
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
          'stockKg', a.entrada_kg - a.delivered_kg,
          'stockRolls', a.entrada_rolls - a.delivered_rolls,
          'availableKg', (a.entrada_kg - a.delivered_kg) - a.reserved_kg,
          'availableRolls', (a.entrada_rolls - a.delivered_rolls) - a.reserved_rolls
        ) ORDER BY COALESCE(mac.name,'—')
      ) AS machines
    FROM agg a
    LEFT JOIN public.machines mac ON mac.id = a.machine_id
    GROUP BY a.client_id, a.article_id
  ),
  per_article AS (
    SELECT a.client_id, a.article_id,
      SUM(a.entrada_kg) AS entrada_kg, SUM(a.entrada_rolls) AS entrada_rolls,
      SUM(a.delivered_kg) AS delivered_kg, SUM(a.delivered_rolls) AS delivered_rolls,
      SUM(a.reserved_kg) AS reserved_kg, SUM(a.reserved_rolls) AS reserved_rolls
    FROM agg a GROUP BY 1,2
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
          'stockKg', p.entrada_kg - p.delivered_kg,
          'stockRolls', p.entrada_rolls - p.delivered_rolls,
          'availableKg', (p.entrada_kg - p.delivered_kg) - p.reserved_kg,
          'availableRolls', (p.entrada_rolls - p.delivered_rolls) - p.reserved_rolls,
          'byMachine', COALESCE((SELECT bm.machines FROM by_machine bm WHERE bm.client_id=p.client_id AND bm.article_id=p.article_id), '[]'::jsonb)
        ) ORDER BY COALESCE(art.name,'—')
      ) AS articles,
      SUM(p.entrada_kg) AS t_entrada_kg,
      SUM(p.delivered_kg) AS t_delivered_kg,
      SUM(p.entrada_kg - p.delivered_kg) AS t_stock_kg,
      SUM(p.entrada_rolls - p.delivered_rolls) AS t_stock_rolls,
      SUM(p.reserved_kg) AS t_reserved_kg,
      SUM((p.entrada_kg - p.delivered_kg) - p.reserved_kg) AS t_available_kg
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
      COALESCE(SUM(entrada_kg - delivered_kg),0) AS stock_kg,
      COALESCE(SUM(entrada_rolls - delivered_rolls),0) AS stock_rolls,
      COALESCE(SUM(reserved_kg),0) AS reserved_kg,
      COALESCE(SUM((entrada_kg - delivered_kg) - reserved_kg),0) AS available_kg
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
$function$;