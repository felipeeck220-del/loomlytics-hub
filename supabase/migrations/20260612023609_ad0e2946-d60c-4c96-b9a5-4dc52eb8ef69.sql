-- Limpar dados de prioridade de OFs que já foram processadas (não estão em status 'open')
UPDATE public.billing_orders 
SET priority = false, 
    priority_reason = NULL, 
    priority_at = NULL, 
    priority_by = NULL 
WHERE status != 'open';

-- Garantir que o gatilho de updated_at exista para billing_orders
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_billing_orders_updated_at ON public.billing_orders;
CREATE TRIGGER tr_billing_orders_updated_at
BEFORE UPDATE ON public.billing_orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
