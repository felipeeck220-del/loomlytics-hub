CREATE OR REPLACE FUNCTION public.next_machine_status(p_machine_id uuid, p_exclude_mo uuid DEFAULT NULL, p_exclude_ac uuid DEFAULT NULL)
RETURNS machine_status
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT o.type::machine_status
       FROM public.maintenance_orders o
      WHERE o.machine_id = p_machine_id
        AND o.status = 'em_curso'
        AND (p_exclude_mo IS NULL OR o.id <> p_exclude_mo)
      ORDER BY o.started_at DESC NULLS LAST
      LIMIT 1),
    (SELECT 'troca_artigo'::machine_status
       FROM public.article_change_orders a
      WHERE a.machine_id = p_machine_id
        AND a.status::text IN ('troca_fio_em_curso','em_regulagem')
        AND (p_exclude_ac IS NULL OR a.id <> p_exclude_ac)
      LIMIT 1),
    'ativa'::machine_status
  );
$$;

REVOKE ALL ON FUNCTION public.next_machine_status(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_machine_status(uuid, uuid, uuid) TO authenticated, service_role;

DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.finalize_maintenance_order'::regproc) INTO v_def;
  v_def := replace(v_def,
    'UPDATE public.machines
     SET status = ''ativa'',',
    'UPDATE public.machines
     SET status = public.next_machine_status(v_order.machine_id, v_order.id, NULL),');
  v_def := replace(v_def,
    'VALUES (v_order.machine_id, v_order.company_id, ''ativa'', v_now, p_author_name)',
    'VALUES (v_order.machine_id, v_order.company_id, public.next_machine_status(v_order.machine_id, v_order.id, NULL), v_now, p_author_name)');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.finalize_article_change_order'::regproc) INTO v_def;
  v_def := replace(v_def,
    'UPDATE public.machines
       SET status = ''ativa''',
    'UPDATE public.machines
       SET status = public.next_machine_status(v_order.machine_id, NULL, v_order.id)');
  EXECUTE v_def;
END
$do$;

REVOKE ALL ON FUNCTION public.finalize_maintenance_order(uuid, jsonb, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_maintenance_order(uuid, jsonb, text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_article_change_order(uuid, text, numeric, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_article_change_order(uuid, text, numeric, integer, integer, text, text) TO authenticated, service_role;

UPDATE public.machines m
   SET status = public.next_machine_status(m.id, NULL, NULL)
 WHERE m.status <> public.next_machine_status(m.id, NULL, NULL)
   AND m.status::text <> 'inativa';