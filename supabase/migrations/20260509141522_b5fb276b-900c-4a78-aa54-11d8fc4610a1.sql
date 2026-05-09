-- Normalizar os turnos para minúsculo e sem acento
UPDATE public.productions
SET shift = 'manha'
WHERE shift IN ('Manhã', 'Manha', 'MANHA', 'manha');

UPDATE public.productions
SET shift = 'tarde'
WHERE shift IN ('Tarde', 'TARDE', 'tarde');

UPDATE public.productions
SET shift = 'noite'
WHERE shift IN ('Noite', 'NOITE', 'noite');
