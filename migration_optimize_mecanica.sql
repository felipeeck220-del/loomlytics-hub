-- Otimização da RPC de OM/OC (Manutenção)
-- Adiciona paginação e filtros para reduzir o payload inicial
CREATE OR REPLACE FUNCTION public.get_maintenance_orders_list(
  p_company_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_cid UUID;
BEGIN
  v_user_cid := public.get_user_company_id();
  IF v_user_cid IS DISTINCT FROM p_company_id THEN
    RETURN json_build_object('orders', '[]'::json, 'items', '[]'::json, 'count', 0);
  END IF;

  RETURN (
    WITH filtered_orders AS (
      SELECT *
      FROM public.maintenance_orders
      WHERE company_id = p_company_id
        AND (p_status IS NULL OR status = p_status)
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ),
    total_count AS (
      SELECT count(*) as full_count 
      FROM public.maintenance_orders 
      WHERE company_id = p_company_id 
        AND (p_status IS NULL OR status = p_status)
    )
    SELECT json_build_object(
      'orders', COALESCE((SELECT json_agg(row_to_json(fo)) FROM filtered_orders fo), '[]'::json),
      'items', COALESCE((
        SELECT json_agg(row_to_json(i))
        FROM public.maintenance_order_items i
        WHERE i.order_id IN (SELECT id FROM filtered_orders)
      ), '[]'::json),
      'count', (SELECT full_count FROM total_count)
    )
  );
END;
$$;

-- Otimização da RPC de OT (Troca de Artigo)
CREATE OR REPLACE FUNCTION public.get_article_change_orders_list(
  p_company_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_cid UUID;
BEGIN
  v_user_cid := public.get_user_company_id();
  IF v_user_cid IS DISTINCT FROM p_company_id THEN
    RETURN json_build_object('orders', '[]'::json, 'count', 0);
  END IF;

  RETURN (
    WITH filtered AS (
      SELECT
        o.*,
        COALESCE((
          SELECT json_agg(row_to_json(y2) ORDER BY
            CASE WHEN y2.feeder_type = 'fio' THEN 0 ELSE 1 END,
            y2.feeder_position
          )
          FROM public.article_change_yarns y2
          WHERE y2.order_id = o.id
        ), '[]'::json) AS yarns
      FROM public.article_change_orders o
      WHERE o.company_id = p_company_id
        AND (p_status IS NULL OR status = p_status)
      ORDER BY o.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ),
    total_count AS (
      SELECT count(*) as full_count 
      FROM public.article_change_orders 
      WHERE company_id = p_company_id 
        AND (p_status IS NULL OR status = p_status)
    )
    SELECT json_build_object(
      'orders', COALESCE(json_agg(row_to_json(filtered)), '[]'::json),
      'count', (SELECT full_count FROM total_count)
    )
    FROM filtered
  );
END;
$$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_maintenance_orders_company_status ON public.maintenance_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_article_change_orders_company_status ON public.article_change_orders(company_id, status);

GRANT EXECUTE ON FUNCTION public.get_maintenance_orders_list(UUID, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_article_change_orders_list(UUID, TEXT, INTEGER, INTEGER) TO authenticated, service_role;
