-- Neutralização de saldos de reserva negativos históricos
DO $$
DECLARE
  r RECORD;
  v_admin_id uuid;
BEGIN
  FOR r IN 
    SELECT billing_order_id, article_id, machine_id, company_id, client_id,
           SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END) as net_p,
           SUM(CASE WHEN type='reserve' THEN weight_kg ELSE -weight_kg END) as net_w
    FROM stock_movements
    WHERE billing_order_id IS NOT NULL
    GROUP BY 1,2,3,4,5
    HAVING SUM(CASE WHEN type='reserve' THEN pieces ELSE -pieces END) < 0
  LOOP
    SELECT id INTO v_admin_id FROM profiles WHERE company_id = r.company_id AND role = 'admin' LIMIT 1;
    
    INSERT INTO stock_movements (company_id, billing_order_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by)
    VALUES (r.company_id, r.billing_order_id, r.article_id, r.client_id, r.machine_id, 'reserve', -r.net_p, -r.net_w, 'Correção de saldo de reserva (neutralização de excesso de liberação)', v_admin_id);
  END LOOP;
END $$;

-- Atualização da RPC com lógica de consistência e GREATEST(0)
CREATE OR REPLACE FUNCTION public.get_manual_stock_estoque(p_company_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_company_id uuid;
  v_res jsonb;
BEGIN
  v_caller_company_id := public.get_user_company_id();
  IF v_caller_company_id IS NULL OR v_caller_company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  WITH base_movements AS (
    SELECT 
      article_id,
      client_id,
      machine_id,
      type,
      pieces,
      weight_kg,
      on_machine,
      created_at
    FROM manual_stock_movements
    WHERE company_id = p_company_id
  ),
  machine_physical AS (
    SELECT 
      article_id,
      machine_id,
      SUM(CASE WHEN on_machine = true AND type IN ('in', 'adjust_in', 'iot_in') THEN pieces 
               WHEN on_machine = true AND type IN ('out', 'adjust_out') THEN -pieces ELSE 0 END) as pcs_maq,
      SUM(CASE WHEN on_machine = false AND type IN ('in', 'adjust_in') THEN pieces 
               WHEN on_machine = false AND type IN ('out', 'adjust_out') THEN -pieces ELSE 0 END) as pcs_exped,
      SUM(CASE WHEN on_machine = true AND type IN ('in', 'adjust_in', 'iot_in') THEN weight_kg 
               WHEN on_machine = true AND type IN ('out', 'adjust_out') THEN -weight_kg ELSE 0 END) as kg_maq,
      SUM(CASE WHEN on_machine = false AND type IN ('in', 'adjust_in') THEN weight_kg 
               WHEN on_machine = false AND type IN ('out', 'adjust_out') THEN -weight_kg ELSE 0 END) as kg_exped
    FROM base_movements
    GROUP BY 1, 2
  ),
  current_reserves AS (
    SELECT 
      article_id,
      machine_id,
      SUM(CASE WHEN type = 'reserve' THEN pieces ELSE -pieces END) as raw_res_pcs,
      SUM(CASE WHEN type = 'reserve' THEN weight_kg ELSE -weight_kg END) as raw_res_kg
    FROM base_movements
    GROUP BY 1, 2
  ),
  machine_data AS (
    SELECT 
      mp.article_id,
      mp.machine_id,
      mp.pcs_maq,
      mp.pcs_exped,
      mp.kg_maq,
      mp.kg_exped,
      GREATEST(0, COALESCE(cr.raw_res_pcs, 0)) as res_pcs,
      GREATEST(0, COALESCE(cr.raw_res_kg, 0)) as res_kg
    FROM machine_physical mp
    LEFT JOIN current_reserves cr ON mp.article_id = cr.article_id AND mp.machine_id = cr.machine_id
  ),
  aggregated AS (
    SELECT 
      a.id as article_id,
      a.name as article_name,
      c.name as client_name,
      jsonb_agg(jsonb_build_object(
        'machine_id', m.machine_id,
        'machine_name', mac.name,
        'pcs_maq', m.pcs_maq,
        'pcs_exped', m.pcs_exped,
        'res_pcs', m.res_pcs,
        'disp_pcs', GREATEST(0, m.pcs_maq + m.pcs_exped - m.res_pcs)
      )) as machines,
      SUM(GREATEST(0, m.pcs_maq + m.pcs_exped - m.res_pcs)) as total_disp_pcs
    FROM public.articles a
    JOIN public.clients c ON a.client_id = c.id
    JOIN machine_data m ON a.id = m.article_id
    LEFT JOIN public.machines mac ON m.machine_id = mac.id
    WHERE a.company_id = p_company_id
    GROUP BY a.id, a.name, c.name
  )
  SELECT jsonb_agg(aggregated) INTO v_res FROM aggregated;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, date, date) TO authenticated, service_role;
