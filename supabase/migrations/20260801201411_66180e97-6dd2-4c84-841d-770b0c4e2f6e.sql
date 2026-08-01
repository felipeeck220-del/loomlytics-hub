-- 1) get_manual_stock_movements: expor on_machine
CREATE OR REPLACE FUNCTION public.get_manual_stock_movements(p_company_id uuid, p_type text DEFAULT 'all'::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid, p_of_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'on_machine', COALESCE(m.on_machine,false),
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
$function$;

-- 2) save_manual_stock_manual_entry: valida saldo do palete da máquina em saídas on_machine
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
  v_article uuid;
  v_machine uuid;
  v_cur_pc numeric;
  v_cur_kg numeric;
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
  v_article := (p_payload->>'article_id')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;

  v_pieces := COALESCE((p_payload->>'pieces')::int, 0);
  v_weight := COALESCE((p_payload->>'weight_kg')::numeric, 0);
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), NULL);

  IF v_weight <= 0 AND v_pieces <= 0 THEN
    RAISE EXCEPTION 'empty_quantities';
  END IF;
  IF v_pieces < 0 OR v_weight < 0 THEN
    RAISE EXCEPTION 'invalid_quantities';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;
  IF v_on_machine AND v_machine IS NULL THEN
    RAISE EXCEPTION 'machine_required';
  END IF;

  IF v_on_machine AND v_type = 'adjust_out' THEN
    SELECT COALESCE(SUM(CASE WHEN type='adjust_in' THEN pieces ELSE -pieces END),0),
           COALESCE(SUM(CASE WHEN type='adjust_in' THEN weight_kg ELSE -weight_kg END),0)
      INTO v_cur_pc, v_cur_kg
    FROM public.manual_stock_movements
    WHERE company_id = v_company_id AND article_id = v_article
      AND machine_id = v_machine AND on_machine = true
      AND type IN ('adjust_in','adjust_out');

    IF v_pieces > v_cur_pc OR v_weight > v_cur_kg THEN
      RAISE EXCEPTION 'insufficient_machine_stock';
    END IF;
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
  VALUES
    (v_company_id,
     v_article,
     NULLIF(p_payload->>'client_id','')::uuid,
     v_machine,
     v_type, v_pieces, v_weight, v_reason, v_profile_id, v_on_machine)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 3) save_manual_stock_machine_adjust: saldo conferido por cliente efetivo (client_id ou cliente do artigo)
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

  IF v_client IS NULL THEN
    SELECT client_id INTO v_client FROM public.articles
    WHERE id = v_article AND company_id = v_company_id;
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
    SELECT COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
           COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
      INTO v_cur_pc, v_cur_kg
    FROM public.manual_stock_movements m
    LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
    WHERE m.company_id = v_company_id AND m.article_id = v_article
      AND m.machine_id = v_machine AND m.on_machine = true
      AND m.type IN ('adjust_in','adjust_out')
      AND COALESCE(m.client_id, a.client_id) IS NOT DISTINCT FROM v_client;

    IF v_mv_pc > v_cur_pc OR v_mv_kg > v_cur_kg THEN
      RAISE EXCEPTION 'insufficient_machine_stock';
    END IF;

    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', v_mv_pc, v_mv_kg,
            'Transferência p/ expedição: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;

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

REVOKE ALL ON FUNCTION public.get_manual_stock_movements(uuid,text,date,date,integer,integer,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_manual_stock_manual_entry(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_movements(uuid,text,date,date,integer,integer,uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) TO authenticated, service_role;