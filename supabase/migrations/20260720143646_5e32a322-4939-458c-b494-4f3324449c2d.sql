CREATE OR REPLACE FUNCTION public.finalize_article_change_order(
  p_order_id uuid,
  p_report text,
  p_turns numeric DEFAULT NULL::numeric,
  p_holes integer DEFAULT 0,
  p_flaws integer DEFAULT 0,
  p_author_name text DEFAULT NULL::text,
  p_author_code text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order article_change_orders%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_order FROM public.article_change_orders
   WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OT % não encontrada', p_order_id USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status = 'concluida' THEN
    PERFORM public.recompute_machine_article_from_latest_ot(v_order.company_id, v_order.machine_id);
    UPDATE public.machines
       SET status = 'ativa'
     WHERE id = v_order.machine_id
       AND company_id = v_order.company_id;
    RETURN jsonb_build_object('ok', true, 'already', true,
                              'order_id', v_order.id,
                              'machine_id', v_order.machine_id,
                              'article_id', v_order.next_article_id,
                              'status', 'ativa');
  END IF;

  IF p_report IS NULL OR btrim(p_report) = '' THEN
    RAISE EXCEPTION 'Relatório final obrigatório' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.article_change_orders
     SET status = 'concluida',
         concluded_at = v_now,
         concluded_by_name = p_author_name,
         concluded_by_code = p_author_code,
         monitoring_turns = p_turns,
         piece_defects_holes = COALESCE(p_holes, 0),
         piece_defects_flaws = COALESCE(p_flaws, 0),
         final_report = btrim(p_report)
   WHERE id = v_order.id;

  IF v_order.machine_id IS NOT NULL THEN
    PERFORM public.recompute_machine_article_from_latest_ot(v_order.company_id, v_order.machine_id);
    UPDATE public.machines
       SET status = 'ativa'
     WHERE id = v_order.machine_id
       AND company_id = v_order.company_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'order_id', v_order.id,
    'machine_id', v_order.machine_id,
    'article_id', v_order.next_article_id,
    'status', 'ativa'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_article_change_order(uuid, text, numeric, int, int, text, text)
  TO anon, authenticated, service_role;