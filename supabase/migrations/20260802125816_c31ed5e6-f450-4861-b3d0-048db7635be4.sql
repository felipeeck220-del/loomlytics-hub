-- 1) Movimentações: ordenação determinística + filtro de cliente com fallback no artigo
CREATE OR REPLACE FUNCTION public.get_manual_stock_movements(
  p_company_id uuid,
  p_type text DEFAULT 'all',
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_client_id uuid DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_of_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_caller uuid;
  v_total bigint;
  v_rows jsonb;
  v_offset int;
  v_size int;
  v_of text;
BEGIN
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object('rows','[]'::jsonb,'total_count',0);
  END IF;

  v_size := GREATEST(1, LEAST(COALESCE(p_page_size,20), 200));
  v_offset := GREATEST(0, (COALESCE(p_page,1)-1) * v_size);
  v_of := NULLIF(BTRIM(COALESCE(p_of_search,'')), '');

  SELECT COUNT(*) INTO v_total
  FROM public.manual_stock_movements m
  LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id AND bo.company_id = p_company_id
  LEFT JOIN public.articles ar0 ON ar0.id = m.article_id AND ar0.company_id = p_company_id
  WHERE m.company_id = p_company_id
    AND (p_type = 'all' OR m.type = p_type)
    AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
    AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
    AND (p_client_id  IS NULL OR COALESCE(m.client_id, ar0.client_id) = p_client_id)
    AND (p_article_id IS NULL OR m.article_id = p_article_id)
    AND (v_of IS NULL OR bo.of_number ILIKE '%' || v_of || '%');

  SELECT COALESCE(jsonb_agg(row_json ORDER BY created_at DESC, id DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT m.created_at, m.id,
      jsonb_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'type', m.type,
        'on_machine', COALESCE(m.on_machine,false),
        'weight_kg', m.weight_kg,
        'pieces', m.pieces,
        'reason', m.reason,
        'author', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('name', pr.name, 'code', pr.code) END,
        'billing_order', CASE WHEN bo.id IS NULL THEN NULL ELSE jsonb_build_object('id', bo.id, 'of_number', bo.of_number) END,
        'client', CASE WHEN cl.id IS NULL THEN NULL ELSE jsonb_build_object('id', cl.id, 'name', cl.name) END,
        'article', CASE WHEN ar.id IS NULL THEN NULL ELSE jsonb_build_object('id', ar.id, 'name', ar.name) END,
        'machine', CASE WHEN mac.id IS NULL THEN NULL ELSE jsonb_build_object('id', mac.id, 'name', mac.name) END
      ) AS row_json
    FROM public.manual_stock_movements m
    LEFT JOIN public.profiles pr ON pr.id = m.created_by
    LEFT JOIN public.billing_orders bo ON bo.id = m.billing_order_id AND bo.company_id = p_company_id
    LEFT JOIN public.articles ar ON ar.id = m.article_id AND ar.company_id = p_company_id
    LEFT JOIN public.clients cl ON cl.id = COALESCE(m.client_id, ar.client_id) AND cl.company_id = p_company_id
    LEFT JOIN public.machines mac ON mac.id = m.machine_id AND mac.company_id = p_company_id
    WHERE m.company_id = p_company_id
      AND (p_type = 'all' OR m.type = p_type)
      AND (p_from IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_from)
      AND (p_to   IS NULL OR (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= p_to)
      AND (p_client_id  IS NULL OR COALESCE(m.client_id, ar.client_id) = p_client_id)
      AND (p_article_id IS NULL OR m.article_id = p_article_id)
      AND (v_of IS NULL OR bo.of_number ILIKE '%' || v_of || '%')
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_size OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object('rows', v_rows, 'total_count', v_total);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_manual_stock_movements(uuid,text,date,date,integer,integer,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_movements(uuid,text,date,date,integer,integer,uuid,uuid,text) TO authenticated, service_role;

-- 2) Espelhamento: preencher cliente pelo artigo quando ausente
CREATE OR REPLACE FUNCTION public.mirror_of_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_client uuid;
BEGIN
  IF COALESCE(NEW.is_second_quality, false) IS TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.type::text IN ('reserve','release','out')
     OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
  THEN
    v_client := NEW.client_id;
    IF v_client IS NULL THEN
      SELECT a.client_id INTO v_client FROM public.articles a
      WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id;
    END IF;

    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, billing_order_id,
       type, pieces, weight_kg, reason, source_movement_id, created_by, created_at)
    VALUES
      (NEW.company_id, NEW.article_id, v_client, NEW.machine_id, NEW.billing_order_id,
       NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
       NEW.reason, NEW.id, NEW.created_by, NEW.created_at)
    ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.mirror_of_update_to_manual_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_should_mirror boolean;
  v_client uuid;
BEGIN
  v_should_mirror := COALESCE(NEW.is_second_quality, false) = false
    AND (
      NEW.type::text IN ('reserve','release','out')
      OR (NEW.type::text = 'in' AND NEW.billing_order_id IS NOT NULL)
    );

  IF NOT v_should_mirror THEN
    DELETE FROM public.manual_stock_movements WHERE source_movement_id = OLD.id;
    RETURN NEW;
  END IF;

  v_client := NEW.client_id;
  IF v_client IS NULL THEN
    SELECT a.client_id INTO v_client FROM public.articles a
    WHERE a.id = NEW.article_id AND a.company_id = NEW.company_id;
  END IF;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, billing_order_id,
     type, pieces, weight_kg, reason, source_movement_id, created_by, created_at)
  VALUES
    (NEW.company_id, NEW.article_id, v_client, NEW.machine_id, NEW.billing_order_id,
     NEW.type::text, COALESCE(NEW.pieces,0), COALESCE(NEW.weight_kg,0),
     NEW.reason, NEW.id, NEW.created_by, NEW.created_at)
  ON CONFLICT (source_movement_id) WHERE source_movement_id IS NOT NULL
  DO UPDATE SET
    company_id = EXCLUDED.company_id,
    article_id = EXCLUDED.article_id,
    client_id = EXCLUDED.client_id,
    machine_id = EXCLUDED.machine_id,
    billing_order_id = EXCLUDED.billing_order_id,
    type = EXCLUDED.type,
    pieces = EXCLUDED.pieces,
    weight_kg = EXCLUDED.weight_kg,
    reason = EXCLUDED.reason,
    created_by = EXCLUDED.created_by,
    created_at = EXCLUDED.created_at;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mirror_of_to_manual_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mirror_of_update_to_manual_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mirror_of_delete_to_manual_stock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_of_to_manual_stock() TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_of_update_to_manual_stock() TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_of_delete_to_manual_stock() TO service_role;

-- 3) Palete na máquina: transferência preserva a unidade não informada
CREATE OR REPLACE FUNCTION public.save_manual_stock_machine_adjust(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_profile_role text;
  v_cur_pc numeric;
  v_cur_kg numeric;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_set_pc int;
  v_set_kg numeric;
  v_move_all boolean;
  v_d_pc numeric;
  v_d_kg numeric;
BEGIN
  v_company_id := NULLIF(p_payload->>'company_id','')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_company_id IS NULL OR v_caller <> v_company_id THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT id, role::text INTO v_profile_id, v_profile_role
  FROM public.profiles
  WHERE company_id = v_company_id AND user_id = auth.uid()
  LIMIT 1;
  IF v_profile_id IS NULL OR v_profile_role NOT IN ('admin','expedicao') THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_article := NULLIF(p_payload->>'article_id','')::uuid;
  v_client := NULLIF(p_payload->>'client_id','')::uuid;
  v_machine := NULLIF(p_payload->>'machine_id','')::uuid;

  SELECT client_id INTO v_article_client
  FROM public.articles
  WHERE id = v_article AND company_id = v_company_id;
  IF v_article_client IS NULL THEN RAISE EXCEPTION 'invalid_article'; END IF;
  IF v_client IS NULL THEN v_client := v_article_client; END IF;
  IF v_client <> v_article_client OR NOT EXISTS (
    SELECT 1 FROM public.clients WHERE id = v_client AND company_id = v_company_id
  ) THEN RAISE EXCEPTION 'invalid_client'; END IF;
  IF v_machine IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.machines WHERE id = v_machine AND company_id = v_company_id
  ) THEN RAISE EXCEPTION 'invalid_machine'; END IF;

  IF NOT (p_payload ? 'set_pieces') AND NOT (p_payload ? 'set_weight_kg') THEN
    RAISE EXCEPTION 'legacy_payload_not_supported';
  END IF;
  v_set_pc := COALESCE(NULLIF(p_payload->>'set_pieces','')::int, 0);
  v_set_kg := COALESCE(NULLIF(p_payload->>'set_weight_kg','')::numeric, 0);
  v_move_all := COALESCE(NULLIF(p_payload->>'move_all','')::boolean, false);
  IF v_set_pc < 0 OR v_set_kg < 0 THEN RAISE EXCEPTION 'invalid_quantities'; END IF;
  IF v_move_all AND v_set_pc <= 0 AND v_set_kg <= 0 THEN RAISE EXCEPTION 'empty_quantities'; END IF;
  v_reason := COALESCE(NULLIF(BTRIM(p_payload->>'reason'),''), 'Ajuste de palete na máquina');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':' || v_client::text || ':' || v_article::text || ':' || v_machine::text, 0));

  SELECT COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.pieces ELSE -m.pieces END),0),
         COALESCE(SUM(CASE WHEN m.type='adjust_in' THEN m.weight_kg ELSE -m.weight_kg END),0)
    INTO v_cur_pc, v_cur_kg
  FROM public.manual_stock_movements m
  LEFT JOIN public.articles a ON a.id = m.article_id AND a.company_id = v_company_id
  WHERE m.company_id = v_company_id AND m.article_id = v_article
    AND m.machine_id = v_machine AND m.on_machine = true
    AND m.type IN ('adjust_in','adjust_out')
    AND COALESCE(m.client_id, a.client_id) = v_client;

  -- Em transferência integral, não zerar a unidade que o usuário não informou
  IF v_move_all THEN
    IF v_set_pc = 0 AND v_cur_pc > 0 THEN v_set_pc := GREATEST(0, v_cur_pc)::int; END IF;
    IF v_set_kg = 0 AND v_cur_kg > 0 THEN v_set_kg := GREATEST(0, v_cur_kg); END IF;
  END IF;

  v_d_pc := v_set_pc - v_cur_pc;
  v_d_kg := v_set_kg - v_cur_kg;

  IF v_d_pc > 0 OR v_d_kg > 0 THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', GREATEST(0,v_d_pc)::int,
      GREATEST(0,v_d_kg), 'Recontagem do palete na máquina: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF v_d_pc < 0 OR v_d_kg < 0 THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', GREATEST(0,-v_d_pc)::int,
      GREATEST(0,-v_d_kg), 'Recontagem do palete na máquina: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF v_move_all THEN
    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_in', v_set_pc, v_set_kg,
      'Recebido da máquina: ' || v_reason, v_profile_id, false)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;

    INSERT INTO public.manual_stock_movements
      (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by, on_machine)
    VALUES (v_company_id, v_article, v_client, v_machine, 'adjust_out', v_set_pc, v_set_kg,
      'Transferência p/ expedição: ' || v_reason, v_profile_id, true)
    RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END IF;

  IF array_length(v_ids,1) IS NULL THEN RAISE EXCEPTION 'empty_quantities'; END IF;
  RETURN jsonb_build_object('ok',true,'ids',to_jsonb(v_ids),'mode','set');
END;
$fn$;

REVOKE ALL ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_machine_adjust(jsonb) TO authenticated, service_role;