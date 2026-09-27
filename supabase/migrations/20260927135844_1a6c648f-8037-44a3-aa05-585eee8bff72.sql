REVOKE EXECUTE ON FUNCTION public.create_billing_order(uuid, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_billing_orders_bootstrap(uuid) FROM anon;