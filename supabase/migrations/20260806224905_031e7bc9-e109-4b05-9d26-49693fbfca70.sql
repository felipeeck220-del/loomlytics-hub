-- Fix: get_mecanica_stats now returns counts separated by mode (OM, OC, OE)
-- This prevents the badges from showing the total sum of all types in every tab.

CREATE OR REPLACE FUNCTION public.get_mecanica_stats(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_om_stats json;
  v_oc_stats json;
  v_oe_stats json;
  v_ot_stats json;
BEGIN
  -- OM Stats (preventiva, troca_artigo, troca_agulhas)
  SELECT json_object_agg(status, count) INTO v_om_stats
  FROM (
    SELECT status, count(*) as count
    FROM public.maintenance_orders
    WHERE company_id = p_company_id
      AND type IN ('manutencao_preventiva', 'troca_artigo', 'troca_agulhas')
    GROUP BY status
  ) t;

  -- OC Stats (corretiva)
  SELECT json_object_agg(status, count) INTO v_oc_stats
  FROM (
    SELECT status, count(*) as count
    FROM public.maintenance_orders
    WHERE company_id = p_company_id
      AND type = 'manutencao_corretiva'
    GROUP BY status
  ) t;

  -- OE Stats (eletrica)
  SELECT json_object_agg(status, count) INTO v_oe_stats
  FROM (
    SELECT status, count(*) as count
    FROM public.maintenance_orders
    WHERE company_id = p_company_id
      AND type = 'manutencao_eletrica'
    GROUP BY status
  ) t;

  -- OT Stats
  SELECT json_object_agg(status, count) INTO v_ot_stats
  FROM (
    SELECT status::text, count(*) as count
    FROM public.article_change_orders
    WHERE company_id = p_company_id
    GROUP BY status
  ) t;

  RETURN json_build_object(
    'om', COALESCE(v_om_stats, '{}'::json),
    'oc', COALESCE(v_oc_stats, '{}'::json),
    'oe', COALESCE(v_oe_stats, '{}'::json),
    'ot', COALESCE(v_ot_stats, '{}'::json)
  );
END;
$$;
