-- Remove a versão incorreta (com 5 argumentos)
DROP FUNCTION IF EXISTS public._of_audit(uuid, text, jsonb, text, text);

-- Cria a versão correta (com 6 argumentos) para atender à chamada em cancel_billing_order
CREATE OR REPLACE FUNCTION public._of_audit(
  p_company_id uuid,
  p_target_id uuid,
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
    target_id,
    action,
    details,
    user_name,
    user_code,
    created_at
  ) VALUES (
    p_company_id,
    p_target_id,
    p_action,
    p_details,
    p_author_name,
    p_author_code,
    now()
  );
END;
$function$;

-- Garante as permissões
GRANT EXECUTE ON FUNCTION public._of_audit TO authenticated, service_role;
