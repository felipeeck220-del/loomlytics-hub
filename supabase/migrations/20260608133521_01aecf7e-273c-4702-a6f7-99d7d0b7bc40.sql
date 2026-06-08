ALTER TABLE public.cylinders ADD COLUMN sinker_quantity INTEGER;
COMMENT ON COLUMN public.cylinders.sinker_quantity IS 'Quantidade de platinas vinculadas a este cilindro (opcional)';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cylinders TO authenticated;
GRANT ALL ON public.cylinders TO service_role;