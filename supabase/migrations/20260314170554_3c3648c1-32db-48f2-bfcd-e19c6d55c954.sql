-- Prevent users from changing their own company_id or role via profile update
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service role to make changes (for admin operations)
  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Prevent changing company_id
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Changing company_id is not allowed';
  END IF;

  -- Prevent changing role
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Changing role is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();