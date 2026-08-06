CREATE OR REPLACE FUNCTION public.get_mecanica_stats(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_maintenance_stats json;
  v_ot_stats json;
BEGIN
  SELECT json_object_agg(status, count) INTO v_maintenance_stats
  FROM (
    SELECT status, count(*) as count
    FROM public.maintenance_orders
    WHERE company_id = p_company_id
    GROUP BY status
  ) t;

  SELECT json_object_agg(status, count) INTO v_ot_stats
  FROM (
    SELECT status::text, count(*) as count
    FROM public.article_change_orders
    WHERE company_id = p_company_id
    GROUP BY status
  ) t;

  RETURN json_build_object(
    'maintenance', COALESCE(v_maintenance_stats, '{}'::json),
    'ot', COALESCE(v_ot_stats, '{}'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mecanica_stats TO authenticated;
