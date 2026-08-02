DO $do$
DECLARE
  src text;
  old_txt text;
  new_txt text;
BEGIN
  SELECT p.prosrc INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'get_manual_stock_estoque' AND n.nspname = 'public'
  LIMIT 1;

  old_txt := '      GREATEST(0, COALESCE(s.stock_kg,0) - COALESCE(r.reserved_kg,0)) AS available_kg,
      GREATEST(0, COALESCE(s.stock_rolls,0) - COALESCE(r.reserved_rolls,0)) AS available_rolls';

  new_txt := '      LEAST(COALESCE(mm.machine_kg,0), COALESCE(s.stock_kg,0))
        + GREATEST(0, COALESCE(s.stock_kg,0) - LEAST(COALESCE(mm.machine_kg,0), COALESCE(s.stock_kg,0)) - COALESCE(r.reserved_kg,0)) AS available_kg,
      LEAST(COALESCE(mm.machine_rolls,0), COALESCE(s.stock_rolls,0))
        + GREATEST(0, COALESCE(s.stock_rolls,0) - LEAST(COALESCE(mm.machine_rolls,0), COALESCE(s.stock_rolls,0)) - COALESCE(r.reserved_rolls,0)) AS available_rolls';

  IF position(old_txt in src) = 0 THEN
    RAISE EXCEPTION 'padrao de calculo de disponivel nao encontrado na funcao get_manual_stock_estoque';
  END IF;

  src := replace(src, old_txt, new_txt);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(p_company_id uuid, p_month text DEFAULT ''all''::text, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$%s$f$',
    src
  );
END
$do$;

REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO service_role;