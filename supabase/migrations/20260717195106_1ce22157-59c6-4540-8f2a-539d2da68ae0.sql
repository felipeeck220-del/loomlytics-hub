ALTER TABLE public.freight_addresses REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.freight_addresses;
ALTER TABLE public.freight_orders REPLICA IDENTITY FULL;
ALTER TABLE public.freight_order_items REPLICA IDENTITY FULL;
ALTER TABLE public.freight_order_photos REPLICA IDENTITY FULL;
ALTER TABLE public.freighters REPLICA IDENTITY FULL;
ALTER TABLE public.freight_cost_companies REPLICA IDENTITY FULL;