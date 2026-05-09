-- Ajustar search_path e permissões da função RPC
ALTER FUNCTION public.get_dashboard_metrics(UUID, DATE, DATE, UUID, TEXT) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics(UUID, DATE, DATE, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(UUID, DATE, DATE, UUID, TEXT) TO authenticated;
