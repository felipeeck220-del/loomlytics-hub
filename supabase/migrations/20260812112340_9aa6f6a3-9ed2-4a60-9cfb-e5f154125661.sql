BEGIN;
-- Move OF #596 to collected status
UPDATE public.billing_orders 
SET status = 'collected', 
    collected_by = '3598c8e4-2a0c-49d8-80ea-e4de85a4baf0',
    collected_at = now(),
    updated_at = now()
WHERE id = 'b9d4f4fa-9d06-47f6-92a9-52d1eefb82a7';

-- Clean up pallets
DELETE FROM public.billing_order_pallets WHERE billing_order_id = 'b9d4f4fa-9d06-47f6-92a9-52d1eefb82a7';

-- Audit log
INSERT INTO public.audit_logs (company_id, user_name, user_code, action, details)
SELECT company_id, 'Felipe', '1', 'billing_order_collect_manual', 
       jsonb_build_object('of', '596', 'target_id', 'b9d4f4fa-9d06-47f6-92a9-52d1eefb82a7')
FROM public.billing_orders WHERE id = 'b9d4f4fa-9d06-47f6-92a9-52d1eefb82a7';
COMMIT;