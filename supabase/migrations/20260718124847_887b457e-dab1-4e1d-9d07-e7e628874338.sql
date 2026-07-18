
-- ============================================================
-- Phase 4 — Outsource atomic writes
-- Pattern: plpgsql, VOLATILE, SECURITY DEFINER, search_path=public
-- Returns jsonb { ok, already?, id, ... } and RAISES friendly messages
-- ============================================================

-- ---- 1. save_outsource_company -----------------------------
CREATE OR REPLACE FUNCTION public.save_outsource_company(
  p_company_id uuid,
  p_id uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := trim(coalesce(p_payload->>'name',''));
  v_contact text := nullif(p_payload->>'contact','');
  v_observations text := nullif(p_payload->>'observations','');
BEGIN
  IF v_name = '' THEN RAISE EXCEPTION 'Nome da malharia é obrigatório'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO outsource_companies(company_id, name, contact, observations)
    VALUES (p_company_id, v_name, v_contact, v_observations)
    RETURNING id INTO v_id;
  ELSE
    PERFORM 1 FROM outsource_companies WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    UPDATE outsource_companies
       SET name = v_name, contact = v_contact, observations = v_observations
     WHERE id = p_id AND company_id = p_company_id;
    v_id := p_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.save_outsource_company(uuid, uuid, jsonb) TO anon, authenticated, service_role;

-- ---- 2. delete_outsource_company ---------------------------
CREATE OR REPLACE FUNCTION public.delete_outsource_company(
  p_company_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod_count int;
  v_freight_count int;
BEGIN
  PERFORM 1 FROM outsource_companies WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  SELECT count(*) INTO v_prod_count FROM outsource_productions
    WHERE company_id = p_company_id AND outsource_company_id = p_id;
  SELECT count(*) INTO v_freight_count FROM outsource_freights
    WHERE company_id = p_company_id AND outsource_company_id = p_id;

  IF v_prod_count > 0 OR v_freight_count > 0 THEN
    RAISE EXCEPTION 'Não é possível remover: existem % produção(ões) e % frete(s) vinculados a esta malharia.', v_prod_count, v_freight_count;
  END IF;

  DELETE FROM outsource_companies WHERE id = p_id AND company_id = p_company_id;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.delete_outsource_company(uuid, uuid) TO anon, authenticated, service_role;

-- ---- helper: adjust outsource_yarn_stock ------------------
CREATE OR REPLACE FUNCTION public._adjust_outsource_yarn_stock(
  p_company_id uuid,
  p_outsource_company_id uuid,
  p_article_id uuid,
  p_date text,
  p_delta_kg numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yarn_type_id uuid;
  v_ref_month text;
  v_existing_id uuid;
  v_existing_qty numeric;
BEGIN
  IF p_delta_kg = 0 OR p_outsource_company_id IS NULL OR p_article_id IS NULL OR p_date IS NULL THEN RETURN; END IF;
  SELECT yarn_type_id INTO v_yarn_type_id FROM articles WHERE id = p_article_id;
  IF v_yarn_type_id IS NULL THEN RETURN; END IF;
  v_ref_month := substring(p_date from 1 for 7);

  SELECT id, quantity_kg INTO v_existing_id, v_existing_qty
    FROM outsource_yarn_stock
   WHERE company_id = p_company_id
     AND outsource_company_id = p_outsource_company_id
     AND yarn_type_id = v_yarn_type_id
     AND reference_month = v_ref_month
   FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE outsource_yarn_stock
       SET quantity_kg = GREATEST(0, v_existing_qty - p_delta_kg),
           updated_at = now()
     WHERE id = v_existing_id;
  END IF;
END $$;

-- ---- 3. save_outsource_production --------------------------
CREATE OR REPLACE FUNCTION public.save_outsource_production(
  p_company_id uuid,
  p_id uuid,
  p_outsource_company_id uuid,
  p_date text,
  p_nf_rom text,
  p_observations text,
  p_items jsonb,
  p_author_name text,
  p_author_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup_id uuid;
  v_dup_date text;
  v_outsource_name text;
  v_item jsonb;
  v_row_id uuid;
  v_old_article_id uuid;
  v_old_outsource uuid;
  v_old_date text;
  v_old_weight numeric;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_outsource_company_id IS NULL THEN RAISE EXCEPTION 'Malharia é obrigatória'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Nenhum item informado'; END IF;

  SELECT name INTO v_outsource_name FROM outsource_companies WHERE id = p_outsource_company_id;
  IF v_outsource_name IS NULL THEN v_outsource_name := 'Avulso'; END IF;

  -- NF/ROM duplicate check (per malharia)
  IF p_nf_rom IS NOT NULL AND trim(p_nf_rom) <> '' THEN
    SELECT id, date INTO v_dup_id, v_dup_date
      FROM outsource_productions
     WHERE company_id = p_company_id
       AND outsource_company_id = p_outsource_company_id
       AND nf_rom = trim(p_nf_rom)
       AND (p_id IS NULL OR id <> p_id)
     LIMIT 1;
    IF v_dup_id IS NOT NULL THEN
      RAISE EXCEPTION 'NF/ROM "%" já cadastrada para % (data: %).', trim(p_nf_rom), v_outsource_name, v_dup_date;
    END IF;
  END IF;

  IF p_id IS NOT NULL THEN
    -- UPDATE single row (edit)
    SELECT article_id, outsource_company_id, date, weight_kg
      INTO v_old_article_id, v_old_outsource, v_old_date, v_old_weight
      FROM outsource_productions
     WHERE id = p_id AND company_id = p_company_id
     FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

    v_item := p_items -> 0;
    UPDATE outsource_productions SET
      outsource_company_id = p_outsource_company_id,
      outsource_company_name = v_outsource_name,
      article_id = (v_item->>'article_id')::uuid,
      article_name = v_item->>'article_name',
      client_name = v_item->>'client_name',
      date = p_date,
      weight_kg = (v_item->>'weight_kg')::numeric,
      rolls = (v_item->>'rolls')::int,
      client_value_per_kg = (v_item->>'client_value_per_kg')::numeric,
      outsource_value_per_kg = (v_item->>'outsource_value_per_kg')::numeric,
      freight_per_kg = (v_item->>'freight_per_kg')::numeric,
      profit_per_kg = (v_item->>'profit_per_kg')::numeric,
      total_revenue = (v_item->>'total_revenue')::numeric,
      total_cost = (v_item->>'total_cost')::numeric,
      total_profit = (v_item->>'total_profit')::numeric,
      observations = nullif(p_observations,''),
      nf_rom = nullif(trim(coalesce(p_nf_rom,'')),'')
    WHERE id = p_id;

    -- restore old yarn stock then deduct new
    IF v_old_weight > 0 THEN
      PERFORM _adjust_outsource_yarn_stock(p_company_id, v_old_outsource, v_old_article_id, v_old_date, -v_old_weight);
    END IF;
    IF (v_item->>'weight_kg')::numeric > 0 THEN
      PERFORM _adjust_outsource_yarn_stock(p_company_id, p_outsource_company_id, (v_item->>'article_id')::uuid, p_date, (v_item->>'weight_kg')::numeric);
    END IF;
    v_ids := ARRAY[p_id];
  ELSE
    -- INSERT (multi-item)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO outsource_productions(
        company_id, outsource_company_id, outsource_company_name,
        article_id, article_name, client_name,
        date, weight_kg, rolls,
        client_value_per_kg, outsource_value_per_kg, freight_per_kg, profit_per_kg,
        total_revenue, total_cost, total_profit,
        observations, nf_rom, created_by_name, created_by_code
      ) VALUES (
        p_company_id, p_outsource_company_id, v_outsource_name,
        (v_item->>'article_id')::uuid, v_item->>'article_name', v_item->>'client_name',
        p_date, (v_item->>'weight_kg')::numeric, (v_item->>'rolls')::int,
        (v_item->>'client_value_per_kg')::numeric, (v_item->>'outsource_value_per_kg')::numeric,
        (v_item->>'freight_per_kg')::numeric, (v_item->>'profit_per_kg')::numeric,
        (v_item->>'total_revenue')::numeric, (v_item->>'total_cost')::numeric, (v_item->>'total_profit')::numeric,
        nullif(p_observations,''), nullif(trim(coalesce(p_nf_rom,'')),''),
        nullif(p_author_name,''), nullif(p_author_code,'')
      ) RETURNING id INTO v_row_id;
      v_ids := array_append(v_ids, v_row_id);

      IF (v_item->>'weight_kg')::numeric > 0 THEN
        PERFORM _adjust_outsource_yarn_stock(p_company_id, p_outsource_company_id, (v_item->>'article_id')::uuid, p_date, (v_item->>'weight_kg')::numeric);
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids));
END $$;

GRANT EXECUTE ON FUNCTION public.save_outsource_production(uuid, uuid, uuid, text, text, text, jsonb, text, text) TO anon, authenticated, service_role;

-- ---- 4. delete_outsource_production ------------------------
CREATE OR REPLACE FUNCTION public.delete_outsource_production(
  p_company_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outsource uuid;
  v_article uuid;
  v_date text;
  v_weight numeric;
BEGIN
  SELECT outsource_company_id, article_id, date, weight_kg
    INTO v_outsource, v_article, v_date, v_weight
    FROM outsource_productions
   WHERE id = p_id AND company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  DELETE FROM outsource_productions WHERE id = p_id;

  IF v_weight > 0 THEN
    PERFORM _adjust_outsource_yarn_stock(p_company_id, v_outsource, v_article, v_date, -v_weight);
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.delete_outsource_production(uuid, uuid) TO anon, authenticated, service_role;

-- ---- 5. save_outsource_freight -----------------------------
CREATE OR REPLACE FUNCTION public.save_outsource_freight(
  p_company_id uuid,
  p_id uuid,
  p_payload jsonb,
  p_author_name text,
  p_author_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_outsource uuid := nullif(p_payload->>'outsource_company_id','')::uuid;
  v_date date := (p_payload->>'date')::date;
  v_nf_rom text := nullif(p_payload->>'nf_rom','');
  v_freteiro text := nullif(p_payload->>'freteiro','');
  v_weight numeric := coalesce((p_payload->>'weight_kg')::numeric, 0);
  v_freight_per_kg numeric := coalesce((p_payload->>'freight_per_kg')::numeric, 0);
  v_total_freight numeric := coalesce((p_payload->>'total_freight')::numeric, 0);
  v_obs text := nullif(p_payload->>'observations','');
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO outsource_freights(
      company_id, outsource_company_id, date, nf_rom, freteiro,
      weight_kg, freight_per_kg, total_freight, observations,
      created_by_name, created_by_code
    ) VALUES (
      p_company_id, v_outsource, v_date, v_nf_rom, v_freteiro,
      v_weight, v_freight_per_kg, v_total_freight, v_obs,
      nullif(p_author_name,''), nullif(p_author_code,'')
    ) RETURNING id INTO v_id;
  ELSE
    PERFORM 1 FROM outsource_freights WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    UPDATE outsource_freights SET
      outsource_company_id = v_outsource,
      date = v_date, nf_rom = v_nf_rom, freteiro = v_freteiro,
      weight_kg = v_weight, freight_per_kg = v_freight_per_kg,
      total_freight = v_total_freight, observations = v_obs
    WHERE id = p_id;
    v_id := p_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.save_outsource_freight(uuid, uuid, jsonb, text, text) TO anon, authenticated, service_role;

-- ---- 6. delete_outsource_freight ---------------------------
CREATE OR REPLACE FUNCTION public.delete_outsource_freight(
  p_company_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM outsource_freights WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  DELETE FROM outsource_freights WHERE id = p_id AND company_id = p_company_id;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.delete_outsource_freight(uuid, uuid) TO anon, authenticated, service_role;
