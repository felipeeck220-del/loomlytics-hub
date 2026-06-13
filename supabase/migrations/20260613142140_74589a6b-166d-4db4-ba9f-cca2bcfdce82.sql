
-- 1. Add 'cancelled' to enum
ALTER TYPE billing_order_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Add new columns for cancellation, edits, and order type
ALTER TABLE public.billing_orders
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'pieces',
  ADD COLUMN IF NOT EXISTS edit_note text,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz;

-- 3. Pieces_expected becomes optional (weight-only orders may omit it)
ALTER TABLE public.billing_orders ALTER COLUMN pieces_expected DROP NOT NULL;

-- 4. Constraint: order_type valid values
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_orders_order_type_check') THEN
    ALTER TABLE public.billing_orders
      ADD CONSTRAINT billing_orders_order_type_check CHECK (order_type IN ('pieces','weight'));
  END IF;
END $$;
