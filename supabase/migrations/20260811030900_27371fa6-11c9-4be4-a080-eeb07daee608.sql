-- Remove a versão que tenta usar target_id
DROP FUNCTION IF EXISTS public._of_audit(uuid, uuid, text, text, text, jsonb);

-- Cria a versão final compatível com a estrutura real de audit_logs (sem target_id)
CREATE OR REPLACE FUNCTION public._of_audit(
  p_company_id uuid,
  p_target_id uuid, -- Mantemos o argumento mas ignoramos no insert por enquanto (ou concatenamos no details)
  p_action text,
  p_author_name text,
  p_author_code text,
  p_details jsonb
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (
    company_id,
    action,
    details,
    user_name,
    user_code,
    created_at
  ) VALUES (
    p_company_id,
    p_action,
    p_details || jsonb_build_object('target_id', p_target_id),
    p_author_name,
    p_author_code,
    now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public._of_audit TO authenticated, service_role;
