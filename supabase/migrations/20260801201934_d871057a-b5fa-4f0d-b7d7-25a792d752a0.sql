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
  v_on_machine boolean;
  v_article uuid;
  v_machine uuid;
  v_cur_pc numeric;
  v_cur_kg numeric;
BEGIN
  v_company_id := (p_payload->>'company_id')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> v_company_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_type := COALESCE(p_payload->>'type','adjust_in');
  IF v_type NOT IN ('adjust_in','adjust_out') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;

  v_on_machine := COALESCE((p_payload->>'on_machine')::boolean, false);
  v_article := (p_payload->>'article_id')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;

  v_pieces := COALESCE((p_payload->>'pieces')::int, 0);
  v_weight := COALESCE((p_payload->>'weight_kg')::numeric, 0);
  -- Motivo opcional: usa texto padrão quando vazio
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''),
                       CASE WHEN v_on_machine THEN 'Lançamento manual (palete na máquina)' ELSE 'Lançamento manual' END);

  IF v_weight <= 0 AND v_pieces <= 0 THEN
    RAISE EXCEPTION 'empty_quantities';
  END IF;
  IF v_pieces < 0 OR v_weight < 0 THEN
    RAISE EXCEPTION 'invalid_quantities';
  END IF;
  IF v_on_machine AND v_machine IS NULL THEN
    RAISE EXCEPTION 'machine_required';
  END IF;

  IF v_on_machine AND v_type = 'adjust_out' THEN
    SELECT COALESCE(SUM(CASE WHEN type='adjust_in' THEN pieces ELSE -pieces END),0),
           COALESCE(SUM(CASE WHEN type='adjust_in' THEN weight_kg ELSE -weight_kg END),0)
      INTO v_cur_pc, v_cur_kg
    FROM public.manual_stock_movements
    WHERE company_id = v_company_id AND article_id = v_article
      AND machine_id = v_machine AND on_machine = true
      AND type IN ('adjust_in','adjust_out');

    IF v_pieces > v_cur_pc OR v_weight > v_cur_kg THEN
      RAISE EXCEPTION 'insufficient_machine_stock';
    END IF;
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
  VALUES
    (v_company_id,
     v_article,
     NULLIF(p_payload->>'client_id','')::uuid,
     v_machine,
     v_type, v_pieces, v_weight, v_reason, v_profile_id, v_on_machine)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_manual_stock_manual_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;