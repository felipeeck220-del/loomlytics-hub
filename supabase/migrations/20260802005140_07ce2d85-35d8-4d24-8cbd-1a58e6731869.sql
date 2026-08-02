ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS separation_started_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS separation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS separation_finished_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS separation_finished_at timestamptz;

UPDATE public.billing_orders
   SET separation_started_by = COALESCE(separation_started_by, separated_by)
 WHERE separated_by IS NOT NULL AND separation_started_by IS NULL;

CREATE OR REPLACE FUNCTION public.start_billing_order_separation(
  p_company_id uuid, p_id uuid, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status <> 'open' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders
     SET status = 'separating', separated_by = v_pid,
         separation_started_by = v_pid, separation_started_at = now(),
         separation_finished_by = NULL, separation_finished_at = NULL,
         updated_at = now()
   WHERE id = p_id;

  PERFORM public._of_audit(p_company_id, 'billing_order_start_separation',
    jsonb_build_object('of', v_row.of_number, 'id', p_id), p_author_name, p_author_code);
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.launch_billing_order_ready(
  p_company_id uuid, p_id uuid, p_pieces_real integer DEFAULT NULL, p_weight_real numeric DEFAULT NULL,
  p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_sum_p int; v_sum_w numeric; v_pallet_count int;
  v_pieces int; v_weight numeric;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF v_row.status = 'ready' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF v_row.status <> 'separating' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  SELECT COUNT(*), COALESCE(SUM(pieces),0), COALESCE(SUM(weight_kg),0)
    INTO v_pallet_count, v_sum_p, v_sum_w
    FROM public.billing_order_pallets WHERE billing_order_id = p_id;

  IF v_pallet_count > 0 THEN
    v_pieces := v_sum_p; v_weight := v_sum_w;
  ELSE
    v_pieces := GREATEST(0, COALESCE(p_pieces_real, v_row.pieces_expected, 0));
    v_weight := GREATEST(0, COALESCE(p_weight_real, v_row.weight_expected, 0));
  END IF;

  UPDATE public.billing_orders
     SET status = 'ready', pieces_real = v_pieces, weight_real = v_weight,
         weight_avg = CASE WHEN v_pieces > 0 THEN v_weight / v_pieces ELSE 0 END,
         priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL,
         separation_finished_by = v_pid, separation_finished_at = now(),
         updated_at = now()
   WHERE id = p_id AND status = 'separating';

  IF v_pallet_count = 0 AND (v_pieces > 0 OR v_weight > 0) THEN
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'reserve',
            v_pieces, v_weight, 'OF #' || v_row.of_number || ' pronta (reserva)', v_pid);
  END IF;

  PERFORM public._of_audit(p_company_id, 'billing_order_launch_ready',
    jsonb_build_object('of', v_row.of_number, 'pieces', v_pieces, 'weight', v_weight,
                       'from_pallets', v_pallet_count > 0),
    p_author_name, p_author_code);
  RETURN jsonb_build_object('ok', true, 'pieces_real', v_pieces, 'weight_real', v_weight);
END; $$;

CREATE OR REPLACE FUNCTION public.get_billing_order_detail(p_company_id uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_result jsonb;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT
    to_jsonb(bo.*)
    || jsonb_build_object(
      'client_name',        cl.name,
      'article_name',       ar.name,
      'machine_name',       ma.name,
      'created_by_name',    pc.name,
      'created_by_code',    pc.code,
      'separated_by_name',  ps.name,
      'separated_by_code',  ps.code,
      'separation_started_by_name',  pss.name,
      'separation_started_by_code',  pss.code,
      'separation_finished_by_name', psf.name,
      'separation_finished_by_code', psf.code,
      'collected_by_name',  pk.name,
      'collected_by_code',  pk.code,
      'cancelled_by_name',  pn.name,
      'cancelled_by_code',  pn.code,
      'edited_by_name',     pe.name,
      'edited_by_code',     pe.code,
      'priority_by_name',   pp.name,
      'priority_by_code',   pp.code,
      'delivery_doc_setter_name', pd.name,
      'delivery_doc_setter_code', pd.code,
      'reversed_by_name',   pr.name,
      'reversed_by_code',   pr.code,
      'pallets', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'pallet_number', p.pallet_number,
            'pieces', p.pieces,
            'weight_kg', p.weight_kg,
            'machine_id', p.machine_id,
            'machine_name', m.name,
            'alt_client_id', p.alt_client_id,
            'alt_article_id', p.alt_article_id,
            'own_article_id', p.own_article_id,
            'own_stock_movement_id', p.own_stock_movement_id,
            'reserve_movement_id', p.reserve_movement_id,
            'created_at', p.created_at,
            'created_by', p.created_by,
            'created_by_name', pb.name,
            'created_by_code', pb.code
          )
          ORDER BY p.pallet_number
        )
        FROM public.billing_order_pallets p
        LEFT JOIN public.machines m ON m.id = p.machine_id
        LEFT JOIN public.profiles pb ON pb.id = p.created_by
        WHERE p.billing_order_id = bo.id
      ), '[]'::jsonb),
      'link_group_size', COALESCE((
        SELECT COUNT(*)::int FROM public.billing_orders x
        WHERE x.link_group_id = bo.link_group_id
      ), 0)
    )
  INTO v_result
  FROM public.billing_orders bo
  LEFT JOIN public.clients  cl ON cl.id = bo.client_id
  LEFT JOIN public.articles ar ON ar.id = bo.article_id
  LEFT JOIN public.machines ma ON ma.id = bo.machine_id
  LEFT JOIN public.profiles pc ON pc.id = bo.created_by
  LEFT JOIN public.profiles ps ON ps.id = bo.separated_by
  LEFT JOIN public.profiles pss ON pss.id = bo.separation_started_by
  LEFT JOIN public.profiles psf ON psf.id = bo.separation_finished_by
  LEFT JOIN public.profiles pk ON pk.id = bo.collected_by
  LEFT JOIN public.profiles pn ON pn.id = bo.cancelled_by
  LEFT JOIN public.profiles pe ON pe.id = bo.last_edited_by
  LEFT JOIN public.profiles pp ON pp.id = bo.priority_by
  LEFT JOIN public.profiles pd ON pd.id = bo.delivery_doc_set_by
  LEFT JOIN public.profiles pr ON pr.id = bo.reversed_by
  WHERE bo.id = p_id AND bo.company_id = p_company_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_billing_order_export(p_company_id uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
      'separation_starter', CASE WHEN ssp.id IS NULL THEN NULL ELSE jsonb_build_object('name', ssp.name, 'code', ssp.code) END,
      'separation_finisher', CASE WHEN sfp.id IS NULL THEN NULL ELSE jsonb_build_object('name', sfp.name, 'code', sfp.code) END,
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
  LEFT JOIN public.profiles ssp ON ssp.id = bo.separation_started_by
  LEFT JOIN public.profiles sfp ON sfp.id = bo.separation_finished_by
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
           bop.own_article_id,
           bop.created_at, bop.created_by,
           pb.name AS created_by_name, pb.code AS created_by_code
    FROM public.billing_order_pallets bop
    LEFT JOIN public.machines m ON m.id = bop.machine_id
    LEFT JOIN public.clients ac ON ac.id = bop.alt_client_id
    LEFT JOIN public.articles aa ON aa.id = bop.alt_article_id
    LEFT JOIN public.profiles pb ON pb.id = bop.created_by
    WHERE bop.billing_order_id = p_id
  ) p;

  RETURN jsonb_build_object(
    'company', v_company,
    'order', v_order,
    'pallets', v_pallets
  );
END; $$;

REVOKE ALL ON FUNCTION public.start_billing_order_separation(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.launch_billing_order_ready(uuid, uuid, integer, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_billing_order_detail(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_billing_order_export(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_billing_order_separation(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.launch_billing_order_ready(uuid, uuid, integer, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_billing_order_detail(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_billing_order_export(uuid, uuid) TO authenticated, service_role;