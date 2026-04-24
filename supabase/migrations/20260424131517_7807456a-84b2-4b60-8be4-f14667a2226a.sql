-- 1. Garantir que a função de atualização de data existe
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Expandir a tabela de máquinas com dados técnicos
ALTER TABLE public.machines 
ADD COLUMN IF NOT EXISTS model TEXT,
ADD COLUMN IF NOT EXISTS diameter TEXT,
ADD COLUMN IF NOT EXISTS fineness TEXT,
ADD COLUMN IF NOT EXISTS needle_quantity INTEGER,
ADD COLUMN IF NOT EXISTS feeder_quantity INTEGER,
ADD COLUMN IF NOT EXISTS serial_number TEXT,
ADD COLUMN IF NOT EXISTS last_needle_change_at TIMESTAMP WITH TIME ZONE;

-- 3. Tabela para cadastro de tipos de agulhas (Estoque)
CREATE TABLE IF NOT EXISTS public.needle_inventory (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    brand TEXT NOT NULL,
    reference_code TEXT NOT NULL,
    current_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, reference_code)
);

-- 4. Tabela para transações de agulhas (Entradas e Saídas)
DO $$ BEGIN
    CREATE TYPE public.needle_transaction_type AS ENUM ('entry', 'exit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.needle_exit_mode AS ENUM ('troca_agulheiro', 'reposicao');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.needle_transactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    needle_id UUID NOT NULL REFERENCES public.needle_inventory(id) ON DELETE CASCADE,
    type public.needle_transaction_type NOT NULL,
    exit_mode public.needle_exit_mode, -- NULL para entradas
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    machine_id UUID REFERENCES public.machines(id), -- Opcional para entradas, obrigatório para saídas
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by_id UUID REFERENCES auth.users(id),
    created_by_name TEXT
);

-- 5. Habilitar RLS
ALTER TABLE public.needle_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.needle_transactions ENABLE ROW LEVEL SECURITY;

-- 6. Políticas RLS
DO $$ BEGIN
    CREATE POLICY "Users can view needles of their company" ON public.needle_inventory FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE company_id = needle_inventory.company_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can manage needles of their company" ON public.needle_inventory FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE company_id = needle_inventory.company_id AND role IN ('admin', 'lider', 'mecanico')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can view needle transactions of their company" ON public.needle_transactions FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE company_id = needle_transactions.company_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE POLICY "Users can manage needle transactions of their company" ON public.needle_transactions FOR ALL USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE company_id = needle_transactions.company_id AND role IN ('admin', 'lider', 'mecanico')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Trigger para atualizar updated_at em needle_inventory
DROP TRIGGER IF EXISTS update_needle_inventory_updated_at ON public.needle_inventory;
CREATE TRIGGER update_needle_inventory_updated_at
BEFORE UPDATE ON public.needle_inventory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Função para atualizar estoque e registrar auditoria automaticamente
CREATE OR REPLACE FUNCTION public.handle_needle_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_user_name TEXT;
    v_user_role TEXT;
    v_details JSONB;
BEGIN
    -- Obter dados do usuário que está realizando a ação
    SELECT name, role INTO v_user_name, v_user_role FROM public.profiles WHERE user_id = auth.uid();

    IF (TG_OP = 'INSERT') THEN
        -- Atualizar quantidade no inventário
        IF (NEW.type = 'entry') THEN
            UPDATE public.needle_inventory 
            SET current_quantity = current_quantity + NEW.quantity 
            WHERE id = NEW.needle_id;
        ELSE -- type = 'exit'
            UPDATE public.needle_inventory 
            SET current_quantity = current_quantity - NEW.quantity 
            WHERE id = NEW.needle_id;
            
            -- Se for troca de agulheiro, atualizar a data na máquina
            IF (NEW.exit_mode = 'troca_agulheiro' AND NEW.machine_id IS NOT NULL) THEN
                UPDATE public.machines 
                SET last_needle_change_at = NEW.date 
                WHERE id = NEW.machine_id;
            END IF;
        END IF;

        -- Registrar na auditoria
        v_details = jsonb_build_object(
            'transaction_id', NEW.id,
            'needle_id', NEW.needle_id,
            'type', NEW.type,
            'exit_mode', NEW.exit_mode,
            'quantity', NEW.quantity,
            'machine_id', NEW.machine_id,
            'date', NEW.date
        );

        INSERT INTO public.audit_logs (company_id, user_id, action, details, user_name, user_role)
        VALUES (NEW.company_id, auth.uid(), 'needle_transaction_' || NEW.type, v_details, v_user_name, v_user_role);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_handle_needle_transaction ON public.needle_transactions;
CREATE TRIGGER tr_handle_needle_transaction
AFTER INSERT ON public.needle_transactions
FOR EACH ROW EXECUTE FUNCTION public.handle_needle_transaction();
