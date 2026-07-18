
-- ============================================================================
-- rpcmecanica FASE 4 — CRUD atômico de fornecedores, preços e lotes
-- Padrão: plpgsql, SECURITY DEFINER, search_path=public, retorno JSON,
-- GRANT EXECUTE a anon/authenticated/service_role.
-- ============================================================================

-- ---------- NEEDLE providers ----------
CREATE OR REPLACE FUNCTION public.upsert_needle_provider(
  p_id uuid, p_company_id uuid, p_name text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Nome obrigatório';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO needle_providers(company_id, name) VALUES (p_company_id, btrim(p_name))
    RETURNING id INTO v_id;
  ELSE
    UPDATE needle_providers SET name = btrim(p_name), updated_at = now()
      WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.delete_needle_provider(p_id uuid, p_company_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM needle_providers WHERE id = p_id AND company_id = p_company_id;
  RETURN json_build_object('ok', true);
END $$;

-- ---------- NEEDLE prices ----------
CREATE OR REPLACE FUNCTION public.upsert_needle_price(
  p_id uuid, p_company_id uuid, p_provider_id uuid, p_needle_id uuid, p_unit_price numeric
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'Preço inválido'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO needle_provider_prices(company_id, provider_id, needle_id, unit_price)
      VALUES (p_company_id, p_provider_id, p_needle_id, p_unit_price)
    RETURNING id INTO v_id;
  ELSE
    UPDATE needle_provider_prices SET unit_price = p_unit_price, updated_at = now()
      WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Vínculo não encontrado'; END IF;
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.delete_needle_price(p_id uuid, p_company_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM needle_provider_prices WHERE id = p_id AND company_id = p_company_id;
  RETURN json_build_object('ok', true);
END $$;

-- ---------- NEEDLE lots (atômico) ----------
CREATE OR REPLACE FUNCTION public.save_needle_lot(
  p_id uuid,
  p_company_id uuid,
  p_provider_id uuid,
  p_needle_id uuid,
  p_lot_code text,
  p_purchase_date date,
  p_quantity integer,
  p_unit_price numeric,
  p_created_by_id uuid,
  p_created_by_name text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lot needle_lots%ROWTYPE;
  v_id uuid;
  v_linked_exits integer;
  v_linked_entries integer;
  v_qty_changed boolean := false;
  v_needle_changed boolean := false;
  v_date_changed boolean := false;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser maior que zero'; END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'Preço inválido'; END IF;

  IF p_id IS NULL THEN
    -- CREATE: lote + entrada automática
    INSERT INTO needle_lots(company_id, provider_id, needle_id, lot_code, purchase_date, quantity, unit_price)
      VALUES (p_company_id, p_provider_id, p_needle_id, NULLIF(btrim(coalesce(p_lot_code,'')),''), p_purchase_date, p_quantity, p_unit_price)
    RETURNING id INTO v_id;
    INSERT INTO needle_transactions(company_id, needle_id, type, quantity, date, lot_id, provider_id, unit_price, created_by_id, created_by_name)
      VALUES (p_company_id, p_needle_id, 'entry', p_quantity, p_purchase_date, v_id, p_provider_id, p_unit_price, p_created_by_id, p_created_by_name);
    RETURN json_build_object('ok', true, 'id', v_id, 'created', true);
  END IF;

  -- UPDATE
  SELECT * INTO v_lot FROM needle_lots WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;

  SELECT count(*) FILTER (WHERE type='exit'), count(*) FILTER (WHERE type='entry')
    INTO v_linked_exits, v_linked_entries
    FROM needle_transactions WHERE lot_id = p_id;

  v_qty_changed := (p_quantity <> v_lot.quantity);
  v_needle_changed := (p_needle_id <> v_lot.needle_id);
  v_date_changed := (p_purchase_date <> v_lot.purchase_date);

  IF v_needle_changed AND (v_linked_exits + v_linked_entries) > 0 THEN
    RAISE EXCEPTION 'Não é possível trocar a agulha: já existem movimentações vinculadas a este lote. Exclua-as antes.';
  END IF;
  IF v_qty_changed AND v_linked_exits > 0 THEN
    RAISE EXCEPTION 'Não é possível alterar a quantidade: já existem saídas vinculadas a este lote. Estorne-as antes.';
  END IF;

  IF v_qty_changed THEN
    DELETE FROM needle_transactions WHERE lot_id = p_id AND type = 'entry';
  END IF;

  UPDATE needle_lots
     SET provider_id = p_provider_id,
         needle_id = p_needle_id,
         lot_code = NULLIF(btrim(coalesce(p_lot_code,'')),''),
         purchase_date = p_purchase_date,
         quantity = p_quantity,
         unit_price = p_unit_price,
         updated_at = now()
   WHERE id = p_id;

  IF v_qty_changed THEN
    INSERT INTO needle_transactions(company_id, needle_id, type, quantity, date, lot_id, provider_id, unit_price, created_by_id, created_by_name)
      VALUES (p_company_id, p_needle_id, 'entry', p_quantity, p_purchase_date, p_id, p_provider_id, p_unit_price, p_created_by_id, p_created_by_name);
  ELSIF v_date_changed AND v_linked_entries > 0 THEN
    UPDATE needle_transactions SET date = p_purchase_date WHERE lot_id = p_id AND type = 'entry';
  END IF;

  RETURN json_build_object('ok', true, 'id', p_id, 'created', false);
END $$;

CREATE OR REPLACE FUNCTION public.delete_needle_lot(p_id uuid, p_company_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exits integer;
BEGIN
  PERFORM 1 FROM needle_lots WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  SELECT count(*) INTO v_exits FROM needle_transactions WHERE lot_id = p_id AND type = 'exit';
  IF v_exits > 0 THEN
    RAISE EXCEPTION 'Não é possível remover: existem % saída(s) vinculadas a este lote. Estorne-as antes.', v_exits;
  END IF;
  DELETE FROM needle_transactions WHERE lot_id = p_id AND type = 'entry';
  DELETE FROM needle_lots WHERE id = p_id AND company_id = p_company_id;
  RETURN json_build_object('ok', true);
END $$;

-- ---------- SINKER providers ----------
CREATE OR REPLACE FUNCTION public.upsert_sinker_provider(
  p_id uuid, p_company_id uuid, p_name text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Nome obrigatório'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO sinker_providers(company_id, name) VALUES (p_company_id, btrim(p_name))
    RETURNING id INTO v_id;
  ELSE
    UPDATE sinker_providers SET name = btrim(p_name), updated_at = now()
      WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Fornecedor não encontrado'; END IF;
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.delete_sinker_provider(p_id uuid, p_company_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM sinker_providers WHERE id = p_id AND company_id = p_company_id;
  RETURN json_build_object('ok', true);
END $$;

-- ---------- SINKER prices ----------
CREATE OR REPLACE FUNCTION public.upsert_sinker_price(
  p_id uuid, p_company_id uuid, p_provider_id uuid, p_sinker_id uuid, p_unit_price numeric
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'Preço inválido'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO sinker_provider_prices(company_id, provider_id, sinker_id, unit_price)
      VALUES (p_company_id, p_provider_id, p_sinker_id, p_unit_price)
    RETURNING id INTO v_id;
  ELSE
    UPDATE sinker_provider_prices SET unit_price = p_unit_price, updated_at = now()
      WHERE id = p_id AND company_id = p_company_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Vínculo não encontrado'; END IF;
  END IF;
  RETURN json_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.delete_sinker_price(p_id uuid, p_company_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM sinker_provider_prices WHERE id = p_id AND company_id = p_company_id;
  RETURN json_build_object('ok', true);
END $$;

-- ---------- SINKER lots (atômico) ----------
CREATE OR REPLACE FUNCTION public.save_sinker_lot(
  p_id uuid,
  p_company_id uuid,
  p_provider_id uuid,
  p_sinker_id uuid,
  p_lot_code text,
  p_purchase_date date,
  p_quantity integer,
  p_unit_price numeric,
  p_created_by_id uuid,
  p_created_by_name text
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lot sinker_lots%ROWTYPE;
  v_id uuid;
  v_linked_exits integer;
  v_linked_entries integer;
  v_qty_changed boolean := false;
  v_sinker_changed boolean := false;
  v_date_changed boolean := false;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser maior que zero'; END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN RAISE EXCEPTION 'Preço inválido'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO sinker_lots(company_id, provider_id, sinker_id, lot_code, purchase_date, quantity, unit_price)
      VALUES (p_company_id, p_provider_id, p_sinker_id, NULLIF(btrim(coalesce(p_lot_code,'')),''), p_purchase_date, p_quantity, p_unit_price)
    RETURNING id INTO v_id;
    INSERT INTO sinker_transactions(company_id, sinker_id, type, quantity, date, lot_id, provider_id, unit_price, created_by_id, created_by_name)
      VALUES (p_company_id, p_sinker_id, 'entry', p_quantity, p_purchase_date, v_id, p_provider_id, p_unit_price, p_created_by_id, p_created_by_name);
    RETURN json_build_object('ok', true, 'id', v_id, 'created', true);
  END IF;

  SELECT * INTO v_lot FROM sinker_lots WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;

  SELECT count(*) FILTER (WHERE type='exit'), count(*) FILTER (WHERE type='entry')
    INTO v_linked_exits, v_linked_entries
    FROM sinker_transactions WHERE lot_id = p_id;

  v_qty_changed := (p_quantity <> v_lot.quantity);
  v_sinker_changed := (p_sinker_id <> v_lot.sinker_id);
  v_date_changed := (p_purchase_date <> v_lot.purchase_date);

  IF v_sinker_changed AND (v_linked_exits + v_linked_entries) > 0 THEN
    RAISE EXCEPTION 'Não é possível trocar a platina: já existem movimentações vinculadas a este lote. Exclua-as antes.';
  END IF;
  IF v_qty_changed AND v_linked_exits > 0 THEN
    RAISE EXCEPTION 'Não é possível alterar a quantidade: já existem saídas vinculadas a este lote. Estorne-as antes.';
  END IF;

  IF v_qty_changed THEN
    DELETE FROM sinker_transactions WHERE lot_id = p_id AND type = 'entry';
  END IF;

  UPDATE sinker_lots
     SET provider_id = p_provider_id,
         sinker_id = p_sinker_id,
         lot_code = NULLIF(btrim(coalesce(p_lot_code,'')),''),
         purchase_date = p_purchase_date,
         quantity = p_quantity,
         unit_price = p_unit_price,
         updated_at = now()
   WHERE id = p_id;

  IF v_qty_changed THEN
    INSERT INTO sinker_transactions(company_id, sinker_id, type, quantity, date, lot_id, provider_id, unit_price, created_by_id, created_by_name)
      VALUES (p_company_id, p_sinker_id, 'entry', p_quantity, p_purchase_date, p_id, p_provider_id, p_unit_price, p_created_by_id, p_created_by_name);
  ELSIF v_date_changed AND v_linked_entries > 0 THEN
    UPDATE sinker_transactions SET date = p_purchase_date WHERE lot_id = p_id AND type = 'entry';
  END IF;

  RETURN json_build_object('ok', true, 'id', p_id, 'created', false);
END $$;

CREATE OR REPLACE FUNCTION public.delete_sinker_lot(p_id uuid, p_company_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exits integer;
BEGIN
  PERFORM 1 FROM sinker_lots WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  SELECT count(*) INTO v_exits FROM sinker_transactions WHERE lot_id = p_id AND type = 'exit';
  IF v_exits > 0 THEN
    RAISE EXCEPTION 'Não é possível remover: existem % saída(s) vinculadas a este lote. Estorne-as antes.', v_exits;
  END IF;
  DELETE FROM sinker_transactions WHERE lot_id = p_id AND type = 'entry';
  DELETE FROM sinker_lots WHERE id = p_id AND company_id = p_company_id;
  RETURN json_build_object('ok', true);
END $$;

-- ---------- GRANTs ----------
GRANT EXECUTE ON FUNCTION public.upsert_needle_provider(uuid,uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_needle_provider(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_needle_price(uuid,uuid,uuid,uuid,numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_needle_price(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_needle_lot(uuid,uuid,uuid,uuid,text,date,integer,numeric,uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_needle_lot(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_sinker_provider(uuid,uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_sinker_provider(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_sinker_price(uuid,uuid,uuid,uuid,numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_sinker_price(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_sinker_lot(uuid,uuid,uuid,uuid,text,date,integer,numeric,uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_sinker_lot(uuid,uuid) TO anon, authenticated, service_role;
