-- Remove as constraints antigas que apontavam para user_id (que não é a PK do profiles)
ALTER TABLE public.billing_orders 
  DROP CONSTRAINT IF EXISTS billing_orders_created_by_fkey,
  DROP CONSTRAINT IF EXISTS billing_orders_separated_by_fkey,
  DROP CONSTRAINT IF EXISTS billing_orders_collected_by_fkey;

-- Adiciona as novas constraints apontando para a coluna id (PK) do profiles
ALTER TABLE public.billing_orders 
  ADD CONSTRAINT billing_orders_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  ADD CONSTRAINT billing_orders_separated_by_fkey 
    FOREIGN KEY (separated_by) REFERENCES public.profiles(id),
  ADD CONSTRAINT billing_orders_collected_by_fkey 
    FOREIGN KEY (collected_by) REFERENCES public.profiles(id);
