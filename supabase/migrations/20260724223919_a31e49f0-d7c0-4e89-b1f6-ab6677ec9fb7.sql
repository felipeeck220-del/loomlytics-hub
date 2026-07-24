
ALTER TABLE public.freight_order_items DROP CONSTRAINT IF EXISTS freight_order_items_item_type_check;
ALTER TABLE public.freight_order_items ADD CONSTRAINT freight_order_items_item_type_check CHECK (item_type = ANY (ARRAY['malha'::text, 'fio'::text, 'outros'::text]));
ALTER TABLE public.freight_order_items ADD COLUMN IF NOT EXISTS description text;
