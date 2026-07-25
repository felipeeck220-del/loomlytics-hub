
-- =========================================================
-- Fase 4 — auxiliares e exports (docs/rpcBillingOrders.md)
-- =========================================================

-- 1) get_billing_order_negative_warning
CREATE OR REPLACE FUNCTION public.get_billing_order_negative_warning(
  p_company_id uuid,
  p_article_id uuid,
  p_requested_pieces numeric DEFAULT 0,
  p_requested_kg numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_produced_kg numeric := 0;
  v_produced_rolls numeric := 0;
  v_delivered_kg numeric := 0;
  v_delivered_rolls numeric := 0;
  v_reserved_kg numeric := 0;
  v_reserved_rolls numeric := 0;
  v_available_kg numeric;
  v_available_pieces numeric;
  v_after_kg numeric;
  v_after_pieces numeric;
  v_article_name text;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(weight_kg), 0), COALESCE(SUM(rolls_produced), 0)
    INTO v_produced_kg, v_produced_rolls
  FROM public.productions
  WHERE company_id = p_company_id AND article_id = p_article_id;

  -- ajustes e reservas em stock_movements (ignora 2ª qualidade, mesma regra do cliente)
  FOR v_produced_kg, v_produced_rolls, v_delivered_kg, v_delivered_rolls, v_reserved_kg, v_reserved_rolls IN
    SELECT
      v_produced_kg
        + COALESCE(SUM(CASE WHEN type = 'adjust_in' THEN COALESCE(weight_kg,0) ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN type = 'adjust_out' THEN COALESCE(weight_kg,0) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NULL THEN COALESCE(weight_kg,0) ELSE 0 END), 0),
      v_produced_rolls
        + COALESCE(SUM(CASE WHEN type = 'adjust_in' THEN COALESCE(pieces,0) ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN type = 'adjust_out' THEN COALESCE(pieces,0) ELSE 0 END), 0)
        + COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NULL THEN COALESCE(pieces,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type = 'out' THEN COALESCE(weight_kg,0) ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NOT NULL THEN COALESCE(weight_kg,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type = 'out' THEN COALESCE(pieces,0) ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NOT NULL THEN COALESCE(pieces,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type = 'reserve' THEN COALESCE(weight_kg,0) ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN type = 'release' THEN COALESCE(weight_kg,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type = 'reserve' THEN COALESCE(pieces,0) ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN type = 'release' THEN COALESCE(pieces,0) ELSE 0 END), 0)
    FROM public.stock_movements
    WHERE company_id = p_company_id
      AND article_id = p_article_id
      AND COALESCE(is_second_quality, false) = false
  LOOP
    -- one-row loop only to assign
    NULL;
  END LOOP;

  v_available_kg := (v_produced_kg - v_delivered_kg) - v_reserved_kg;
  v_available_pieces := (v_produced_rolls - v_delivered_rolls) - v_reserved_rolls;
  v_after_kg := v_available_kg - COALESCE(p_requested_kg, 0);
  v_after_pieces := v_available_pieces - COALESCE(p_requested_pieces, 0);

  SELECT name INTO v_article_name FROM public.articles WHERE id = p_article_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'article_id', p_article_id,
    'article_name', COALESCE(v_article_name, 'Artigo'),
    'available_kg', v_available_kg,
    'available_pieces', v_available_pieces,
    'requested_kg', COALESCE(p_requested_kg, 0),
    'requested_pieces', COALESCE(p_requested_pieces, 0),
    'after_kg', v_after_kg,
    'after_pieces', v_after_pieces,
    'is_already_negative', (v_available_kg < 0 OR v_available_pieces < 0),
    'will_go_negative', (
      (COALESCE(p_requested_kg,0) > 0 AND v_after_kg < 0)
      OR (COALESCE(p_requested_pieces,0) > 0 AND v_after_pieces < 0)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_order_negative_warning(uuid, uuid, numeric, numeric)
  TO anon, authenticated, service_role;

-- 2) get_billing_order_link_group
CREATE OR REPLACE FUNCTION public.get_billing_order_link_group(
  p_company_id uuid,
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_rows jsonb;
  v_totals jsonb;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t.*) ORDER BY t.priority DESC, t.created_at ASC), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT
      bo.id,
      bo.of_number,
      bo.status,
      bo.priority,
      bo.dyehouse,
      bo.pieces_expected,
      bo.pieces_real,
      bo.weight_expected,
      bo.weight_real,
      bo.delivery_doc_type,
      bo.delivery_doc_number,
      bo.created_at,
      bo.collected_at,
      c.name AS client_name,
      a.name AS article_name,
      m.name AS machine_name
    FROM public.billing_orders bo
    LEFT JOIN public.clients c ON c.id = bo.client_id
    LEFT JOIN public.articles a ON a.id = bo.article_id
    LEFT JOIN public.machines m ON m.id = bo.machine_id
    WHERE bo.company_id = p_company_id
      AND bo.link_group_id = p_group_id
  ) t;

  SELECT jsonb_build_object(
    'total_orders', COUNT(*),
    'total_pieces_expected', COALESCE(SUM(pieces_expected), 0),
    'total_pieces_real', COALESCE(SUM(pieces_real), 0),
    'total_weight_expected', COALESCE(SUM(weight_expected), 0),
    'total_weight_real', COALESCE(SUM(weight_real), 0),
    'active_count', COUNT(*) FILTER (WHERE status NOT IN ('collected','cancelled')),
    'collected_count', COUNT(*) FILTER (WHERE status = 'collected'),
    'cancelled_count', COUNT(*) FILTER (WHERE status = 'cancelled')
  ) INTO v_totals
  FROM public.billing_orders
  WHERE company_id = p_company_id AND link_group_id = p_group_id;

  RETURN jsonb_build_object(
    'group_id', p_group_id,
    'rows', v_rows,
    'totals', v_totals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_order_link_group(uuid, uuid)
  TO anon, authenticated, service_role;

-- 3) get_billing_order_export — payload consolidado para PDF (por OF)
CREATE OR REPLACE FUNCTION public.get_billing_order_export(
  p_company_id uuid,
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_order jsonb;
  v_company jsonb;
  v_pallets jsonb;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id', co.id, 'name', co.name, 'logo_url', co.logo_url, 'slug', co.slug
  ) INTO v_company
  FROM public.companies co WHERE co.id = p_company_id;

  SELECT to_jsonb(bo.*)
    || jsonb_build_object(
      'client', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'name', c.name) END,
      'article', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id', a.id, 'name', a.name, 'own_stock', a.own_stock) END,
      'machine', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'name', m.name) END,
      'creator', CASE WHEN cp.id IS NULL THEN NULL ELSE jsonb_build_object('name', cp.name, 'code', cp.code) END,
      'separator', CASE WHEN sp.id IS NULL THEN NULL ELSE jsonb_build_object('name', sp.name, 'code', sp.code) END,
      'collector', CASE WHEN kp.id IS NULL THEN NULL ELSE jsonb_build_object('name', kp.name, 'code', kp.code) END,
      'prioritizer', CASE WHEN pp.id IS NULL THEN NULL ELSE jsonb_build_object('name', pp.name, 'code', pp.code) END,
      'editor', CASE WHEN ep.id IS NULL THEN NULL ELSE jsonb_build_object('name', ep.name, 'code', ep.code) END
    )
    INTO v_order
  FROM public.billing_orders bo
  LEFT JOIN public.clients c ON c.id = bo.client_id
  LEFT JOIN public.articles a ON a.id = bo.article_id
  LEFT JOIN public.machines m ON m.id = bo.machine_id
  LEFT JOIN public.profiles cp ON cp.id = bo.created_by
  LEFT JOIN public.profiles sp ON sp.id = bo.separated_by
  LEFT JOIN public.profiles kp ON kp.id = bo.collected_by
  LEFT JOIN public.profiles pp ON pp.id = bo.priority_by
  LEFT JOIN public.profiles ep ON ep.id = bo.last_edited_by
  WHERE bo.id = p_id AND bo.company_id = p_company_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(p.*) ORDER BY p.pallet_number ASC), '[]'::jsonb)
    INTO v_pallets
  FROM (
    SELECT bop.id, bop.pallet_number, bop.pieces, bop.weight_kg,
           bop.machine_id, m.name AS machine_name,
           bop.alt_client_id, ac.name AS alt_client_name,
           bop.alt_article_id, aa.name AS alt_article_name,
           bop.own_article_id
    FROM public.billing_order_pallets bop
    LEFT JOIN public.machines m ON m.id = bop.machine_id
    LEFT JOIN public.clients ac ON ac.id = bop.alt_client_id
    LEFT JOIN public.articles aa ON aa.id = bop.alt_article_id
    WHERE bop.billing_order_id = p_id
  ) p;

  RETURN jsonb_build_object(
    'company', v_company,
    'order', v_order,
    'pallets', v_pallets
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_billing_order_export(uuid, uuid)
  TO anon, authenticated, service_role;
