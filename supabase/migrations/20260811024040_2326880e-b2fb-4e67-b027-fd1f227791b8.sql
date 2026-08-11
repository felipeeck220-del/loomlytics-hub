-- Ensure the function is accessible to authenticated users
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_billing_order(uuid, uuid, text, text, text, text, text) TO anon;

-- Verification query (this will be logged in the migration record if needed)
SELECT 'Grants applied for cancel_billing_order' as result;
