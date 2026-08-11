DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'billing_order_type' AND n.nspname = 'public') THEN 
    CREATE TYPE public.billing_order_type AS ENUM ('standard', 'express');
    GRANT USAGE ON TYPE public.billing_order_type TO authenticated, anon, service_role;
  END IF;
END $$;