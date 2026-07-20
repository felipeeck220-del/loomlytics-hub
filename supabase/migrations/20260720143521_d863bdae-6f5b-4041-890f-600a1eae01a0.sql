CREATE OR REPLACE FUNCTION public.recompute_machine_article_from_latest_ot(
  p_company_id uuid,
  p_machine_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next_article_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_machine_id IS NULL THEN
    RETURN;
  END IF;

  SELECT o.next_article_id
    INTO v_next_article_id
    FROM public.article_change_orders o
   WHERE o.company_id = p_company_id
     AND o.machine_id = p_machine_id
     AND o.status = 'concluida'
     AND o.next_article_id IS NOT NULL
   ORDER BY
     o.concluded_at DESC NULLS LAST,
     o.updated_at DESC NULLS LAST,
     o.created_at DESC NULLS LAST,
     o.ot_number DESC NULLS LAST
   LIMIT 1;

  IF v_next_article_id IS NOT NULL THEN
    UPDATE public.machines m
       SET article_id = v_next_article_id
     WHERE m.id = p_machine_id
       AND m.company_id = p_company_id
       AND m.article_id IS DISTINCT FROM v_next_article_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_machine_article_on_ot_conclude()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'concluida' THEN
      PERFORM public.recompute_machine_article_from_latest_ot(OLD.company_id, OLD.machine_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status = 'concluida' THEN
    PERFORM public.recompute_machine_article_from_latest_ot(NEW.company_id, NEW.machine_id);
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'concluida'
     AND (
       OLD.company_id IS DISTINCT FROM NEW.company_id
       OR OLD.machine_id IS DISTINCT FROM NEW.machine_id
       OR NEW.status IS DISTINCT FROM 'concluida'
     ) THEN
    PERFORM public.recompute_machine_article_from_latest_ot(OLD.company_id, OLD.machine_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_machine_article_on_ot_conclude ON public.article_change_orders;
CREATE TRIGGER trg_promote_machine_article_on_ot_conclude
AFTER INSERT OR UPDATE OR DELETE ON public.article_change_orders
FOR EACH ROW EXECUTE FUNCTION public.promote_machine_article_on_ot_conclude();