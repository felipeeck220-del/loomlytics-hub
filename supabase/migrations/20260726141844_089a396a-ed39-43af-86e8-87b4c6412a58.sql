
-- 1) GRANTs faltantes na tabela mirror
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_stock_movements TO authenticated;
GRANT ALL ON public.manual_stock_movements TO service_role;

-- 2) Realtime: REPLICA IDENTITY FULL (padrão do projeto para filtros por company_id)
ALTER TABLE public.manual_stock_movements REPLICA IDENTITY FULL;

-- 3) Corrigir get_manual_stock_estoque: remover ramo morto type='in' AND billing_order_id IS NULL
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(
  p_company_id uuid, p_client_id uuid DEFAULT NULL, p_article_id uuid DEFAULT NULL, p_month text DEFAULT 'all'
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='public' AS $$
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
      SUM(CASE WHEN type='reserve' THEN kg WHEN type='release' THEN -kg ELSE 0 END) AS reserved_kg,
      SUM(CASE WHEN type='reserve' THEN pc WHEN type='release' THEN -pc ELSE 0 END) AS reserved_rolls
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
        )
        ORDER BY mac.number NULLS LAST, COALESCE(mac.name,'zzz')
      ) AS machines
    FROM agg a
    LEFT JOIN public.machines mac ON mac.id = a.machine_id AND mac.company_id = p_company_id
    GROUP BY 1,2
  ),
  by_article AS (
    SELECT client_id, article_id,
      SUM(entrada_kg) AS entrada_kg, SUM(entrada_rolls) AS entrada_rolls,
      SUM(delivered_kg) AS delivered_kg, SUM(delivered_rolls) AS delivered_rolls,
      SUM(reserved_kg) AS reserved_kg, SUM(reserved_rolls) AS reserved_rolls
    FROM agg GROUP BY 1,2
  ),
  articles_json AS (
    SELECT ba.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', ba.article_id,
          'articleName', COALESCE(ar.name,'Artigo removido'),
          'entradaKg', ba.entrada_kg, 'entradaRolls', ba.entrada_rolls,
          'deliveredKg', ba.delivered_kg, 'deliveredRolls', ba.delivered_rolls,
          'reservedKg', ba.reserved_kg, 'reservedRolls', ba.reserved_rolls,
          'stockKg', ba.entrada_kg - ba.delivered_kg,
          'stockRolls', ba.entrada_rolls - ba.delivered_rolls,
          'availableKg', (ba.entrada_kg - ba.delivered_kg) - ba.reserved_kg,
          'availableRolls', (ba.entrada_rolls - ba.delivered_rolls) - ba.reserved_rolls,
          'byMachine', COALESCE(bm.machines,'[]'::jsonb)
        )
        ORDER BY COALESCE(ar.name,'zzz')
      ) AS arts,
      SUM(ba.entrada_kg) AS tek, SUM(ba.entrada_rolls) AS ter,
      SUM(ba.delivered_kg) AS tdk, SUM(ba.delivered_rolls) AS tdr,
      SUM(ba.reserved_kg) AS trk, SUM(ba.reserved_rolls) AS trr
    FROM by_article ba
    LEFT JOIN public.articles ar ON ar.id = ba.article_id AND ar.company_id = p_company_id
    LEFT JOIN by_machine bm ON bm.client_id = ba.client_id AND bm.article_id = ba.article_id
    GROUP BY 1
  ),
  groups_json AS (
    SELECT
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'clientId', aj.client_id,
          'clientName', COALESCE(cl.name,'Cliente removido'),
          'articles', aj.arts,
          'totalEntradaKg', aj.tek, 'totalEntradaRolls', aj.ter,
          'totalDeliveredKg', aj.tdk, 'totalDeliveredRolls', aj.tdr,
          'totalReservedKg', aj.trk, 'totalReservedRolls', aj.trr,
          'totalStockKg', aj.tek - aj.tdk,
          'totalStockRolls', aj.ter - aj.tdr,
          'totalAvailableKg', (aj.tek - aj.tdk) - aj.trk,
          'totalAvailableRolls', (aj.ter - aj.tdr) - aj.trr
        )
        ORDER BY COALESCE(cl.name,'zzz')
      ), '[]'::jsonb) AS gs,
      COALESCE(SUM(aj.tek),0) AS s_entrada_kg,
      COALESCE(SUM(aj.tdk),0) AS s_deliv_kg,
      COALESCE(SUM(aj.tek - aj.tdk),0) AS s_stock_kg,
      COALESCE(SUM(aj.ter - aj.tdr),0) AS s_stock_rolls,
      COALESCE(SUM(aj.trk),0) AS s_reserved_kg,
      COALESCE(SUM((aj.tek - aj.tdk) - aj.trk),0) AS s_avail_kg
    FROM articles_json aj
    LEFT JOIN public.clients cl ON cl.id = aj.client_id AND cl.company_id = p_company_id
  )
  SELECT jsonb_build_object(
    'groups', gs,
    'kpis', jsonb_build_object(
      'entradaKg', s_entrada_kg,
      'deliveredKg', s_deliv_kg,
      'stockKg', s_stock_kg,
      'stockRolls', s_stock_rolls,
      'reservedKg', s_reserved_kg,
      'availableKg', s_avail_kg
    )
  ) INTO v_result FROM groups_json;

  RETURN COALESCE(v_result, jsonb_build_object('groups','[]'::jsonb,
    'kpis', jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'availableKg',0)));
END;
$$;
