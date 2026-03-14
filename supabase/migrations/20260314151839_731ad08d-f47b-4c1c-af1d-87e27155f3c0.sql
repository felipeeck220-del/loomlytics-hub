
-- Allow users to read all profiles in the same company
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read company profiles" ON public.profiles FOR SELECT TO authenticated USING (company_id = get_user_company_id());

-- Add status column to profiles for active/inactive management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
