-- Tabela de Estoque Malha (Manual) 100% independente
CREATE TABLE IF NOT EXISTS public.manual_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('in','out')),
  pieces integer NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0,
  reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msm_company_created ON public.manual_stock_movements (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msm_article ON public.manual_stock_movements (article_id);
CREATE INDEX IF NOT EXISTS idx_msm_client ON public.manual_stock_movements (client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_stock_movements TO authenticated;
GRANT ALL ON public.manual_stock_movements TO service_role;

ALTER TABLE public.manual_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY msm_select ON public.manual_stock_movements FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY msm_insert ON public.manual_stock_movements FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY msm_update ON public.manual_stock_movements FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY msm_delete ON public.manual_stock_movements FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- RPCs simplificadas
CREATE OR REPLACE FUNCTION public.save_manual_stock_entry(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_caller uuid;
  v_company_id uuid;
  v_id uuid;
BEGIN
  v_company_id := (p_payload->>'company_id')::uuid;
  v_caller := public.get_user_company_id();
  IF v_caller IS NULL OR v_caller <> v_company_id THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.manual_stock_movements
    (company_id, article_id, client_id, machine_id, type, pieces, weight_kg, reason, created_by)
  VALUES
    (v_company_id, (p_payload->>'article_id')::uuid, (p_payload->>'client_id')::uuid, (p_payload->>'machine_id')::uuid,
     p_payload->>'type', (p_payload->>'pieces')::int, (p_payload->>'weight_kg')::numeric, p_payload->>'reason', v_caller)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.save_manual_stock_entry(jsonb) TO authenticated, service_role;
