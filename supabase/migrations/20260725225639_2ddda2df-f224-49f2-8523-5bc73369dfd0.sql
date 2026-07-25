
CREATE OR REPLACE FUNCTION public.get_billing_order_negative_warning(
  p_company_id uuid,
  p_article_id uuid,
  p_requested_pieces numeric DEFAULT 0,
  p_requested_kg numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_produced_kg numeric := 0;
  v_produced_rolls numeric := 0;
  v_adj_in_kg numeric := 0;
  v_adj_in_pc numeric := 0;
  v_adj_out_kg numeric := 0;
  v_adj_out_pc numeric := 0;
  v_in_free_kg numeric := 0;
  v_in_free_pc numeric := 0;
  v_out_kg numeric := 0;
  v_out_pc numeric := 0;
  v_in_bo_kg numeric := 0;
  v_in_bo_pc numeric := 0;
  v_reserve_kg numeric := 0;
  v_reserve_pc numeric := 0;
  v_release_kg numeric := 0;
  v_release_pc numeric := 0;
  v_stock_kg numeric;
  v_stock_pc numeric;
  v_reserved_kg numeric;
  v_reserved_pc numeric;
  v_available_kg numeric;
  v_available_pieces numeric;
  v_after_kg numeric;
  v_after_pieces numeric;
  v_article_name text;
BEGIN
  v_caller_company := public.get_user_company_id();
  IF v_caller_company IS NULL OR v_caller_company <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(weight_kg), 0), COALESCE(SUM(rolls_produced), 0)
    INTO v_produced_kg, v_produced_rolls
  FROM public.productions
  WHERE company_id = p_company_id AND article_id = p_article_id;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'adjust_in'  THEN COALESCE(weight_kg,0) END), 0),
    COALESCE(SUM(CASE WHEN type = 'adjust_in'  THEN COALESCE(pieces,0)    END), 0),
    COALESCE(SUM(CASE WHEN type = 'adjust_out' THEN COALESCE(weight_kg,0) END), 0),
    COALESCE(SUM(CASE WHEN type = 'adjust_out' THEN COALESCE(pieces,0)    END), 0),
    COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NULL THEN COALESCE(weight_kg,0) END), 0),
    COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NULL THEN COALESCE(pieces,0)    END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN COALESCE(weight_kg,0) END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN COALESCE(pieces,0)    END), 0),
    COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NOT NULL THEN COALESCE(weight_kg,0) END), 0),
    COALESCE(SUM(CASE WHEN type = 'in' AND billing_order_id IS NOT NULL THEN COALESCE(pieces,0)    END), 0),
    COALESCE(SUM(CASE WHEN type = 'reserve' THEN COALESCE(weight_kg,0) END), 0),
    COALESCE(SUM(CASE WHEN type = 'reserve' THEN COALESCE(pieces,0)    END), 0),
    COALESCE(SUM(CASE WHEN type = 'release' THEN COALESCE(weight_kg,0) END), 0),
    COALESCE(SUM(CASE WHEN type = 'release' THEN COALESCE(pieces,0)    END), 0)
  INTO
    v_adj_in_kg, v_adj_in_pc, v_adj_out_kg, v_adj_out_pc,
    v_in_free_kg, v_in_free_pc, v_out_kg, v_out_pc,
    v_in_bo_kg, v_in_bo_pc, v_reserve_kg, v_reserve_pc,
    v_release_kg, v_release_pc
  FROM public.stock_movements
  WHERE company_id = p_company_id
    AND article_id = p_article_id
    AND COALESCE(is_second_quality, false) = false;

  v_produced_kg   := v_produced_kg   + v_adj_in_kg - v_adj_out_kg + v_in_free_kg;
  v_produced_rolls := v_produced_rolls + v_adj_in_pc - v_adj_out_pc + v_in_free_pc;
  v_stock_kg := v_produced_kg - (v_out_kg - v_in_bo_kg);
  v_stock_pc := v_produced_rolls - (v_out_pc - v_in_bo_pc);
  v_reserved_kg := v_reserve_kg - v_release_kg;
  v_reserved_pc := v_reserve_pc - v_release_pc;
  v_available_kg := v_stock_kg - v_reserved_kg;
  v_available_pieces := v_stock_pc - v_reserved_pc;
  v_after_kg := v_available_kg - COALESCE(p_requested_kg, 0);
  v_after_pieces := v_available_pieces - COALESCE(p_requested_pieces, 0);

  SELECT name INTO v_article_name FROM public.articles WHERE id = p_article_id AND company_id = p_company_id;

  RETURN jsonb_build_object(
    'article_id', p_article_id,
    'article_name', COALESCE(v_article_name, 'Artigo'),
    'available_kg', v_available_kg,
    'available_pieces', v_available_pieces,
    'requested_kg', COALESCE(p_requested_kg, 0),
    'requested_pieces', COALESCE(p_requested_pieces, 0),
    'after_kg', v_after_kg,
    'after_pieces', v_after_pieces,
    'is_already_negative', (v_available_kg < 0 OR v_available_pieces < 0),
    'will_go_negative', (
      (COALESCE(p_requested_kg,0) > 0 AND v_after_kg < 0)
      OR (COALESCE(p_requested_pieces,0) > 0 AND v_after_pieces < 0)
    )
  );
END;
$$;
