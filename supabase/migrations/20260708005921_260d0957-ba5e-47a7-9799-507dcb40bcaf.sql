
-- Harden profile update path against tenant hopping via user_active_company toggling.
-- 1) Tighten UPDATE policy so it does NOT depend on get_user_company_id()
--    (which is derived from the mutable user_active_company table).
-- 2) Strengthen the anti-escalation trigger to detect service_role reliably
--    and to also block direct changes to user_id / code / status by the owner.

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  -- Detect service role reliably from the JWT claims; current_setting('role')
  -- returned 'authenticator' in PostgREST context, so admin edge-function writes
  -- were being treated as end-user writes.
  BEGIN
    v_jwt_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- End users may never change these fields on their own profile
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Changing company_id is not allowed';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Changing role is not allowed';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Changing user_id is not allowed';
  END IF;

  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Changing code is not allowed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Changing status is not allowed';
  END IF;

  IF NEW.permission_overrides IS DISTINCT FROM OLD.permission_overrides THEN
    RAISE EXCEPTION 'Changing permission_overrides is not allowed';
  END IF;

  RETURN NEW;
END;
$$;
