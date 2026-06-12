-- Ajustar permissões para garantir que authenticated e service_role tenham acesso às tabelas
GRANT ALL ON public.billing_orders TO authenticated;
GRANT ALL ON public.billing_orders TO service_role;

-- Recriar política de RLS para ser mais robusta
DROP POLICY IF EXISTS "Users can manage their company's billing orders" ON public.billing_orders;

CREATE POLICY "Users can manage their company's billing orders" 
ON public.billing_orders 
FOR ALL 
TO authenticated 
USING (company_id = (SELECT company_id FROM public.user_active_company WHERE user_id = auth.uid()))
WITH CHECK (company_id = (SELECT company_id FROM public.user_active_company WHERE user_id = auth.uid()));

-- Garantir que a tabela profiles também tenha permissões corretas (usada nos joins)
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO service_role;
