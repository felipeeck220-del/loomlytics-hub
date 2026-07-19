DROP FUNCTION IF EXISTS public.get_stock_malha_movements(uuid,text,boolean,date,date,integer,integer,uuid,uuid,text);

CREATE OR REPLACE FUNCTION public.get_stock_malha_movements(
  p_company_id uuid,
  p_type text,
  p_second boolean,
  p_from date,
  p_to date,
  p_page integer,
  p_page_size integer,
  p_client_id uuid,
  p_article_id uuid,
  p_of_search text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_total  bigint;
  v_rows   jsonb;
  v_offset int;
  v_size   int;
  v_of     text;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('rows','[]'::jsonb,'total_count',0);
  END IF;

  v_size := GREATEST(1, LEAST(COALESCE(p_page_size,15), 200));
  v_offset := GREATEST(0, (COALESCE(p_page,1)-1) * v_size);
  -- Match literal (apenas trim) para preservar '/', '-' e demais chars em of_number
  v_of := NULLIF(BTRIM(COALESCE(p_of_search,'')), '');

  SELECT COUNT(*) INTO v_total
  FROM public.stock_movements m
  LEFT JOIN public.billing_orders bo2 ON bo2.id = m.billing_order_id AND bo2.company_id = p_company_id
  WHERE m.company_id = p_company_id
    AND (p_type = 'all' OR m.type::text = p_type)
    AND (p_second IS NULL OR m.is_second_quality = p_second)
    AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
    AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
    AND (p_client_id  IS NULL OR m.client_id = p_client_id)
    AND (p_article_id IS NULL OR m.article_id = p_article_id)
    AND (v_of IS NULL OR bo2.of_number ILIKE '%' || v_of || '%');

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT m.created_at,
      jsonb_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'type', m.type,
        'is_second_quality', m.is_second_quality,
        'weight_kg', m.weight_kg,
        'pieces', m.pieces,
        'reason', m.reason,
        'author', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('name', pr.name, 'code', pr.code) END,
        'billing_order', CASE WHEN bo.id IS NULL THEN NULL ELSE jsonb_build_object('id', bo.id, 'of_number', bo.of_number) END,
        'client', CASE WHEN cl.id IS NULL THEN NULL ELSE jsonb_build_object('id', cl.id, 'name', cl.name) END,
        'article', CASE WHEN ar.id IS NULL THEN NULL ELSE jsonb_build_object('id', ar.id, 'name', ar.name) END,
        'machine', CASE WHEN mac.id IS NULL THEN NULL ELSE jsonb_build_object('id', mac.id, 'name', mac.name) END
      ) AS row_json
    FROM public.stock_movements m
    LEFT JOIN public.profiles pr ON pr.id = m.created_by
    LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id AND bo.company_id = p_company_id
    LEFT JOIN public.clients cl ON cl.id = m.client_id AND cl.company_id = p_company_id
    LEFT JOIN public.articles ar ON ar.id = m.article_id AND ar.company_id = p_company_id
    LEFT JOIN public.machines mac ON mac.id = m.machine_id AND mac.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_type = 'all' OR m.type::text = p_type)
      AND (p_second IS NULL OR m.is_second_quality = p_second)
      AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
      AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
      AND (p_client_id  IS NULL OR m.client_id = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
      AND (v_of IS NULL OR bo.of_number ILIKE '%' || v_of || '%')
    ORDER BY m.created_at DESC
    LIMIT v_size OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object('rows', v_rows, 'total_count', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stock_malha_movements(uuid,text,boolean,date,date,integer,integer,uuid,uuid,text) TO anon, authenticated, service_role;