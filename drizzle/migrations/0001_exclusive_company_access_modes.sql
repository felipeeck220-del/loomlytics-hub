CREATE OR REPLACE FUNCTION public.set_company_maintenance(p_company_id uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF p_enabled IS NULL OR auth.uid() IS NULL OR p_company_id IS DISTINCT FROM public.get_user_company_id() OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND company_id=p_company_id AND role='admin' AND code='1' AND status='active') THEN RAISE EXCEPTION 'Somente o administrador principal pode alterar a manutenção da empresa' USING ERRCODE='42501'; END IF;
 UPDATE public.company_settings SET maintenance_enabled=p_enabled, new_app_url=CASE WHEN p_enabled THEN NULL ELSE new_app_url END, updated_at=now() WHERE company_id=p_company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configurações da empresa não encontradas'; END IF;
 RETURN public.get_company_maintenance_state();
END; $$;
CREATE OR REPLACE FUNCTION public.set_company_new_app_url(p_company_id uuid, p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_url text := NULLIF(btrim(COALESCE(p_url,'')), '');
BEGIN
 IF auth.uid() IS NULL OR p_company_id IS DISTINCT FROM public.get_user_company_id() OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND company_id=p_company_id AND role='admin' AND code='1' AND status='active') THEN RAISE EXCEPTION 'Somente o administrador principal pode alterar o aviso de nova versão' USING ERRCODE='42501'; END IF;
 IF v_url IS NOT NULL AND v_url !~ '^https://' THEN RAISE EXCEPTION 'Informe um link válido iniciado por https://'; END IF;
 UPDATE public.company_settings SET new_app_url=v_url, maintenance_enabled=CASE WHEN v_url IS NOT NULL THEN false ELSE maintenance_enabled END, updated_at=now() WHERE company_id=p_company_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configurações da empresa não encontradas'; END IF;
 RETURN public.get_company_maintenance_state();
END; $$;
REVOKE ALL ON FUNCTION public.set_company_maintenance(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_company_new_app_url(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_maintenance(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_company_new_app_url(uuid, text) TO authenticated, service_role;
DROP TRIGGER IF EXISTS guard_company_maintenance_change ON public.company_settings;
CREATE TRIGGER guard_company_maintenance_change BEFORE UPDATE OF maintenance_enabled, new_app_url ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.guard_company_maintenance_change();
ALTER TABLE public.company_settings ADD CONSTRAINT company_access_modes_exclusive CHECK (NOT (maintenance_enabled AND new_app_url IS NOT NULL)) NOT VALID;