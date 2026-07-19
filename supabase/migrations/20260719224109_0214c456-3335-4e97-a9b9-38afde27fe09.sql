
-- =====================================================
-- Fase 2 rpcstockMalha: 4 RPCs de leitura consolidadas
-- =====================================================

-- 2.1 Estoque principal (1ª qualidade) ----------------
CREATE OR REPLACE FUNCTION public.get_stock_malha_estoque(
  p_company_id     uuid,
  p_client_id      uuid DEFAULT NULL,
  p_article_id     uuid DEFAULT NULL,
  p_month          text DEFAULT 'all',
  p_entregue_from  date DEFAULT NULL,
  p_entregue_to    date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
      'kpis', jsonb_build_object('producedKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'availableKg',0));
  END IF;

  WITH cutoff AS (
    SELECT stock_cutoff_date::date AS cd
    FROM public.company_settings
    WHERE company_id = p_company_id
    LIMIT 1
  ),
  prod AS (
    SELECT a.client_id, p.article_id, p.machine_id,
           COALESCE(p.weight_kg,0)::numeric AS kg,
           COALESCE(p.rolls_produced,0)::numeric AS rolls
    FROM public.productions p
    JOIN public.articles a ON a.id = p.article_id AND a.company_id = p_company_id
    LEFT JOIN cutoff c ON true
    WHERE p.company_id = p_company_id
      AND p.machine_id IS NOT NULL
      AND a.client_id IS NOT NULL
      AND (p_month = 'all' OR substring(p.date,1,7) = p_month)
      AND (c.cd IS NULL OR p.date >= to_char(c.cd,'YYYY-MM-DD'))
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
  ),
  mv_base AS (
    SELECT a.client_id, m.article_id, m.machine_id, m.type, m.billing_order_id,
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc,
           (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS local_date
    FROM public.stock_movements m
    JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    LEFT JOIN cutoff c ON true
    WHERE m.company_id = p_company_id
      AND m.machine_id IS NOT NULL
      AND m.is_second_quality = false
      AND a.client_id IS NOT NULL
      AND m.type IN ('adjust_in','adjust_out','in','out','reserve','release')
      AND (c.cd IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= c.cd)
      AND (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM') = p_month)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  prod_agg AS (
    SELECT client_id, article_id, machine_id,
           SUM(kg) AS pkg, SUM(rolls) AS prolls
    FROM prod GROUP BY 1,2,3
  ),
  mv_agg AS (
    SELECT client_id, article_id, machine_id,
      SUM(CASE
        WHEN type='adjust_in' THEN kg
        WHEN type='adjust_out' THEN -kg
        WHEN type='in' AND billing_order_id IS NULL THEN kg
        ELSE 0 END) AS mv_prod_kg,
      SUM(CASE
        WHEN type='adjust_in' THEN pc
        WHEN type='adjust_out' THEN -pc
        WHEN type='in' AND billing_order_id IS NULL THEN pc
        ELSE 0 END) AS mv_prod_rolls,
      SUM(CASE
        WHEN type='out' THEN kg
        WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg
        ELSE 0 END) AS delivered_kg_total,
      SUM(CASE
        WHEN type='out' THEN pc
        WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc
        ELSE 0 END) AS delivered_rolls_total,
      SUM(CASE
        WHEN (p_entregue_from IS NULL OR local_date >= p_entregue_from)
         AND (p_entregue_to IS NULL OR local_date <= p_entregue_to)
        THEN CASE
          WHEN type='out' THEN kg
          WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg
          ELSE 0 END
        ELSE 0 END) AS delivered_kg,
      SUM(CASE
        WHEN (p_entregue_from IS NULL OR local_date >= p_entregue_from)
         AND (p_entregue_to IS NULL OR local_date <= p_entregue_to)
        THEN CASE
          WHEN type='out' THEN pc
          WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc
          ELSE 0 END
        ELSE 0 END) AS delivered_rolls,
      SUM(CASE WHEN type='reserve' THEN kg WHEN type='release' THEN -kg ELSE 0 END) AS reserved_kg,
      SUM(CASE WHEN type='reserve' THEN pc WHEN type='release' THEN -pc ELSE 0 END) AS reserved_rolls
    FROM mv_base GROUP BY 1,2,3
  ),
  merged AS (
    SELECT
      COALESCE(p.client_id, m.client_id) AS client_id,
      COALESCE(p.article_id, m.article_id) AS article_id,
      COALESCE(p.machine_id, m.machine_id) AS machine_id,
      COALESCE(p.pkg,0) + COALESCE(m.mv_prod_kg,0) AS produced_kg,
      COALESCE(p.prolls,0) + COALESCE(m.mv_prod_rolls,0) AS produced_rolls,
      COALESCE(m.delivered_kg,0) AS delivered_kg,
      COALESCE(m.delivered_rolls,0) AS delivered_rolls,
      COALESCE(m.delivered_kg_total,0) AS delivered_kg_total,
      COALESCE(m.delivered_rolls_total,0) AS delivered_rolls_total,
      COALESCE(m.reserved_kg,0) AS reserved_kg,
      COALESCE(m.reserved_rolls,0) AS reserved_rolls
    FROM prod_agg p
    FULL OUTER JOIN mv_agg m
      ON p.client_id=m.client_id AND p.article_id=m.article_id AND p.machine_id=m.machine_id
  ),
  by_machine AS (
    SELECT mrg.client_id, mrg.article_id,
      jsonb_agg(
        jsonb_build_object(
          'machineId', mrg.machine_id,
          'machineName', COALESCE(mac.name,'Máquina removida'),
          'producedKg', mrg.produced_kg,
          'producedRolls', mrg.produced_rolls,
          'deliveredKg', mrg.delivered_kg,
          'deliveredRolls', mrg.delivered_rolls,
          'deliveredKgTotal', mrg.delivered_kg_total,
          'deliveredRollsTotal', mrg.delivered_rolls_total,
          'reservedKg', mrg.reserved_kg,
          'reservedRolls', mrg.reserved_rolls
        )
        ORDER BY COALESCE(mac.name,'zzz')
      ) AS machines
    FROM merged mrg
    LEFT JOIN public.machines mac ON mac.id = mrg.machine_id AND mac.company_id = p_company_id
    GROUP BY 1,2
  ),
  by_article AS (
    SELECT client_id, article_id,
      SUM(produced_kg) AS produced_kg,
      SUM(produced_rolls) AS produced_rolls,
      SUM(delivered_kg) AS delivered_kg,
      SUM(delivered_rolls) AS delivered_rolls,
      SUM(delivered_kg_total) AS delivered_kg_total,
      SUM(delivered_rolls_total) AS delivered_rolls_total,
      SUM(reserved_kg) AS reserved_kg,
      SUM(reserved_rolls) AS reserved_rolls
    FROM merged GROUP BY 1,2
  ),
  articles_json AS (
    SELECT ba.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', ba.article_id,
          'articleName', COALESCE(a.name,'Artigo removido'),
          'producedKg', ba.produced_kg,
          'producedRolls', ba.produced_rolls,
          'deliveredKg', ba.delivered_kg,
          'deliveredRolls', ba.delivered_rolls,
          'deliveredKgTotal', ba.delivered_kg_total,
          'deliveredRollsTotal', ba.delivered_rolls_total,
          'reservedKg', ba.reserved_kg,
          'reservedRolls', ba.reserved_rolls,
          'stockKg', ba.produced_kg - ba.delivered_kg_total,
          'stockRolls', ba.produced_rolls - ba.delivered_rolls_total,
          'availableKg', (ba.produced_kg - ba.delivered_kg_total) - ba.reserved_kg,
          'availableRolls', (ba.produced_rolls - ba.delivered_rolls_total) - ba.reserved_rolls,
          'byMachine', COALESCE(bm.machines,'[]'::jsonb)
        )
        ORDER BY COALESCE(a.name,'zzz')
      ) AS arts,
      SUM(ba.produced_kg) AS tpk, SUM(ba.produced_rolls) AS tpr,
      SUM(ba.delivered_kg) AS tdk, SUM(ba.delivered_rolls) AS tdr,
      SUM(ba.delivered_kg_total) AS tdkt, SUM(ba.delivered_rolls_total) AS tdrt,
      SUM(ba.reserved_kg) AS trk, SUM(ba.reserved_rolls) AS trr
    FROM by_article ba
    LEFT JOIN public.articles a ON a.id = ba.article_id AND a.company_id = p_company_id
    LEFT JOIN by_machine bm ON bm.client_id = ba.client_id AND bm.article_id = ba.article_id
    GROUP BY 1
  ),
  groups_json AS (
    SELECT
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'clientId', aj.client_id,
          'clientName', COALESCE(c.name,'Cliente removido'),
          'articles', aj.arts,
          'totalProducedKg', aj.tpk,
          'totalProducedRolls', aj.tpr,
          'totalDeliveredKg', aj.tdk,
          'totalDeliveredRolls', aj.tdr,
          'totalReservedKg', aj.trk,
          'totalReservedRolls', aj.trr,
          'totalStockKg', aj.tpk - aj.tdkt,
          'totalStockRolls', aj.tpr - aj.tdrt,
          'totalAvailableKg', (aj.tpk - aj.tdkt) - aj.trk,
          'totalAvailableRolls', (aj.tpr - aj.tdrt) - aj.trr
        )
        ORDER BY COALESCE(c.name,'zzz')
      ), '[]'::jsonb) AS gs,
      COALESCE(SUM(aj.tpk),0) AS s_prod_kg,
      COALESCE(SUM(aj.tdk),0) AS s_deliv_kg,
      COALESCE(SUM(aj.tpk - aj.tdkt),0) AS s_stock_kg,
      COALESCE(SUM(aj.tpr - aj.tdrt),0) AS s_stock_rolls,
      COALESCE(SUM(aj.trk),0) AS s_reserved_kg,
      COALESCE(SUM((aj.tpk - aj.tdkt) - aj.trk),0) AS s_avail_kg
    FROM articles_json aj
    LEFT JOIN public.clients c ON c.id = aj.client_id AND c.company_id = p_company_id
  )
  SELECT jsonb_build_object(
    'groups', gs,
    'kpis', jsonb_build_object(
      'producedKg', s_prod_kg,
      'deliveredKg', s_deliv_kg,
      'stockKg', s_stock_kg,
      'stockRolls', s_stock_rolls,
      'reservedKg', s_reserved_kg,
      'availableKg', s_avail_kg
    )
  ) INTO v_result FROM groups_json;

  RETURN COALESCE(v_result, jsonb_build_object('groups','[]'::jsonb,
    'kpis', jsonb_build_object('producedKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'availableKg',0)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_malha_estoque(uuid,uuid,uuid,text,date,date) TO anon, authenticated, service_role;

-- 2.2 Segunda qualidade -----------------------------
CREATE OR REPLACE FUNCTION public.get_stock_malha_segunda(
  p_company_id uuid,
  p_client_id  uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_month      text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
      'kpis', jsonb_build_object('entradaKg',0,'entradaRolls',0,'saidaKg',0,'saidaRolls',0,'saldoKg',0,'saldoRolls',0));
  END IF;

  WITH mv AS (
    SELECT a.client_id, m.article_id, m.type,
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc
    FROM public.stock_movements m
    JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND m.is_second_quality = true
      AND a.client_id IS NOT NULL
      AND m.type IN ('in','out','adjust_in','adjust_out')
      AND (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM') = p_month)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
  by_article AS (
    SELECT client_id, article_id,
      SUM(CASE WHEN type IN ('in','adjust_in') THEN kg ELSE 0 END) AS entrada_kg,
      SUM(CASE WHEN type IN ('in','adjust_in') THEN pc ELSE 0 END) AS entrada_rolls,
      SUM(CASE WHEN type IN ('out','adjust_out') THEN kg ELSE 0 END) AS saida_kg,
      SUM(CASE WHEN type IN ('out','adjust_out') THEN pc ELSE 0 END) AS saida_rolls
    FROM mv GROUP BY 1,2
  ),
  articles_json AS (
    SELECT ba.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', ba.article_id,
          'articleName', COALESCE(a.name,'Artigo removido'),
          'entradaKg', ba.entrada_kg,
          'entradaRolls', ba.entrada_rolls,
          'saidaKg', ba.saida_kg,
          'saidaRolls', ba.saida_rolls,
          'saldoKg', ba.entrada_kg - ba.saida_kg,
          'saldoRolls', ba.entrada_rolls - ba.saida_rolls
        )
        ORDER BY COALESCE(a.name,'zzz')
      ) AS arts,
      SUM(ba.entrada_kg) AS tek, SUM(ba.entrada_rolls) AS ter,
      SUM(ba.saida_kg) AS tsk, SUM(ba.saida_rolls) AS tsr
    FROM by_article ba
    LEFT JOIN public.articles a ON a.id = ba.article_id AND a.company_id = p_company_id
    GROUP BY 1
  ),
  groups_json AS (
    SELECT
      COALESCE(jsonb_agg(
        jsonb_build_object(
          'clientId', aj.client_id,
          'clientName', COALESCE(c.name,'Cliente removido'),
          'articles', aj.arts,
          'totalEntradaKg', aj.tek,
          'totalEntradaRolls', aj.ter,
          'totalSaidaKg', aj.tsk,
          'totalSaidaRolls', aj.tsr,
          'totalSaldoKg', aj.tek - aj.tsk,
          'totalSaldoRolls', aj.ter - aj.tsr
        )
        ORDER BY COALESCE(c.name,'zzz')
      ), '[]'::jsonb) AS gs,
      COALESCE(SUM(aj.tek),0) AS s_ek,
      COALESCE(SUM(aj.ter),0) AS s_er,
      COALESCE(SUM(aj.tsk),0) AS s_sk,
      COALESCE(SUM(aj.tsr),0) AS s_sr
    FROM articles_json aj
    LEFT JOIN public.clients c ON c.id = aj.client_id AND c.company_id = p_company_id
  )
  SELECT jsonb_build_object(
    'groups', gs,
    'kpis', jsonb_build_object(
      'entradaKg', s_ek,
      'entradaRolls', s_er,
      'saidaKg', s_sk,
      'saidaRolls', s_sr,
      'saldoKg', s_ek - s_sk,
      'saldoRolls', s_er - s_sr
    )
  ) INTO v_result FROM groups_json;

  RETURN COALESCE(v_result, jsonb_build_object('groups','[]'::jsonb,
    'kpis', jsonb_build_object('entradaKg',0,'entradaRolls',0,'saidaKg',0,'saidaRolls',0,'saldoKg',0,'saldoRolls',0)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_malha_segunda(uuid,uuid,uuid,text) TO anon, authenticated, service_role;

-- 2.3 Estoque próprio ------------------------------
CREATE OR REPLACE FUNCTION public.get_own_stock_summary(
  p_company_id uuid,
  p_article_id uuid DEFAULT NULL,
  p_month      text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_result jsonb;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('summary','[]'::jsonb,'details','[]'::jsonb,
      'kpis', jsonb_build_object('entradaKg',0,'entradaPc',0,'saidaKg',0,'saidaPc',0,'saldoKg',0,'saldoPc',0));
  END IF;

  WITH mv AS (
    SELECT m.own_article_id, m.type,
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc,
           NULLIF(TRIM(COALESCE(m.yarn_type,'')),'') AS yarn_type,
           NULLIF(TRIM(COALESCE(m.of_number,'')),'') AS of_number,
           CASE
             WHEN m.source = 'outsource' THEN 'outsource'
             WHEN m.source = 'internal' THEN 'internal'
             ELSE 'unknown' END AS src,
           m.outsource_company_id,
           oc.name AS outsource_name
    FROM public.own_stock_movements m
    LEFT JOIN public.outsource_companies oc ON oc.id = m.outsource_company_id AND oc.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_article_id IS NULL OR m.own_article_id = p_article_id)
      AND (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM') = p_month)
  ),
  summary_rows AS (
    SELECT oa.id AS article_id, oa.name,
      COALESCE(SUM(CASE WHEN mv.type='in' THEN mv.kg ELSE 0 END),0) AS in_kg,
      COALESCE(SUM(CASE WHEN mv.type='in' THEN mv.pc ELSE 0 END),0) AS in_pc,
      COALESCE(SUM(CASE WHEN mv.type='out' THEN mv.kg ELSE 0 END),0) AS out_kg,
      COALESCE(SUM(CASE WHEN mv.type='out' THEN mv.pc ELSE 0 END),0) AS out_pc
    FROM public.own_stock_articles oa
    LEFT JOIN mv ON mv.own_article_id = oa.id
    WHERE oa.company_id = p_company_id
      AND (p_article_id IS NULL OR oa.id = p_article_id)
    GROUP BY oa.id, oa.name
  ),
  details_grouped AS (
    SELECT own_article_id,
           COALESCE(yarn_type,'—') AS yarn_type,
           COALESCE(of_number,'—') AS of_number,
           src,
           COALESCE(outsource_company_id::text,'') AS oc_id,
           MAX(outsource_name) AS outsource_name,
           SUM(kg) AS in_kg, SUM(pc) AS in_pc
    FROM mv
    WHERE type = 'in'
    GROUP BY own_article_id, yarn_type, of_number, src, oc_id
  ),
  details_json AS (
    SELECT own_article_id,
      jsonb_agg(
        jsonb_build_object(
          'key', yarn_type || '||' || of_number || '||' || src || '||' || oc_id,
          'yarn_type', yarn_type,
          'of_number', of_number,
          'source', src,
          'origin_label', CASE
            WHEN src = 'outsource' THEN 'Terceirizado' || CASE WHEN outsource_name IS NOT NULL AND outsource_name <> '' THEN ' — ' || outsource_name ELSE '' END
            WHEN src = 'internal' THEN 'Produção interna'
            ELSE '—' END,
          'inKg', in_kg,
          'inPc', in_pc
        )
        ORDER BY yarn_type, of_number
      ) AS items
    FROM details_grouped
    GROUP BY own_article_id
  )
  SELECT jsonb_build_object(
    'summary', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'articleId', article_id,
          'name', name,
          'inKg', in_kg, 'inPc', in_pc,
          'outKg', out_kg, 'outPc', out_pc
        )
        ORDER BY name
      ) FROM summary_rows
    ), '[]'::jsonb),
    'details', COALESCE((
      SELECT jsonb_object_agg(own_article_id::text, items)
      FROM details_json
    ), '{}'::jsonb),
    'kpis', jsonb_build_object(
      'entradaKg', COALESCE((SELECT SUM(in_kg) FROM summary_rows),0),
      'entradaPc', COALESCE((SELECT SUM(in_pc) FROM summary_rows),0),
      'saidaKg', COALESCE((SELECT SUM(out_kg) FROM summary_rows),0),
      'saidaPc', COALESCE((SELECT SUM(out_pc) FROM summary_rows),0),
      'saldoKg', COALESCE((SELECT SUM(in_kg-out_kg) FROM summary_rows),0),
      'saldoPc', COALESCE((SELECT SUM(in_pc-out_pc) FROM summary_rows),0)
    )
  ) INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object('summary','[]'::jsonb,'details','{}'::jsonb,
    'kpis', jsonb_build_object('entradaKg',0,'entradaPc',0,'saidaKg',0,'saidaPc',0,'saldoKg',0,'saldoPc',0)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_own_stock_summary(uuid,uuid,text) TO anon, authenticated, service_role;

-- 2.4 Movimentações paginadas ----------------------
CREATE OR REPLACE FUNCTION public.get_stock_malha_movements(
  p_company_id uuid,
  p_type       text DEFAULT 'all',
  p_second     boolean DEFAULT NULL,
  p_from       date DEFAULT NULL,
  p_to         date DEFAULT NULL,
  p_page       int  DEFAULT 1,
  p_page_size  int  DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_total  bigint;
  v_rows   jsonb;
  v_offset int;
  v_size   int;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('rows','[]'::jsonb,'total_count',0);
  END IF;

  v_size := GREATEST(1, LEAST(COALESCE(p_page_size,15), 200));
  v_offset := GREATEST(0, (COALESCE(p_page,1)-1) * v_size);

  SELECT COUNT(*) INTO v_total
  FROM public.stock_movements m
  WHERE m.company_id = p_company_id
    AND (p_type = 'all' OR m.type::text = p_type)
    AND (p_second IS NULL OR m.is_second_quality = p_second)
    AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
    AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to);

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT m.created_at,
      jsonb_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'type', m.type,
        'is_second_quality', m.is_second_quality,
        'weight_kg', m.weight_kg,
        'pieces', m.pieces,
        'reason', m.reason,
        'author', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('name', pr.name, 'code', pr.code) END,
        'billing_order', CASE WHEN bo.id IS NULL THEN NULL ELSE jsonb_build_object('id', bo.id, 'of_number', bo.of_number) END,
        'client', CASE WHEN cl.id IS NULL THEN NULL ELSE jsonb_build_object('id', cl.id, 'name', cl.name) END,
        'article', CASE WHEN ar.id IS NULL THEN NULL ELSE jsonb_build_object('id', ar.id, 'name', ar.name) END,
        'machine', CASE WHEN mac.id IS NULL THEN NULL ELSE jsonb_build_object('id', mac.id, 'name', mac.name) END
      ) AS row_json
    FROM public.stock_movements m
    LEFT JOIN public.profiles pr ON pr.id = m.created_by
    LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id AND bo.company_id = p_company_id
    LEFT JOIN public.clients cl ON cl.id = m.client_id AND cl.company_id = p_company_id
    LEFT JOIN public.articles ar ON ar.id = m.article_id AND ar.company_id = p_company_id
    LEFT JOIN public.machines mac ON mac.id = m.machine_id AND mac.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_type = 'all' OR m.type::text = p_type)
      AND (p_second IS NULL OR m.is_second_quality = p_second)
      AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
      AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
    ORDER BY m.created_at DESC
    LIMIT v_size OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object('rows', v_rows, 'total_count', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_malha_movements(uuid,text,boolean,date,date,int,int) TO anon, authenticated, service_role;
