-- Tabela de Estoque Malha (Manual) 100% independente
CREATE TABLE IF NOT EXISTS public.manual_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('in','out')),
  pieces integer NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0,
  reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msm_company_created ON public.manual_stock_movements (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msm_article ON public.manual_stock_movements (article_id);
CREATE INDEX IF NOT EXISTS idx_msm_client ON public.manual_stock_movements (client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_stock_movements TO authenticated;
GRANT ALL ON public.manual_stock_movements TO service_role;

ALTER TABLE public.manual_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY msm_select ON public.manual_stock_movements FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY msm_insert ON public.manual_stock_movements FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY msm_update ON public.manual_stock_movements FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY msm_delete ON public.manual_stock_movements FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- RPCs simplificadas
CREATE OR REPLACE FUNCTION public.save_manual_stock_entry(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_id uuid;
BEGIN
  v_company_id := (p_payload->>'company_id')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> v_company_id THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by)
  VALUES
    (v_company_id, (p_payload->>'article_id')::uuid, (p_payload->>'client_id')::uuid, (p_payload->>'machine_id')::uuid,
     p_payload->>'type', (p_payload->>'pieces')::int, (p_payload->>'weight_kg')::numeric, p_payload->>'reason', v_caller)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_entry(jsonb) TO authenticated, service_role;

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
    RETURN jsonb_build_object('groups','[]'::jsonb, 'kpis', jsonb_build_object('stockKg',0,'stockRolls',0));
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
      SUM(CASE WHEN type='in' THEN kg ELSE -kg END) AS stock_kg,
      SUM(CASE WHEN type='in' THEN pc ELSE -pc END) AS stock_rolls
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
          'stockKg', a.stock_kg,
          'stockRolls', a.stock_rolls
        )
        ORDER BY mac.name NULLS LAST
      ) AS machines
    FROM agg a
    LEFT JOIN public.machines mac ON mac.id = a.machine_id AND mac.company_id = p_company_id
    GROUP BY 1,2
  ),
  by_article AS (
    SELECT client_id, article_id,
      SUM(stock_kg) AS stock_kg, SUM(stock_rolls) AS stock_rolls
    FROM agg GROUP BY 1,2
  ),
  articles_json AS (
    SELECT ba.client_id,
      jsonb_agg(
        jsonb_build_object(
          'articleId', ba.article_id,
          'articleName', COALESCE(ar.name,'Artigo removido'),
          'stockKg', ba.stock_kg,
          'stockRolls', ba.stock_rolls,
          'byMachine', COALESCE(bm.machines,'[]'::jsonb)
        )
        ORDER BY COALESCE(ar.name,'zzz')
      ) AS arts,
      SUM(ba.stock_kg) AS sk, SUM(ba.stock_rolls) AS sr
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
          'totalStockKg', aj.sk,
          'totalStockRolls', aj.sr
        )
        ORDER BY COALESCE(cl.name,'zzz')
      ), '[]'::jsonb) AS gs,
      COALESCE(SUM(aj.sk),0) AS s_stock_kg,
      COALESCE(SUM(aj.sr),0) AS s_stock_rolls
    FROM articles_json aj
    LEFT JOIN public.clients cl ON cl.id = aj.client_id AND cl.company_id = p_company_id
  )
  SELECT jsonb_build_object(
    'groups', gs,
    'kpis', jsonb_build_object(
      'stockKg', s_stock_kg,
      'stockRolls', s_stock_rolls
    )
  ) INTO v_result FROM groups_json;

  RETURN COALESCE(v_result, jsonb_build_object('groups','[]'::jsonb, 'kpis', jsonb_build_object('stockKg',0,'stockRolls',0)));
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque_independent(uuid,uuid,uuid,text) TO authenticated, service_role;
