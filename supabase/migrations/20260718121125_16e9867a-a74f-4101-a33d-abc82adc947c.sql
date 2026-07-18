
-- Fase 2 (rpcmecanica.md): RPCs de leitura consolidada para OM/OC e OT
-- Cada RPC devolve JSON único, elimina N+1 (items/yarns nested)

-- =========================================================================
-- get_maintenance_orders_list — substitui 2 SELECTs paralelos em
-- MaintenanceOrdersTab.load e MaintenanceMovementsTab (orders + items)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_maintenance_orders_list(p_company_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'orders', COALESCE((
      SELECT json_agg(row_to_json(o) ORDER BY o.created_at DESC)
      FROM public.maintenance_orders o
      WHERE o.company_id = p_company_id
    ), '[]'::json),
    'items', COALESCE((
      SELECT json_agg(row_to_json(i))
      FROM public.maintenance_order_items i
      WHERE i.company_id = p_company_id
    ), '[]'::json)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_orders_list(UUID) TO anon, authenticated, service_role;

-- =========================================================================
-- get_article_change_orders_list — substitui loadOrders em
-- ArticleChangeOrdersTab (elimina loop N+1 de article_change_yarns)
-- Retorna orders com yarns aninhados, já ordenados por feeder_type/position
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_article_change_orders_list(p_company_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH enriched AS (
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
  )
  SELECT json_build_object(
    'orders', COALESCE(
      json_agg(row_to_json(enriched) ORDER BY enriched.created_at DESC),
      '[]'::json
    )
  )
  FROM enriched;
$$;

GRANT EXECUTE ON FUNCTION public.get_article_change_orders_list(UUID) TO anon, authenticated, service_role;
