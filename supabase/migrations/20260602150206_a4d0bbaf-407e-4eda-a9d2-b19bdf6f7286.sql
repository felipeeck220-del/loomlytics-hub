-- Alter total_freight to be a regular column
ALTER TABLE public.outsource_freights ALTER COLUMN total_freight DROP EXPRESSION;

-- Ensure it has a default of 0 if needed, although it might be better to leave it nullable or handle in app
ALTER TABLE public.outsource_freights ALTER COLUMN total_freight SET DEFAULT 0;
ALTER TABLE public.outsource_freights ALTER COLUMN total_freight SET NOT NULL;
