
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
      JOIN public.client_invoices ci ON ci.id = it.invoice_id
     WHERE ci.company_id = p_company_id AND ci.client_id = p_client_id
     GROUP BY it.invoice_id
  ),
  base AS (
    SELECT ci.*,
           COALESCE(items.items,'[]'::jsonb) AS items_json,
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
       AND ci.client_id  = p_client_id
  ),
  filt AS (
    SELECT * FROM base b
     WHERE (
       p_view = 'historico'
       OR (p_view = 'aberto'    AND b.type = 'entrada' AND COALESCE(b.saldo,0) > 0.001)
       OR (p_view = 'encerrada' AND b.type = 'entrada' AND COALESCE(b.saldo,0) <= 0.001)
     )
       AND (
         v_q IS NULL
         OR b.invoice_number ILIKE '%'||v_q||'%'
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(b.items_json) it
            WHERE COALESCE(it->>'yarn_type_name','') ILIKE '%'||v_q||'%'
               OR COALESCE(it->>'article_name','')  ILIKE '%'||v_q||'%'
         )
       )
  ),
  totals AS (
    SELECT COUNT(*) AS total_count,
           COALESCE(SUM(CASE WHEN type='entrada' THEN weight_entrada ELSE 0 END),0) AS total_entrada,
           COALESCE(SUM(CASE WHEN type='saida'   THEN weight_entrada ELSE 0 END),0) AS total_saida
      FROM filt
  ),
  paged AS (
    SELECT * FROM filt
     ORDER BY issue_date DESC, created_at DESC
     LIMIT CASE WHEN p_view = 'aberto' THEN NULL ELSE v_limit END
     OFFSET CASE WHEN p_view = 'aberto' THEN 0    ELSE v_offset END
  ),
  rows_json AS (
    SELECT COALESCE(jsonb_agg(
             (to_jsonb(p) - 'items_json') || jsonb_build_object('items', p.items_json)
             ORDER BY p.issue_date DESC, p.created_at DESC
           ),'[]'::jsonb) AS rows
      FROM paged p
  )
  SELECT rj.rows, t.total_count,
         jsonb_build_object(
           'totalEntrada', t.total_entrada,
           'totalSaida',   t.total_saida,
           'totalSaldo',   t.total_entrada - t.total_saida
         )
    INTO v_rows, v_total, v_kpis
    FROM rows_json rj, totals t;

  RETURN jsonb_build_object(
    'rows',        COALESCE(v_rows,'[]'::jsonb),
    'total_count', COALESCE(v_total,0),
    'kpis',        COALESCE(v_kpis,'{}'::jsonb)
  );
END;
$$;
