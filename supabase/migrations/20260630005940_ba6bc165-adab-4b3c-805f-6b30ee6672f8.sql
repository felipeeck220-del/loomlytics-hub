
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinker_inventory TO authenticated;
GRANT ALL ON public.sinker_inventory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinker_transactions TO authenticated;
GRANT ALL ON public.sinker_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.needle_inventory TO authenticated;
GRANT ALL ON public.needle_inventory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.needle_transactions TO authenticated;
GRANT ALL ON public.needle_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_needle_refs TO authenticated;
GRANT ALL ON public.machine_needle_refs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_sinker_refs TO authenticated;
GRANT ALL ON public.machine_sinker_refs TO service_role;
