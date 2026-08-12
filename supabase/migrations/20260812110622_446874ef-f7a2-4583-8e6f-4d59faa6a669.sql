BEGIN;
UPDATE public.billing_orders 
SET status = 'collected', 
    collected_by = (SELECT id FROM public.profiles WHERE code = '1' AND company_id = 'a664927c-a285-4997-8faa-8c90985c6fac' LIMIT 1),
    collected_at = now(),
    updated_at = now()
WHERE id = '7ae42ba5-4846-48d3-8df9-1d701668d422';

DELETE FROM public.billing_order_pallets WHERE billing_order_id = '7ae42ba5-4846-48d3-8df9-1d701668d422';

INSERT INTO public.audit_logs (company_id, user_name, user_code, action, details)
VALUES ('a664927c-a285-4997-8faa-8c90985c6fac', 'Felipe', '1', 'billing_order_collect_manual', 
        jsonb_build_object('of', '595', 'target_id', '7ae42ba5-4846-48d3-8df9-1d701668d422'));
COMMIT;