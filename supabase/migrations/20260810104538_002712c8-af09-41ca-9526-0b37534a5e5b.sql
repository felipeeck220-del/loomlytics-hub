-- Fix: get_manual_stock_movements pagination and Fallback consistency
CREATE OR REPLACE FUNCTION public.get_manual_stock_movements(
  p_company_id uuid,
  p_type text DEFAULT 'all'::text,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_client_id uuid DEFAULT NULL::uuid,
  p_article_id uuid DEFAULT NULL::uuid,
  p_of_search text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_rows jsonb;
  v_total integer;
  v_offset integer := (p_page - 1) * p_page_size;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0);
  END IF;

  WITH filtered AS (
    SELECT 
      m.id, m.company_id, m.article_id, m.client_id, m.machine_id, 
      m.billing_order_id, m.type, m.pieces, m.weight_kg, m.reason, 
      m.source_movement_id, m.created_by, m.created_at, m.on_machine,
      a.name as article_name,
      c.name as client_name,
      mac.name as machine_name,
      p.name as creator_name,
      bo.order_number as of_number,
      COALESCE(m.client_id, a.client_id) as effective_client_id
    FROM public.manual_stock_movements m
    JOIN public.articles a ON a.id = m.article_id AND a.company_id = p_company_id
    LEFT JOIN public.clients c ON c.id = COALESCE(m.client_id, a.client_id) AND c.company_id = p_company_id
    LEFT JOIN public.machines mac ON mac.id = m.machine_id AND mac.company_id = p_company_id
    LEFT JOIN public.profiles p ON p.id = m.created_by
    LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id
    WHERE m.company_id = p_company_id
      AND (p_type = 'all' OR m.type = p_type)
      AND (p_from IS NULL OR m.created_at::date >= p_from)
      AND (p_to IS NULL OR m.created_at::date <= p_to)
      AND (p_client_id IS NULL OR COALESCE(m.client_id, a.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
      AND (p_of_search IS NULL OR bo.order_number::text ILIKE '%' || p_of_search || '%')
  ),
  ordered AS (
    SELECT *, COUNT(*) OVER() as total_count
    FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT 
    jsonb_build_object(
      'rows', COALESCE(jsonb_agg(row_to_json(ordered)), '[]'::jsonb),
      'total_count', COALESCE((SELECT total_count FROM ordered LIMIT 1), 0)
    ) INTO v_rows
  FROM ordered;

  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_manual_stock_movements(uuid, text, date, date, integer, integer, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_movements(uuid, text, date, date, integer, integer, uuid, uuid, text) TO authenticated, service_role;