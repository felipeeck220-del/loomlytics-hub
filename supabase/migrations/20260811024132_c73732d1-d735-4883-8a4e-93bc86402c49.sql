CREATE OR REPLACE FUNCTION public._of_audit(
  p_company_id uuid,
  p_action text,
  p_details jsonb,
  p_author_name text,
  p_author_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (
    company_id,
    table_name,
    action,
    details,
    author
  ) VALUES (
    p_company_id,
    'billing_orders',
    p_action,
    p_details,
    p_author_name || ' #' || COALESCE(p_author_code, '0')
  );
END;
$$;
