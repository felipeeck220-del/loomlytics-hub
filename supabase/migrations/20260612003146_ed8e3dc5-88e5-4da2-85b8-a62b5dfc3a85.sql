-- Primeiro garantimos que as colunas existem
ALTER TABLE public.billing_orders 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS separated_by UUID REFERENCES public.profiles(user_id),
  ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES public.profiles(user_id);

-- O Supabase às vezes cria nomes de FK automáticos, vamos tentar padronizar ou apenas garantir que o join funcione.
-- Se houver erro de join no PostgREST, geralmente é porque o PostgREST não sabe qual relação usar se houver múltiplas.
-- No PostgREST usamos !billing_orders_created_by_fkey para desambiguar.
