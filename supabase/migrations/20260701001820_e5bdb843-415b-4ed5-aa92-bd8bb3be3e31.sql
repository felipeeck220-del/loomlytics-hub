-- Garante que um cilindro só possa estar vinculado a uma máquina por vez
CREATE UNIQUE INDEX IF NOT EXISTS cylinders_machine_id_unique
  ON public.cylinders (machine_id)
  WHERE machine_id IS NOT NULL;