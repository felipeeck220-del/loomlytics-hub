DO $do$
DECLARE
  r record;
  def text;
  guard text;
  pos int;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS res
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_dashboard_metrics','get_report_kpis','get_report_data',
                        'get_report_by_machine','get_report_by_article','get_report_by_client',
                        'get_report_by_shift','get_report_evolution')
  LOOP
    def := pg_get_functiondef(r.oid);
    IF r.res ILIKE 'TABLE(%' THEN
      guard := 'RETURN;';
    ELSIF r.res ILIKE 'json%' THEN
      guard := 'RETURN NULL::' || r.res || ';';
    ELSE
      guard := 'RETURN NULL;';
    END IF;

    pos := position('AS $function$' in def);
    IF pos = 0 THEN
      RAISE EXCEPTION 'unexpected function body for %', r.proname;
    END IF;

    -- injeta a verificação de tenant logo após o primeiro BEGIN do corpo
    def := left(def, pos - 1)
           || regexp_replace(
                substr(def, pos),
                E'\nBEGIN\n',
                E'\nBEGIN\n  IF public.get_user_company_id() IS DISTINCT FROM p_company_id THEN ' || guard || E' END IF;\n',
                ''
              );

    IF def NOT LIKE '%get_user_company_id() IS DISTINCT FROM p_company_id%' THEN
      RAISE EXCEPTION 'nao foi possivel injetar guarda em %', r.proname;
    END IF;

    EXECUTE def;
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path TO ''public''', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.args);
  END LOOP;
END
$do$;