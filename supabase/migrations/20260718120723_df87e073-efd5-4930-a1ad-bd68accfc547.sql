
-- ============================================================
-- Fase 1 RPCMECANICA - Leitura consolidada do módulo Mecânica
-- ============================================================

-- 1) BOOTSTRAP: substitui 6 SELECTs do boot em Mecanica.tsx
CREATE OR REPLACE FUNCTION public.get_mecanica_bootstrap(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  SELECT json_build_object(
    'needle_providers', COALESCE((
      SELECT json_agg(to_jsonb(np) ORDER BY np.name)
      FROM public.needle_providers np WHERE np.company_id = p_company_id
    ), '[]'::json),
    'needle_provider_prices', COALESCE((
      SELECT json_agg(to_jsonb(npp))
      FROM public.needle_provider_prices npp WHERE npp.company_id = p_company_id
    ), '[]'::json),
    'needle_lots', COALESCE((
      SELECT json_agg(to_jsonb(nl) ORDER BY nl.purchase_date DESC NULLS LAST, nl.created_at DESC)
      FROM public.needle_lots nl WHERE nl.company_id = p_company_id
    ), '[]'::json),
    'sinker_providers', COALESCE((
      SELECT json_agg(to_jsonb(sp) ORDER BY sp.name)
      FROM public.sinker_providers sp WHERE sp.company_id = p_company_id
    ), '[]'::json),
    'sinker_provider_prices', COALESCE((
      SELECT json_agg(to_jsonb(spp))
      FROM public.sinker_provider_prices spp WHERE spp.company_id = p_company_id
    ), '[]'::json),
    'sinker_lots', COALESCE((
      SELECT json_agg(to_jsonb(sl) ORDER BY sl.purchase_date DESC NULLS LAST, sl.created_at DESC)
      FROM public.sinker_lots sl WHERE sl.company_id = p_company_id
    ), '[]'::json),
    'machine_needle_refs', COALESCE((
      SELECT json_agg(to_jsonb(mnr))
      FROM public.machine_needle_refs mnr WHERE mnr.company_id = p_company_id
    ), '[]'::json),
    'machine_sinker_refs', COALESCE((
      SELECT json_agg(to_jsonb(msr))
      FROM public.machine_sinker_refs msr WHERE msr.company_id = p_company_id
    ), '[]'::json),
    'profiles_min', COALESCE((
      SELECT json_agg(json_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'name', p.name,
        'code', p.code,
        'role', p.role
      ))
      FROM public.profiles p WHERE p.company_id = p_company_id
    ), '[]'::json)
  ) INTO v;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mecanica_bootstrap(uuid) TO anon, authenticated, service_role;

-- 2) NEEDLE STOCK: providers + prices + lots enriquecidos + tx + saldo
CREATE OR REPLACE FUNCTION public.get_needle_stock(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  WITH tx_agg AS (
    SELECT
      lot_id,
      COALESCE(SUM(CASE WHEN type = 'entry' THEN quantity ELSE 0 END), 0) AS entries,
      COALESCE(SUM(CASE WHEN type = 'exit'  THEN quantity ELSE 0 END), 0) AS exits
    FROM public.needle_transactions
    WHERE company_id = p_company_id AND lot_id IS NOT NULL
    GROUP BY lot_id
  ),
  lots_enriched AS (
    SELECT
      nl.*,
      np.name AS provider_name,
      ni.reference_code AS reference,
      ni.brand AS brand,
      COALESCE(t.entries, 0) AS entries,
      COALESCE(t.exits, 0) AS exits,
      (nl.quantity - COALESCE(t.exits, 0)) AS current_quantity,
      COALESCE(t.exits, 0) AS consumed_quantity
    FROM public.needle_lots nl
    LEFT JOIN public.needle_providers np ON np.id = nl.provider_id
    LEFT JOIN public.needle_inventory ni ON ni.id = nl.needle_id
    LEFT JOIN tx_agg t ON t.lot_id = nl.id
    WHERE nl.company_id = p_company_id
  ),
  balance AS (
    SELECT
      ni.reference_code AS reference,
      ni.brand,
      SUM(nl.quantity - COALESCE(t.exits, 0)) AS total_quantity,
      CASE WHEN SUM(nl.quantity) > 0
        THEN SUM(nl.quantity * COALESCE(nl.unit_price, 0)) / NULLIF(SUM(nl.quantity), 0)
        ELSE 0 END AS avg_price
    FROM public.needle_lots nl
    JOIN public.needle_inventory ni ON ni.id = nl.needle_id
    LEFT JOIN tx_agg t ON t.lot_id = nl.id
    WHERE nl.company_id = p_company_id
    GROUP BY ni.reference_code, ni.brand
  )
  SELECT json_build_object(
    'providers', COALESCE((
      SELECT json_agg(to_jsonb(np) ORDER BY np.name)
      FROM public.needle_providers np WHERE np.company_id = p_company_id
    ), '[]'::json),
    'provider_prices', COALESCE((
      SELECT json_agg(to_jsonb(npp))
      FROM public.needle_provider_prices npp WHERE npp.company_id = p_company_id
    ), '[]'::json),
    'lots', COALESCE((
      SELECT json_agg(to_jsonb(le) ORDER BY le.purchase_date DESC NULLS LAST, le.created_at DESC)
      FROM lots_enriched le
    ), '[]'::json),
    'transactions', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.date DESC, x.created_at DESC)
      FROM (
        SELECT
          nt.id, nt.date, nt.type, nt.exit_mode, nt.quantity, nt.unit_price,
          nt.provider_id, np.name AS provider_name,
          nt.lot_id, nl.lot_code AS lot_short_id,
          nt.machine_id, m.name AS machine_name,
          nt.created_by_id, nt.created_by_name,
          nt.created_at
        FROM public.needle_transactions nt
        LEFT JOIN public.needle_providers np ON np.id = nt.provider_id
        LEFT JOIN public.needle_lots nl ON nl.id = nt.lot_id
        LEFT JOIN public.machines m ON m.id = nt.machine_id
        WHERE nt.company_id = p_company_id
        ORDER BY nt.date DESC, nt.created_at DESC
        LIMIT 500
      ) x
    ), '[]'::json),
    'balance_by_ref', COALESCE((
      SELECT json_agg(row_to_json(b) ORDER BY b.reference)
      FROM balance b
    ), '[]'::json)
  ) INTO v;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_needle_stock(uuid) TO anon, authenticated, service_role;

-- 3) SINKER STOCK: espelho de get_needle_stock
CREATE OR REPLACE FUNCTION public.get_sinker_stock(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v json;
BEGIN
  WITH tx_agg AS (
    SELECT
      lot_id,
      COALESCE(SUM(CASE WHEN type = 'entry' THEN quantity ELSE 0 END), 0) AS entries,
      COALESCE(SUM(CASE WHEN type = 'exit'  THEN quantity ELSE 0 END), 0) AS exits
    FROM public.sinker_transactions
    WHERE company_id = p_company_id AND lot_id IS NOT NULL
    GROUP BY lot_id
  ),
  lots_enriched AS (
    SELECT
      sl.*,
      sp.name AS provider_name,
      si.reference_code AS reference,
      si.brand AS brand,
      COALESCE(t.entries, 0) AS entries,
      COALESCE(t.exits, 0) AS exits,
      (sl.quantity - COALESCE(t.exits, 0)) AS current_quantity,
      COALESCE(t.exits, 0) AS consumed_quantity
    FROM public.sinker_lots sl
    LEFT JOIN public.sinker_providers sp ON sp.id = sl.provider_id
    LEFT JOIN public.sinker_inventory si ON si.id = sl.sinker_id
    LEFT JOIN tx_agg t ON t.lot_id = sl.id
    WHERE sl.company_id = p_company_id
  ),
  balance AS (
    SELECT
      si.reference_code AS reference,
      si.brand,
      SUM(sl.quantity - COALESCE(t.exits, 0)) AS total_quantity,
      CASE WHEN SUM(sl.quantity) > 0
        THEN SUM(sl.quantity * COALESCE(sl.unit_price, 0)) / NULLIF(SUM(sl.quantity), 0)
        ELSE 0 END AS avg_price
    FROM public.sinker_lots sl
    JOIN public.sinker_inventory si ON si.id = sl.sinker_id
    LEFT JOIN tx_agg t ON t.lot_id = sl.id
    WHERE sl.company_id = p_company_id
    GROUP BY si.reference_code, si.brand
  )
  SELECT json_build_object(
    'providers', COALESCE((
      SELECT json_agg(to_jsonb(sp) ORDER BY sp.name)
      FROM public.sinker_providers sp WHERE sp.company_id = p_company_id
    ), '[]'::json),
    'provider_prices', COALESCE((
      SELECT json_agg(to_jsonb(spp))
      FROM public.sinker_provider_prices spp WHERE spp.company_id = p_company_id
    ), '[]'::json),
    'lots', COALESCE((
      SELECT json_agg(to_jsonb(le) ORDER BY le.purchase_date DESC NULLS LAST, le.created_at DESC)
      FROM lots_enriched le
    ), '[]'::json),
    'transactions', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.date DESC, x.created_at DESC)
      FROM (
        SELECT
          st.id, st.date, st.type, st.exit_mode, st.quantity, st.unit_price,
          st.provider_id, sp.name AS provider_name,
          st.lot_id, sl.lot_code AS lot_short_id,
          st.machine_id, m.name AS machine_name,
          st.created_by_id, st.created_by_name,
          st.created_at
        FROM public.sinker_transactions st
        LEFT JOIN public.sinker_providers sp ON sp.id = st.provider_id
        LEFT JOIN public.sinker_lots sl ON sl.id = st.lot_id
        LEFT JOIN public.machines m ON m.id = st.machine_id
        WHERE st.company_id = p_company_id
        ORDER BY st.date DESC, st.created_at DESC
        LIMIT 500
      ) x
    ), '[]'::json),
    'balance_by_ref', COALESCE((
      SELECT json_agg(row_to_json(b) ORDER BY b.reference)
      FROM balance b
    ), '[]'::json)
  ) INTO v;
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sinker_stock(uuid) TO anon, authenticated, service_role;
