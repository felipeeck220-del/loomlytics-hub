
CREATE OR REPLACE FUNCTION public.save_client_invoice(
  p_id uuid,
  p_payload jsonb,
  p_items jsonb,
  p_exit_links jsonb,
  p_author_name text,
  p_author_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_company uuid := public.get_user_company_id();
  v_company     uuid;
  v_client      uuid;
  v_type        text;
  v_invoice_no  text;
  v_issue_date  date;
  v_obs         text;
  v_parent      uuid;
  v_supplier    text;
  v_item        jsonb;
  v_weight      numeric;
  v_yarn        uuid;
  v_article     uuid;
  v_row_company uuid;
  v_new_id      uuid;
  v_action      text;
  v_links_count int := 0;
  v_total_ded   numeric := 0;
  v_dup_count   int;
  v_bad_entries int;
BEGIN
  IF v_user_company IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário sem empresa';
  END IF;

  v_company    := (p_payload->>'company_id')::uuid;
  v_client     := (p_payload->>'client_id')::uuid;
  v_type       := p_payload->>'type';
  v_invoice_no := p_payload->>'invoice_number';
  v_issue_date := (p_payload->>'issue_date')::date;
  v_obs        := NULLIF(p_payload->>'observations','');
  v_parent     := NULLIF(p_payload->>'parent_invoice_id','')::uuid;
  v_supplier   := NULLIF(p_payload->>'supplier_name','');

  IF v_type NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'Tipo inválido';
  END IF;
  IF v_invoice_no IS NULL OR length(trim(v_invoice_no))=0 THEN
    RAISE EXCEPTION 'Número da NF é obrigatório';
  END IF;
  IF v_issue_date < (CURRENT_DATE - INTERVAL '5 years')::date
     OR v_issue_date > (CURRENT_DATE + INTERVAL '5 years')::date THEN
    RAISE EXCEPTION 'Data de emissão fora do intervalo permitido (±5 anos)';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) <> 1 THEN
    RAISE EXCEPTION 'Item da nota é obrigatório (exatamente 1)';
  END IF;
  v_item   := p_items->0;
  v_weight := COALESCE((v_item->>'weight_kg')::numeric, 0);
  v_yarn   := NULLIF(v_item->>'yarn_type_id','')::uuid;
  v_article:= NULLIF(v_item->>'article_id','')::uuid;
  IF v_weight <= 0 THEN
    RAISE EXCEPTION 'Peso do item deve ser maior que zero';
  END IF;
  IF v_type = 'entrada' AND v_yarn IS NULL THEN
    RAISE EXCEPTION 'Entrada exige tipo de fio';
  END IF;
  IF v_type = 'saida' AND v_article IS NULL THEN
    RAISE EXCEPTION 'Saída exige artigo';
  END IF;

  -- valida vínculos para saída
  IF v_type = 'saida' THEN
    IF p_exit_links IS NULL OR jsonb_typeof(p_exit_links) <> 'array' THEN
      RAISE EXCEPTION 'Vínculos de saída inválidos';
    END IF;

    SELECT count(*), COALESCE(SUM((l->>'deduct_kg')::numeric), 0)
      INTO v_links_count, v_total_ded
      FROM jsonb_array_elements(p_exit_links) l
     WHERE NULLIF(l->>'entry_invoice_id','') IS NOT NULL
       AND COALESCE((l->>'deduct_kg')::numeric, 0) > 0;

    IF v_links_count = 0 THEN
      RAISE EXCEPTION 'Selecione ao menos uma NF de entrada para descontar';
    END IF;
    IF v_total_ded - v_weight > 0.001 THEN
      RAISE EXCEPTION 'Total descontado maior que o peso da saída';
    END IF;

    SELECT count(*) - count(DISTINCT (l->>'entry_invoice_id')::uuid)
      INTO v_dup_count
      FROM jsonb_array_elements(p_exit_links) l
     WHERE NULLIF(l->>'entry_invoice_id','') IS NOT NULL
       AND COALESCE((l->>'deduct_kg')::numeric, 0) > 0;
    IF v_dup_count > 0 THEN
      RAISE EXCEPTION 'NFs de entrada duplicadas na lista de descontos';
    END IF;

    SELECT count(*) INTO v_bad_entries
      FROM jsonb_array_elements(p_exit_links) l
     WHERE NULLIF(l->>'entry_invoice_id','') IS NOT NULL
       AND COALESCE((l->>'deduct_kg')::numeric, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.client_invoices ci
          WHERE ci.id = (l->>'entry_invoice_id')::uuid
            AND ci.company_id = v_user_company
            AND ci.client_id  = v_client
            AND ci.type       = 'entrada'
       );
    IF v_bad_entries > 0 THEN
      RAISE EXCEPTION 'Uma ou mais NFs de entrada não pertencem a este cliente/empresa';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    IF v_company IS NULL OR v_company <> v_user_company THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
    INSERT INTO public.client_invoices
      (company_id, client_id, type, invoice_number, issue_date, observations,
       parent_invoice_id, supplier_name, composition, created_by_name, created_by_code)
    VALUES
      (v_user_company, v_client, v_type::client_invoice_type, v_invoice_no, v_issue_date, v_obs,
       v_parent, CASE WHEN v_type='entrada' THEN v_supplier ELSE NULL END, NULL,
       p_author_name, p_author_code)
    RETURNING id INTO v_new_id;
    v_action := 'created';
  ELSE
    SELECT company_id INTO v_row_company
      FROM public.client_invoices WHERE id = p_id FOR UPDATE;
    IF v_row_company IS NULL THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'id', p_id);
    END IF;
    IF v_row_company <> v_user_company THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
    UPDATE public.client_invoices
       SET client_id      = v_client,
           type           = v_type::client_invoice_type,
           invoice_number = v_invoice_no,
           issue_date     = v_issue_date,
           observations   = v_obs,
           parent_invoice_id = v_parent,
           supplier_name  = CASE WHEN v_type='entrada' THEN v_supplier ELSE NULL END,
           composition    = NULL,
           updated_at     = now()
     WHERE id = p_id;
    v_new_id := p_id;
    v_action := 'updated';
  END IF;

  -- item único: sempre delete+insert para simplicidade
  DELETE FROM public.client_invoice_items WHERE invoice_id = v_new_id;
  INSERT INTO public.client_invoice_items (invoice_id, company_id, yarn_type_id, article_id, weight_kg)
  VALUES (v_new_id, v_user_company,
          CASE WHEN v_type='entrada' THEN v_yarn ELSE NULL END,
          CASE WHEN v_type='saida'   THEN v_article ELSE NULL END,
          v_weight);

  -- vínculos: apaga tudo e reinsere quando saída
  DELETE FROM public.client_invoice_exit_links WHERE exit_invoice_id = v_new_id;
  IF v_type = 'saida' THEN
    INSERT INTO public.client_invoice_exit_links
      (company_id, exit_invoice_id, entry_invoice_id, yarn_type_id, deduct_kg)
    SELECT v_user_company,
           v_new_id,
           (l->>'entry_invoice_id')::uuid,
           NULLIF(l->>'yarn_type_id','')::uuid,
           (l->>'deduct_kg')::numeric
      FROM jsonb_array_elements(p_exit_links) l
     WHERE NULLIF(l->>'entry_invoice_id','') IS NOT NULL
       AND COALESCE((l->>'deduct_kg')::numeric, 0) > 0;
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false, 'id', v_new_id, 'action', v_action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_client_invoice(uuid, jsonb, jsonb, jsonb, text, text)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_client_invoice(
  p_id uuid,
  p_author_name text,
  p_author_code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_company uuid := public.get_user_company_id();
  v_row_company  uuid;
  v_row_type     text;
  v_links_count  int := 0;
  v_legacy_count int := 0;
  v_cascade      int := 0;
BEGIN
  IF v_user_company IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário sem empresa';
  END IF;

  SELECT company_id, type::text INTO v_row_company, v_row_type
    FROM public.client_invoices WHERE id = p_id FOR UPDATE;

  IF v_row_company IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'cascade_count', 0);
  END IF;
  IF v_row_company <> v_user_company THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_row_type = 'entrada' THEN
    SELECT count(DISTINCT exit_invoice_id) INTO v_links_count
      FROM public.client_invoice_exit_links
     WHERE entry_invoice_id = p_id AND company_id = v_user_company;

    SELECT count(*) INTO v_legacy_count
      FROM public.client_invoices s
     WHERE s.parent_invoice_id = p_id
       AND s.company_id = v_user_company
       AND s.type = 'saida'
       AND NOT EXISTS (
         SELECT 1 FROM public.client_invoice_exit_links l
          WHERE l.entry_invoice_id = p_id AND l.exit_invoice_id = s.id
       );
    v_cascade := v_links_count + v_legacy_count;
  END IF;

  DELETE FROM public.client_invoices WHERE id = p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'cascade_count', v_cascade,
    'was_parent', (v_cascade > 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_invoice(uuid, text, text)
  TO anon, authenticated, service_role;
