
-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Security definer function to get company_id for current user (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Profiles RLS: users can read/update their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Now replace all overly-permissive policies with company-scoped ones

-- COMPANIES
DROP POLICY IF EXISTS "Allow all access to companies" ON public.companies;
CREATE POLICY "Users can read own company"
  ON public.companies FOR SELECT
  TO authenticated
  USING (id = public.get_user_company_id());
CREATE POLICY "Users can update own company"
  ON public.companies FOR UPDATE
  TO authenticated
  USING (id = public.get_user_company_id());
CREATE POLICY "Anyone can insert company"
  ON public.companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- MACHINES
DROP POLICY IF EXISTS "Allow all access to machines" ON public.machines;
CREATE POLICY "Users can read own machines"
  ON public.machines FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can insert own machines"
  ON public.machines FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Users can update own machines"
  ON public.machines FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can delete own machines"
  ON public.machines FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id());

-- MACHINE_LOGS
DROP POLICY IF EXISTS "Allow all access to machine_logs" ON public.machine_logs;
CREATE POLICY "Users can manage own machine_logs"
  ON public.machine_logs FOR ALL
  TO authenticated
  USING (machine_id IN (SELECT id FROM public.machines WHERE company_id = public.get_user_company_id()))
  WITH CHECK (machine_id IN (SELECT id FROM public.machines WHERE company_id = public.get_user_company_id()));

-- CLIENTS
DROP POLICY IF EXISTS "Allow all access to clients" ON public.clients;
CREATE POLICY "Users can read own clients"
  ON public.clients FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can insert own clients"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Users can update own clients"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can delete own clients"
  ON public.clients FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id());

-- ARTICLES
DROP POLICY IF EXISTS "Allow all access to articles" ON public.articles;
CREATE POLICY "Users can read own articles"
  ON public.articles FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can insert own articles"
  ON public.articles FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Users can update own articles"
  ON public.articles FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can delete own articles"
  ON public.articles FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id());

-- WEAVERS
DROP POLICY IF EXISTS "Allow all access to weavers" ON public.weavers;
CREATE POLICY "Users can read own weavers"
  ON public.weavers FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can insert own weavers"
  ON public.weavers FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Users can update own weavers"
  ON public.weavers FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can delete own weavers"
  ON public.weavers FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id());

-- PRODUCTIONS
DROP POLICY IF EXISTS "Allow all access to productions" ON public.productions;
CREATE POLICY "Users can read own productions"
  ON public.productions FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can insert own productions"
  ON public.productions FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Users can update own productions"
  ON public.productions FOR UPDATE
  TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Users can delete own productions"
  ON public.productions FOR DELETE
  TO authenticated
  USING (company_id = public.get_user_company_id());
