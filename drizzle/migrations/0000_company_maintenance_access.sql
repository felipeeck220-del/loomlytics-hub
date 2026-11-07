ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS maintenance_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_company_maintenance_state()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid := public.get_user_company_id(); v_manager boolean;
BEGIN
  IF auth.uid() IS NULL OR v_company_id IS NULL THEN RAISE EXCEPTION 'Empresa não autorizada' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id = v_company_id) THEN RAISE EXCEPTION 'Empresa não autorizada' USING ERRCODE = '42501'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id = v_company_id AND role = 'admin' AND code = '1' AND status = 'active') INTO v_manager;
  RETURN jsonb_build_object('company_id', v_company_id, 'enabled', COALESCE((SELECT maintenance_enabled FROM public.company_settings WHERE company_id = v_company_id), false), 'can_manage', v_manager);
END;
$$;
REVOKE ALL ON FUNCTION public.get_company_maintenance_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_maintenance_state() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_company_maintenance(p_company_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_enabled IS NULL OR auth.uid() IS NULL OR p_company_id IS DISTINCT FROM public.get_user_company_id() OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id = p_company_id AND role = 'admin' AND code = '1' AND status = 'active') THEN
    RAISE EXCEPTION 'Somente o administrador principal pode alterar a manutenção da empresa' USING ERRCODE = '42501';
  END IF;
  UPDATE public.company_settings SET maintenance_enabled = p_enabled, updated_at = now() WHERE company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configurações da empresa não encontradas'; END IF;
  RETURN public.get_company_maintenance_state();
END;
$$;
REVOKE ALL ON FUNCTION public.set_company_maintenance(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_maintenance(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_company_maintenance_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile public.profiles%ROWTYPE;
BEGIN
  IF NEW.maintenance_enabled IS NOT DISTINCT FROM OLD.maintenance_enabled THEN RETURN NEW; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = auth.uid() AND company_id = OLD.company_id AND role = 'admin' AND code = '1' AND status = 'active';
  IF auth.uid() IS NOT NULL AND (v_profile.id IS NULL OR OLD.company_id IS DISTINCT FROM public.get_user_company_id()) THEN
    RAISE EXCEPTION 'Somente o administrador principal pode alterar a manutenção da empresa' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.audit_logs (company_id, user_id, user_name, user_role, user_code, action, details)
  VALUES (OLD.company_id, auth.uid(), COALESCE(v_profile.name, 'Sistema'), COALESCE(v_profile.role, 'system'), v_profile.code, CASE WHEN NEW.maintenance_enabled THEN 'Ativou manutenção da empresa' ELSE 'Desativou manutenção da empresa' END, jsonb_build_object('maintenance_enabled', NEW.maintenance_enabled));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_company_maintenance_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_company_maintenance_change BEFORE UPDATE OF maintenance_enabled ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.guard_company_maintenance_change();