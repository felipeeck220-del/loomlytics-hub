-- Garante que a função tenha permissões de execução para todos os papéis necessários
-- Isso resolve o erro persistente de 'permission denied'
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO anon;
