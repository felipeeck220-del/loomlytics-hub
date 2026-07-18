
-- ============================================================================
-- Fase 2 rpcclientInvoices — Leituras paginadas server-side
-- ============================================================================

-- 2.1 get_client_invoices_search — aba raiz "Busca Geral"
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
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,15));
  v_limit  int := GREATEST(1, COALESCE(p_page_size,15));
  v_q      text := NULLIF(trim(COALESCE(p_search,'')),'');
  v_total  bigint;
  v_rows   jsonb;
BEGIN
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
           SELECT 1
             FROM public.client_invoice_items it
             LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
             LEFT JOIN public.articles   a  ON a.id  = it.article_id
            WHERE it.invoice_id = ci.id
              AND (
                COALESCE(yt.name,'') ILIKE '%'||v_q||'%'
                OR COALESCE(a.name,'') ILIKE '%'||v_q||'%'
              )
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
           SELECT 1
             FROM public.client_invoice_items it
             LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
             LEFT JOIN public.articles   a  ON a.id  = it.article_id
            WHERE it.invoice_id = ci.id
              AND (
                COALESCE(yt.name,'') ILIKE '%'||v_q||'%'
                OR COALESCE(a.name,'') ILIKE '%'||v_q||'%'
              )
         )
       )
     ORDER BY ci.issue_date DESC, ci.created_at DESC
     LIMIT v_limit OFFSET v_offset
  ),
  items AS (
    SELECT it.invoice_id,
           jsonb_agg(jsonb_build_object(
             'id', it.id,
             'invoice_id', it.invoice_id,
             'yarn_type_id', it.yarn_type_id,
             'yarn_type_name', yt.name,
             'article_id', it.article_id,
             'article_name', a.name,
             'weight_kg', it.weight_kg
           ) ORDER BY it.created_at) AS items
      FROM public.client_invoice_items it
      LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
      LEFT JOIN public.articles   a  ON a.id  = it.article_id
     WHERE it.invoice_id IN (SELECT id FROM base)
     GROUP BY it.invoice_id
  )
  SELECT COALESCE(jsonb_agg(
           to_jsonb(base) || jsonb_build_object('items', COALESCE(items.items, '[]'::jsonb))
           ORDER BY base.issue_date DESC, base.created_at DESC
         ), '[]'::jsonb)
    INTO v_rows
    FROM base
    LEFT JOIN items ON items.invoice_id = base.id;

  RETURN jsonb_build_object('rows', COALESCE(v_rows,'[]'::jsonb), 'total_count', COALESCE(v_total,0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_invoices_search(uuid, text, text, text, int, int) TO anon, authenticated, service_role;


-- 2.2 get_client_invoices_by_client — sub-abas por cliente (aberto | encerrada | historico)
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
  v_offset int := GREATEST(0, (COALESCE(p_page,1) - 1) * COALESCE(p_page_size,15));
  v_limit  int := GREATEST(1, COALESCE(p_page_size,15));
  v_q      text := NULLIF(trim(COALESCE(p_search,'')),'');
  v_total  bigint;
  v_rows   jsonb;
  v_kpis   jsonb;
BEGIN
  -- Dataset base: todas as NFs desse cliente + itens + saldos (entradas)
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
             'id', it.id,
             'invoice_id', it.invoice_id,
             'yarn_type_id', it.yarn_type_id,
             'yarn_type_name', yt.name,
             'article_id', it.article_id,
             'article_name', a.name,
             'weight_kg', it.weight_kg
           ) ORDER BY it.created_at) AS items,
           COALESCE(SUM(it.weight_kg),0)::numeric AS weight_entrada
      FROM public.client_invoice_items it
      LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id
      LEFT JOIN public.articles   a  ON a.id  = it.article_id
     GROUP BY it.invoice_id
  )
  SELECT ci.*,
         COALESCE(items.items, '[]'::jsonb) AS items,
         COALESCE(items.weight_entrada, 0)::numeric AS weight_entrada,
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

  -- Aplica filtro de view + search em uma view lógica
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

  -- KPIs sobre todo o conjunto filtrado (pré-paginação)
  SELECT jsonb_build_object(
           'totalEntrada', COALESCE(SUM(CASE WHEN type='entrada' THEN weight_entrada ELSE 0 END),0),
           'totalSaida',   COALESCE(SUM(CASE WHEN type='saida'   THEN weight_entrada ELSE 0 END),0),
           'totalSaldo',   COALESCE(SUM(CASE WHEN type='entrada' THEN weight_entrada ELSE 0 END),0)
                         - COALESCE(SUM(CASE WHEN type='saida'   THEN weight_entrada ELSE 0 END),0)
         )
    INTO v_kpis
    FROM _filt;

  -- 'aberto' devolve tudo (sem paginação); demais paginam
  IF p_view = 'aberto' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.issue_date DESC, f.created_at DESC), '[]'::jsonb)
      INTO v_rows FROM _filt f;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.issue_date DESC, f.created_at DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        SELECT * FROM _filt
        ORDER BY issue_date DESC, created_at DESC
        LIMIT v_limit OFFSET v_offset
      ) f;
  END IF;

  RETURN jsonb_build_object(
    'rows',        COALESCE(v_rows,'[]'::jsonb),
    'total_count', COALESCE(v_total,0),
    'kpis',        COALESCE(v_kpis,'{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_invoices_by_client(uuid, uuid, text, text, int, int) TO anon, authenticated, service_role;


-- 2.3 get_client_invoice_linked_exits — modal "Saídas vinculadas"
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
  v_entry   jsonb;
  v_linked  jsonb;
  v_legacy  jsonb;
  v_consumed numeric := 0;
BEGIN
  -- Entry (com item[0], yarn_type_name/color)
  SELECT to_jsonb(ci) || jsonb_build_object(
           'weight_entrada', COALESCE((SELECT SUM(weight_kg) FROM public.client_invoice_items WHERE invoice_id = ci.id),0),
           'yarn_type_name', (SELECT yt.name FROM public.client_invoice_items it LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id WHERE it.invoice_id = ci.id ORDER BY it.created_at LIMIT 1),
           'yarn_color',     (SELECT yt.color FROM public.client_invoice_items it LEFT JOIN public.yarn_types yt ON yt.id = it.yarn_type_id WHERE it.invoice_id = ci.id ORDER BY it.created_at LIMIT 1),
           'items',          COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                             'id', it.id, 'yarn_type_id', it.yarn_type_id,
                                             'article_id', it.article_id, 'weight_kg', it.weight_kg
                                           )) FROM public.client_invoice_items it WHERE it.invoice_id = ci.id), '[]'::jsonb)
         )
    INTO v_entry
    FROM public.client_invoices ci
   WHERE ci.id = p_entry_invoice_id
     AND ci.company_id = p_company_id;

  IF v_entry IS NULL THEN
    RETURN jsonb_build_object('entry', NULL, 'linked', '[]'::jsonb, 'legacy', '[]'::jsonb, 'consumed_kg', 0);
  END IF;

  -- Linked (via client_invoice_exit_links)
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
  SELECT COALESCE(jsonb_agg(to_jsonb(lk) || jsonb_build_object('source','link') ORDER BY lk.issue_date DESC, lk.invoice_number), '[]'::jsonb)
    INTO v_linked FROM lk;

  -- Legacy (parent_invoice_id = entry) que NÃO estão nos links
  WITH lg AS (
    SELECT s.id AS exit_invoice_id,
           s.invoice_number, s.issue_date,
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
  SELECT COALESCE(jsonb_agg(to_jsonb(lg) || jsonb_build_object('source','legacy','deduct_kg', lg.weight_kg) ORDER BY lg.issue_date DESC, lg.invoice_number), '[]'::jsonb)
    INTO v_legacy FROM lg;

  SELECT
    COALESCE((SELECT SUM((el->>'deduct_kg')::numeric) FROM jsonb_array_elements(v_linked) el),0)
    + COALESCE((SELECT SUM((el->>'weight_kg')::numeric) FROM jsonb_array_elements(v_legacy) el),0)
    INTO v_consumed;

  RETURN jsonb_build_object(
    'entry',       v_entry,
    'linked',      COALESCE(v_linked,'[]'::jsonb),
    'legacy',      COALESCE(v_legacy,'[]'::jsonb),
    'consumed_kg', COALESCE(v_consumed,0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_invoice_linked_exits(uuid, uuid) TO anon, authenticated, service_role;
