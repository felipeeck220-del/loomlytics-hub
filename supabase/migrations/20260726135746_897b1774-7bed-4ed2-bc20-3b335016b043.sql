
-- 1) Tabela paralela
CREATE TABLE IF NOT EXISTS public.manual_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  billing_order_id uuid REFERENCES public.billing_orders(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('adjust_in','adjust_out','in','out','reserve','release')),
  pieces integer NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0,
  reason text,
  source_movement_id uuid,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msm_company_created ON public.manual_stock_movements (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msm_article ON public.manual_stock_movements (article_id);
CREATE INDEX IF NOT EXISTS idx_msm_client ON public.manual_stock_movements (client_id);
CREATE INDEX IF NOT EXISTS idx_msm_billing_order ON public.manual_stock_movements (billing_order_id);
CREATE INDEX IF NOT EXISTS idx_msm_source ON public.manual_stock_movements (source_movement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_stock_movements TO authenticated;
GRANT ALL ON public.manual_stock_movements TO service_role;

ALTER TABLE public.manual_stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS msm_select ON public.manual_stock_movements;
CREATE POLICY msm_select ON public.manual_stock_movements
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
DROP POLICY IF EXISTS msm_insert ON public.manual_stock_movements;
CREATE POLICY msm_insert ON public.manual_stock_movements
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
DROP POLICY IF EXISTS msm_update ON public.manual_stock_movements;
CREATE POLICY msm_update ON public.manual_stock_movements
  FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
DROP POLICY IF EXISTS msm_delete ON public.manual_stock_movements;
CREATE POLICY msm_delete ON public.manual_stock_movements
  FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Realtime
ALTER TABLE public.manual_stock_movements REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'manual_stock_movements'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_stock_movements';
  END IF;
END $$;

-- 2) Trigger espelho: da tabela stock_movements para manual, apenas eventos ligados a OF, 1ª qualidade
CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.type::text IN ('reserve','release','out')
     OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
  THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id,
       type, pieces, weight_kg, reason, source_movement_id, created_by, created_at)
    VALUES
      (NEW.company_id, NEW.article_id, NEW.client_id, NEW.machine_id, NEW.billing_order_id,
       NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
       NEW.reason, NEW.id, NEW.created_by, NEW.created_at);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_mirror_of_to_manual_stock ON public.stock_movements;
CREATE TRIGGER trg_mirror_of_to_manual_stock
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.mirror_of_to_manual_stock();

CREATE OR REPLACE FUNCTION public.mirror_of_delete_to_manual_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  DELETE FROM public.manual_stock_movements WHERE source_movement_id = OLD.id;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_mirror_of_delete_to_manual_stock ON public.stock_movements;
CREATE TRIGGER trg_mirror_of_delete_to_manual_stock
AFTER DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.mirror_of_delete_to_manual_stock();

-- 3) Backfill de saídas históricas ligadas a OF (para começar consistente)
INSERT INTO public.manual_stock_movements
  (company_id, article_id, client_id, machine_id, billing_order_id,
   type, pieces, weight_kg, reason, source_movement_id, created_by, created_at)
SELECT s.company_id, s.article_id, s.client_id, s.machine_id, s.billing_order_id,
       s.type::text, COALESCE(s.pieces,0), COALESCE(s.weight_kg,0),
       s.reason, s.id, s.created_by, s.created_at
FROM public.stock_movements s
WHERE COALESCE(s.is_second_quality,false) = false
  AND (s.type::text IN ('reserve','release','out')
       OR (s.type::text = 'in' AND s.billing_order_id IS NOT NULL))
  AND NOT EXISTS (
    SELECT 1 FROM public.manual_stock_movements msm WHERE msm.source_movement_id = s.id
  );

-- 4) RPC bootstrap
CREATE OR REPLACE FUNCTION public.get_manual_stock_bootstrap(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid;
  v_company jsonb;
  v_months jsonb;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('company', NULL, 'available_months', '[]'::jsonb);
  END IF;

  SELECT to_jsonb(c) FROM (
    SELECT name, logo_url FROM public.companies WHERE id = p_company_id
  ) c INTO v_company;

  WITH m AS (
    SELECT DISTINCT to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS ym
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id
    UNION
    SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM')
  )
  SELECT COALESCE(jsonb_agg(ym ORDER BY ym DESC), '[]'::jsonb) INTO v_months FROM m WHERE ym IS NOT NULL;

  RETURN jsonb_build_object('company', v_company, 'available_months', v_months);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_bootstrap(uuid) TO authenticated, service_role;

-- 5) RPC estoque agregado
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(
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
      SUM(CASE
        WHEN type='adjust_in' THEN kg
        WHEN type='adjust_out' THEN -kg
        WHEN type='in' AND billing_order_id IS NULL THEN kg
        ELSE 0 END) AS entrada_kg,
      SUM(CASE
        WHEN type='adjust_in' THEN pc
        WHEN type='adjust_out' THEN -pc
        WHEN type='in' AND billing_order_id IS NULL THEN pc
        ELSE 0 END) AS entrada_rolls,
      SUM(CASE
        WHEN type='out' THEN kg
        WHEN type='in' AND billing_order_id IS NOT NULL THEN -kg
        ELSE 0 END) AS delivered_kg,
      SUM(CASE
        WHEN type='out' THEN pc
        WHEN type='in' AND billing_order_id IS NOT NULL THEN -pc
        ELSE 0 END) AS delivered_rolls,
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
          'entradaKg', a.entrada_kg,
          'entradaRolls', a.entrada_rolls,
          'deliveredKg', a.delivered_kg,
          'deliveredRolls', a.delivered_rolls,
          'reservedKg', a.reserved_kg,
          'reservedRolls', a.reserved_rolls,
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
          'entradaKg', ba.entrada_kg,
          'entradaRolls', ba.entrada_rolls,
          'deliveredKg', ba.delivered_kg,
          'deliveredRolls', ba.delivered_rolls,
          'reservedKg', ba.reserved_kg,
          'reservedRolls', ba.reserved_rolls,
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
          'totalEntradaKg', aj.tek,
          'totalEntradaRolls', aj.ter,
          'totalDeliveredKg', aj.tdk,
          'totalDeliveredRolls', aj.tdr,
          'totalReservedKg', aj.trk,
          'totalReservedRolls', aj.trr,
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
$fn$;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid,uuid,uuid,text) TO authenticated, service_role;

-- 6) RPC lista de movimentações
CREATE OR REPLACE FUNCTION public.get_manual_stock_movements(
  p_company_id uuid,
  p_type text DEFAULT 'all',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_client_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_of_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid;
  v_total bigint;
  v_rows jsonb;
  v_offset int;
  v_size int;
  v_of text;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('rows','[]'::jsonb,'total_count',0);
  END IF;

  v_size := GREATEST(1, LEAST(COALESCE(p_page_size,20), 200));
  v_offset := GREATEST(0, (COALESCE(p_page,1)-1) * v_size);
  v_of := NULLIF(BTRIM(COALESCE(p_of_search,'')), '');

  SELECT COUNT(*) INTO v_total
  FROM public.manual_stock_movements m
  LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id AND bo.company_id = p_company_id
  WHERE m.company_id = p_company_id
    AND (p_type = 'all' OR m.type = p_type)
    AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
    AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
    AND (p_client_id  IS NULL OR m.client_id = p_client_id)
    AND (p_article_id IS NULL OR m.article_id = p_article_id)
    AND (v_of IS NULL OR bo.of_number ILIKE '%' || v_of || '%');

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT m.created_at,
      jsonb_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'type', m.type,
        'weight_kg', m.weight_kg,
        'pieces', m.pieces,
        'reason', m.reason,
        'author', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('name', pr.name, 'code', pr.code) END,
        'billing_order', CASE WHEN bo.id IS NULL THEN NULL ELSE jsonb_build_object('id', bo.id, 'of_number', bo.of_number) END,
        'client', CASE WHEN cl.id IS NULL THEN NULL ELSE jsonb_build_object('id', cl.id, 'name', cl.name) END,
        'article', CASE WHEN ar.id IS NULL THEN NULL ELSE jsonb_build_object('id', ar.id, 'name', ar.name) END,
        'machine', CASE WHEN mac.id IS NULL THEN NULL ELSE jsonb_build_object('id', mac.id, 'name', mac.name) END
      ) AS row_json
    FROM public.manual_stock_movements m
    LEFT JOIN public.profiles pr ON pr.id = m.created_by
    LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id AND bo.company_id = p_company_id
    LEFT JOIN public.clients cl ON cl.id = m.client_id AND cl.company_id = p_company_id
    LEFT JOIN public.articles ar ON ar.id = m.article_id AND ar.company_id = p_company_id
    LEFT JOIN public.machines mac ON mac.id = m.machine_id AND mac.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_type = 'all' OR m.type = p_type)
      AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
      AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
      AND (p_client_id  IS NULL OR m.client_id = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
      AND (v_of IS NULL OR bo.of_number ILIKE '%' || v_of || '%')
    ORDER BY m.created_at DESC
    LIMIT v_size OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object('rows', v_rows, 'total_count', v_total);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_movements(uuid,text,date,date,integer,integer,uuid,uuid,text) TO authenticated, service_role;

-- 7) RPC salvar entrada/saída manual do usuário
CREATE OR REPLACE FUNCTION public.save_manual_stock_manual_entry(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_id uuid;
  v_type text;
  v_pieces int;
  v_weight numeric;
  v_reason text;
  v_profile_id uuid;
BEGIN
  v_company_id := (p_payload->>'company_id')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> v_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_type := COALESCE(p_payload->>'type','adjust_in');
  IF v_type NOT IN ('adjust_in','adjust_out') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;

  v_pieces := COALESCE((p_payload->>'pieces')::int, 0);
  v_weight := COALESCE((p_payload->>'weight_kg')::numeric, 0);
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), NULL);

  IF v_weight <= 0 AND v_pieces <= 0 THEN
    RAISE EXCEPTION 'empty_quantities';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by)
  VALUES
    (v_company_id,
     (p_payload->>'article_id')::uuid,
     NULLIF(p_payload->>'client_id','')::uuid,
     NULLIF(p_payload->>'machine_id','')::uuid,
     v_type, v_pieces, v_weight, v_reason, v_profile_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;
