-- Garantir que a função tenha search_path definido por segurança
ALTER FUNCTION get_faturamento_total_metrics(UUID, DATE, DATE, DATE, DATE) SET search_path = public;

-- Garantir que usuários autenticados possam executar a função
GRANT EXECUTE ON FUNCTION get_faturamento_total_metrics(UUID, DATE, DATE, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_faturamento_total_metrics(UUID, DATE, DATE, DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION get_faturamento_total_metrics(UUID, DATE, DATE, DATE, DATE) TO service_role;