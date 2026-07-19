CREATE OR REPLACE FUNCTION public.save_stock_manual_movement(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := (p_payload->>'company_id')::uuid;
  v_article uuid := (p_payload->>'article_id')::uuid;
  v_client uuid := NULLIF(p_payload->>'client_id','')::uuid;
  v_machine uuid := NULLIF(p_payload->>'machine_id','')::uuid;
  v_type text := p_payload->>'type';
  v_pieces int := COALESCE((p_payload->>'pieces')::int, 0);
  v_weight numeric := COALESCE((p_payload->>'weight_kg')::numeric, 0);
  v_reason text := p_payload->>'reason';
  v_created_by uuid := NULLIF(p_payload->>'created_by','')::uuid;
  v_second boolean := COALESCE((p_payload->>'is_second_quality')::boolean, false);
  v_id uuid;
BEGIN
  IF v_company IS NULL OR v_company <> get_user_company_id() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF v_type NOT IN ('adjust_in','adjust_out','in','out') THEN
    RAISE EXCEPTION 'Tipo inválido';
  END IF;
  IF v_pieces <= 0 AND v_weight <= 0 THEN
    RAISE EXCEPTION 'Informe peças ou peso';
  END IF;
  IF char_length(coalesce(v_reason,'')) < 5 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 5 caracteres)';
  END IF;

  INSERT INTO public.stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, is_second_quality)
  VALUES
    (v_company, v_article, v_client, v_machine, v_type::stock_movement_type, v_pieces, v_weight, v_reason, v_created_by, v_second)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;