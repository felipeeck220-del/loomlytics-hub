UPDATE public.billing_orders
SET 
    status = 'separating',
    separation_started_by = (SELECT id FROM public.profiles WHERE code::text = '832' LIMIT 1),
    separation_started_at = now(),
    updated_at = now()
WHERE of_number = '624'
RETURNING id, status;