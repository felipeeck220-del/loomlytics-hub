DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_order_status') THEN
        CREATE TYPE billing_order_status AS ENUM ('open', 'separating', 'ready', 'collected');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    of_number TEXT NOT NULL,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
    pieces_expected INTEGER NOT NULL,
    weight_expected DECIMAL(10,3),
    machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
    dyehouse TEXT NOT NULL,
    status billing_order_status NOT NULL DEFAULT 'open',
    pieces_real INTEGER,
    weight_real DECIMAL(10,3),
    weight_avg DECIMAL(10,3),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    separated_by UUID REFERENCES public.profiles(id),
    collected_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_orders TO authenticated;
GRANT ALL ON public.billing_orders TO service_role;

ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company's billing orders" 
ON public.billing_orders FOR ALL 
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());

CREATE OR REPLACE FUNCTION public.update_billing_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_billing_orders_updated_at
BEFORE UPDATE ON public.billing_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_billing_orders_updated_at();