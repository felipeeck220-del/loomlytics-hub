-- =========================================================
-- Pente fino Fases 1–4 rpcInvoices.md — isolamento multi-tenant
-- =========================================================

-- 1) cancel_invoice — exige que a NF pertença à empresa ativa
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_id uuid, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_type text; v_status text; v_company uuid; v_caller uuid;
BEGIN
  v_caller := public.get_user_company_id();
  SELECT type, status, company_id INTO v_type, v_status, v_company
    FROM public.invoices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_caller IS NULL OR v_company <> v_caller THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF v_type = 'entrada' THEN
    DELETE FROM public.invoices WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'deleted', true);
  ELSE
    IF v_status = 'cancelada' THEN
      RETURN jsonb_build_object('ok', true, 'already', true);
    END IF;
    UPDATE public.invoices SET status = 'cancelada' WHERE id = p_id;
    RETURN jsonb_build_object('ok', true);
  END IF;
END;
$$;

-- 2) confirm_invoice — mesma trava
CREATE OR REPLACE FUNCTION public.confirm_invoice(p_id uuid, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_status text; v_company uuid; v_caller uuid;
BEGIN
  v_caller := public.get_user_company_id();
  SELECT status, company_id INTO v_status, v_company FROM public.invoices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_caller IS NULL OR v_company <> v_caller THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF v_status = 'conferida' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  UPDATE public.invoices SET status = 'conferida' WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3) delete_yarn_type — restringe à empresa
CREATE OR REPLACE FUNCTION public.delete_yarn_type(p_id uuid, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid; v_caller uuid;
BEGIN
  v_caller := public.get_user_company_id();
  SELECT company_id INTO v_company FROM public.yarn_types WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_caller IS NULL OR v_company <> v_caller THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  DELETE FROM public.yarn_types WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4) delete_outsource_yarn_stock — restringe à empresa
CREATE OR REPLACE FUNCTION public.delete_outsource_yarn_stock(p_id uuid, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid; v_caller uuid;
BEGIN
  v_caller := public.get_user_company_id();
  SELECT company_id INTO v_company FROM public.outsource_yarn_stock WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_caller IS NULL OR v_company <> v_caller THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  DELETE FROM public.outsource_yarn_stock WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5) save_outsource_yarn_stock — travar UPDATE por empresa; INSERT valida caller
CREATE OR REPLACE FUNCTION public.save_outsource_yarn_stock(p_id uuid, p_payload jsonb, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid := (p_payload->>'company_id')::uuid;
  v_outsource uuid := NULLIF(p_payload->>'outsource_company_id','')::uuid;
  v_yarn uuid := NULLIF(p_payload->>'yarn_type_id','')::uuid;
  v_month text := p_payload->>'reference_month';
  v_qty numeric := COALESCE((p_payload->>'quantity_kg')::numeric, 0);
  v_obs text := NULLIF(p_payload->>'observations','');
  v_id uuid; v_row_company uuid; v_caller uuid;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF v_qty <= 0 THEN RAISE EXCEPTION 'Quantidade deve ser maior que zero'; END IF;

  IF p_id IS NULL THEN
    IF v_company_id IS NULL OR v_outsource IS NULL OR v_yarn IS NULL OR v_month IS NULL THEN
      RAISE EXCEPTION 'Preencha malharia, fio e mês';
    END IF;
    IF v_company_id <> v_caller THEN RAISE EXCEPTION 'Acesso negado'; END IF;
    INSERT INTO public.outsource_yarn_stock (
      company_id, outsource_company_id, yarn_type_id, reference_month, quantity_kg, observations
    ) VALUES (v_company_id, v_outsource, v_yarn, v_month, v_qty, v_obs)
    ON CONFLICT (company_id, outsource_company_id, yarn_type_id, reference_month)
    DO UPDATE SET quantity_kg = EXCLUDED.quantity_kg, observations = EXCLUDED.observations
    RETURNING id INTO v_id;
  ELSE
    SELECT company_id INTO v_row_company FROM public.outsource_yarn_stock WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    IF v_row_company <> v_caller THEN RAISE EXCEPTION 'Acesso negado'; END IF;
    UPDATE public.outsource_yarn_stock
      SET quantity_kg = v_qty, observations = v_obs
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'stock_id', v_id);
END;
$$;

-- 6) save_yarn_type — reforçar caller check
CREATE OR REPLACE FUNCTION public.save_yarn_type(p_id uuid, p_payload jsonb, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid := (p_payload->>'company_id')::uuid;
  v_name text := NULLIF(trim(p_payload->>'name'), '');
  v_id uuid; v_row_company uuid; v_caller uuid;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id obrigatório'; END IF;
  IF v_company_id <> v_caller THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Nome do fio é obrigatório'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.yarn_types (company_id, name, composition, color, observations)
    VALUES (v_company_id, v_name, NULLIF(p_payload->>'composition',''), NULLIF(p_payload->>'color',''), NULLIF(p_payload->>'observations',''))
    RETURNING id INTO v_id;
  ELSE
    SELECT company_id INTO v_row_company FROM public.yarn_types WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    IF v_row_company <> v_caller THEN RAISE EXCEPTION 'Acesso negado'; END IF;
    UPDATE public.yarn_types SET
      name = v_name,
      composition = NULLIF(p_payload->>'composition',''),
      color = NULLIF(p_payload->>'color',''),
      observations = NULLIF(p_payload->>'observations','')
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'yarn_type_id', v_id);
END;
$$;

-- 7) save_invoice — reforça caller check + validação ±5 anos + UPDATE preserva campos opcionais
CREATE OR REPLACE FUNCTION public.save_invoice(p_id uuid, p_payload jsonb, p_items jsonb, p_author_name text DEFAULT NULL, p_author_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid := (p_payload->>'company_id')::uuid;
  v_type       text := p_payload->>'type';
  v_issue_date text := p_payload->>'issue_date';
  v_access_key text := NULLIF(p_payload->>'access_key','');
  v_invoice_id uuid;
  v_row_company uuid;
  v_caller uuid;
  v_total_weight numeric := 0;
  v_total_value  numeric := 0;
  v_item jsonb;
  v_date date;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id obrigatório'; END IF;
  IF v_company_id <> v_caller THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF v_type NOT IN ('entrada','saida','venda_fio') THEN
    RAISE EXCEPTION 'Tipo de NF inválido';
  END IF;
  IF v_issue_date IS NULL OR length(v_issue_date) < 10 THEN
    RAISE EXCEPTION 'Data de emissão inválida';
  END IF;
  BEGIN
    v_date := to_date(substring(v_issue_date,1,10), 'YYYY-MM-DD');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de emissão inválida';
  END;
  IF v_date < (CURRENT_DATE - INTERVAL '5 years') OR v_date > (CURRENT_DATE + INTERVAL '5 years') THEN
    RAISE EXCEPTION 'Data fora do limite permitido (±5 anos)';
  END IF;
  IF v_access_key IS NOT NULL AND (length(v_access_key) <> 44 OR v_access_key !~ '^[0-9]+$') THEN
    RAISE EXCEPTION 'Chave de acesso deve ter 44 dígitos numéricos';
  END IF;

  IF p_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_total_weight := v_total_weight + COALESCE((v_item->>'weight_kg')::numeric, 0);
      v_total_value  := v_total_value  + COALESCE((v_item->>'weight_kg')::numeric, 0)
                                      * COALESCE((v_item->>'value_per_kg')::numeric, 0);
    END LOOP;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.invoices (
      company_id, type, invoice_number, access_key,
      client_id, client_name, buyer_name, destination_name,
      issue_date, total_weight_kg, total_value, status, observations,
      created_by_name, created_by_code
    ) VALUES (
      v_company_id, v_type,
      COALESCE(NULLIF(p_payload->>'invoice_number',''), 'S/N'),
      v_access_key,
      NULLIF(p_payload->>'client_id','')::uuid,
      NULLIF(p_payload->>'client_name',''),
      NULLIF(p_payload->>'buyer_name',''),
      NULLIF(p_payload->>'destination_name',''),
      v_issue_date, v_total_weight, v_total_value,
      COALESCE(NULLIF(p_payload->>'status',''), 'conferida'),
      NULLIF(p_payload->>'observations',''),
      COALESCE(p_author_name, NULLIF(p_payload->>'created_by_name','')),
      COALESCE(p_author_code, NULLIF(p_payload->>'created_by_code',''))
    ) RETURNING id INTO v_invoice_id;
  ELSE
    SELECT company_id INTO v_row_company FROM public.invoices WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
    IF v_row_company <> v_caller THEN RAISE EXCEPTION 'Acesso negado'; END IF;

    UPDATE public.invoices SET
      type = v_type,
      invoice_number = COALESCE(NULLIF(p_payload->>'invoice_number',''), invoice_number),
      access_key = COALESCE(v_access_key, access_key),
      client_id = COALESCE(NULLIF(p_payload->>'client_id','')::uuid, client_id),
      client_name = COALESCE(NULLIF(p_payload->>'client_name',''), client_name),
      buyer_name = COALESCE(NULLIF(p_payload->>'buyer_name',''), buyer_name),
      destination_name = COALESCE(NULLIF(p_payload->>'destination_name',''), destination_name),
      issue_date = v_issue_date,
      total_weight_kg = v_total_weight,
      total_value = v_total_value,
      status = COALESCE(NULLIF(p_payload->>'status',''), status),
      observations = COALESCE(NULLIF(p_payload->>'observations',''), observations)
    WHERE id = p_id
    RETURNING id INTO v_invoice_id;

    DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id;
  END IF;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.invoice_items (
      invoice_id, company_id,
      yarn_type_id, yarn_type_name,
      article_id, article_name,
      weight_kg, quantity_rolls, quantity_boxes,
      value_per_kg, subtotal, brand
    )
    SELECT
      v_invoice_id, v_company_id,
      NULLIF(x->>'yarn_type_id','')::uuid,
      NULLIF(x->>'yarn_type_name',''),
      NULLIF(x->>'article_id','')::uuid,
      NULLIF(x->>'article_name',''),
      COALESCE((x->>'weight_kg')::numeric, 0),
      COALESCE((x->>'quantity_rolls')::numeric, 0),
      COALESCE((x->>'quantity_boxes')::numeric, 0),
      COALESCE((x->>'value_per_kg')::numeric, 0),
      COALESCE((x->>'weight_kg')::numeric, 0) * COALESCE((x->>'value_per_kg')::numeric, 0),
      NULLIF(x->>'brand','')
    FROM jsonb_array_elements(p_items) x;
  END IF;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice_id);
END;
$$;
