CREATE OR REPLACE FUNCTION public.debug_manual_stock(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count bigint;
  v_latest timestamptz;
  v_sample jsonb;
BEGIN
  SELECT count(*), max(created_at) INTO v_count, v_latest
  FROM public.manual_stock_movements
  WHERE company_id = p_company_id;

  SELECT jsonb_agg(m) INTO v_sample
  FROM (
    SELECT * FROM public.manual_stock_movements
    WHERE company_id = p_company_id
    ORDER BY created_at DESC
    LIMIT 3
  ) m;

  RETURN jsonb_build_object(
    'movement_count', v_count,
    'latest_movement', v_latest,
    'sample_movements', v_sample
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_manual_stock(uuid) TO authenticated, service_role;
