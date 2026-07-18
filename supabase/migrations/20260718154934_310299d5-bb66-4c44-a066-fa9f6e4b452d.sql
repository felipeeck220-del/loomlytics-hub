
-- Pente fino Fases 1-3 rpcclientInvoices.md: adiciona validação multi-tenant
-- (p_company_id vs get_user_company_id()) nas 7 RPCs de leitura SECURITY DEFINER.

-- 1) Bootstrap
CREATE OR REPLACE FUNCTION public.get_client_invoices_bootstrap(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  uuid := public.get_user_company_id();
  v_company jsonb;
  v_months  jsonb;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object(
      'company', jsonb_build_object('name','', 'logo_url', NULL),
      'available_months', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url)
    INTO v_company FROM public.companies c WHERE c.id = p_company_id;

  WITH months AS (
    SELECT DISTINCT to_char(issue_date,'YYYY-MM') AS ym
      FROM public.client_invoices
     WHERE company_id = p_company_id AND issue_date IS NOT NULL
    UNION
    SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')
  )
  SELECT COALESCE(jsonb_agg(ym ORDER BY ym DESC), '[]'::jsonb)
    INTO v_months FROM months;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, jsonb_build_object('name','', 'logo_url', NULL)),
    'available_months', v_months
  );
END;
$$;

-- 2) Search
CREATE OR REPLACE FUNCTION public.get_client_invoices_search(
  p_company_id uuid,
  p_search     text default null,
  p_month      text default 'all',
  p_type       text default 'all',
  p_page       int  default 1,
  p_page_size  int  default 15
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_offset int  := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,15));
  v_limit  int  := GREATEST(1, COALESCE(p_page_size,15));
  v_q      text := NULLIF(trim(COALESCE(p_search,'')),'');
  v_total  bigint;
  v_rows   jsonb;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('rows','[]'::jsonb,'total_count',0);
  END IF;

  WITH base AS (
    SELECT ci.*
      FROM public.client_invoices ci
      LEFT JOIN public.clients cl ON cl.id = ci.client_id
     WHERE ci.company_id = p_company_id
       AND (p_type = 'all' OR ci.type::text = p_type)
       AND (p_month = 'all' OR to_char(ci.issue_date,'YYYY-MM') = p_month)
       AND (
         v_q IS NULL
         OR ci.invoice_number ILIKE '%'||v_q||'%'
         OR COALESCE(cl.name,'') ILIKE '%'||v_q||'%'
         OR COALESCE(ci.supplier_name,'') ILIKE '%'||v_q||'%'
         OR EXISTS (
           SELECT 1 FROM public.client_invoice_items it
             LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
             LEFT JOIN public.articles   a  ON a.id  = it.article_id
            WHERE it.invoice_id = ci.id
              AND (COALESCE(yt.name,'') ILIKE '%'||v_q||'%'
                OR COALESCE(a.name,'')  ILIKE '%'||v_q||'%')
         )
       )
  )
  SELECT COUNT(*) INTO v_total FROM base;

  WITH base AS (
    SELECT ci.*, cl.name AS client_name
      FROM public.client_invoices ci
      LEFT JOIN public.clients cl ON cl.id = ci.client_id
     WHERE ci.company_id = p_company_id
       AND (p_type = 'all' OR ci.type::text = p_type)
       AND (p_month = 'all' OR to_char(ci.issue_date,'YYYY-MM') = p_month)
       AND (
         v_q IS NULL
         OR ci.invoice_number ILIKE '%'||v_q||'%'
         OR COALESCE(cl.name,'') ILIKE '%'||v_q||'%'
         OR COALESCE(ci.supplier_name,'') ILIKE '%'||v_q||'%'
         OR EXISTS (
           SELECT 1 FROM public.client_invoice_items it
             LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
             LEFT JOIN public.articles   a  ON a.id  = it.article_id
            WHERE it.invoice_id = ci.id
              AND (COALESCE(yt.name,'') ILIKE '%'||v_q||'%'
                OR COALESCE(a.name,'')  ILIKE '%'||v_q||'%')
         )
       )
     ORDER BY ci.issue_date DESC, ci.created_at DESC
     LIMIT v_limit OFFSET v_offset
  ),
  items AS (
    SELECT it.invoice_id,
           jsonb_agg(jsonb_build_object(
             'id', it.id, 'invoice_id', it.invoice_id,
             'yarn_type_id', it.yarn_type_id, 'yarn_type_name', yt.name,
             'article_id',   it.article_id,   'article_name',   a.name,
             'weight_kg',    it.weight_kg
           ) ORDER BY it.created_at) AS items
      FROM public.client_invoice_items it
      LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
      LEFT JOIN public.articles   a  ON a.id  = it.article_id
     WHERE it.invoice_id IN (SELECT id FROM base)
     GROUP BY it.invoice_id
  )
  SELECT COALESCE(jsonb_agg(
           to_jsonb(base) || jsonb_build_object('items', COALESCE(items.items,'[]'::jsonb))
           ORDER BY base.issue_date DESC, base.created_at DESC
         ),'[]'::jsonb)
    INTO v_rows
    FROM base
    LEFT JOIN items ON items.invoice_id = base.id;

  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total_count', COALESCE(v_total,0));
END;
$$;

-- 3) By client
CREATE OR REPLACE FUNCTION public.get_client_invoices_by_client(
  p_company_id uuid,
  p_client_id  uuid,
  p_view       text default 'aberto',
  p_search     text default null,
  p_page       int  default 1,
  p_page_size  int  default 15
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_offset int  := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,15));
  v_limit  int  := GREATEST(1, COALESCE(p_page_size,15));
  v_q      text := NULLIF(trim(COALESCE(p_search,'')),'');
  v_total  bigint;
  v_rows   jsonb;
  v_kpis   jsonb;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('rows','[]'::jsonb,'total_count',0,'kpis','{}'::jsonb);
  END IF;

  CREATE TEMP TABLE _base ON COMMIT DROP AS
  WITH links_agg AS (
    SELECT l.entry_invoice_id,
           SUM(l.deduct_kg)::numeric AS weight_from_links,
           array_agg(l.exit_invoice_id) AS linked_exit_ids
      FROM public.client_invoice_exit_links l
     WHERE l.company_id = p_company_id
     GROUP BY l.entry_invoice_id
  ),
  legacy_agg AS (
    SELECT s.parent_invoice_id AS entry_invoice_id,
           COALESCE(SUM((SELECT COALESCE(SUM(weight_kg),0)
                           FROM public.client_invoice_items
                          WHERE invoice_id = s.id)),0)::numeric AS weight_legacy
      FROM public.client_invoices s
      LEFT JOIN links_agg la ON la.entry_invoice_id = s.parent_invoice_id
     WHERE s.company_id = p_company_id
       AND s.type = 'saida'
       AND s.parent_invoice_id IS NOT NULL
       AND (la.linked_exit_ids IS NULL OR NOT (la.linked_exit_ids @> ARRAY[s.id]))
     GROUP BY s.parent_invoice_id
  ),
  items AS (
    SELECT it.invoice_id,
           jsonb_agg(jsonb_build_object(
             'id', it.id, 'invoice_id', it.invoice_id,
             'yarn_type_id', it.yarn_type_id, 'yarn_type_name', yt.name,
             'article_id',   it.article_id,   'article_name',   a.name,
             'weight_kg',    it.weight_kg
           ) ORDER BY it.created_at) AS items,
           COALESCE(SUM(it.weight_kg),0)::numeric AS weight_entrada
      FROM public.client_invoice_items it
      LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
      LEFT JOIN public.articles   a  ON a.id  = it.article_id
     GROUP BY it.invoice_id
  )
  SELECT ci.*,
         COALESCE(items.items,'[]'::jsonb) AS items,
         COALESCE(items.weight_entrada,0)::numeric AS weight_entrada,
         CASE WHEN ci.type = 'entrada'
              THEN COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0)
              ELSE NULL END::numeric AS weight_saida,
         CASE WHEN ci.type = 'entrada'
              THEN GREATEST(0, COALESCE(items.weight_entrada,0) - (COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0)))
              ELSE NULL END::numeric AS saldo,
         CASE WHEN ci.type = 'entrada'
              THEN (GREATEST(0, COALESCE(items.weight_entrada,0) - (COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0))) <= 0.001)
              ELSE NULL END AS is_encerrada,
         CASE WHEN ci.type = 'entrada'
              THEN (la.entry_invoice_id IS NOT NULL OR lg.entry_invoice_id IS NOT NULL)
              ELSE NULL END AS has_linked_outputs
    FROM public.client_invoices ci
    LEFT JOIN items      ON items.invoice_id = ci.id
    LEFT JOIN links_agg  la ON la.entry_invoice_id = ci.id
    LEFT JOIN legacy_agg lg ON lg.entry_invoice_id = ci.id
   WHERE ci.company_id = p_company_id
     AND ci.client_id  = p_client_id;

  CREATE TEMP TABLE _filt ON COMMIT DROP AS
  SELECT * FROM _base b
   WHERE (
     p_view = 'historico'
     OR (p_view = 'aberto'    AND b.type = 'entrada' AND COALESCE(b.saldo,0) > 0.001)
     OR (p_view = 'encerrada' AND b.type = 'entrada' AND COALESCE(b.saldo,0) <= 0.001)
   )
     AND (
       v_q IS NULL
       OR b.invoice_number ILIKE '%'||v_q||'%'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(b.items) it
          WHERE COALESCE(it->>'yarn_type_name','') ILIKE '%'||v_q||'%'
             OR COALESCE(it->>'article_name','')  ILIKE '%'||v_q||'%'
       )
     );

  SELECT COUNT(*) INTO v_total FROM _filt;

  SELECT jsonb_build_object(
           'totalEntrada', COALESCE(SUM(CASE WHEN type='entrada' THEN weight_entrada ELSE 0 END),0),
           'totalSaida',   COALESCE(SUM(CASE WHEN type='saida'   THEN weight_entrada ELSE 0 END),0),
           'totalSaldo',   COALESCE(SUM(CASE WHEN type='entrada' THEN weight_entrada ELSE 0 END),0)
                         - COALESCE(SUM(CASE WHEN type='saida'   THEN weight_entrada ELSE 0 END),0)
         )
    INTO v_kpis FROM _filt;

  IF p_view = 'aberto' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.issue_date DESC, f.created_at DESC),'[]'::jsonb)
      INTO v_rows FROM _filt f;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.issue_date DESC, f.created_at DESC),'[]'::jsonb)
      INTO v_rows
      FROM (SELECT * FROM _filt ORDER BY issue_date DESC, created_at DESC LIMIT v_limit OFFSET v_offset) f;
  END IF;

  RETURN jsonb_build_object(
    'rows',        COALESCE(v_rows,'[]'::jsonb),
    'total_count', COALESCE(v_total,0),
    'kpis',        COALESCE(v_kpis,'{}'::jsonb)
  );
END;
$$;

-- 4) Linked exits
CREATE OR REPLACE FUNCTION public.get_client_invoice_linked_exits(
  p_company_id       uuid,
  p_entry_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  uuid := public.get_user_company_id();
  v_entry   jsonb;
  v_linked  jsonb;
  v_legacy  jsonb;
  v_consumed numeric := 0;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('entry', NULL, 'linked','[]'::jsonb, 'legacy','[]'::jsonb, 'consumed_kg', 0);
  END IF;

  SELECT to_jsonb(ci) || jsonb_build_object(
           'weight_entrada', COALESCE((SELECT SUM(weight_kg) FROM public.client_invoice_items WHERE invoice_id = ci.id),0),
           'yarn_type_name', (SELECT yt.name FROM public.client_invoice_items it LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id WHERE it.invoice_id = ci.id ORDER BY it.created_at LIMIT 1),
           'yarn_color',     (SELECT yt.color FROM public.client_invoice_items it LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id WHERE it.invoice_id = ci.id ORDER BY it.created_at LIMIT 1),
           'items',          COALESCE((SELECT jsonb_agg(jsonb_build_object('id', it.id, 'yarn_type_id', it.yarn_type_id, 'article_id', it.article_id, 'weight_kg', it.weight_kg)) FROM public.client_invoice_items it WHERE it.invoice_id = ci.id),'[]'::jsonb)
         )
    INTO v_entry
    FROM public.client_invoices ci
   WHERE ci.id = p_entry_invoice_id AND ci.company_id = p_company_id;

  IF v_entry IS NULL THEN
    RETURN jsonb_build_object('entry', NULL, 'linked','[]'::jsonb, 'legacy','[]'::jsonb, 'consumed_kg', 0);
  END IF;

  WITH lk AS (
    SELECT l.exit_invoice_id, l.yarn_type_id, l.deduct_kg,
           s.invoice_number, s.issue_date,
           (SELECT it.article_id FROM public.client_invoice_items it WHERE it.invoice_id = s.id ORDER BY it.created_at LIMIT 1) AS article_id,
           (SELECT a.name FROM public.client_invoice_items it LEFT JOIN public.articles a ON a.id = it.article_id WHERE it.invoice_id = s.id ORDER BY it.created_at LIMIT 1) AS article_name,
           (SELECT COALESCE(SUM(weight_kg),0) FROM public.client_invoice_items WHERE invoice_id = s.id) AS peso_saida
      FROM public.client_invoice_exit_links l
      JOIN public.client_invoices s ON s.id = l.exit_invoice_id
     WHERE l.company_id = p_company_id
       AND l.entry_invoice_id = p_entry_invoice_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(lk) || jsonb_build_object('source','link') ORDER BY lk.issue_date DESC, lk.invoice_number),'[]'::jsonb)
    INTO v_linked FROM lk;

  WITH lg AS (
    SELECT s.id AS exit_invoice_id, s.invoice_number, s.issue_date,
           (SELECT it.article_id FROM public.client_invoice_items it WHERE it.invoice_id = s.id ORDER BY it.created_at LIMIT 1) AS article_id,
           (SELECT a.name FROM public.client_invoice_items it LEFT JOIN public.articles a ON a.id = it.article_id WHERE it.invoice_id = s.id ORDER BY it.created_at LIMIT 1) AS article_name,
           (SELECT COALESCE(SUM(weight_kg),0) FROM public.client_invoice_items WHERE invoice_id = s.id) AS weight_kg
      FROM public.client_invoices s
     WHERE s.company_id = p_company_id
       AND s.type = 'saida'
       AND s.parent_invoice_id = p_entry_invoice_id
       AND NOT EXISTS (
         SELECT 1 FROM public.client_invoice_exit_links l
          WHERE l.company_id = p_company_id
            AND l.entry_invoice_id = p_entry_invoice_id
            AND l.exit_invoice_id = s.id
       )
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(lg) || jsonb_build_object('source','legacy','deduct_kg', lg.weight_kg) ORDER BY lg.issue_date DESC, lg.invoice_number),'[]'::jsonb)
    INTO v_legacy FROM lg;

  SELECT COALESCE((SELECT SUM((el->>'deduct_kg')::numeric) FROM jsonb_array_elements(v_linked) el),0)
       + COALESCE((SELECT SUM((el->>'weight_kg')::numeric) FROM jsonb_array_elements(v_legacy) el),0)
    INTO v_consumed;

  RETURN jsonb_build_object(
    'entry', v_entry, 'linked', COALESCE(v_linked,'[]'::jsonb),
    'legacy', COALESCE(v_legacy,'[]'::jsonb), 'consumed_kg', COALESCE(v_consumed,0)
  );
END;
$$;

-- 5) Balances for distribute
CREATE OR REPLACE FUNCTION public.get_client_invoice_balances_for_distribute(
  p_company_id        uuid,
  p_client_id         uuid,
  p_entry_invoice_ids uuid[],
  p_exclude_exit_id   uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  uuid := public.get_user_company_id();
  v_entries jsonb;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('entries','[]'::jsonb);
  END IF;
  IF p_company_id IS NULL OR p_client_id IS NULL OR p_entry_invoice_ids IS NULL THEN
    RETURN jsonb_build_object('entries', '[]'::jsonb);
  END IF;

  WITH ids AS (SELECT unnest(p_entry_invoice_ids) AS id),
  ent AS (
    SELECT ci.id,
           COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = ci.id),0) AS weight_entrada
      FROM client_invoices ci
      JOIN ids ON ids.id = ci.id
     WHERE ci.company_id = p_company_id AND ci.client_id = p_client_id AND ci.type = 'entrada'
  ),
  links_agg AS (
    SELECT l.entry_invoice_id, SUM(l.deduct_kg) AS weight_from_links,
           array_agg(l.exit_invoice_id) AS linked_exit_ids
      FROM client_invoice_exit_links l
     WHERE l.company_id = p_company_id
       AND l.entry_invoice_id = ANY(p_entry_invoice_ids)
       AND (p_exclude_exit_id IS NULL OR l.exit_invoice_id <> p_exclude_exit_id)
     GROUP BY l.entry_invoice_id
  ),
  legacy_agg AS (
    SELECT s.parent_invoice_id AS entry_invoice_id,
           COALESCE(SUM((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id)),0) AS weight_legacy
      FROM client_invoices s
      LEFT JOIN links_agg la ON s.parent_invoice_id = la.entry_invoice_id
     WHERE s.company_id = p_company_id AND s.type = 'saida'
       AND s.parent_invoice_id = ANY(p_entry_invoice_ids)
       AND (p_exclude_exit_id IS NULL OR s.id <> p_exclude_exit_id)
       AND (la.linked_exit_ids IS NULL OR NOT (la.linked_exit_ids @> ARRAY[s.id]))
     GROUP BY s.parent_invoice_id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'entry_invoice_id', e.id,
    'weight_entrada',   e.weight_entrada,
    'already_consumed', COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0),
    'saldo',            GREATEST(0, e.weight_entrada - (COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0)))
  ))
    INTO v_entries
    FROM ent e
    LEFT JOIN links_agg  la ON la.entry_invoice_id = e.id
    LEFT JOIN legacy_agg lg ON lg.entry_invoice_id = e.id;

  RETURN jsonb_build_object('entries', COALESCE(v_entries,'[]'::jsonb));
END;
$$;

-- 6) Export geral
CREATE OR REPLACE FUNCTION public.get_client_invoices_export(
  p_company_id uuid,
  p_client_id  uuid,
  p_type       text DEFAULT 'ambos',
  p_month      text DEFAULT 'all',
  p_start      date DEFAULT NULL,
  p_end        date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller  uuid := public.get_user_company_id();
  v_company jsonb;
  v_client  jsonb;
  v_rows    jsonb;
  v_totals  jsonb;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object(
      'company', jsonb_build_object('name','', 'logo_url', NULL),
      'client',  jsonb_build_object('id', p_client_id, 'name',''),
      'rows',    '[]'::jsonb,
      'totals',  jsonb_build_object('totalEntrada',0,'totalSaida',0,'totalSaldo',0,'totalNotas',0)
    );
  END IF;

  SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url)
    INTO v_company FROM companies c WHERE c.id = p_company_id;

  SELECT jsonb_build_object('id', cl.id, 'name', cl.name)
    INTO v_client FROM clients cl WHERE cl.id = p_client_id AND cl.company_id = p_company_id;

  WITH base AS (
    SELECT ci.* FROM client_invoices ci
     WHERE ci.company_id = p_company_id AND ci.client_id = p_client_id
       AND (p_type = 'ambos' OR ci.type = p_type)
       AND (p_month = 'all' OR to_char(ci.issue_date,'YYYY-MM') = p_month)
       AND (p_start IS NULL OR ci.issue_date >= p_start)
       AND (p_end   IS NULL OR ci.issue_date <= p_end)
  ),
  items AS (
    SELECT cii.invoice_id,
           COALESCE(SUM(cii.weight_kg),0) AS weight_total,
           (array_agg(cii.yarn_type_id) FILTER (WHERE cii.yarn_type_id IS NOT NULL))[1] AS first_yarn_id,
           (array_agg(cii.article_id)   FILTER (WHERE cii.article_id   IS NOT NULL))[1] AS first_article_id
      FROM client_invoice_items cii JOIN base b ON b.id = cii.invoice_id
     GROUP BY cii.invoice_id
  ),
  links_agg AS (
    SELECT l.entry_invoice_id, SUM(l.deduct_kg) AS weight_from_links,
           array_agg(l.exit_invoice_id) AS linked_exit_ids,
           array_agg(DISTINCT l.yarn_type_id) FILTER (WHERE l.yarn_type_id IS NOT NULL) AS link_yarn_ids
      FROM client_invoice_exit_links l JOIN base b ON b.id = l.entry_invoice_id
     WHERE l.company_id = p_company_id
     GROUP BY l.entry_invoice_id
  ),
  exit_links_for_exits AS (
    SELECT l.exit_invoice_id,
           array_agg(DISTINCT l.yarn_type_id) FILTER (WHERE l.yarn_type_id IS NOT NULL) AS yarn_ids
      FROM client_invoice_exit_links l
     WHERE l.company_id = p_company_id
       AND l.exit_invoice_id IN (SELECT id FROM base WHERE type = 'saida')
     GROUP BY l.exit_invoice_id
  ),
  legacy_agg AS (
    SELECT s.parent_invoice_id AS entry_invoice_id,
           COALESCE(SUM((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id)),0) AS weight_legacy
      FROM client_invoices s
      LEFT JOIN links_agg la ON s.parent_invoice_id = la.entry_invoice_id
     WHERE s.company_id = p_company_id AND s.type = 'saida'
       AND s.parent_invoice_id IS NOT NULL
       AND s.parent_invoice_id IN (SELECT id FROM base)
       AND (la.linked_exit_ids IS NULL OR NOT (la.linked_exit_ids @> ARRAY[s.id]))
     GROUP BY s.parent_invoice_id
  )
  SELECT jsonb_agg(row_to_json(r) ORDER BY r.issue_date DESC, r.created_at DESC)
    INTO v_rows
    FROM (
      SELECT b.id, b.issue_date, b.invoice_number, b.type, b.supplier_name, b.created_at,
        CASE
          WHEN b.type = 'entrada' THEN yt_e.name
          WHEN b.type = 'saida' THEN (
            SELECT string_agg(DISTINCT yt.name, ' + ')
              FROM unnest(COALESCE(elx.yarn_ids, ARRAY[]::uuid[])) yid
              JOIN yarn_types yt ON yt.id = yid
          )
        END AS yarn_name,
        CASE WHEN b.type='entrada' THEN COALESCE(i.weight_total,0) ELSE 0 END AS weight_entrada,
        CASE WHEN b.type='saida'   THEN COALESCE(i.weight_total,0) ELSE 0 END AS weight_saida,
        CASE WHEN b.type='entrada' THEN GREATEST(0, COALESCE(i.weight_total,0) - (COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0))) ELSE 0 END AS saldo,
        art.name AS article_name
      FROM base b
      LEFT JOIN items i        ON i.invoice_id = b.id
      LEFT JOIN links_agg la   ON la.entry_invoice_id = b.id
      LEFT JOIN legacy_agg lg  ON lg.entry_invoice_id = b.id
      LEFT JOIN exit_links_for_exits elx ON elx.exit_invoice_id = b.id
      LEFT JOIN yarn_types yt_e ON yt_e.id = i.first_yarn_id
      LEFT JOIN articles   art  ON art.id  = i.first_article_id
    ) r;

  SELECT jsonb_build_object(
    'totalEntrada', COALESCE(SUM((row->>'weight_entrada')::numeric),0),
    'totalSaida',   COALESCE(SUM((row->>'weight_saida')::numeric),0),
    'totalSaldo',   COALESCE(SUM((row->>'saldo')::numeric),0),
    'totalNotas',   COALESCE(jsonb_array_length(v_rows),0)
  )
    INTO v_totals
    FROM jsonb_array_elements(COALESCE(v_rows,'[]'::jsonb)) row;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, jsonb_build_object('name','', 'logo_url', NULL)),
    'client',  COALESCE(v_client,  jsonb_build_object('id', p_client_id, 'name','')),
    'rows',    COALESCE(v_rows,'[]'::jsonb),
    'totals',  v_totals
  );
END;
$$;

-- 7) Export por NF
CREATE OR REPLACE FUNCTION public.get_client_invoice_by_nf_export(
  p_company_id       uuid,
  p_entry_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller    uuid := public.get_user_company_id();
  v_company   jsonb;
  v_client    jsonb;
  v_entry     jsonb;
  v_linked    jsonb;
  v_legacy    jsonb;
  v_consumed  numeric;
  v_client_id uuid;
  v_entry_wt  numeric;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url)
    INTO v_company FROM companies c WHERE c.id = p_company_id;

  SELECT ci.client_id INTO v_client_id
    FROM client_invoices ci
   WHERE ci.id = p_entry_invoice_id AND ci.company_id = p_company_id AND ci.type = 'entrada';

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT jsonb_build_object('id', cl.id, 'name', cl.name)
    INTO v_client FROM clients cl WHERE cl.id = v_client_id;

  SELECT COALESCE(SUM(weight_kg),0) INTO v_entry_wt
    FROM client_invoice_items WHERE invoice_id = p_entry_invoice_id;

  SELECT to_jsonb(ci) || jsonb_build_object(
      'weight_entrada', v_entry_wt,
      'yarn_type_name', (
        SELECT yt.name FROM client_invoice_items it
          LEFT JOIN yarn_types yt ON yt.id = it.yarn_type_id
         WHERE it.invoice_id = p_entry_invoice_id LIMIT 1
      )
    )
    INTO v_entry
    FROM client_invoices ci WHERE ci.id = p_entry_invoice_id;

  SELECT jsonb_agg(jsonb_build_object(
      'exit_invoice_id', ex.id,
      'invoice_number',  ex.invoice_number,
      'issue_date',      ex.issue_date,
      'deduct_kg',       l.deduct_kg,
      'weight_kg',       COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = ex.id),0),
      'article_name',    (SELECT art.name FROM client_invoice_items it LEFT JOIN articles art ON art.id = it.article_id WHERE it.invoice_id = ex.id LIMIT 1),
      'source',          'link'
    ) ORDER BY ex.issue_date DESC)
    INTO v_linked
    FROM client_invoice_exit_links l
    JOIN client_invoices ex ON ex.id = l.exit_invoice_id
   WHERE l.company_id = p_company_id AND l.entry_invoice_id = p_entry_invoice_id;

  SELECT jsonb_agg(jsonb_build_object(
      'exit_invoice_id', s.id,
      'invoice_number',  s.invoice_number,
      'issue_date',      s.issue_date,
      'weight_kg',       COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id),0),
      'deduct_kg',       COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id),0),
      'article_name',    (SELECT art.name FROM client_invoice_items it LEFT JOIN articles art ON art.id = it.article_id WHERE it.invoice_id = s.id LIMIT 1),
      'source',          'legacy'
    ) ORDER BY s.issue_date DESC)
    INTO v_legacy
    FROM client_invoices s
   WHERE s.company_id = p_company_id AND s.type = 'saida'
     AND s.parent_invoice_id = p_entry_invoice_id
     AND NOT EXISTS (
       SELECT 1 FROM client_invoice_exit_links l
        WHERE l.entry_invoice_id = p_entry_invoice_id AND l.exit_invoice_id = s.id
     );

  v_consumed :=
      COALESCE((SELECT SUM((r->>'deduct_kg')::numeric) FROM jsonb_array_elements(COALESCE(v_linked,'[]'::jsonb)) r),0)
    + COALESCE((SELECT SUM((r->>'weight_kg')::numeric) FROM jsonb_array_elements(COALESCE(v_legacy,'[]'::jsonb)) r),0);

  RETURN jsonb_build_object(
    'company',     COALESCE(v_company, jsonb_build_object('name','', 'logo_url', NULL)),
    'client',      v_client,
    'entry',       v_entry,
    'linked',      COALESCE(v_linked,'[]'::jsonb),
    'legacy',      COALESCE(v_legacy,'[]'::jsonb),
    'consumed_kg', v_consumed,
    'saldo',       GREATEST(0, v_entry_wt - v_consumed)
  );
END;
$$;
