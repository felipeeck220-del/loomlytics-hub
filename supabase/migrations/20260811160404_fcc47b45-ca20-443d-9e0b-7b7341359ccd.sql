-- REMOÇÃO DE DUPLICIDADE EM cancel_billing_order
-- O erro "Could not choose the best candidate function" ocorre devido à existência de duas funções com o mesmo nome
-- mas tipos de argumentos ligeiramente diferentes (text vs public.billing_order_status).

-- 1. Removemos todas as versões possíveis para limpar o ambiente
DROP FUNCTION IF EXISTS public.cancel_billing_order(uuid, uuid, text, public.billing_order_status, text, text, text);
DROP FUNCTION IF EXISTS public.cancel_billing_order(uuid, uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.cancel_billing_order(uuid, uuid, text);

-- 2. Recriamos a versão canônica (usando text para maior flexibilidade no RPC)
CREATE OR REPLACE FUNCTION public.cancel_billing_order(
  p_company_id uuid,
  p_id uuid,
  p_reason text,
  p_expected_status text DEFAULT NULL,
  p_reversal_quality text DEFAULT 'first',
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row public.billing_orders%ROWTYPE;
  v_is_second boolean := (COALESCE(p_reversal_quality,'first') = 'second');
  v_reason_str text;
  v_pid uuid;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  
  v_pid := public._of_current_profile_id(p_company_id);

  SELECT * INTO v_row FROM public.billing_orders WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  
  -- Comparação flexível de status (cast para text)
  IF p_expected_status IS NOT NULL AND v_row.status::text <> p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict', 'current_status', v_row.status);
  END IF;

  UPDATE public.billing_orders SET
    status = 'cancelled',
    cancelled_by = v_pid,
    cancelled_at = now(),
    cancellation_reason = p_reason,
    reverted_from = v_row.status::text,
    reversed_by   = CASE WHEN v_row.status = 'collected' THEN v_pid ELSE reversed_by END,
    reversed_at   = CASE WHEN v_row.status = 'collected' THEN now() ELSE reversed_at END,
    reversal_reason  = CASE WHEN v_row.status = 'collected' THEN p_reason ELSE reversal_reason END,
    reversal_quality = CASE WHEN v_row.status = 'collected' THEN COALESCE(p_reversal_quality,'first') ELSE reversal_quality END,
    priority = false, priority_reason = NULL, priority_at = NULL, priority_by = NULL,
    updated_at = now()
  WHERE id = p_id;

  v_reason_str := 'OF #' || v_row.of_number || ' cancelada/estornada — '
                   || CASE WHEN v_is_second THEN '2ª QUALIDADE' ELSE '1ª qualidade' END
                   || ' — ' || COALESCE(p_reason,'sem motivo');

  IF v_row.status IN ('separating','ready') THEN
    -- Estorno de reserva: devolve para 1ª qualidade sempre
    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'release', 
           GREATEST(0, SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END))::int, 
           GREATEST(0, SUM(CASE WHEN type='reserve' THEN weight_kg ELSE -weight_kg END)),
           'OF #' || v_row.of_number || ' cancelada (libera reserva)', v_pid
      FROM public.stock_movements
     WHERE billing_order_id = p_id AND type IN ('reserve','release')
     GROUP BY article_id, client_id, machine_id
    HAVING SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END) > 0;

    PERFORM public._of_restore_own_stock_and_wipe_pallets(p_company_id, p_id, v_row.of_number,
      '(OF cancelada — devolve estoque próprio)', v_pid, true);

  ELSIF v_row.status = 'collected' THEN
    -- Coletada: estorna via 'in' respeitando qualidade
    INSERT INTO public.own_stock_movements
      (company_id, own_article_id, type, pieces, weight_kg, reason, created_by)
    SELECT p_company_id, own_article_id, 'in', pieces, weight_kg,
           'OF #' || v_row.of_number || ' estornada — devolve estoque próprio (Palete ' || pallet_number || ')',
           v_pid
    FROM public.billing_order_pallets
    WHERE billing_order_id = p_id AND own_article_id IS NOT NULL;

    INSERT INTO public.stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id, type,
       pieces, weight_kg, is_second_quality, reason, created_by)
    SELECT p_company_id, article_id, client_id, machine_id, p_id, 'in',
           GREATEST(0, ROUND(SUM(pieces)))::int, GREATEST(0, SUM(weight_kg)),
           v_is_second, v_reason_str, v_pid
      FROM public.billing_order_pallets
     WHERE billing_order_id = p_id AND own_article_id IS NULL
     GROUP BY article_id, client_id, machine_id;

    IF NOT EXISTS (SELECT 1 FROM public.billing_order_pallets WHERE billing_order_id = p_id)
        AND (COALESCE(v_row.pieces_real,0) > 0 OR COALESCE(v_row.weight_real,0) > 0) THEN
      INSERT INTO public.stock_movements
        (company_id, article_id, client_id, machine_id, billing_order_id, type,
         pieces, weight_kg, is_second_quality, reason, created_by)
      VALUES (p_company_id, v_row.article_id, v_row.client_id, v_row.machine_id, p_id, 'in',
              GREATEST(0, ROUND(v_row.pieces_real))::int, GREATEST(0, v_row.weight_real),
              v_is_second, v_reason_str, v_pid);
    END IF;
  END IF;

  PERFORM public._of_audit(p_company_id, p_id, 'billing_order_cancel', p_author_name, p_author_code, 
    jsonb_build_object('of', v_row.of_number, 'from_status', v_row.status, 'reversal_quality', p_reversal_quality, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. Grants
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO authenticated, service_role;