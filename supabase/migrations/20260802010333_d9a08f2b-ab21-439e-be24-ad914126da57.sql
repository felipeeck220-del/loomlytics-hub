CREATE OR REPLACE FUNCTION public._of_clear_separation_audit_on_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'open'::billing_order_status
     AND OLD.status IS DISTINCT FROM 'open'::billing_order_status THEN
    NEW.separation_started_by := NULL;
    NEW.separation_started_at := NULL;
    NEW.separation_finished_by := NULL;
    NEW.separation_finished_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._of_clear_separation_audit_on_open() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_of_clear_separation_audit_on_open ON public.billing_orders;
CREATE TRIGGER trg_of_clear_separation_audit_on_open
BEFORE UPDATE OF status ON public.billing_orders
FOR EACH ROW
EXECUTE FUNCTION public._of_clear_separation_audit_on_open();

UPDATE public.billing_orders
   SET separation_started_by = NULL, separation_started_at = NULL,
       separation_finished_by = NULL, separation_finished_at = NULL
 WHERE status = 'open'
   AND (separation_started_by IS NOT NULL OR separation_finished_by IS NOT NULL
        OR separation_started_at IS NOT NULL OR separation_finished_at IS NOT NULL);