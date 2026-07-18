
-- ============================================================
-- rpcmecanica Fase 3 — Escritas atômicas (OM/OC/OT)
-- Objetivo: eliminar bug "status travado" e garantir consistência
-- ============================================================

-- 1) finalize_maintenance_order --------------------------------
CREATE OR REPLACE FUNCTION public.finalize_maintenance_order(
  p_order_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_finish_notes text DEFAULT NULL,
  p_author_name text DEFAULT NULL,
  p_author_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order maintenance_orders%ROWTYPE;
  v_machine machines%ROWTYPE;
  v_now timestamptz := now();
  v_seconds int;
  v_local_date date := (v_now AT TIME ZONE 'America/Sao_Paulo')::date;
  v_is_dupla boolean;
  v_item jsonb;
  v_item_type text;
  v_qty int;
  v_ref_id uuid;
  v_desc text;
  v_position text;
  v_prev_cyl uuid;
  v_new_log_id uuid;
  v_items_count int := 0;
BEGIN
  -- Lock + idempotência
  SELECT * INTO v_order FROM public.maintenance_orders
   WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem % não encontrada', p_order_id USING ERRCODE = 'P0002';
  END IF;
  IF v_order.status = 'finalizada' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'order_id', v_order.id,
                              'machine_id', v_order.machine_id, 'machine_status', 'ativa');
  END IF;
  IF v_order.started_at IS NULL THEN
    RAISE EXCEPTION 'Ordem % não foi iniciada', p_order_id USING ERRCODE = 'P0001';
  END IF;

  v_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_order.started_at))::int);

  -- Fecha o machine_log da manutenção (se houver)
  IF v_order.machine_log_id IS NOT NULL THEN
    UPDATE public.machine_logs
       SET ended_at = v_now,
           ended_by_name = p_author_name
     WHERE id = v_order.machine_log_id
       AND ended_at IS NULL;
  END IF;

  -- Reativa a máquina
  SELECT * INTO v_machine FROM public.machines WHERE id = v_order.machine_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Máquina % não encontrada', v_order.machine_id USING ERRCODE = 'P0002';
  END IF;
  v_is_dupla := (v_machine.machine_type = 'dupla');

  UPDATE public.machines
     SET status = 'ativa',
         last_needle_change_at = CASE WHEN v_order.type = 'troca_agulhas' THEN v_now ELSE last_needle_change_at END
   WHERE id = v_order.machine_id;

  -- Abre novo log 'ativa'
  INSERT INTO public.machine_logs(machine_id, company_id, status, started_at, started_by_name)
  VALUES (v_order.machine_id, v_order.company_id, 'ativa', v_now, p_author_name)
  RETURNING id INTO v_new_log_id;

  -- Atualiza a OM
  UPDATE public.maintenance_orders
     SET status = 'finalizada',
         finished_at = v_now,
         finished_by_id = p_author_user_id,
         finished_by_name = p_author_name,
         duration_seconds = v_seconds,
         finish_notes = NULLIF(p_finish_notes, '')
   WHERE id = v_order.id;

  -- Itens + efeitos colaterais (transações de estoque, refs, cilindros)
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      v_item_type := v_item->>'item_type';
      v_qty := COALESCE((v_item->>'quantity')::int, 0);
      v_ref_id := NULLIF(v_item->>'ref_id','')::uuid;
      v_desc := NULLIF(v_item->>'description','');
      IF v_qty <= 0 OR (v_ref_id IS NULL AND v_desc IS NULL) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.maintenance_order_items(
        company_id, order_id, item_type,
        needle_id, sinker_id, cylinder_id,
        description, quantity
      ) VALUES (
        v_order.company_id, v_order.id, v_item_type,
        CASE WHEN v_item_type = 'agulha'   THEN v_ref_id ELSE NULL END,
        CASE WHEN v_item_type = 'platina'  THEN v_ref_id ELSE NULL END,
        CASE WHEN v_item_type = 'cilindro' THEN v_ref_id ELSE NULL END,
        v_desc, v_qty
      );
      v_items_count := v_items_count + 1;

      IF v_item_type = 'agulha' AND v_ref_id IS NOT NULL THEN
        INSERT INTO public.needle_transactions(
          company_id, needle_id, type, exit_mode, quantity, date, machine_id,
          created_by_id, created_by_name
        ) VALUES (
          v_order.company_id, v_ref_id, 'exit', 'reposicao', v_qty, v_local_date,
          v_order.machine_id, p_author_user_id, p_author_name
        );
        v_position := CASE WHEN v_is_dupla THEN 'cilindro' ELSE 'mono' END;
        DELETE FROM public.machine_needle_refs
         WHERE machine_id = v_order.machine_id AND position = v_position;
        INSERT INTO public.machine_needle_refs(company_id, machine_id, needle_id, position)
        VALUES (v_order.company_id, v_order.machine_id, v_ref_id, v_position);

      ELSIF v_item_type = 'platina' AND v_ref_id IS NOT NULL THEN
        INSERT INTO public.sinker_transactions(
          company_id, sinker_id, type, exit_mode, quantity, date, machine_id,
          created_by_id, created_by_name
        ) VALUES (
          v_order.company_id, v_ref_id, 'exit', 'troca_platinas', v_qty, v_local_date,
          v_order.machine_id, p_author_user_id, p_author_name
        );
        IF NOT EXISTS (
          SELECT 1 FROM public.machine_sinker_refs
           WHERE machine_id = v_order.machine_id AND sinker_id = v_ref_id
        ) THEN
          INSERT INTO public.machine_sinker_refs(company_id, machine_id, sinker_id)
          VALUES (v_order.company_id, v_order.machine_id, v_ref_id);
        END IF;

      ELSIF v_item_type = 'cilindro' AND v_ref_id IS NOT NULL THEN
        v_prev_cyl := v_machine.cylinder_id;
        IF v_prev_cyl IS NOT NULL AND v_prev_cyl <> v_ref_id THEN
          UPDATE public.cylinders SET machine_id = NULL WHERE id = v_prev_cyl;
        END IF;
        UPDATE public.machines SET cylinder_id = NULL
         WHERE company_id = v_order.company_id
           AND cylinder_id = v_ref_id
           AND id <> v_order.machine_id;
        UPDATE public.machines SET cylinder_id = v_ref_id WHERE id = v_order.machine_id;
        UPDATE public.cylinders SET machine_id = v_order.machine_id WHERE id = v_ref_id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'order_id', v_order.id,
    'machine_id', v_order.machine_id,
    'machine_status', 'ativa',
    'duration_seconds', v_seconds,
    'items_inserted', v_items_count,
    'new_log_id', v_new_log_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_maintenance_order(uuid, jsonb, text, text, uuid)
  TO anon, authenticated, service_role;

-- 2) finalize_article_change_order -----------------------------
CREATE OR REPLACE FUNCTION public.finalize_article_change_order(
  p_order_id uuid,
  p_report text,
  p_turns numeric DEFAULT NULL,
  p_holes int DEFAULT 0,
  p_flaws int DEFAULT 0,
  p_author_name text DEFAULT NULL,
  p_author_code text DEFAULT NULL
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
    RETURN jsonb_build_object('ok', true, 'already', true,
                              'order_id', v_order.id,
                              'machine_id', v_order.machine_id,
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
    IF v_order.next_article_id IS NOT NULL THEN
      UPDATE public.machines
         SET article_id = v_order.next_article_id,
             status = 'ativa'
       WHERE id = v_order.machine_id;
    ELSE
      UPDATE public.machines
         SET status = 'ativa'
       WHERE id = v_order.machine_id;
    END IF;
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
