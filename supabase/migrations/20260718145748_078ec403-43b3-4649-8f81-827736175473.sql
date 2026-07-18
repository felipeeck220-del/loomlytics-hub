
-- =====================================================
-- Fase 2 rpcInvoices.md — Listas paginadas server-side
-- =====================================================

-- 2.1 get_invoices_list -------------------------------
CREATE OR REPLACE FUNCTION public.get_invoices_list(
  p_company_id uuid,
  p_type       text,
  p_status     text DEFAULT 'all',
  p_month      text DEFAULT 'all',
  p_search     text DEFAULT NULL,
  p_page       int  DEFAULT 1,
  p_page_size  int  DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type_filter text;
  v_offset int;
  v_total_count int;
  v_kpis jsonb;
  v_rows jsonb;
  v_search text;
BEGIN
  -- Normaliza type -> valor real na coluna invoices.type
  v_type_filter := CASE
    WHEN p_type = 'entrada'   THEN 'entrada'
    WHEN p_type = 'venda_fio' THEN 'venda_fio'
    WHEN p_type = 'saida'     THEN 'saida'
    WHEN p_type = 'saida_malha' THEN 'saida'
    ELSE p_type
  END;

  v_offset := GREATEST(0, (COALESCE(p_page,1) - 1) * GREATEST(1, COALESCE(p_page_size,20)));
  v_search := NULLIF(TRIM(COALESCE(p_search,'')), '');

  -- CTE base com filtros
  WITH base AS (
    SELECT i.*
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.type = v_type_filter
      AND (p_status = 'all' OR i.status = p_status)
      AND (p_month  = 'all' OR substring(i.issue_date,1,7) = p_month)
      AND (
        v_search IS NULL
        OR i.invoice_number ILIKE '%'||v_search||'%'
        OR COALESCE(i.buyer_name,'')       ILIKE '%'||v_search||'%'
        OR COALESCE(i.client_name,'')      ILIKE '%'||v_search||'%'
        OR COALESCE(i.destination_name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(i.access_key,'')       ILIKE '%'||v_search||'%'
        OR EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.id
            AND (
              COALESCE(ii.yarn_type_name,'') ILIKE '%'||v_search||'%'
              OR COALESCE(ii.article_name,'') ILIKE '%'||v_search||'%'
            )
        )
      )
  )
  SELECT
    COUNT(*)::int,
    jsonb_build_object(
      'count',     COUNT(*) FILTER (WHERE status <> 'cancelada'),
      'totalKg',   COALESCE(SUM(total_weight_kg) FILTER (WHERE status <> 'cancelada'),0),
      'totalValue',COALESCE(SUM(total_value)     FILTER (WHERE status <> 'cancelada'),0),
      'pendentes', COUNT(*) FILTER (WHERE status = 'pendente')
    )
  INTO v_total_count, v_kpis
  FROM base;

  -- Página com itens aninhados
  WITH base AS (
    SELECT i.*
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.type = v_type_filter
      AND (p_status = 'all' OR i.status = p_status)
      AND (p_month  = 'all' OR substring(i.issue_date,1,7) = p_month)
      AND (
        v_search IS NULL
        OR i.invoice_number ILIKE '%'||v_search||'%'
        OR COALESCE(i.buyer_name,'')       ILIKE '%'||v_search||'%'
        OR COALESCE(i.client_name,'')      ILIKE '%'||v_search||'%'
        OR COALESCE(i.destination_name,'') ILIKE '%'||v_search||'%'
        OR COALESCE(i.access_key,'')       ILIKE '%'||v_search||'%'
        OR EXISTS (
          SELECT 1 FROM invoice_items ii
          WHERE ii.invoice_id = i.id
            AND (
              COALESCE(ii.yarn_type_name,'') ILIKE '%'||v_search||'%'
              OR COALESCE(ii.article_name,'') ILIKE '%'||v_search||'%'
            )
        )
      )
    ORDER BY i.issue_date DESC, i.created_at DESC
    LIMIT GREATEST(1, COALESCE(p_page_size,20))
    OFFSET v_offset
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY sort_issue DESC, sort_created DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      b.issue_date  AS sort_issue,
      b.created_at  AS sort_created,
      (to_jsonb(b) || jsonb_build_object(
        'items', COALESCE((
          SELECT jsonb_agg(to_jsonb(ii) ORDER BY ii.created_at)
          FROM invoice_items ii
          WHERE ii.invoice_id = b.id
        ), '[]'::jsonb)
      )) AS row_json
    FROM base b
  ) s;

  RETURN jsonb_build_object(
    'rows',        v_rows,
    'total_count', v_total_count,
    'kpis',        v_kpis
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoices_list(uuid,text,text,text,text,int,int)
  TO anon, authenticated, service_role;


-- 2.2 get_outsource_yarn_stock_list -------------------
CREATE OR REPLACE FUNCTION public.get_outsource_yarn_stock_list(
  p_company_id uuid,
  p_month      text DEFAULT 'all',
  p_outsource_company_id uuid DEFAULT NULL,
  p_yarn_type_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_groups jsonb;
  v_kpis   jsonb;
BEGIN
  WITH filtered AS (
    SELECT
      s.id,
      s.outsource_company_id,
      COALESCE(oc.name, 'Facção removida') AS outsource_company_name,
      s.yarn_type_id,
      yt.name         AS yarn_type_name,
      yt.color        AS yarn_color,
      yt.composition  AS yarn_composition,
      s.quantity_kg,
      s.reference_month,
      s.observations
    FROM outsource_yarn_stock s
    LEFT JOIN outsource_companies oc ON oc.id = s.outsource_company_id
    LEFT JOIN yarn_types          yt ON yt.id = s.yarn_type_id
    WHERE s.company_id = p_company_id
      AND (p_month = 'all' OR s.reference_month = p_month)
      AND (p_outsource_company_id IS NULL OR s.outsource_company_id = p_outsource_company_id)
      AND (p_yarn_type_id         IS NULL OR s.yarn_type_id         = p_yarn_type_id)
  ), grouped AS (
    SELECT
      outsource_company_id,
      outsource_company_name,
      SUM(quantity_kg) AS total_kg,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'yarn_type_id', yarn_type_id,
          'yarn_type_name', yarn_type_name,
          'yarn_color', yarn_color,
          'yarn_composition', yarn_composition,
          'quantity_kg', quantity_kg,
          'reference_month', reference_month,
          'observations', observations
        )
        ORDER BY COALESCE(yarn_type_name,'')
      ) AS items
    FROM filtered
    GROUP BY outsource_company_id, outsource_company_name
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'outsource_company_id',   outsource_company_id,
        'outsource_company_name', outsource_company_name,
        'items',                  items,
        'total_kg',               total_kg
      )
      ORDER BY outsource_company_name
    ), '[]'::jsonb)
  INTO v_groups
  FROM grouped;

  SELECT jsonb_build_object(
    'total_kg', COALESCE(SUM(quantity_kg),0),
    'companies_count',   COUNT(DISTINCT outsource_company_id),
    'yarn_types_count',  COUNT(DISTINCT yarn_type_id)
  )
  INTO v_kpis
  FROM (
    SELECT s.quantity_kg, s.outsource_company_id, s.yarn_type_id
    FROM outsource_yarn_stock s
    WHERE s.company_id = p_company_id
      AND (p_month = 'all' OR s.reference_month = p_month)
      AND (p_outsource_company_id IS NULL OR s.outsource_company_id = p_outsource_company_id)
      AND (p_yarn_type_id         IS NULL OR s.yarn_type_id         = p_yarn_type_id)
  ) f;

  RETURN jsonb_build_object(
    'groups', v_groups,
    'kpis',   v_kpis
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_outsource_yarn_stock_list(uuid,text,uuid,uuid)
  TO anon, authenticated, service_role;
