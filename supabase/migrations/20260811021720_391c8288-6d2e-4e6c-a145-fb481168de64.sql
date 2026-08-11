DO $$
DECLARE
  v_company_id uuid := 'a664927c-a285-4997-8faa-8c90985c6fac';
  v_of_544_id uuid := '7b094ba1-eb47-4bb4-a5c5-88d5063b3058';
  v_of_545_id uuid := '6e2bfd09-2699-4b2d-a6ad-10881eb1b6d4';
  v_res jsonb;
BEGIN
  -- Re-calling with named parameters to be 100% safe
  SELECT public.cancel_billing_order(
    p_company_id := v_company_id,
    p_id := v_of_544_id,
    p_reason := 'Cancelamento solicitado pelo usuário - movido manualmente via migration',
    p_expected_status := NULL,
    p_reversal_quality := 'first',
    p_author_name := 'Sistema',
    p_author_code := '0'
  ) INTO v_res;

  SELECT public.cancel_billing_order(
    p_company_id := v_company_id,
    p_id := v_of_545_id,
    p_reason := 'Cancelamento solicitado pelo usuário - movido manualmente via migration',
    p_expected_status := NULL,
    p_reversal_quality := 'first',
    p_author_name := 'Sistema',
    p_author_code := '0'
  ) INTO v_res;
END $$;