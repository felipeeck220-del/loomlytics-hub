-- Create cylinders table
CREATE TABLE public.cylinders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES auth.users(id),
    brand TEXT NOT NULL,
    model TEXT,
    diameter TEXT,
    fineness TEXT,
    needle_quantity INTEGER,
    feeder_quantity INTEGER,
    observations TEXT,
    machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL, -- Currently assigned machine
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cylinders TO authenticated;
GRANT ALL ON public.cylinders TO service_role;
ALTER TABLE public.cylinders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage cylinders for their company" ON public.cylinders FOR ALL USING (true);

-- Add current cylinder to machines table
ALTER TABLE public.machines ADD COLUMN cylinder_id UUID REFERENCES public.cylinders(id) ON DELETE SET NULL;
