-- [Manual Stock Stabilization - save_manual_stock_manual_entry]
DROP FUNCTION IF EXISTS public.save_manual_stock_manual_entry(jsonb);
CREATE OR REPLACE FUNCTION public.save_manual_stock_manual_entry(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_cur_stock_pc numeric;
  v_cur_res_pc numeric;
  v_cur_mach_pc numeric;
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

  v_pieces := COALESCE(NULLIF(p_payload->>'pieces','')::int, 0);
  v_weight := COALESCE(NULLIF(p_payload->>'weight_kg','')::numeric, 0);
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), 'Lançamento manual');

  -- Validação de saída (evitar saldo negativo)
  IF v_type = 'adjust_out' THEN
    -- Calcula saldo atual da expedição e reservas específicas da máquina
    SELECT 
      COALESCE(SUM(CASE WHEN (type = 'adjust_in' AND NOT on_machine) OR (type = 'in' AND billing_order_id IS NOT NULL) THEN pieces 
                        WHEN (type = 'adjust_out' AND NOT on_machine) OR (type = 'out') THEN -pieces 
                        ELSE 0 END), 0) as stock_pc,
      COALESCE(SUM(CASE WHEN type = 'adjust_in' AND on_machine THEN pieces 
                        WHEN type = 'adjust_out' AND on_machine THEN -pieces 
                        ELSE 0 END), 0) as mach_pc
    INTO v_cur_stock_pc, v_cur_mach_pc
    FROM public.manual_stock_movements
    WHERE company_id = v_company_id AND article_id = v_article AND machine_id = v_machine;

    SELECT COALESCE(SUM(CASE WHEN type = 'reserve' THEN pieces WHEN type = 'release' THEN -pieces ELSE 0 END), 0)
    INTO v_cur_res_pc
    FROM public.manual_stock_movements m
    WHERE company_id = v_company_id AND article_id = v_article AND machine_id = v_machine
      AND type IN ('reserve', 'release')
      AND EXISTS (SELECT 1 FROM public.billing_orders bo WHERE bo.id = m.billing_order_id AND bo.status NOT IN ('collected', 'cancelled'));

    IF v_on_machine THEN
      IF v_pieces > v_cur_mach_pc THEN RAISE EXCEPTION 'insufficient_machine_stock'; END IF;
    ELSE
      -- Na expedição, não pode sair o que está reservado
      IF v_pieces > GREATEST(0, v_cur_stock_pc - v_cur_res_pc) THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
    END IF;
  END IF;

  INSERT INTO public.manual_stock_movements (
    company_id, article_id, client_id, machine_id,
    type, pieces, weight_kg, reason, created_by, on_machine
  ) VALUES (
    v_company_id, v_article, v_client, v_machine,
    v_type, v_pieces, v_weight, v_reason, v_profile_id, v_on_machine
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

-- [Manual Stock Stabilization - save_manual_stock_machine_adjust]
DROP FUNCTION IF EXISTS public.save_manual_stock_machine_adjust(jsonb);
CREATE OR REPLACE FUNCTION public.save_manual_stock_machine_adjust(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), 'Ajuste de palete na máquina');

  -- Saldo atual em máquina
  SELECT
    COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
    COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
  INTO v_cur_pc, v_cur_kg
  FROM public.manual_stock_movements m
  WHERE m.company_id = v_company_id AND m.article_id = v_article
    AND m.machine_id = v_machine AND m.on_machine = true;

  -- 1) Zerar o palete na máquina (independente do modo)
  IF v_cur_pc > 0 OR v_cur_kg > 0 THEN
    INSERT INTO public.manual_stock_movements (
      company_id, article_id, client_id, machine_id,
      type, pieces, weight_kg, reason, created_by, on_machine
    ) VALUES (
      v_company_id, v_article, v_client, v_machine,
      'adjust_out', v_cur_pc, v_cur_kg, v_reason, v_profile_id, true
    );
  END IF;

  -- 2) Se move_all, lança o novo valor na EXPEDIÇÃO. Caso contrário, lança o novo valor na MÁQUINA.
  IF v_set_pc > 0 OR v_set_kg > 0 THEN
    INSERT INTO public.manual_stock_movements (
      company_id, article_id, client_id, machine_id,
      type, pieces, weight_kg, reason, created_by, on_machine
    ) VALUES (
      v_company_id, v_article, v_client, v_machine,
      'adjust_in', v_set_pc, v_set_kg, v_reason, v_profile_id, NOT v_move_all
    ) RETURNING id INTO v_id;
  END IF;

  RETURN COALESCE(v_id, gen_random_uuid());
END;
$fn$;

-- Final Grants
REVOKE EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) TO authenticated, service_role;
