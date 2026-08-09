-- Final Check and Audit Consistency for Billing Orders and Manual Stock
-- 2026-08-10

-- 1) Update mirror_of_update_to_manual_stock to include 'on_machine'
-- Ensure that updates to stock_movements (rare but possible during edits) 
-- propagate the 'on_machine' state (which is always false for OF/Manual Stock mirror)
-- and respect the machine_id nullability.

CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_should_mirror boolean;
  v_client uuid;
BEGIN
  v_should_mirror := COALESCE(NEW.is_second_quality, false) = false
    AND (
      NEW.type::text IN ('reserve','release','out')
      OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
    );

  IF NOT v_should_mirror THEN
    DELETE FROM public.manual_stock_movements WHERE source_movement_id = OLD.id;
    RETURN NEW;
  END IF;

  v_client := NEW.client_id;
  IF v_client IS NULL THEN
    SELECT a.client_id INTO v_client FROM public.articles a
    WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id;
  END IF;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, billing_order_id,
     type, pieces, weight_kg, reason, source_movement_id, created_by, created_at, on_machine)
  VALUES
    (NEW.company_id, NEW.article_id, v_client, NEW.machine_id, NEW.billing_order_id,
     NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
     NEW.reason, NEW.id, NEW.created_by, NEW.created_at, false)
  ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
  DO UPDATE SET
    company_id = EXCLUDED.company_id,
    article_id = EXCLUDED.article_id,
    client_id = EXCLUDED.client_id,
    machine_id = EXCLUDED.machine_id,
    billing_order_id = EXCLUDED.billing_order_id,
    type = EXCLUDED.type,
    pieces = EXCLUDED.pieces,
    weight_kg = EXCLUDED.weight_kg,
    reason = EXCLUDED.reason,
    created_by = EXCLUDED.created_by,
    created_at = EXCLUDED.created_at,
    on_machine = EXCLUDED.on_machine;

  RETURN NEW;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mirror_of_update_to_manual_stock() TO service_role;

-- 2) Update get_billing_orders_list to include 'multiplier' in the returned rows
-- This ensures the frontend correctly displays the multiplier badge on the cards.

CREATE OR REPLACE FUNCTION public.get_billing_orders_list(p_company_id uuid, p_view text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_client_id uuid DEFAULT NULL::uuid, p_month text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_company uuid;
  v_offset integer;
  v_limit integer;
  v_search text;
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_range_start timestamptz;
  v_range_end   timestamptz;
  v_total integer;
  v_rows jsonb;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  v_limit  := GREATEST(1, LEAST(COALESCE(p_page_size, 50), 200));
  v_offset := GREATEST(0, (COALESCE(p_page, 1) - 1) * v_limit);
  v_search := NULLIF(BTRIM(COALESCE(p_search, '')), '');

  IF p_month IS NOT NULL AND p_month ~ '^\d{4}-\d{2}$' THEN
    v_month_start := ((p_month || '-01')::timestamp AT TIME ZONE 'America/Sao_Paulo');
    v_month_end   := v_month_start + INTERVAL '1 month';
  END IF;

  IF p_start_date IS NOT NULL THEN
    v_range_start := (p_start_date::timestamp AT TIME ZONE 'America/Sao_Paulo');
  END IF;
  IF p_end_date IS NOT NULL THEN
    v_range_end := ((p_end_date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  END IF;

  WITH base AS (
    SELECT bo.*
    FROM public.billing_orders bo
    WHERE bo.company_id = p_company_id
      AND (
        p_view = 'all'
        OR (p_view = 'priority'     AND bo.status = 'open'       AND bo.priority = TRUE)
        OR (p_view = 'open'         AND bo.status = 'open'       AND COALESCE(bo.priority, FALSE) = FALSE)
        OR (p_view = 'separating'   AND bo.status = 'separating')
        OR (p_view = 'awaiting_doc' AND bo.status = 'ready'      AND bo.delivery_doc_number IS NULL)
        OR (p_view = 'ready'        AND bo.status = 'ready'      AND bo.delivery_doc_number IS NOT NULL)
        OR (p_view = 'collected'    AND bo.status = 'collected')
        OR (p_view = 'cancelled'    AND bo.status = 'cancelled')
      )
      AND (p_client_id IS NULL OR bo.client_id = p_client_id)
      AND (
        v_month_start IS NULL
        OR (p_view = 'collected'  AND bo.collected_at >= v_month_start AND bo.collected_at < v_month_end)
        OR (p_view = 'cancelled'  AND bo.cancelled_at >= v_month_start AND bo.cancelled_at < v_month_end)
        OR (p_view NOT IN ('collected','cancelled'))
      )
      AND (
        v_range_start IS NULL
        OR (p_view = 'collected'  AND bo.collected_at >= v_range_start)
        OR (p_view = 'cancelled'  AND bo.cancelled_at >= v_range_start)
        OR (p_view NOT IN ('collected','cancelled'))
      )
      AND (
        v_range_end IS NULL
        OR (p_view = 'collected'  AND bo.collected_at < v_range_end)
        OR (p_view = 'cancelled'  AND bo.cancelled_at < v_range_end)
        OR (p_view NOT IN ('collected','cancelled'))
      )
  ),
  filtered AS (
    SELECT b.*
    FROM base b
    LEFT JOIN public.clients  c ON c.id = b.client_id
    LEFT JOIN public.articles a ON a.id = b.article_id
    WHERE v_search IS NULL
       OR b.of_number ILIKE '%' || v_search || '%'
       OR COALESCE(b.dyehouse,'') ILIKE '%' || v_search || '%'
       OR COALESCE(b.delivery_doc_number,'') ILIKE '%' || v_search || '%'
       OR COALESCE(c.name,'') ILIKE '%' || v_search || '%'
       OR COALESCE(a.name,'') ILIKE '%' || v_search || '%'
  ),
  counted AS (
    SELECT COUNT(*)::int AS total FROM filtered
  ),
  ordered AS (
    SELECT f.*,
           CASE
             WHEN p_view = 'collected' THEN EXTRACT(EPOCH FROM COALESCE(f.collected_at, f.updated_at, f.created_at))
             WHEN p_view = 'cancelled' THEN EXTRACT(EPOCH FROM COALESCE(f.cancelled_at, f.updated_at, f.created_at))
             ELSE EXTRACT(EPOCH FROM f.created_at)
           END AS order_key
    FROM filtered f
    ORDER BY
      CASE WHEN p_view NOT IN ('collected','cancelled') THEN f.priority::int ELSE 0 END DESC,
      CASE
        WHEN p_view = 'collected' THEN COALESCE(f.collected_at, f.updated_at, f.created_at)
        WHEN p_view = 'cancelled' THEN COALESCE(f.cancelled_at, f.updated_at, f.created_at)
        ELSE f.created_at
      END DESC
    LIMIT v_limit OFFSET v_offset
  ),
  pallets_agg AS (
    SELECT p.billing_order_id,
           jsonb_agg(
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
               'created_at', p.created_at,
               'created_by_name', pb.name,
               'created_by_code', pb.code
             )
             ORDER BY p.pallet_number
           ) AS pallets
    FROM public.billing_order_pallets p
    LEFT JOIN public.machines m ON m.id = p.machine_id
    LEFT JOIN public.profiles pb ON pb.id = p.created_by
    WHERE p.billing_order_id IN (SELECT id FROM ordered)
    GROUP BY p.billing_order_id
  ),
  link_sizes AS (
    SELECT link_group_id, COUNT(*)::int AS grp_size
    FROM public.billing_orders
    WHERE company_id = p_company_id AND link_group_id IS NOT NULL
    GROUP BY link_group_id
  )
  SELECT
    (SELECT total FROM counted),
    COALESCE(jsonb_agg(
      to_jsonb(o.*)
      - 'order_key'
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
        'pallets',            COALESCE(pa.pallets, '[]'::jsonb),
        'link_group_size',    COALESCE(lg.grp_size, 0)
      )
      ORDER BY
        CASE WHEN p_view NOT IN ('collected','cancelled') THEN o.priority::int ELSE 0 END DESC,
        o.order_key DESC
    ), '[]'::jsonb)
  INTO v_total, v_rows
  FROM ordered o
  LEFT JOIN public.clients  cl ON cl.id = o.client_id
  LEFT JOIN public.articles ar ON ar.id = o.article_id
  LEFT JOIN public.machines ma ON ma.id = o.machine_id
  LEFT JOIN public.profiles pc ON pc.id = o.created_by
  LEFT JOIN public.profiles ps ON ps.id = o.separated_by
  LEFT JOIN public.profiles pss ON pss.id = o.separation_started_by
  LEFT JOIN public.profiles psf ON psf.id = o.separation_finished_by
  LEFT JOIN public.profiles pk ON pk.id = o.collected_by
  LEFT JOIN public.profiles pn ON pn.id = o.cancelled_by
  LEFT JOIN public.profiles pe ON pe.id = o.last_edited_by
  LEFT JOIN pallets_agg     pa ON pa.billing_order_id = o.id
  LEFT JOIN link_sizes      lg ON lg.link_group_id    = o.link_group_id;

  RETURN jsonb_build_object(
    'rows',        COALESCE(v_rows, '[]'::jsonb),
    'total_count', COALESCE(v_total, 0),
    'page',        COALESCE(p_page, 1),
    'page_size',   v_limit
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_billing_orders_list(uuid, text, text, uuid, text, date, date, integer, integer) TO authenticated, service_role;
