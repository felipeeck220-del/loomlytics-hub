DO $$
DECLARE
  v_company_id uuid := 'a664927c-a285-4997-8faa-8c90985c6fac';
  v_of_544_id uuid := '7b094ba1-eb47-4bb4-a5c5-88d5063b3058';
  v_of_545_id uuid := '6e2bfd09-2699-4b2d-a6ad-10881eb1b6d4';
  v_res jsonb;
BEGIN
  -- Cancel OF 544
  SELECT public.cancel_billing_order(
    v_of_544_id, 
    v_company_id, 
    'separating', 
    'Cancelamento solicitado pelo usuário - movido manualmente pelo sistema', 
    'first', 
    'Sistema',
    '0'
  ) INTO v_res;

  -- Cancel OF 545
  SELECT public.cancel_billing_order(
    v_of_545_id, 
    v_company_id, 
    'separating', 
    'Cancelamento solicitado pelo usuário - movido manualmente pelo sistema', 
    'first', 
    'Sistema',
    '0'
  ) INTO v_res;
END $$;