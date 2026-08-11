-- Deleta a OF de teste #566 e seus paletes associados
DELETE FROM public.billing_order_pallets 
WHERE billing_order_id = (SELECT id FROM public.billing_orders WHERE of_number = '566');

DELETE FROM public.billing_orders 
WHERE of_number = '566';

-- Registra a exclusão na auditoria usando os nomes de coluna corretos: name e code em profiles
INSERT INTO public.audit_logs (company_id, user_id, user_name, user_code, action, details)
SELECT 
    company_id, 
    id, 
    name,
    code,
    'delete', 
    jsonb_build_object(
        'target_table', 'billing_orders',
        'of_number', '566', 
        'reason', 'Exclusão de OF de teste solicitada pelo usuário'
    )
FROM public.profiles
WHERE id = auth.uid()
LIMIT 1;