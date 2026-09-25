CREATE OR REPLACE FUNCTION public.generate_next_of_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_num bigint;
BEGIN
  SELECT COALESCE(MAX(regexp_replace(bo.of_number, '\D', '', 'g')::bigint), 0)
    INTO v_max_num
  FROM public.billing_orders bo
  WHERE bo.company_id = p_company_id
    AND bo.of_number ~ '\d';

  IF v_max_num < 999 THEN
    RETURN lpad((v_max_num + 1)::text, 3, '0');
  END IF;

  RETURN (v_max_num + 1)::text;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_of_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_of_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_next_of_number(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_billing_orders_bootstrap(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_company jsonb;
  v_stats jsonb;
  v_months jsonb;
  v_next text;
  v_last text;
  v_max_num bigint;
  v_link_groups bigint;
  v_month_start timestamptz;
  v_now timestamptz;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  v_now := now() AT TIME ZONE 'America/Sao_Paulo';
  v_month_start := date_trunc('month', v_now) AT TIME ZONE 'America/Sao_Paulo';

  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url, 'slug', c.slug)
    INTO v_company
  FROM public.companies c
  WHERE c.id = p_company_id;

  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE status = 'open' AND priority = false),
    'priority', COUNT(*) FILTER (WHERE status = 'open' AND priority = true),
    'separating', COUNT(*) FILTER (WHERE status = 'separating'),
    'awaiting_doc', COUNT(*) FILTER (WHERE (status = 'ready' OR status = 'collected') AND delivery_doc_number IS NULL),
    'ready', COUNT(*) FILTER (WHERE status = 'ready' AND delivery_doc_number IS NOT NULL AND (separation_finished_at IS NULL OR (EXTRACT(EPOCH FROM (v_now - separation_finished_at))/86400) <= 7)),
    'delayed_collection', COUNT(*) FILTER (WHERE status = 'ready' AND delivery_doc_number IS NOT NULL AND separation_finished_at IS NOT NULL AND (EXTRACT(EPOCH FROM (v_now - separation_finished_at))/86400) > 7),
    'collected_month', COUNT(*) FILTER (WHERE status = 'collected' AND collected_at >= v_month_start),
    'cancelled_month', COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_at >= v_month_start)
  ) INTO v_stats
  FROM public.billing_orders
  WHERE company_id = p_company_id;

  WITH months AS (
    SELECT DISTINCT to_char((collected_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS m
    FROM public.billing_orders
    WHERE company_id = p_company_id AND collected_at IS NOT NULL
    UNION
    SELECT to_char(v_now, 'YYYY-MM')
  )
  SELECT COALESCE(jsonb_agg(m ORDER BY m DESC), '[]'::jsonb)
    INTO v_months
  FROM months;

  SELECT COALESCE(MAX(regexp_replace(bo.of_number, '\D', '', 'g')::bigint), 0)
    INTO v_max_num
  FROM public.billing_orders bo
  WHERE bo.company_id = p_company_id
    AND bo.of_number ~ '\d';

  IF v_max_num > 0 THEN
    v_last := CASE WHEN v_max_num < 1000 THEN lpad(v_max_num::text, 3, '0') ELSE v_max_num::text END;
    v_next := CASE WHEN v_max_num < 999 THEN lpad((v_max_num + 1)::text, 3, '0') ELSE (v_max_num + 1)::text END;
  ELSE
    v_last := NULL;
    v_next := '001';
  END IF;

  SELECT COUNT(DISTINCT link_group_id)
    INTO v_link_groups
  FROM public.billing_orders
  WHERE company_id = p_company_id AND link_group_id IS NOT NULL;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, '{}'::jsonb),
    'stats', v_stats,
    'available_months', v_months,
    'next_of_number', v_next,
    'last_of_number', v_last,
    'link_groups_count', v_link_groups
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_billing_orders_bootstrap(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_billing_orders_bootstrap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_orders_bootstrap(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_billing_order(p_company_id uuid, p_payload jsonb, p_author_name text DEFAULT NULL::text, p_author_code text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_pid uuid;
  v_id uuid;
  v_of_num text;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('billing_order_number:' || p_company_id::text, 0));

  v_pid := public._of_current_profile_id(p_company_id);
  v_of_num := NULLIF(btrim(p_payload->>'of_number'), '');
  IF v_of_num IS NULL THEN
    v_of_num := public.generate_next_of_number(p_company_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.billing_orders
    WHERE company_id = p_company_id AND of_number = v_of_num
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
  END IF;

  INSERT INTO public.billing_orders (
    company_id, of_number, client_id, article_id, machine_id,
    pieces_expected, weight_expected, piece_weight_target, dyehouse,
    order_type, status, created_by, admin_notes, multiplier, updated_at
  ) VALUES (
    p_company_id, v_of_num, (p_payload->>'client_id')::uuid,
    (p_payload->>'article_id')::uuid, (p_payload->>'machine_id')::uuid,
    (p_payload->>'pieces_expected')::int, (p_payload->>'weight_expected')::numeric,
    (p_payload->>'piece_weight_target')::numeric, p_payload->>'dyehouse',
    p_payload->>'order_type', 'open', v_pid, p_payload->>'admin_notes',
    (p_payload->>'multiplier')::int, now()
  ) RETURNING id INTO v_id;

  PERFORM public._of_audit(
    p_company_id, v_id, 'billing_order_create', p_author_name,
    p_author_code, jsonb_build_object('of', v_of_num)
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'of_number', v_of_num);
END;
$$;

REVOKE ALL ON FUNCTION public.create_billing_order(uuid, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid, jsonb, text, text) TO service_role;