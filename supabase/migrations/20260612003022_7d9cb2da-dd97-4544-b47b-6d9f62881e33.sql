ALTER TABLE public.billing_orders 
  ADD COLUMN IF NOT EXISTS dyehouse TEXT,
  ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES public.machines(id),
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id),
  ADD COLUMN IF NOT EXISTS article_id UUID REFERENCES public.articles(id);

-- Se billing_order_status não existe, cria. Caso contrário, ignora.
DO $$ BEGIN
    CREATE TYPE billing_order_status AS ENUM ('open', 'separating', 'ready', 'collected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.billing_orders 
  ALTER COLUMN status TYPE billing_order_status USING status::text::billing_order_status;
