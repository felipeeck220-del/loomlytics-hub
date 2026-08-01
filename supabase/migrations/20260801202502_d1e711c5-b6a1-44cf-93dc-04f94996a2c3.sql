DO $do$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_manual_stock_estoque';

  IF position('ORDER BY created_at, id ROWS UNBOUNDED PRECEDING' in v_src) = 0 THEN
    RAISE NOTICE 'ja aplicado';
    RETURN;
  END IF;

  v_new := replace(v_src,
    'ORDER BY created_at, id ROWS UNBOUNDED PRECEDING',
    'ORDER BY created_at, (CASE WHEN d_kg + d_pc >= 0 THEN 0 ELSE 1 END), id ROWS UNBOUNDED PRECEDING');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(p_company_id uuid, p_month text DEFAULT ''all''::text, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS %L',
    v_new);
END
$do$;

REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;