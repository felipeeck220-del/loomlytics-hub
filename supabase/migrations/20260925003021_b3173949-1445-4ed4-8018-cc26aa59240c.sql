REVOKE ALL ON FUNCTION public.generate_next_of_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_next_of_number(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.generate_next_of_number(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.generate_next_of_number(uuid) FROM service_role;