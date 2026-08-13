UPDATE public.billing_orders 
SET priority = true, 
    priority_reason = 'Coleta a caminho',
    priority_at = now(),
    updated_at = now()
WHERE of_number = '611';

SELECT public._of_audit(
    company_id,
    id,
    'billing_order_set_priority',
    'Felipe #220',
    '220',
    '{"priority": true, "reason": "Coleta a caminho", "of": "611"}'::jsonb
)
FROM public.billing_orders
WHERE of_number = '611';