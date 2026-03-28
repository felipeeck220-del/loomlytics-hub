
CREATE TABLE public.defect_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  machine_id UUID REFERENCES public.machines(id),
  article_id UUID REFERENCES public.articles(id),
  weaver_id UUID REFERENCES public.weavers(id),
  date TEXT NOT NULL,
  shift TEXT NOT NULL,
  measure_type TEXT NOT NULL DEFAULT 'kg',
  measure_value NUMERIC NOT NULL DEFAULT 0,
  machine_name TEXT,
  article_name TEXT,
  weaver_name TEXT,
  observations TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.defect_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own defect_records" ON public.defect_records FOR SELECT TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can insert own defect_records" ON public.defect_records FOR INSERT TO authenticated WITH CHECK (company_id = get_user_company_id());
CREATE POLICY "Users can update own defect_records" ON public.defect_records FOR UPDATE TO authenticated USING (company_id = get_user_company_id());
CREATE POLICY "Users can delete own defect_records" ON public.defect_records FOR DELETE TO authenticated USING (company_id = get_user_company_id());
