-- 1. Sync _of_audit with standard parameter names but keeping same types
CREATE OR REPLACE FUNCTION public._of_audit(
  p_company_id uuid,
  p_target_id uuid,
  p_action text,
  p_author_name text,
  p_author_code text,
  p_details jsonb DEFAULT '{}'::jsonb
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

-- 2. Sync set_billing_order_priority to use _of_audit correctly
CREATE OR REPLACE FUNCTION public.set_billing_order_priority(
  p_company_id uuid, 
  p_id uuid, 
  p_priority boolean, 
  p_reason text DEFAULT NULL::text, 
  p_author_name text DEFAULT NULL::text, 
  p_author_code text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_pid uuid;
  v_of_num text;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  
  v_pid := public._of_current_profile_id(p_company_id);
  
  SELECT of_number INTO v_of_num FROM public.billing_orders 
  WHERE id = p_id AND company_id = p_company_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF não encontrada' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.billing_orders SET
    priority = p_priority,
    priority_reason = CASE WHEN p_priority THEN p_reason ELSE NULL END,
    priority_at = CASE WHEN p_priority THEN now() ELSE NULL END,
    priority_by = CASE WHEN p_priority THEN v_pid ELSE NULL END,
    updated_at = now()
  WHERE id = p_id;

  PERFORM public._of_audit(
    p_company_id, 
    p_id, 
    CASE WHEN p_priority THEN 'billing_order_priority_set' ELSE 'billing_order_priority_unset' END, 
    p_author_name, 
    p_author_code, 
    jsonb_build_object('of', v_of_num, 'reason', p_reason)
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 3. Fix data inconsistencies (ready/separating without process dates)
UPDATE public.billing_orders
SET separation_started_at = COALESCE(separation_started_at, created_at),
    separation_started_by = COALESCE(separation_started_by, created_by)
WHERE status IN ('separating', 'ready') AND separation_started_at IS NULL;

UPDATE public.billing_orders
SET separation_finished_at = COALESCE(separation_finished_at, updated_at),
    separation_finished_by = COALESCE(separation_finished_by, separation_started_by, created_by)
WHERE status = 'ready' AND separation_finished_at IS NULL;
