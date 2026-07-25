
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
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  -- Empresa
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'logo_url', c.logo_url,
    'slug', c.slug
  ) INTO v_company
  FROM public.companies c
  WHERE c.id = p_company_id;

  v_month_start := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))
                   AT TIME ZONE 'America/Sao_Paulo';

  -- Stats
  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE status = 'open' AND priority = false),
    'priority', COUNT(*) FILTER (WHERE status = 'open' AND priority = true),
    'separating', COUNT(*) FILTER (WHERE status = 'separating'),
    'awaiting_doc', COUNT(*) FILTER (WHERE status = 'ready' AND delivery_doc_number IS NULL),
    'ready', COUNT(*) FILTER (WHERE status = 'ready' AND delivery_doc_number IS NOT NULL),
    'collected_month', COUNT(*) FILTER (
      WHERE status = 'collected' AND collected_at >= v_month_start
    ),
    'cancelled_month', COUNT(*) FILTER (
      WHERE status = 'cancelled' AND cancelled_at >= v_month_start
    )
  ) INTO v_stats
  FROM public.billing_orders
  WHERE company_id = p_company_id;

  -- Meses disponíveis (de coletas + mês corrente)
  WITH months AS (
    SELECT DISTINCT to_char(
      (collected_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM'
    ) AS m
    FROM public.billing_orders
    WHERE company_id = p_company_id AND collected_at IS NOT NULL
    UNION
    SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM')
  )
  SELECT COALESCE(jsonb_agg(m ORDER BY m DESC), '[]'::jsonb)
  INTO v_months
  FROM months;

  -- Próximo número de OF (mesma lógica do cliente: maior numérico + 1, pad 3)
  SELECT COALESCE(MAX((regexp_replace(of_number, '\D', '', 'g'))::int), 0)
  INTO v_max_num
  FROM public.billing_orders
  WHERE company_id = p_company_id
    AND regexp_replace(of_number, '\D', '', 'g') ~ '^\d+$'
    AND regexp_replace(of_number, '\D', '', 'g') <> '';

  IF v_max_num > 0 THEN
    v_last := lpad(v_max_num::text, 3, '0');
    v_next := lpad((v_max_num + 1)::text, 3, '0');
  ELSE
    v_last := NULL;
    v_next := '001';
  END IF;

  -- Quantidade de grupos atrelados distintos
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

GRANT EXECUTE ON FUNCTION public.get_billing_orders_bootstrap(uuid)
  TO anon, authenticated, service_role;
