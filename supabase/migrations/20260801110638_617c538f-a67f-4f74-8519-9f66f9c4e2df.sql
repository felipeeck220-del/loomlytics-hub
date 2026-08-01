REVOKE ALL ON public.manual_stock_movements FROM anon;

REVOKE ALL ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_manual_stock_bootstrap(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_manual_stock_movements(uuid, text, date, date, integer, integer, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_manual_stock_manual_entry(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mirror_of_to_manual_stock() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mirror_of_delete_to_manual_stock() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_manual_stock_estoque(uuid, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_bootstrap(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_manual_stock_movements(uuid, text, date, date, integer, integer, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_manual_entry(jsonb) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_stock_movements TO authenticated;
GRANT ALL ON public.manual_stock_movements TO service_role;