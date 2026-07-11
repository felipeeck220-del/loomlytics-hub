CREATE OR REPLACE FUNCTION public.promote_machine_article_on_ot_conclude()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'concluida'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluida')
     AND NEW.machine_id IS NOT NULL
     AND NEW.next_article_id IS NOT NULL THEN
    UPDATE public.machines
       SET article_id = NEW.next_article_id
     WHERE id = NEW.machine_id
       AND company_id = NEW.company_id
       AND (article_id IS DISTINCT FROM NEW.next_article_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_machine_article_on_ot_conclude ON public.article_change_orders;
CREATE TRIGGER trg_promote_machine_article_on_ot_conclude
AFTER INSERT OR UPDATE OF status ON public.article_change_orders
FOR EACH ROW EXECUTE FUNCTION public.promote_machine_article_on_ot_conclude();

WITH last_ot AS (
  SELECT DISTINCT ON (machine_id)
         machine_id, next_article_id, company_id
    FROM public.article_change_orders
   WHERE status = 'concluida'
     AND next_article_id IS NOT NULL
     AND machine_id IS NOT NULL
   ORDER BY machine_id, concluded_at DESC NULLS LAST
)
UPDATE public.machines m
   SET article_id = l.next_article_id
  FROM last_ot l
 WHERE m.id = l.machine_id
   AND m.company_id = l.company_id
   AND m.article_id IS DISTINCT FROM l.next_article_id;