-- Atualização da RPC para refletir KPIs de Entrada, Saída e Saldo, mantendo a independência
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque_independent(
  p_company_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_month text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid;
  v_result jsonb;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('groups','[]'::jsonb, 'kpis', jsonb_build_object('stockKg',0,'stockRolls',0,'inKg',0,'inPc',0,'outKg',0,'outPc',0));
  END IF;

  WITH base AS (
    SELECT COALESCE(m.client_id, a.client_id) AS client_id,
           m.article_id, m.machine_id, m.type,
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
      SUM(CASE WHEN type='in' THEN kg ELSE 0 END) AS in_kg,
      SUM(CASE WHEN type='in' THEN pc ELSE 0 END) AS in_pc,
      SUM(CASE WHEN type='out' THEN kg ELSE 0 END) AS out_kg,
      SUM(CASE WHEN type='out' THEN pc ELSE 0 END) AS out_pc
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
          'inKg', a.in_kg,
          'inPc', a.in_pc,
          'outKg', a.out_kg,
          'outPc', a.out_pc,
          'stockKg', a.in_kg - a.out_kg,
          'stockRolls', a.in_pc - a.out_pc
        )
        ORDER BY mac.name NULLS LAST
      ) AS machines
    FROM agg a
    LEFT JOIN public.machines mac ON mac.id = a.machine_id AND mac.company_id = p_company_id
    GROUP BY 1,2
  ),
  by_article AS (
    SELECT client_id, article_id,
      SUM(in_kg) AS in_kg, SUM(in_pc) AS in_pc,
      SUM(out_kg) AS out_kg, SUM(out_pc) AS out_pc
    FROM agg GROUP BY 1,2
  ),
  articles_json AS (
    SELECT ba.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', ba.article_id,
          'articleName', COALESCE(ar.name,'Artigo removido'),
          'inKg', ba.in_kg,
          'inPc', ba.in_pc,
          'outKg', ba.out_kg,
          'outPc', ba.out_pc,
          'stockKg', ba.in_kg - ba.out_kg,
          'stockRolls', ba.in_pc - ba.out_pc,
          'byMachine', COALESCE(bm.machines,'[]'::jsonb)
        )
        ORDER BY COALESCE(ar.name,'zzz')
      ) AS arts,
      SUM(ba.in_kg) AS client_in_kg, SUM(ba.in_pc) AS client_in_pc,
      SUM(ba.out_kg) AS client_out_kg, SUM(ba.out_pc) AS client_out_pc
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
          'totalInKg', aj.client_in_kg,
          'totalInPc', aj.client_in_pc,
          'totalOutKg', aj.client_out_kg,
          'totalOutPc', aj.client_out_pc,
          'totalStockKg', aj.client_in_kg - aj.client_out_kg,
          'totalStockRolls', aj.client_in_pc - aj.client_out_pc
        )
        ORDER BY COALESCE(cl.name,'zzz')
      ), '[]'::jsonb) AS gs,
      COALESCE(SUM(aj.client_in_kg),0) AS s_in_kg,
      COALESCE(SUM(aj.client_in_pc),0) AS s_in_pc,
      COALESCE(SUM(aj.client_out_kg),0) AS s_out_kg,
      COALESCE(SUM(aj.client_out_pc),0) AS s_out_pc
    FROM articles_json aj
    LEFT JOIN public.clients cl ON cl.id = aj.client_id AND cl.company_id = p_company_id
  )
  SELECT jsonb_build_object(
    'groups', gs,
    'kpis', jsonb_build_object(
      'inKg', s_in_kg,
      'inPc', s_in_pc,
      'outKg', s_out_kg,
      'outPc', s_out_pc,
      'stockKg', s_in_kg - s_out_kg,
      'stockRolls', s_in_pc - s_out_pc
    )
  ) INTO v_result FROM groups_json;

  RETURN COALESCE(v_result, jsonb_build_object('groups','[]'::jsonb, 'kpis', jsonb_build_object('stockKg',0,'stockRolls',0,'inKg',0,'inPc',0,'outKg',0,'outPc',0)));
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque_independent(uuid,uuid,uuid,text) TO authenticated, service_role;
