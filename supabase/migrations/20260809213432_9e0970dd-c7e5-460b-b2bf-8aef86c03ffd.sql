-- Comprehensive Audit and Consistency Fixes for Billing Orders and Manual Stock
-- 2026-08-10

-- 1) Ensure _of_audit is robust and available for our updates
CREATE OR REPLACE FUNCTION public._of_audit(
  p_company_id uuid,
  p_action text,
  p_details jsonb,
  p_author_name text,
  p_author_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (company_id, user_id, user_name, user_role, user_code, action, details)
  VALUES (p_company_id, auth.uid(), p_author_name, NULL, p_author_code, p_action, COALESCE(p_details, '{}'::jsonb));
END;
$$;

-- 2) Update create_billing_order to include audit log
CREATE OR REPLACE FUNCTION public.create_billing_order(
    p_company_id uuid,
    p_payload jsonb,
    p_author_name text,
    p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
    v_of_number text;
    v_profile_id uuid;
BEGIN
    SELECT id INTO v_profile_id 
    FROM profiles 
    WHERE user_id = auth.uid() 
      AND company_id = p_company_id;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
    END IF;

    v_of_number := p_payload->>'of_number';
    IF v_of_number IS NULL OR v_of_number = '' THEN
        SELECT LPAD((COALESCE(MAX(of_number::integer), 0) + 1)::text, 3, '0')
        INTO v_of_number
        FROM billing_orders
        WHERE company_id = p_company_id
        AND of_number ~ '^[0-9]+$';
    END IF;

    IF EXISTS (SELECT 1 FROM billing_orders WHERE company_id = p_company_id AND of_number = v_of_number) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'duplicate_of_number');
    END IF;

    INSERT INTO billing_orders (
        company_id, of_number, client_id, article_id, machine_id,
        pieces_expected, weight_expected, piece_weight_target,
        dyehouse, order_type, admin_notes, created_by, multiplier
    )
    VALUES (
        p_company_id,
        v_of_number,
        (p_payload->>'client_id')::uuid,
        (p_payload->>'article_id')::uuid,
        (p_payload->>'machine_id')::uuid,
        (p_payload->>'pieces_expected')::integer,
        (p_payload->>'weight_expected')::numeric,
        (p_payload->>'piece_weight_target')::numeric,
        p_payload->>'dyehouse',
        COALESCE(p_payload->>'order_type', 'pieces'),
        p_payload->>'admin_notes',
        v_profile_id,
        (p_payload->>'multiplier')::integer
    )
    RETURNING id INTO v_id;

    -- Audit
    PERFORM public._of_audit(p_company_id, 'billing_order_create', 
        jsonb_build_object('id', v_id, 'of_number', v_of_number, 'multiplier', (p_payload->>'multiplier')::integer),
        p_author_name, p_author_code);

    RETURN jsonb_build_object('ok', true, 'id', v_id, 'of_number', v_of_number);
END;
$$;

-- 3) Update edit_billing_order to include audit log
CREATE OR REPLACE FUNCTION public.edit_billing_order(
    p_company_id uuid,
    p_id uuid,
    p_payload jsonb,
    p_note text,
    p_expected_status text,
    p_revert_to_open boolean,
    p_author_name text,
    p_author_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_status text;
    v_profile_id uuid;
    v_of_number text;
BEGIN
    SELECT id INTO v_profile_id 
    FROM profiles 
    WHERE user_id = auth.uid() 
      AND company_id = p_company_id;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
    END IF;

    SELECT status, of_number INTO v_current_status, v_of_number 
    FROM billing_orders 
    WHERE id = p_id AND company_id = p_company_id;
    
    IF p_expected_status IS NOT NULL AND v_current_status IS DISTINCT FROM p_expected_status THEN
        RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_current_status);
    END IF;

    UPDATE billing_orders
    SET
        of_number = COALESCE(p_payload->>'of_number', of_number),
        client_id = COALESCE((p_payload->>'client_id')::uuid, client_id),
        article_id = COALESCE((p_payload->>'article_id')::uuid, article_id),
        machine_id = CASE WHEN p_payload ? 'machine_id' THEN (p_payload->>'machine_id')::uuid ELSE machine_id END,
        pieces_expected = CASE WHEN p_payload ? 'pieces_expected' THEN (p_payload->>'pieces_expected')::integer ELSE pieces_expected END,
        weight_expected = CASE WHEN p_payload ? 'weight_expected' THEN (p_payload->>'weight_expected')::numeric ELSE weight_expected END,
        piece_weight_target = CASE WHEN p_payload ? 'piece_weight_target' THEN (p_payload->>'piece_weight_target')::numeric ELSE piece_weight_target END,
        dyehouse = COALESCE(p_payload->>'dyehouse', dyehouse),
        order_type = COALESCE(p_payload->>'order_type', order_type),
        admin_notes = CASE WHEN p_payload ? 'admin_notes' THEN p_payload->>'admin_notes' ELSE admin_notes END,
        multiplier = CASE WHEN p_payload ? 'multiplier' THEN (p_payload->>'multiplier')::integer ELSE multiplier END,
        status = CASE WHEN p_revert_to_open THEN 'open'::text ELSE status END,
        last_edited_by = v_profile_id,
        last_edited_at = now()
    WHERE id = p_id AND company_id = p_company_id;

    -- Audit
    PERFORM public._of_audit(p_company_id, 'billing_order_edit', 
        jsonb_build_object('id', p_id, 'of_number', v_of_number, 'note', p_note, 'revert', p_revert_to_open),
        p_author_name, p_author_code);

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4) Update save_manual_stock_manual_entry with better check and audit
CREATE OR REPLACE FUNCTION public.save_manual_stock_manual_entry(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_id uuid;
  v_type text;
  v_pieces int;
  v_weight numeric;
  v_reason text;
  v_profile_id uuid;
  v_profile_name text;
  v_profile_code text;
  v_profile_role text;
  v_on_machine boolean;
  v_article uuid;
  v_machine uuid;
  v_client uuid;
  v_article_client uuid;
  v_cur_pc numeric;
  v_cur_kg numeric;
  v_avail_pc numeric;
  v_avail_kg numeric;
  v_res_pc numeric;
  v_res_kg numeric;
BEGIN
  v_company_id := NULLIF(p_payload->>'company_id','')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_company_id IS NULL OR v_caller <> v_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id, name, code, role::text INTO v_profile_id, v_profile_name, v_profile_code, v_profile_role
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_profile_id IS NULL OR v_profile_role NOT IN ('admin','expedicao') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_type := COALESCE(NULLIF(BTRIM(p_payload->>'type'),''), '');
  IF v_type NOT IN ('adjust_in','adjust_out') THEN RAISE EXCEPTION 'invalid_type'; END IF;

  v_on_machine := COALESCE(NULLIF(p_payload->>'on_machine','')::boolean, false);
  v_article := NULLIF(p_payload->>'article_id','')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;
  v_client := NULLIF(p_payload->>'client_id','')::uuid;

  SELECT client_id INTO v_article_client
  FROM public.articles
  WHERE id = v_article AND company_id = v_company_id;
  IF v_article_client IS NULL THEN RAISE EXCEPTION 'invalid_article'; END IF;
  IF v_client IS NULL THEN v_client := v_article_client; END IF;
  
  IF v_machine IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.machines WHERE id = v_machine AND company_id = v_company_id
  ) THEN RAISE EXCEPTION 'invalid_machine'; END IF;

  v_pieces := COALESCE(NULLIF(p_payload->>'pieces','')::int, 0);
  v_weight := COALESCE(NULLIF(p_payload->>'weight_kg','')::numeric, 0);
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''),
    CASE WHEN v_on_machine THEN 'Lançamento manual (palete na máquina)' ELSE 'Lançamento manual' END);
  IF v_weight <= 0 AND v_pieces <= 0 THEN RAISE EXCEPTION 'empty_quantities'; END IF;
  IF v_pieces < 0 OR v_weight < 0 THEN RAISE EXCEPTION 'invalid_quantities'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':' || v_client::text || ':' || v_article::text || ':' || v_machine::text, 0));

  -- Verificação de saldo para Saída
  IF v_type = 'adjust_out' THEN
    -- Busca Reservas atuais (conforme get_manual_stock_estoque)
    SELECT 
      GREATEST(0, SUM(CASE WHEN m.type='reserve' THEN m.pieces ELSE -m.pieces END)),
      GREATEST(0, SUM(CASE WHEN m.type='reserve' THEN m.weight_kg ELSE -m.weight_kg END))
    INTO v_res_pc, v_res_kg
    FROM public.manual_stock_movements m
    LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id
    WHERE m.company_id = v_company_id AND m.article_id = v_article AND m.machine_id = v_machine
      AND m.type IN ('reserve','release')
      AND (m.billing_order_id IS NULL OR COALESCE(bo.status::text,'') NOT IN ('collected','cancelled'));

    -- Se for saída "em máquina"
    IF v_on_machine THEN
      SELECT 
        COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
        COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
      INTO v_cur_pc, v_cur_kg
      FROM public.manual_stock_movements m
      WHERE m.company_id = v_company_id AND m.article_id = v_article
        AND m.machine_id = v_machine AND m.on_machine = true
        AND m.type IN ('adjust_in','adjust_out');
      
      IF v_pieces > (v_cur_pc - COALESCE(v_res_pc,0)) OR v_weight > (v_cur_kg - COALESCE(v_res_kg,0)) THEN 
        RAISE EXCEPTION 'insufficient_machine_stock'; 
      END IF;
    ELSE
      -- Saída da Expedição
      WITH res_first AS (
        SELECT r.billing_order_id, MIN(r.created_at) AS first_at
        FROM public.manual_stock_movements r
        WHERE r.company_id = v_company_id AND r.article_id = v_article
          AND r.machine_id = v_machine AND r.type = 'reserve' AND r.billing_order_id IS NOT NULL
        GROUP BY 1
      ),
      ev AS (
        SELECT m.id,
          CASE WHEN m.type = 'out' AND m.billing_order_id IS NOT NULL
               THEN COALESCE(rf.first_at, m.created_at) ELSE m.created_at END AS eff_at,
          CASE
            WHEN m.type = 'adjust_in' THEN COALESCE(m.weight_kg,0)
            WHEN m.type = 'in' AND m.billing_order_id IS NOT NULL THEN COALESCE(m.weight_kg,0)
            WHEN m.type IN ('adjust_out','out') THEN -COALESCE(m.weight_kg,0)
            ELSE 0 END AS d_kg,
          CASE
            WHEN m.type = 'adjust_in' THEN COALESCE(m.pieces,0)
            WHEN m.type = 'in' AND m.billing_order_id IS NOT NULL THEN COALESCE(m.pieces,0)
            WHEN m.type IN ('adjust_out','out') THEN -COALESCE(m.pieces,0)
            ELSE 0 END AS d_pc
        FROM public.manual_stock_movements m
        LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
        LEFT JOIN res_first rf ON rf.billing_order_id = m.billing_order_id
        WHERE m.company_id = v_company_id AND m.article_id = v_article
          AND m.machine_id = v_machine
          AND (m.type IN ('adjust_in','adjust_out','out')
               OR (m.type = 'in' AND m.billing_order_id IS NOT NULL))
      ),
      tl AS (
        SELECT d_kg, d_pc,
          SUM(d_kg) OVER w AS p_kg,
          SUM(d_pc) OVER w AS p_pc
        FROM ev
        WINDOW w AS (ORDER BY eff_at, (CASE WHEN d_kg + d_pc >= 0 THEN 0 ELSE 1 END), id ROWS UNBOUNDED PRECEDING)
      )
      SELECT COALESCE(GREATEST(0, SUM(d_pc) - LEAST(0, MIN(p_pc))), 0),
             COALESCE(GREATEST(0, SUM(d_kg) - LEAST(0, MIN(p_kg))), 0)
        INTO v_cur_pc, v_cur_kg
      FROM tl;

      v_avail_pc := GREATEST(0, v_cur_pc - COALESCE(v_res_pc,0));
      v_avail_kg := GREATEST(0, v_cur_kg - COALESCE(v_res_kg,0));

      IF v_pieces > v_avail_pc OR v_weight > v_avail_kg THEN
        RAISE EXCEPTION 'insufficient_stock';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
  VALUES
    (v_company_id, v_article, v_client, v_machine, v_type, v_pieces, v_weight, v_reason, v_profile_id, v_on_machine)
  RETURNING id INTO v_id;

  -- Audit
  PERFORM public._of_audit(v_company_id, 'manual_stock_entry', 
    jsonb_build_object('id', v_id, 'type', v_type, 'pieces', v_pieces, 'weight', v_weight, 'machine', v_machine, 'on_machine', v_on_machine),
    v_profile_name, v_profile_code);

  RETURN v_id;
END;
$function$;

-- 5) Update save_manual_stock_machine_adjust with audit
CREATE OR REPLACE FUNCTION public.save_manual_stock_machine_adjust(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_article uuid;
  v_client uuid;
  v_article_client uuid;
  v_machine uuid;
  v_reason text;
  v_profile_id uuid;
  v_profile_name text;
  v_profile_code text;
  v_profile_role text;
  v_cur_pc numeric;
  v_cur_kg numeric;
  v_id uuid;
  v_set_pc int;
  v_set_kg numeric;
  v_move_all boolean;
BEGIN
  v_company_id := NULLIF(p_payload->>'company_id','')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_company_id IS NULL OR v_caller <> v_company_id THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT id, name, code, role::text INTO v_profile_id, v_profile_name, v_profile_code, v_profile_role
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_profile_id IS NULL OR v_profile_role NOT IN ('admin','expedicao') THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_article := NULLIF(p_payload->>'article_id','')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;
  v_client := NULLIF(p_payload->>'client_id','')::uuid;

  SELECT client_id INTO v_article_client FROM public.articles WHERE id = v_article AND company_id = v_company_id;
  IF v_article_client IS NULL THEN RAISE EXCEPTION 'invalid_article'; END IF;
  IF v_client IS NULL THEN v_client := v_article_client; END IF;

  v_set_pc := COALESCE(NULLIF(p_payload->>'set_pieces','')::int, 0);
  v_set_kg := COALESCE(NULLIF(p_payload->>'set_weight_kg','')::numeric, 0);
  v_move_all := COALESCE(NULLIF(p_payload->>'move_all','')::boolean, false);

  SELECT 
    COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
    COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
  INTO v_cur_pc, v_cur_kg
  FROM public.manual_stock_movements m
  WHERE m.company_id = v_company_id AND m.article_id = v_article
    AND m.machine_id = v_machine AND m.on_machine = true
    AND m.type IN ('adjust_in','adjust_out');

  IF v_move_all THEN
    IF v_cur_pc <= 0 AND v_cur_kg <= 0 THEN RAISE EXCEPTION 'no_stock_on_machine'; END IF;
    INSERT INTO public.manual_stock_movements (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', v_cur_pc, v_cur_kg, 'Transferência p/ Expedição (Total)', v_profile_id, true);
    INSERT INTO public.manual_stock_movements (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_cur_pc, v_cur_kg, 'Transferência p/ Expedição (Total)', v_profile_id, false);
    
    PERFORM public._of_audit(v_company_id, 'manual_stock_machine_move_all', 
      jsonb_build_object('article', v_article, 'machine', v_machine, 'pieces', v_cur_pc, 'weight', v_cur_kg),
      v_profile_name, v_profile_code);
  ELSE
    IF v_set_pc <> v_cur_pc THEN
        IF v_cur_pc > 0 THEN
            INSERT INTO public.manual_stock_movements (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
            VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', v_cur_pc, 0, 'Ajuste de peças na máquina', v_profile_id, true);
        END IF;
        IF v_set_pc > 0 THEN
            INSERT INTO public.manual_stock_movements (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
            VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_set_pc, 0, 'Ajuste de peças na máquina', v_profile_id, true);
        END IF;
    END IF;
    IF v_set_kg <> v_cur_kg THEN
        IF v_cur_kg > 0 THEN
            INSERT INTO public.manual_stock_movements (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
            VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', 0, v_cur_kg, 'Ajuste de peso na máquina', v_profile_id, true);
        END IF;
        IF v_set_kg > 0 THEN
            INSERT INTO public.manual_stock_movements (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
            VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', 0, v_set_kg, 'Ajuste de peso na máquina', v_profile_id, true);
        END IF;
    END IF;

    PERFORM public._of_audit(v_company_id, 'manual_stock_machine_adjust', 
      jsonb_build_object('article', v_article, 'machine', v_machine, 'set_pc', v_set_pc, 'set_kg', v_set_kg, 'old_pc', v_cur_pc, 'old_kg', v_cur_kg),
      v_profile_name, v_profile_code);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_billing_order(uuid,jsonb,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.edit_billing_order(uuid,uuid,jsonb,text,text,boolean,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) TO authenticated, service_role;
