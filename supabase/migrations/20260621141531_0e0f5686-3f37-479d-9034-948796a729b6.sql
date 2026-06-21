
CREATE TABLE IF NOT EXISTS public.machine_needle_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  needle_id uuid NOT NULL REFERENCES public.needle_inventory(id) ON DELETE CASCADE,
  position text NOT NULL DEFAULT 'mono' CHECK (position IN ('mono','cilindro','disco')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, needle_id, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_needle_refs TO authenticated;
GRANT ALL ON public.machine_needle_refs TO service_role;
ALTER TABLE public.machine_needle_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant select machine_needle_refs" ON public.machine_needle_refs FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "tenant insert machine_needle_refs" ON public.machine_needle_refs FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant update machine_needle_refs" ON public.machine_needle_refs FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id()) WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant delete machine_needle_refs" ON public.machine_needle_refs FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

CREATE TABLE IF NOT EXISTS public.machine_sinker_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  sinker_id uuid NOT NULL REFERENCES public.sinker_inventory(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (machine_id, sinker_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_sinker_refs TO authenticated;
GRANT ALL ON public.machine_sinker_refs TO service_role;
ALTER TABLE public.machine_sinker_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant select machine_sinker_refs" ON public.machine_sinker_refs FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "tenant insert machine_sinker_refs" ON public.machine_sinker_refs FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant update machine_sinker_refs" ON public.machine_sinker_refs FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id()) WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant delete machine_sinker_refs" ON public.machine_sinker_refs FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Migrar dados antigos
INSERT INTO public.machine_needle_refs (company_id, machine_id, needle_id, position)
SELECT m.company_id, m.id, m.current_needle_id,
  CASE WHEN m.machine_type = 'dupla' THEN 'cilindro' ELSE 'mono' END
FROM public.machines m
WHERE m.current_needle_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.machine_sinker_refs (company_id, machine_id, sinker_id)
SELECT m.company_id, m.id, m.current_sinker_id
FROM public.machines m
WHERE m.current_sinker_id IS NOT NULL
ON CONFLICT DO NOTHING;
