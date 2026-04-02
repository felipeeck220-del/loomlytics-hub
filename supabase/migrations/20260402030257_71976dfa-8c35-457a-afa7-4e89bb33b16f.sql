-- Add permission_overrides JSONB column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS permission_overrides jsonb NOT NULL DEFAULT '[]'::jsonb;