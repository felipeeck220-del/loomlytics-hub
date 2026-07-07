-- Add FKs from freight_orders.*_by columns to profiles(id) so PDF/audit joins work
ALTER TABLE public.freight_orders
  ADD CONSTRAINT freight_orders_pickup_started_by_fkey FOREIGN KEY (pickup_started_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.freight_orders
  ADD CONSTRAINT freight_orders_delivery_started_by_fkey FOREIGN KEY (delivery_started_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.freight_orders
  ADD CONSTRAINT freight_orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.freight_orders
  ADD CONSTRAINT freight_orders_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;