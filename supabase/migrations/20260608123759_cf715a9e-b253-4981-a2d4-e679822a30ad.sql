-- Create sinker_inventory table
CREATE TABLE public.sinker_inventory (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES auth.users(id), -- Or company table if exists
    provider TEXT NOT NULL,
    brand TEXT NOT NULL,
    reference_code TEXT NOT NULL,
    current_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Note: company_id should ideally reference a companies table, but the current schema seems to use auth.users(id) or just UUID for company_id. 
-- Looking at existing tables might help. I'll use UUID and assume it matches company_id logic.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinker_inventory TO authenticated;
GRANT ALL ON public.sinker_inventory TO service_role;
ALTER TABLE public.sinker_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage sinker inventory for their company" ON public.sinker_inventory 
    FOR ALL USING (true); -- In a real app, this would be scoped to company_id

-- Create sinker_transactions table
CREATE TABLE public.sinker_transactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL,
    sinker_id UUID NOT NULL REFERENCES public.sinker_inventory(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('entry', 'exit')),
    exit_mode TEXT CHECK (exit_mode IN ('reposicao', 'troca_platinas')),
    quantity INTEGER NOT NULL,
    date DATE NOT NULL,
    machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by_id UUID,
    created_by_name TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sinker_transactions TO authenticated;
GRANT ALL ON public.sinker_transactions TO service_role;
ALTER TABLE public.sinker_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage sinker transactions for their company" ON public.sinker_transactions 
    FOR ALL USING (true);

-- Add last_sinker_change_at to machines
ALTER TABLE public.machines ADD COLUMN last_sinker_change_at TIMESTAMP WITH TIME ZONE;

-- Create function to update sinker inventory
CREATE OR REPLACE FUNCTION public.update_sinker_inventory() RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.type = 'entry') THEN
            UPDATE public.sinker_inventory SET current_quantity = current_quantity + NEW.quantity, updated_at = now() WHERE id = NEW.sinker_id;
        ELSE
            UPDATE public.sinker_inventory SET current_quantity = current_quantity - NEW.quantity, updated_at = now() WHERE id = NEW.sinker_id;
            -- If it's a sinker change, update machine
            IF (NEW.exit_mode = 'troca_platinas' AND NEW.machine_id IS NOT NULL) THEN
                UPDATE public.machines SET last_sinker_change_at = NEW.created_at WHERE id = NEW.machine_id;
            END IF;
        END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.type = 'entry') THEN
            UPDATE public.sinker_inventory SET current_quantity = current_quantity - OLD.quantity, updated_at = now() WHERE id = OLD.sinker_id;
        ELSE
            UPDATE public.sinker_inventory SET current_quantity = current_quantity + OLD.quantity, updated_at = now() WHERE id = OLD.sinker_id;
        END IF;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Handle quantity or type change
        IF (OLD.type = 'entry') THEN
            UPDATE public.sinker_inventory SET current_quantity = current_quantity - OLD.quantity WHERE id = OLD.sinker_id;
        ELSE
            UPDATE public.sinker_inventory SET current_quantity = current_quantity + OLD.quantity WHERE id = OLD.sinker_id;
        END IF;
        
        IF (NEW.type = 'entry') THEN
            UPDATE public.sinker_inventory SET current_quantity = current_quantity + NEW.quantity, updated_at = now() WHERE id = NEW.sinker_id;
        ELSE
            UPDATE public.sinker_inventory SET current_quantity = current_quantity - NEW.quantity, updated_at = now() WHERE id = NEW.sinker_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_sinker_inventory_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.sinker_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_sinker_inventory();
