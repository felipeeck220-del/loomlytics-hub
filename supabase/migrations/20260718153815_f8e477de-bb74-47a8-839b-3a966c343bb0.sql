
-- Fase 3 rpcclientInvoices.md — auxiliares de saldo e payloads de export
-- Todas as funções são STABLE, SECURITY DEFINER, search_path=public

-- 3.1 Saldos frescos para o botão "Auto distribuir"
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
  v_entries jsonb;
BEGIN
  IF p_company_id IS NULL OR p_client_id IS NULL OR p_entry_invoice_ids IS NULL THEN
    RETURN jsonb_build_object('entries', '[]'::jsonb);
  END IF;

  WITH ids AS (
    SELECT unnest(p_entry_invoice_ids) AS id
  ),
  ent AS (
    SELECT ci.id,
           COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = ci.id), 0) AS weight_entrada
      FROM client_invoices ci
      JOIN ids ON ids.id = ci.id
     WHERE ci.company_id = p_company_id
       AND ci.client_id  = p_client_id
       AND ci.type       = 'entrada'
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
           COALESCE(SUM((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id)), 0) AS weight_legacy
      FROM client_invoices s
      LEFT JOIN links_agg la ON s.parent_invoice_id = la.entry_invoice_id
     WHERE s.company_id = p_company_id
       AND s.type = 'saida'
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

  RETURN jsonb_build_object('entries', COALESCE(v_entries, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_invoice_balances_for_distribute(uuid, uuid, uuid[], uuid) TO anon, authenticated, service_role;

-- 3.2 Payload do PDF geral por cliente
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
  v_company jsonb;
  v_client  jsonb;
  v_rows    jsonb;
  v_totals  jsonb;
BEGIN
  SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url)
    INTO v_company
    FROM companies c WHERE c.id = p_company_id;

  SELECT jsonb_build_object('id', cl.id, 'name', cl.name)
    INTO v_client
    FROM clients cl WHERE cl.id = p_client_id AND cl.company_id = p_company_id;

  WITH base AS (
    SELECT ci.*
      FROM client_invoices ci
     WHERE ci.company_id = p_company_id
       AND ci.client_id  = p_client_id
       AND (p_type = 'ambos' OR ci.type = p_type)
       AND (p_month = 'all' OR to_char(ci.issue_date, 'YYYY-MM') = p_month)
       AND (p_start IS NULL OR ci.issue_date >= p_start)
       AND (p_end   IS NULL OR ci.issue_date <= p_end)
  ),
  items AS (
    SELECT cii.invoice_id,
           COALESCE(SUM(cii.weight_kg), 0) AS weight_total,
           (array_agg(cii.yarn_type_id)  FILTER (WHERE cii.yarn_type_id IS NOT NULL))[1] AS first_yarn_id,
           (array_agg(cii.article_id)    FILTER (WHERE cii.article_id   IS NOT NULL))[1] AS first_article_id
      FROM client_invoice_items cii
      JOIN base b ON b.id = cii.invoice_id
     GROUP BY cii.invoice_id
  ),
  links_agg AS (
    SELECT l.entry_invoice_id,
           SUM(l.deduct_kg) AS weight_from_links,
           array_agg(l.exit_invoice_id) AS linked_exit_ids,
           array_agg(DISTINCT l.yarn_type_id) FILTER (WHERE l.yarn_type_id IS NOT NULL) AS link_yarn_ids
      FROM client_invoice_exit_links l
      JOIN base b ON b.id = l.entry_invoice_id
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
           COALESCE(SUM((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id)), 0) AS weight_legacy
      FROM client_invoices s
      LEFT JOIN links_agg la ON s.parent_invoice_id = la.entry_invoice_id
     WHERE s.company_id = p_company_id
       AND s.type = 'saida'
       AND s.parent_invoice_id IS NOT NULL
       AND s.parent_invoice_id IN (SELECT id FROM base)
       AND (la.linked_exit_ids IS NULL OR NOT (la.linked_exit_ids @> ARRAY[s.id]))
     GROUP BY s.parent_invoice_id
  )
  SELECT jsonb_agg(row_to_json(r) ORDER BY r.issue_date DESC, r.created_at DESC)
    INTO v_rows
    FROM (
      SELECT
        b.id,
        b.issue_date,
        b.invoice_number,
        b.type,
        b.supplier_name,
        b.created_at,
        CASE
          WHEN b.type = 'entrada' THEN yt_e.name
          WHEN b.type = 'saida' THEN (
            SELECT string_agg(DISTINCT yt.name, ' + ')
              FROM unnest(COALESCE(elx.yarn_ids, ARRAY[]::uuid[])) yid
              JOIN yarn_types yt ON yt.id = yid
          )
        END AS yarn_name,
        CASE
          WHEN b.type = 'entrada' THEN COALESCE(i.weight_total, 0)
          ELSE 0
        END AS weight_entrada,
        CASE
          WHEN b.type = 'saida' THEN COALESCE(i.weight_total, 0)
          ELSE 0
        END AS weight_saida,
        CASE
          WHEN b.type = 'entrada' THEN GREATEST(0, COALESCE(i.weight_total,0)
              - (COALESCE(la.weight_from_links,0) + COALESCE(lg.weight_legacy,0)))
          ELSE 0
        END AS saldo,
        art.name AS article_name
      FROM base b
      LEFT JOIN items i        ON i.invoice_id       = b.id
      LEFT JOIN links_agg la   ON la.entry_invoice_id = b.id
      LEFT JOIN legacy_agg lg  ON lg.entry_invoice_id = b.id
      LEFT JOIN exit_links_for_exits elx ON elx.exit_invoice_id = b.id
      LEFT JOIN yarn_types yt_e ON yt_e.id = i.first_yarn_id
      LEFT JOIN articles   art  ON art.id  = i.first_article_id
    ) r;

  SELECT jsonb_build_object(
    'totalEntrada', COALESCE(SUM((row->>'weight_entrada')::numeric), 0),
    'totalSaida',   COALESCE(SUM((row->>'weight_saida')::numeric), 0),
    'totalSaldo',   COALESCE(SUM((row->>'saldo')::numeric), 0),
    'totalNotas',   COALESCE(jsonb_array_length(v_rows), 0)
  )
    INTO v_totals
    FROM jsonb_array_elements(COALESCE(v_rows, '[]'::jsonb)) row;

  RETURN jsonb_build_object(
    'company', COALESCE(v_company, jsonb_build_object('name','', 'logo_url', NULL)),
    'client',  COALESCE(v_client,  jsonb_build_object('id', p_client_id, 'name', '')),
    'rows',    COALESCE(v_rows, '[]'::jsonb),
    'totals',  v_totals
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_invoices_export(uuid, uuid, text, text, date, date) TO anon, authenticated, service_role;

-- 3.3 Payload do PDF de uma NF de entrada
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
  v_company     jsonb;
  v_client      jsonb;
  v_entry       jsonb;
  v_linked      jsonb;
  v_legacy      jsonb;
  v_consumed    numeric;
  v_client_id   uuid;
  v_entry_wt    numeric;
BEGIN
  SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url)
    INTO v_company FROM companies c WHERE c.id = p_company_id;

  SELECT ci.client_id INTO v_client_id
    FROM client_invoices ci
   WHERE ci.id = p_entry_invoice_id
     AND ci.company_id = p_company_id
     AND ci.type = 'entrada';

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT jsonb_build_object('id', cl.id, 'name', cl.name)
    INTO v_client FROM clients cl WHERE cl.id = v_client_id;

  SELECT COALESCE(SUM(weight_kg), 0) INTO v_entry_wt
    FROM client_invoice_items WHERE invoice_id = p_entry_invoice_id;

  SELECT to_jsonb(ci) || jsonb_build_object(
      'weight_entrada', v_entry_wt,
      'yarn_type_name', (
        SELECT yt.name FROM client_invoice_items it
          LEFT JOIN yarn_types yt ON yt.id = it.yarn_type_id
         WHERE it.invoice_id = p_entry_invoice_id
         LIMIT 1
      )
    )
    INTO v_entry
    FROM client_invoices ci WHERE ci.id = p_entry_invoice_id;

  -- Saídas via link novo
  SELECT jsonb_agg(jsonb_build_object(
      'exit_invoice_id', ex.id,
      'invoice_number',  ex.invoice_number,
      'issue_date',      ex.issue_date,
      'deduct_kg',       l.deduct_kg,
      'weight_kg',       COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = ex.id), 0),
      'article_name',    (SELECT art.name FROM client_invoice_items it LEFT JOIN articles art ON art.id = it.article_id WHERE it.invoice_id = ex.id LIMIT 1),
      'source',          'link'
    ) ORDER BY ex.issue_date DESC)
    INTO v_linked
    FROM client_invoice_exit_links l
    JOIN client_invoices ex ON ex.id = l.exit_invoice_id
   WHERE l.company_id = p_company_id
     AND l.entry_invoice_id = p_entry_invoice_id;

  -- Saídas via parent_invoice_id (legacy) que não estão em v_linked
  SELECT jsonb_agg(jsonb_build_object(
      'exit_invoice_id', s.id,
      'invoice_number',  s.invoice_number,
      'issue_date',      s.issue_date,
      'weight_kg',       COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id), 0),
      'deduct_kg',       COALESCE((SELECT SUM(weight_kg) FROM client_invoice_items WHERE invoice_id = s.id), 0),
      'article_name',    (SELECT art.name FROM client_invoice_items it LEFT JOIN articles art ON art.id = it.article_id WHERE it.invoice_id = s.id LIMIT 1),
      'source',          'legacy'
    ) ORDER BY s.issue_date DESC)
    INTO v_legacy
    FROM client_invoices s
   WHERE s.company_id = p_company_id
     AND s.type = 'saida'
     AND s.parent_invoice_id = p_entry_invoice_id
     AND NOT EXISTS (
       SELECT 1 FROM client_invoice_exit_links l
        WHERE l.entry_invoice_id = p_entry_invoice_id
          AND l.exit_invoice_id  = s.id
     );

  v_consumed :=
      COALESCE((SELECT SUM((r->>'deduct_kg')::numeric) FROM jsonb_array_elements(COALESCE(v_linked,'[]'::jsonb)) r), 0)
    + COALESCE((SELECT SUM((r->>'weight_kg')::numeric) FROM jsonb_array_elements(COALESCE(v_legacy,'[]'::jsonb)) r), 0);

  RETURN jsonb_build_object(
    'company',     COALESCE(v_company, jsonb_build_object('name','','logo_url', NULL)),
    'client',      v_client,
    'entry',       v_entry,
    'linked',      COALESCE(v_linked, '[]'::jsonb),
    'legacy',      COALESCE(v_legacy, '[]'::jsonb),
    'consumed_kg', v_consumed,
    'saldo',       GREATEST(0, v_entry_wt - v_consumed)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_invoice_by_nf_export(uuid, uuid) TO anon, authenticated, service_role;
