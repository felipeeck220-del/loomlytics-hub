-- Redefine a função e garante as permissões
-- O objetivo é que o sandbox_exec também possa ver/rodar se necessário para testes,
-- mas principalmente authenticated/service_role para o app.

GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO sandbox_exec;
