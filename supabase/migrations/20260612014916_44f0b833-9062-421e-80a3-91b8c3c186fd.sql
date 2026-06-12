-- Adicionar chaves estrangeiras para a tabela profiles
ALTER TABLE public.billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_created_by_fkey,
  DROP CONSTRAINT IF EXISTS billing_orders_separated_by_fkey,
  DROP CONSTRAINT IF EXISTS billing_orders_collected_by_fkey,
  DROP CONSTRAINT IF EXISTS billing_orders_priority_by_fkey;

ALTER TABLE public.billing_orders
  ADD CONSTRAINT billing_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  ADD CONSTRAINT billing_orders_separated_by_fkey FOREIGN KEY (separated_by) REFERENCES public.profiles(id),
  ADD CONSTRAINT billing_orders_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES public.profiles(id),
  ADD CONSTRAINT billing_orders_priority_by_fkey FOREIGN KEY (priority_by) REFERENCES public.profiles(id);

-- Garantir que a tabela tenha as permissões corretas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_orders TO authenticated;
GRANT ALL ON public.billing_orders TO service_role;
