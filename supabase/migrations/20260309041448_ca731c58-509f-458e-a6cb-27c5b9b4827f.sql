
-- Drop all existing restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Allow all access to articles" ON public.articles;
DROP POLICY IF EXISTS "Allow all access to clients" ON public.clients;
DROP POLICY IF EXISTS "Allow all access to companies" ON public.companies;
DROP POLICY IF EXISTS "Allow all access to machine_logs" ON public.machine_logs;
DROP POLICY IF EXISTS "Allow all access to machines" ON public.machines;
DROP POLICY IF EXISTS "Allow all access to productions" ON public.productions;
DROP POLICY IF EXISTS "Allow all access to weavers" ON public.weavers;

-- Recreate as PERMISSIVE policies (default)
CREATE POLICY "Allow all access to articles" ON public.articles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to clients" ON public.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to machine_logs" ON public.machine_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to machines" ON public.machines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to productions" ON public.productions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to weavers" ON public.weavers FOR ALL USING (true) WITH CHECK (true);
