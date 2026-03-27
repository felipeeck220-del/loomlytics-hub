
-- =========================================
-- Multi-company support migration
-- =========================================

-- 1. Add slug to companies
ALTER TABLE companies ADD COLUMN slug text;

-- Generate URL-friendly slugs from company names
UPDATE companies SET slug = lower(
  regexp_replace(
    regexp_replace(
      translate(name, 
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñ', 
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'),
      '[^a-zA-Z0-9 -]', '', 'g'
    ),
    '\s+', '-', 'g'
  )
);

-- Handle empty slugs
UPDATE companies SET slug = 'empresa-' || left(id::text, 8) WHERE slug IS NULL OR slug = '';

-- Deduplicate slugs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) as rn
    FROM companies
  LOOP
    IF r.rn > 1 THEN
      UPDATE companies SET slug = r.slug || '-' || r.rn WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

ALTER TABLE companies ALTER COLUMN slug SET NOT NULL;
ALTER TABLE companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);

-- 2. Restructure profiles for multi-company support
-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can read company profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Drop the trigger
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON profiles;

-- Alter table: rename id → user_id, add new auto PK
ALTER TABLE profiles DROP CONSTRAINT profiles_pkey;
ALTER TABLE profiles RENAME COLUMN id TO user_id;
ALTER TABLE profiles ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE profiles ADD PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT profiles_user_company_unique UNIQUE (user_id, company_id);

-- 3. Create user_active_company table
CREATE TABLE user_active_company (
  user_id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE
);

ALTER TABLE user_active_company ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own active company" ON user_active_company 
  FOR ALL TO authenticated 
  USING (user_id = auth.uid()) 
  WITH CHECK (user_id = auth.uid());

-- Populate from existing profiles
INSERT INTO user_active_company (user_id, company_id)
SELECT DISTINCT ON (user_id) user_id, company_id FROM profiles
ORDER BY user_id, created_at
ON CONFLICT DO NOTHING;

-- 4. Update get_user_company_id to use active company
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT company_id FROM public.user_active_company WHERE user_id = auth.uid()
$$;

-- 5. Recreate profiles RLS policies
CREATE POLICY "Users can read company profiles" ON profiles 
  FOR SELECT TO authenticated 
  USING (company_id = get_user_company_id());

CREATE POLICY "Users can insert profile" ON profiles 
  FOR INSERT TO authenticated 
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON profiles 
  FOR UPDATE TO authenticated 
  USING (user_id = auth.uid() AND company_id = get_user_company_id());

-- 6. Recreate the trigger
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_profile_privilege_escalation();

-- 7. Function to set active company
CREATE OR REPLACE FUNCTION public.set_active_company(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid() AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Access denied to this company';
  END IF;
  
  INSERT INTO user_active_company (user_id, company_id)
  VALUES (auth.uid(), _company_id)
  ON CONFLICT (user_id) DO UPDATE SET company_id = _company_id;
END;
$$;

-- 8. Function to get all companies for a user
CREATE OR REPLACE FUNCTION public.get_user_companies()
RETURNS TABLE(company_id uuid, company_name text, company_slug text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.company_id, c.name, c.slug, p.role
  FROM profiles p
  JOIN companies c ON c.id = p.company_id
  WHERE p.user_id = auth.uid()
$$;
