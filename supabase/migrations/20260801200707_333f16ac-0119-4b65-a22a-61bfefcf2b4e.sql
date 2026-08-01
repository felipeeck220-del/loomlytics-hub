ALTER TABLE public.manual_stock_movements
  ADD COLUMN IF NOT EXISTS on_machine boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_msm_on_machine ON public.manual_stock_movements (company_id, on_machine);

-- Entrada manual com flag on_machine
CREATE OR REPLACE FUNCTION public.save_manual_stock_manual_entry(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_id uuid;
  v_type text;
  v_pieces int;
  v_weight numeric;
  v_reason text;
  v_profile_id uuid;
  v_on_machine boolean;
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

  v_on_machine := COALESCE((p_payload->>'on_machine')::boolean, false);

  v_pieces := COALESCE((p_payload->>'pieces')::int, 0);
  v_weight := COALESCE((p_payload->>'weight_kg')::numeric, 0);
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), NULL);

  IF v_weight <= 0 AND v_pieces <= 0 THEN
    RAISE EXCEPTION 'empty_quantities';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  IF v_on_machine AND NULLIF(p_payload->>'machine_id','') IS NULL THEN
    RAISE EXCEPTION 'machine_required';
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
  VALUES
    (v_company_id,
     (p_payload->>'article_id')::uuid,
     NULLIF(p_payload->>'client_id','')::uuid,
     NULLIF(p_payload->>'machine_id','')::uuid,
     v_type, v_pieces, v_weight, v_reason, v_profile_id, v_on_machine)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_manual_stock_manual_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;

-- Ajuste do palete em máquina: adicionar peças e/ou transferir para a expedição
CREATE OR REPLACE FUNCTION public.save_manual_stock_machine_adjust(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_article uuid;
  v_client uuid;
  v_machine uuid;
  v_add_pc int;
  v_add_kg numeric;
  v_mv_pc int;
  v_mv_kg numeric;
  v_reason text;
  v_profile_id uuid;
  v_cur_pc numeric;
  v_cur_kg numeric;
  v_ids uuid[] := '{}';
  v_id uuid;
BEGIN
  v_company_id := (p_payload->>'company_id')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> v_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_article := (p_payload->>'article_id')::uuid;
  v_client  := NULLIF(p_payload->>'client_id','')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;
  IF v_article IS NULL OR v_machine IS NULL THEN
    RAISE EXCEPTION 'machine_required';
  END IF;

  v_add_pc := GREATEST(0, COALESCE((p_payload->>'add_pieces')::int, 0));
  v_add_kg := GREATEST(0, COALESCE((p_payload->>'add_weight_kg')::numeric, 0));
  v_mv_pc  := GREATEST(0, COALESCE((p_payload->>'move_pieces')::int, 0));
  v_mv_kg  := GREATEST(0, COALESCE((p_payload->>'move_weight_kg')::numeric, 0));
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), NULL);

  IF (v_add_pc + v_mv_pc) <= 0 AND (v_add_kg + v_mv_kg) <= 0 THEN
    RAISE EXCEPTION 'empty_quantities';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;

  IF v_add_pc > 0 OR v_add_kg > 0 THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_add_pc, v_add_kg,
            v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF v_mv_pc > 0 OR v_mv_kg > 0 THEN
    -- saldo atual em máquina (após a adição acima)
    SELECT COALESCE(SUM(CASE WHEN type='adjust_in' THEN pieces ELSE -pieces END),0),
           COALESCE(SUM(CASE WHEN type='adjust_in' THEN weight_kg ELSE -weight_kg END),0)
      INTO v_cur_pc, v_cur_kg
    FROM public.manual_stock_movements
    WHERE company_id = v_company_id AND article_id = v_article
      AND machine_id = v_machine AND on_machine = true
      AND type IN ('adjust_in','adjust_out');

    IF v_mv_pc > v_cur_pc OR v_mv_kg > v_cur_kg THEN
      RAISE EXCEPTION 'insufficient_machine_stock';
    END IF;

    -- sai do palete da máquina
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', v_mv_pc, v_mv_kg,
            'Transferência p/ expedição: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;

    -- entra no estoque da expedição
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_mv_pc, v_mv_kg,
            'Recebido da máquina: ' || v_reason, v_profile_id, false)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids));
END;
$function$;

REVOKE ALL ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) TO authenticated, service_role;

-- Estoque com quantidade "em máquina"
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(p_company_id uuid, p_month text DEFAULT 'all'::text, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)
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
      'kpis', jsonb_build_object('entradaKg',0,'deliveredKg',0,'stockKg',0,'stockRolls',0,'reservedKg',0,'availableKg',0,'machineKg',0,'machineRolls',0));
  END IF;

  WITH base AS (
    SELECT COALESCE(m.client_id, a.client_id) AS client_id,
           m.article_id, m.machine_id, m.type, m.billing_order_id,
           m.created_at, m.id, COALESCE(m.on_machine,false) AS on_machine,
           (p_month = 'all' OR to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') = p_month) AS in_month,
           COALESCE(m.weight_kg,0)::numeric AS kg,
           COALESCE(m.pieces,0)::numeric AS pc
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
  ),
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
  running AS (
    SELECT client_id, article_id, machine_id,
      SUM(d_kg) OVER w AS pfx_kg,
      SUM(d_pc) OVER w AS pfx_pc
    FROM phys
    WINDOW w AS (PARTITION BY client_id, article_id, machine_id ORDER BY created_at, id ROWS UNBOUNDED PRECEDING)
  ),
  stock AS (
    SELECT client_id, article_id, machine_id,
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
  mach AS (
    SELECT client_id, article_id, machine_id,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN kg ELSE -kg END)) AS machine_kg,
      GREATEST(0, SUM(CASE WHEN type='adjust_in' THEN pc ELSE -pc END)) AS machine_rolls
    FROM base
    WHERE client_id IS NOT NULL AND on_machine = true AND type IN ('adjust_in','adjust_out')
    GROUP BY 1,2,3
  ),
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
    UNION SELECT client_id, article_id, machine_id FROM mach
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
      LEAST(COALESCE(mm.machine_kg,0), COALESCE(s.stock_kg,0)) AS machine_kg,
      LEAST(COALESCE(mm.machine_rolls,0), COALESCE(s.stock_rolls,0)) AS machine_rolls,
      GREATEST(0, COALESCE(s.stock_kg,0) - COALESCE(r.reserved_kg,0)) AS available_kg,
      GREATEST(0, COALESCE(s.stock_rolls,0) - COALESCE(r.reserved_rolls,0)) AS available_rolls
    FROM keys k
    LEFT JOIN stock_final s USING (client_id, article_id, machine_id)
    LEFT JOIN res r USING (client_id, article_id, machine_id)
    LEFT JOIN flows f USING (client_id, article_id, machine_id)
    LEFT JOIN mach mm USING (client_id, article_id, machine_id)
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
          'machineKg', a.machine_kg,
          'machineRolls', a.machine_rolls,
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
      SUM(a.machine_kg) AS machine_kg, SUM(a.machine_rolls) AS machine_rolls,
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
          'machineKg', p.machine_kg,
          'machineRolls', p.machine_rolls,
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
      SUM(p.machine_kg) AS t_machine_kg,
      SUM(p.machine_rolls) AS t_machine_rolls,
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
        'totalMachineKg', paj.t_machine_kg,
        'totalMachineRolls', paj.t_machine_rolls,
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
      COALESCE(SUM(machine_kg),0) AS machine_kg,
      COALESCE(SUM(machine_rolls),0) AS machine_rolls,
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
      'machineKg', (SELECT machine_kg FROM kpis),
      'machineRolls', (SELECT machine_rolls FROM kpis),
      'availableKg', (SELECT available_kg FROM kpis)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;