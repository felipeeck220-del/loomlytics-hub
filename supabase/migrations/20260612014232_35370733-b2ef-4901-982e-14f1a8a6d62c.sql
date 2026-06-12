ALTER TABLE public.billing_orders 
ADD COLUMN IF NOT EXISTS priority BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS priority_reason TEXT,
ADD COLUMN IF NOT EXISTS priority_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS priority_by UUID REFERENCES auth.users(id);

-- Adicionar 'priority' ao enum de status se necessário (não é o caso aqui pois manteremos os status e usaremos o booleano de prioridade para a aba especial)
