-- Create outsource_freights table
CREATE TABLE IF NOT EXISTS public.outsource_freights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outsource_company_id UUID REFERENCES public.outsource_companies(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    nf_rom TEXT,
    weight_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
    freight_per_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_freight DECIMAL(12,2) GENERATED ALWAYS AS (weight_kg * freight_per_kg) STORED,
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_by_name TEXT,
    created_by_code TEXT
);

-- Enable RLS
ALTER TABLE public.outsource_freights ENABLE ROW LEVEL SECURITY;

-- Create policies (using auth.uid() and company_id check)
CREATE POLICY "Users can view freights from their company" 
ON public.outsource_freights FOR SELECT 
USING (company_id = (SELECT (raw_user_meta_data->>'company_id')::uuid FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Users can insert freights to their company" 
ON public.outsource_freights FOR INSERT 
WITH CHECK (company_id = (SELECT (raw_user_meta_data->>'company_id')::uuid FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Users can update freights from their company" 
ON public.outsource_freights FOR UPDATE 
USING (company_id = (SELECT (raw_user_meta_data->>'company_id')::uuid FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Users can delete freights from their company" 
ON public.outsource_freights FOR DELETE 
USING (company_id = (SELECT (raw_user_meta_data->>'company_id')::uuid FROM auth.users WHERE id = auth.uid()));

-- Migrate existing data from outsource_productions (only if there's freight)
INSERT INTO public.outsource_freights (
    company_id, 
    outsource_company_id, 
    date, 
    nf_rom, 
    weight_kg, 
    freight_per_kg, 
    observations, 
    created_by_name, 
    created_by_code
)
SELECT 
    company_id, 
    outsource_company_id, 
    date::DATE, 
    nf_rom, 
    weight_kg, 
    freight_per_kg, 
    observations, 
    created_by_name, 
    created_by_code
FROM public.outsource_productions
WHERE freight_per_kg > 0;
