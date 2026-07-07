
ALTER TABLE public.freight_order_items
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'malha',
  ADD COLUMN IF NOT EXISTS yarn_type_id uuid REFERENCES public.yarn_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS yarn_type_name text,
  ADD COLUMN IF NOT EXISTS boxes integer;

ALTER TABLE public.freight_order_items
  DROP CONSTRAINT IF EXISTS freight_order_items_item_type_check;
ALTER TABLE public.freight_order_items
  ADD CONSTRAINT freight_order_items_item_type_check CHECK (item_type IN ('malha','fio'));

ALTER TABLE public.freight_orders
  ADD COLUMN IF NOT EXISTS delivery_doc_type text,
  ADD COLUMN IF NOT EXISTS delivery_doc_number text,
  ADD COLUMN IF NOT EXISTS freight_price_per_kg numeric(12,4),
  ADD COLUMN IF NOT EXISTS freight_total numeric(14,2);

ALTER TABLE public.freight_orders
  DROP CONSTRAINT IF EXISTS freight_orders_delivery_doc_type_check;
ALTER TABLE public.freight_orders
  ADD CONSTRAINT freight_orders_delivery_doc_type_check CHECK (delivery_doc_type IS NULL OR delivery_doc_type IN ('nf','rom'));
