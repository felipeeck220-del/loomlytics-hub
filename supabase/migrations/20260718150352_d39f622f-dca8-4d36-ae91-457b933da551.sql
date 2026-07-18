
-- ============================================================
-- Fase 3 rpcInvoices.md — Saldos agregados + export PDF venda_fio
-- ============================================================

-- 3.1) get_yarn_balance_by_brand ---------------------------------
CREATE OR REPLACE FUNCTION public.get_yarn_balance_by_brand(
  p_company_id uuid,
  p_month text DEFAULT 'all',
  p_brand text DEFAULT 'all'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_kpis jsonb;
  v_brands jsonb;
BEGIN
  WITH base AS (
    SELECT
      COALESCE(NULLIF(ii.brand, ''), 'Sem marca') AS brand,
      i.type,
      ii.weight_kg,
      substring(i.issue_date, 1, 7) AS ym
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.company_id = p_company_id
      AND i.status <> 'cancelada'
      AND i.type IN ('entrada', 'venda_fio')
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (p_month = 'all' OR ym = p_month)
  ),
  agg AS (
    SELECT
      brand,
      COALESCE(SUM(weight_kg) FILTER (WHERE type = 'entrada'), 0)::numeric   AS received,
      COALESCE(SUM(weight_kg) FILTER (WHERE type = 'venda_fio'), 0)::numeric AS sold
    FROM filtered
    GROUP BY brand
  ),
  agg_filtered AS (
    SELECT brand, received, sold, (received - sold) AS balance
    FROM agg
    WHERE (p_brand = 'all' OR brand = p_brand)
    ORDER BY brand
  ),
  totals AS (
    SELECT
      COALESCE(SUM(received), 0)::numeric AS total_received,
      COALESCE(SUM(sold), 0)::numeric     AS total_sold,
      COALESCE(SUM(received - sold), 0)::numeric AS total_balance
    FROM agg_filtered
  ),
  brand_list AS (
    SELECT DISTINCT COALESCE(NULLIF(ii.brand, ''), 'Sem marca') AS brand
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.company_id = p_company_id
      AND i.status <> 'cancelada'
      AND i.type IN ('entrada', 'venda_fio')
      AND ii.brand IS NOT NULL AND ii.brand <> ''
    ORDER BY 1
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'brand', af.brand,
      'received', af.received,
      'sold', af.sold,
      'balance', af.balance
    )), '[]'::jsonb),
    (SELECT jsonb_build_object(
        'totalReceived', total_received,
        'totalSold', total_sold,
        'totalBalance', total_balance
      ) FROM totals),
    (SELECT COALESCE(jsonb_agg(brand ORDER BY brand), '[]'::jsonb) FROM brand_list)
  INTO v_rows, v_kpis, v_brands
  FROM agg_filtered af;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'kpis', v_kpis,
    'available_brands', v_brands
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_yarn_balance_by_brand(uuid, text, text) TO anon, authenticated, service_role;


-- 3.2) get_yarn_global_balance -----------------------------------
CREATE OR REPLACE FUNCTION public.get_yarn_global_balance(
  p_company_id uuid,
  p_month text DEFAULT 'all',
  p_yarn_type_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end_date text;
  v_rows jsonb;
  v_kpis jsonb;
BEGIN
  IF p_month = 'all' THEN
    v_end_date := '9999-12-31';
  ELSE
    v_end_date := to_char(
      (date_trunc('month', to_date(p_month || '-01', 'YYYY-MM-DD')) + interval '1 month - 1 day')::date,
      'YYYY-MM-DD'
    );
  END IF;

  WITH purchases AS (
    SELECT
      ii.yarn_type_id,
      SUM(CASE WHEN p_month = 'all' OR substring(i.issue_date, 1, 7) = p_month
               THEN ii.weight_kg ELSE 0 END)::numeric AS purchase_month,
      SUM(CASE WHEN i.issue_date <= v_end_date
               THEN ii.weight_kg ELSE 0 END)::numeric AS stock_purchase
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.company_id = p_company_id
      AND i.status <> 'cancelada'
      AND i.type = 'entrada'
      AND ii.yarn_type_id IS NOT NULL
    GROUP BY ii.yarn_type_id
  ),
  sales AS (
    SELECT
      ii.yarn_type_id,
      SUM(CASE WHEN p_month = 'all' OR substring(i.issue_date, 1, 7) = p_month
               THEN ii.weight_kg ELSE 0 END)::numeric AS sales_month,
      SUM(CASE WHEN i.issue_date <= v_end_date
               THEN ii.weight_kg ELSE 0 END)::numeric AS stock_sales
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.company_id = p_company_id
      AND i.status <> 'cancelada'
      AND i.type = 'venda_fio'
      AND ii.yarn_type_id IS NOT NULL
    GROUP BY ii.yarn_type_id
  ),
  consumption AS (
    SELECT
      a.yarn_type_id,
      SUM(CASE WHEN p_month = 'all' OR substring(p.date, 1, 7) = p_month
               THEN p.weight_kg ELSE 0 END)::numeric AS consumed_month,
      SUM(CASE WHEN p.date <= v_end_date
               THEN p.weight_kg ELSE 0 END)::numeric AS stock_consumed
    FROM public.productions p
    JOIN public.articles a ON a.id = p.article_id
    WHERE p.company_id = p_company_id
      AND a.yarn_type_id IS NOT NULL
    GROUP BY a.yarn_type_id
  ),
  base AS (
    SELECT
      yt.id AS yarn_type_id,
      yt.name AS yarn_type_name,
      yt.color AS yarn_color,
      yt.composition AS yarn_composition,
      COALESCE(pu.purchase_month, 0)::numeric AS purchase_month,
      COALESCE(co.consumed_month, 0)::numeric AS consumed_month,
      COALESCE(sa.sales_month, 0)::numeric AS sales_month,
      (COALESCE(pu.stock_purchase, 0) - COALESCE(co.stock_consumed, 0) - COALESCE(sa.stock_sales, 0))::numeric AS stock_accumulated
    FROM public.yarn_types yt
    LEFT JOIN purchases   pu ON pu.yarn_type_id = yt.id
    LEFT JOIN sales       sa ON sa.yarn_type_id = yt.id
    LEFT JOIN consumption co ON co.yarn_type_id = yt.id
    WHERE yt.company_id = p_company_id
      AND (p_yarn_type_id IS NULL OR yt.id = p_yarn_type_id)
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE purchase_month <> 0 OR sales_month <> 0 OR consumed_month <> 0 OR stock_accumulated <> 0
    ORDER BY yarn_type_name
  ),
  totals AS (
    SELECT
      COALESCE(SUM(purchase_month), 0)::numeric AS total_purchase,
      COALESCE(SUM(consumed_month), 0)::numeric AS total_consumed,
      COALESCE(SUM(sales_month), 0)::numeric AS total_sales,
      COALESCE(SUM(stock_accumulated), 0)::numeric AS total_stock
    FROM filtered
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'yarn_type_id', f.yarn_type_id,
      'yarn_type_name', f.yarn_type_name,
      'yarn_color', f.yarn_color,
      'yarn_composition', f.yarn_composition,
      'purchase_month', f.purchase_month,
      'consumed_month', f.consumed_month,
      'sales_month', f.sales_month,
      'stock_accumulated', f.stock_accumulated
    )), '[]'::jsonb),
    (SELECT jsonb_build_object(
        'totalPurchase', total_purchase,
        'totalConsumed', total_consumed,
        'totalSales', total_sales,
        'totalStock', total_stock
      ) FROM totals)
  INTO v_rows, v_kpis
  FROM filtered f;

  RETURN jsonb_build_object('rows', v_rows, 'kpis', v_kpis);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_yarn_global_balance(uuid, text, uuid) TO anon, authenticated, service_role;


-- 3.3) get_yarn_sales_report_export -------------------------------
CREATE OR REPLACE FUNCTION public.get_yarn_sales_report_export(
  p_company_id uuid,
  p_month text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(trim(coalesce(p_search, '')), '');
  v_invoices jsonb;
  v_items jsonb;
  v_kpis jsonb;
BEGIN
  WITH filtered AS (
    SELECT i.*
    FROM public.invoices i
    WHERE i.company_id = p_company_id
      AND i.type = 'venda_fio'
      AND (p_status = 'all' OR i.status = p_status)
      AND (p_month  = 'all' OR substring(i.issue_date, 1, 7) = p_month)
      AND (
        v_search IS NULL
        OR i.invoice_number    ILIKE '%' || v_search || '%'
        OR COALESCE(i.buyer_name, '')       ILIKE '%' || v_search || '%'
        OR COALESCE(i.client_name, '')      ILIKE '%' || v_search || '%'
        OR COALESCE(i.destination_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(i.access_key, '')       ILIKE '%' || v_search || '%'
        OR EXISTS (
          SELECT 1 FROM public.invoice_items ii
          WHERE ii.invoice_id = i.id
            AND (
              COALESCE(ii.yarn_type_name, '') ILIKE '%' || v_search || '%'
              OR COALESCE(ii.article_name, '')  ILIKE '%' || v_search || '%'
            )
        )
      )
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.issue_date DESC, f.created_at DESC), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(ii) ORDER BY ii.created_at)
      FROM public.invoice_items ii
      WHERE ii.invoice_id IN (SELECT id FROM filtered)
    ), '[]'::jsonb),
    jsonb_build_object(
      'count',      (SELECT COUNT(*)                                     FROM filtered),
      'totalKg',    (SELECT COALESCE(SUM(total_weight_kg), 0)::numeric   FROM filtered WHERE status <> 'cancelada'),
      'totalValue', (SELECT COALESCE(SUM(total_value), 0)::numeric       FROM filtered WHERE status <> 'cancelada'),
      'pendentes',  (SELECT COUNT(*)                                     FROM filtered WHERE status = 'pendente')
    )
  INTO v_invoices, v_items, v_kpis
  FROM filtered f;

  RETURN jsonb_build_object(
    'invoices', v_invoices,
    'items',    v_items,
    'kpis',     v_kpis
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_yarn_sales_report_export(uuid, text, text, text) TO anon, authenticated, service_role;
