-- Corrigir avisos de search_path para as funções criadas
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.handle_needle_transaction() SET search_path = public;
