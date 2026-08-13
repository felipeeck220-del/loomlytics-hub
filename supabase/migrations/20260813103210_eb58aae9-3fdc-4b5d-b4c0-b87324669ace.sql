-- Recuperando dados e forçando status
UPDATE public.billing_orders 
SET status = 'collected',
    pieces_real = 120,
    weight_real = 2393.5,
    collected_at = now(),
    updated_at = now()
WHERE of_number = '568' 
  AND company_id = 'a664927c-a285-4997-8faa-8c90985c6fac';

-- Limpando paletes remanescentes
DELETE FROM public.billing_order_pallets 
WHERE billing_order_id = (SELECT id FROM public.billing_orders WHERE of_number = '568' AND company_id = 'a664927c-a285-4997-8faa-8c90985c6fac');

-- Auditoria manual
INSERT INTO public.audit_logs (company_id, action, user_name, user_code, details)
VALUES (
  'a664927c-a285-4997-8faa-8c90985c6fac', 
  'collect', 
  'Felipe', 
  '220', 
  jsonb_build_object('of', '568', 'pieces', 120, 'weight', 2393.5, 'manual', true)
);
