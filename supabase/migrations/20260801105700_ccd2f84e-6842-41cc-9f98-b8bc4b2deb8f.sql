DROP FUNCTION IF EXISTS public.get_manual_stock_estoque(uuid, uuid, uuid, text);
GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;