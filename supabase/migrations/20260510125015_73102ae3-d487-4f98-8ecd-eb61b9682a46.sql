-- Ajuste na função de meses
ALTER FUNCTION public.get_production_filter_months(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_production_filter_months(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_production_filter_months(UUID) TO authenticated;

-- Ajuste na função de máquinas
ALTER FUNCTION public.get_production_filter_machines(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_production_filter_machines(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_production_filter_machines(UUID) TO authenticated;

-- Ajuste na função de clientes
ALTER FUNCTION public.get_production_filter_clients(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_production_filter_clients(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_production_filter_clients(UUID) TO authenticated;

-- Ajuste na função de artigos
ALTER FUNCTION public.get_production_filter_articles(UUID) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.get_production_filter_articles(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_production_filter_articles(UUID) TO authenticated;