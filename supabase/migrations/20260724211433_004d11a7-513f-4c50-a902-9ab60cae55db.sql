
-- 1) Adiciona o novo status de máquina ao enum
ALTER TYPE public.machine_status ADD VALUE IF NOT EXISTS 'manutencao_eletrica';

-- 2) Novas colunas em maintenance_orders
ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS oe_number integer,
  ADD COLUMN IF NOT EXISTS escalated_from_oc_id uuid REFERENCES public.maintenance_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escalated_to_oe_id uuid REFERENCES public.maintenance_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_orders_oe_company
  ON public.maintenance_orders(company_id, oe_number) WHERE type = 'manutencao_eletrica';

-- 3) Amplia trigger de numeração para gerar oe_number quando type = manutencao_eletrica
CREATE OR REPLACE FUNCTION public.assign_om_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type = 'manutencao_corretiva' THEN
    IF NEW.oc_number IS NULL OR NEW.oc_number = 0 THEN
      SELECT COALESCE(MAX(oc_number), 0) + 1
        INTO NEW.oc_number
        FROM public.maintenance_orders
        WHERE company_id = NEW.company_id
          AND type = 'manutencao_corretiva';
    END IF;
    NEW.om_number := NULL;
    NEW.oe_number := NULL;
  ELSIF NEW.type = 'manutencao_eletrica' THEN
    IF NEW.oe_number IS NULL OR NEW.oe_number = 0 THEN
      SELECT COALESCE(MAX(oe_number), 0) + 1
        INTO NEW.oe_number
        FROM public.maintenance_orders
        WHERE company_id = NEW.company_id
          AND type = 'manutencao_eletrica';
    END IF;
    NEW.om_number := NULL;
    NEW.oc_number := NULL;
  ELSE
    IF NEW.om_number IS NULL OR NEW.om_number = 0 THEN
      SELECT COALESCE(MAX(om_number), 0) + 1
        INTO NEW.om_number
        FROM public.maintenance_orders
        WHERE company_id = NEW.company_id
          AND type NOT IN ('manutencao_corretiva','manutencao_eletrica');
    END IF;
    NEW.oe_number := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) RPC de escalonamento OC → OE (atômica)
CREATE OR REPLACE FUNCTION public.escalate_oc_to_oe(
  p_oc_id uuid,
  p_description text,
  p_photos jsonb DEFAULT '[]'::jsonb,
  p_author_name text DEFAULT NULL,
  p_author_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_oc maintenance_orders%ROWTYPE;
  v_now timestamptz := now();
  v_seconds int;
  v_new_log_id uuid;
  v_oe_id uuid;
  v_oe_number int;
  v_finish_notes text;
BEGIN
  SELECT * INTO v_oc FROM public.maintenance_orders
    WHERE id = p_oc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC % não encontrada', p_oc_id USING ERRCODE = 'P0002';
  END IF;
  IF v_oc.type <> 'manutencao_corretiva' THEN
    RAISE EXCEPTION 'Ordem % não é uma OC', p_oc_id USING ERRCODE = 'P0001';
  END IF;
  IF v_oc.status <> 'em_curso' THEN
    RAISE EXCEPTION 'OC % precisa estar em curso para escalonar', p_oc_id USING ERRCODE = 'P0001';
  END IF;
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'Descrição do problema elétrico é obrigatória' USING ERRCODE = 'P0001';
  END IF;

  -- 1) Cria a OE já em curso, vinculada à OC
  INSERT INTO public.maintenance_orders(
    company_id, machine_id, type, priority, status, description,
    created_by_id, created_by_name,
    started_at, started_by_id, started_by_name,
    escalated_from_oc_id, oc_photos, progress_notes
  ) VALUES (
    v_oc.company_id, v_oc.machine_id, 'manutencao_eletrica', 'prioritaria', 'em_curso',
    p_description,
    p_author_user_id, p_author_name,
    v_now, p_author_user_id, p_author_name,
    v_oc.id, COALESCE(p_photos, '[]'::jsonb), '[]'::jsonb
  ) RETURNING id, oe_number INTO v_oe_id, v_oe_number;

  -- 2) Fecha o machine_log da OC (se aberto) e abre um novo para manutencao_eletrica
  IF v_oc.machine_log_id IS NOT NULL THEN
    UPDATE public.machine_logs
       SET ended_at = v_now, ended_by_name = p_author_name
     WHERE id = v_oc.machine_log_id AND ended_at IS NULL;
  END IF;
  INSERT INTO public.machine_logs(machine_id, company_id, status, started_at, started_by_name)
  VALUES (v_oc.machine_id, v_oc.company_id, 'manutencao_eletrica', v_now, p_author_name)
  RETURNING id INTO v_new_log_id;

  -- 3) Atualiza status da máquina
  UPDATE public.machines SET status = 'manutencao_eletrica' WHERE id = v_oc.machine_id;

  -- 4) Vincula a OE ao log e atualiza a OE recém-criada
  UPDATE public.maintenance_orders SET machine_log_id = v_new_log_id WHERE id = v_oe_id;

  -- 5) Finaliza a OC com relatório automático
  v_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_oc.started_at))::int);
  v_finish_notes := 'Problema elétrico. OE #' || LPAD(v_oe_number::text, 3, '0') ||
                    ' aberta.' || E'\n\nDescrição: ' || p_description;
  UPDATE public.maintenance_orders
     SET status = 'finalizada',
         finished_at = v_now,
         finished_by_id = p_author_user_id,
         finished_by_name = p_author_name,
         duration_seconds = v_seconds,
         finish_notes = v_finish_notes,
         escalated_to_oe_id = v_oe_id
   WHERE id = v_oc.id;

  RETURN jsonb_build_object(
    'ok', true,
    'oc_id', v_oc.id,
    'oe_id', v_oe_id,
    'oe_number', v_oe_number,
    'machine_id', v_oc.machine_id,
    'duration_seconds', v_seconds
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.escalate_oc_to_oe(uuid, text, jsonb, text, uuid) TO authenticated;
