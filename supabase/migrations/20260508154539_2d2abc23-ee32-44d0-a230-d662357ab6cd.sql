REVOKE EXECUTE ON FUNCTION public.get_defect_stats(uuid, date, date, text, uuid, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_defect_stats(uuid, date, date, text, uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_defect_stats(uuid, date, date, text, uuid, uuid, uuid, text) TO service_role;