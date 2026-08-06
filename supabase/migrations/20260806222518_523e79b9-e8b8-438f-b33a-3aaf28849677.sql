-- Precisely drop existing functions
DROP FUNCTION IF EXISTS public.get_maintenance_orders_list(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_maintenance_orders_list(uuid);
DROP FUNCTION IF EXISTS public.get_article_change_orders_list(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_article_change_orders_list(uuid);

-- Maintenance Orders
CREATE OR REPLACE FUNCTION public.get_maintenance_orders_list(
  p_company_id uuid,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders json;
  v_items json;
  v_count integer;
BEGIN
  -- Total count com filtros
  SELECT count(*) INTO v_count
  FROM public.maintenance_orders
  WHERE company_id = p_company_id
    AND (p_status IS NULL OR p_status = '' OR status = p_status)
    AND (p_search IS NULL OR p_search = '' OR (
      description ILIKE '%' || p_search || '%' OR
      cancellation_reason ILIKE '%' || p_search || '%' OR
      EXISTS (
        SELECT 1 FROM public.machines m 
        WHERE m.id = machine_id AND m.name ILIKE '%' || p_search || '%'
      )
    ));

  -- Orders paginadas
  SELECT json_agg(t) INTO v_orders
  FROM (
    SELECT *
    FROM public.maintenance_orders
    WHERE company_id = p_company_id
      AND (p_status IS NULL OR p_status = '' OR status = p_status)
      AND (p_search IS NULL OR p_search = '' OR (
        description ILIKE '%' || p_search || '%' OR
        cancellation_reason ILIKE '%' || p_search || '%' OR
        EXISTS (
          SELECT 1 FROM public.machines m 
          WHERE m.id = machine_id AND m.name ILIKE '%' || p_search || '%'
        )
      ))
    ORDER BY created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  -- Items vinculados às ordens retornadas
  SELECT json_agg(it) INTO v_items
  FROM public.maintenance_order_items it
  WHERE it.order_id IN (
    SELECT id FROM (
      SELECT id FROM public.maintenance_orders
      WHERE company_id = p_company_id
        AND (p_status IS NULL OR p_status = '' OR status = p_status)
        AND (p_search IS NULL OR p_search = '' OR (
          description ILIKE '%' || p_search || '%' OR
          cancellation_reason ILIKE '%' || p_search || '%' OR
          EXISTS (
            SELECT 1 FROM public.machines m 
            WHERE m.id = machine_id AND m.name ILIKE '%' || p_search || '%'
          )
        ))
      ORDER BY created_at DESC
      LIMIT p_limit
      OFFSET p_offset
    ) sub
  );

  RETURN json_build_object(
    'orders', COALESCE(v_orders, '[]'::json),
    'items', COALESCE(v_items, '[]'::json),
    'count', v_count
  );
END;
$$;

-- Article Change Orders (OT)
CREATE OR REPLACE FUNCTION public.get_article_change_orders_list(
  p_company_id uuid,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders json;
  v_count integer;
BEGIN
  -- Total count com filtros
  SELECT count(*) INTO v_count
  FROM public.article_change_orders
  WHERE company_id = p_company_id
    AND (p_status IS NULL OR p_status = '' OR status::text = p_status)
    AND (p_search IS NULL OR p_search = '' OR (
      notes ILIKE '%' || p_search || '%' OR
      EXISTS (
        SELECT 1 FROM public.machines m 
        WHERE m.id = machine_id AND m.name ILIKE '%' || p_search || '%'
      )
    ));

  -- Orders paginadas com yarns incluídos
  SELECT json_agg(t) INTO v_orders
  FROM (
    SELECT 
      o.*,
      COALESCE(
        (
          SELECT json_agg(y ORDER BY y.created_at)
          FROM public.article_change_yarns y
          WHERE y.order_id = o.id
        ),
        '[]'::json
      ) as yarns
    FROM public.article_change_orders o
    WHERE o.company_id = p_company_id
      AND (p_status IS NULL OR p_status = '' OR o.status::text = p_status)
      AND (p_search IS NULL OR p_search = '' OR (
        o.notes ILIKE '%' || p_search || '%' OR
        EXISTS (
          SELECT 1 FROM public.machines m 
          WHERE m.id = o.machine_id AND m.name ILIKE '%' || p_search || '%'
        )
      ))
    ORDER BY o.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN json_build_object(
    'orders', COALESCE(v_orders, '[]'::json),
    'count', v_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_orders_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_article_change_orders_list TO authenticated;
