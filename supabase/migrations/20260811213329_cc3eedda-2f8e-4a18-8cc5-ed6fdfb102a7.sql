
-- Removendo versões antigas que podem ter parâmetros default ou assinaturas conflitantes
DROP FUNCTION IF EXISTS public.link_billing_orders(uuid, uuid[], text, text);
DROP FUNCTION IF EXISTS public.unlink_billing_order_group(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.collect_billing_order(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.get_billing_orders_bootstrap(uuid);

-- 1. Sincronização de Auditoria em RPCs de Agrupamento
CREATE OR REPLACE FUNCTION public.link_billing_orders(
    p_company_id uuid,
    p_ids uuid[],
    p_author_name text,
    p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id uuid;
    v_id uuid;
BEGIN
    IF public.get_user_company_id() <> p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
    END IF;

    v_group_id := gen_random_uuid();

    FOREACH v_id IN ARRAY p_ids LOOP
        PERFORM public._of_audit(v_id, NULL, jsonb_build_object('link_group_id', v_group_id), p_author_name, p_author_code, jsonb_build_object('target_id', v_id));
        UPDATE public.billing_orders 
        SET link_group_id = v_group_id, 
            updated_at = now() 
        WHERE id = v_id AND company_id = p_company_id;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'group_id', v_group_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_billing_order_group(
    p_company_id uuid,
    p_group_id uuid,
    p_author_name text,
    p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    IF public.get_user_company_id() <> p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
    END IF;

    FOR v_id IN SELECT id FROM public.billing_orders WHERE link_group_id = p_group_id AND company_id = p_company_id LOOP
        PERFORM public._of_audit(v_id, NULL, jsonb_build_object('link_group_id', NULL), p_author_name, p_author_code, jsonb_build_object('target_id', v_id));
    END LOOP;

    UPDATE public.billing_orders 
    SET link_group_id = NULL, 
        updated_at = now() 
    WHERE link_group_id = p_group_id AND company_id = p_company_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 2. Reforço da Auditoria com 6 Argumentos na Coleta
CREATE OR REPLACE FUNCTION public.collect_billing_order(
    p_company_id uuid,
    p_id uuid,
    p_author_name text,
    p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_status public.billing_order_status;
BEGIN
    IF public.get_user_company_id() <> p_company_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized');
    END IF;

    SELECT status INTO v_old_status FROM public.billing_orders WHERE id = p_id FOR UPDATE;

    IF v_old_status IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not_found');
    END IF;

    IF v_old_status = 'collected' THEN
        RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;

    -- Auditoria com 6 argumentos
    PERFORM public._of_audit(p_id, v_old_status::text, jsonb_build_object('status', 'collected'), p_author_name, p_author_code, jsonb_build_object('target_id', p_id));

    UPDATE public.billing_orders 
    SET status = 'collected',
        collected_by = auth.uid(),
        collected_at = now(),
        updated_at = now()
    WHERE id = p_id;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. Otimização do Bootstrap para refletir abas de Atraso
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
  v_max_num int;
  v_link_groups int;
  v_month_start timestamptz;
  v_now timestamptz;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  v_now := now() AT TIME ZONE 'America/Sao_Paulo';
  v_month_start := date_trunc('month', v_now) AT TIME ZONE 'America/Sao_Paulo';

  -- Empresa
  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'logo_url', c.logo_url, 'slug', c.slug) 
  INTO v_company FROM public.companies c WHERE c.id = p_company_id;

  -- Stats robustos sincronizados com as abas do frontend
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

  -- Meses e Próximo Número
  WITH months AS (
    SELECT DISTINCT to_char((collected_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS m
    FROM public.billing_orders WHERE company_id = p_company_id AND collected_at IS NOT NULL
    UNION SELECT to_char(v_now, 'YYYY-MM')
  )
  SELECT COALESCE(jsonb_agg(m ORDER BY m DESC), '[]'::jsonb) INTO v_months FROM months;

  SELECT COALESCE(MAX((regexp_replace(of_number, '\D', '', 'g'))::int), 0) INTO v_max_num
  FROM public.billing_orders WHERE company_id = p_company_id AND of_number ~ '\d';

  IF v_max_num > 0 THEN
    v_last := lpad(v_max_num::text, 3, '0');
    v_next := lpad((v_max_num + 1)::text, 3, '0');
  ELSE
    v_last := NULL;
    v_next := '001';
  END IF;

  SELECT COUNT(DISTINCT link_group_id) INTO v_link_groups
  FROM public.billing_orders WHERE company_id = p_company_id AND link_group_id IS NOT NULL;

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

GRANT EXECUTE ON FUNCTION public.link_billing_orders(uuid, uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_billing_order_group(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_billing_order(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_orders_bootstrap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_orders_bootstrap(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_billing_orders_bootstrap(uuid) TO anon;
