
-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  whatsapp TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create articles table
CREATE TABLE public.articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name TEXT,
  weight_per_roll NUMERIC NOT NULL DEFAULT 0,
  value_per_kg NUMERIC NOT NULL DEFAULT 0,
  turns_per_roll INTEGER NOT NULL DEFAULT 0,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create machine status enum
CREATE TYPE public.machine_status AS ENUM ('ativa', 'manutencao_preventiva', 'manutencao_corretiva', 'troca_artigo', 'inativa');

-- Create machines table
CREATE TABLE public.machines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  rpm INTEGER NOT NULL DEFAULT 0,
  status machine_status NOT NULL DEFAULT 'ativa',
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create machine logs table
CREATE TABLE public.machine_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  status machine_status NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

-- Create weavers table
CREATE TABLE public.weavers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  shift_type TEXT NOT NULL DEFAULT 'fixo',
  fixed_shift TEXT,
  start_time TEXT,
  end_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create productions table
CREATE TABLE public.productions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  shift TEXT NOT NULL,
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  machine_name TEXT,
  weaver_id UUID REFERENCES public.weavers(id) ON DELETE SET NULL,
  weaver_name TEXT,
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  article_name TEXT,
  rpm INTEGER NOT NULL DEFAULT 0,
  rolls_produced INTEGER NOT NULL DEFAULT 0,
  weight_kg NUMERIC NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  efficiency NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weavers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (app uses localStorage auth, not Supabase auth yet)
-- These permissive policies will be tightened when we migrate to Supabase Auth
CREATE POLICY "Allow all access to companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to articles" ON public.articles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to machines" ON public.machines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to machine_logs" ON public.machine_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to weavers" ON public.weavers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to productions" ON public.productions FOR ALL USING (true) WITH CHECK (true);
