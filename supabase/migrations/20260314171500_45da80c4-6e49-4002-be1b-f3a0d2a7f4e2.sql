-- Create platform_admins table for super admin access
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS - only service_role can manage this table
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to check if they are a platform admin (read-only)
CREATE POLICY "Users can check own platform admin status"
ON public.platform_admins
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Security definer function to check platform admin status
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  )
$$;