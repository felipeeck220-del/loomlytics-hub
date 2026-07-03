-- Enum de status da OT
CREATE TYPE public.article_change_status AS ENUM (
  'aberto',
  'troca_fio_em_curso',
  'aguardando_regulagem',
  'em_regulagem',
  'em_acompanhamento',
  'concluida',
  'cancelada'
);

CREATE TYPE public.article_change_feeder_type AS ENUM ('fio', 'elastano');

-- Tabela principal
CREATE TABLE public.article_change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ot_number INTEGER,
  machine_id UUID NOT NULL REFERENCES public.machines(id) ON DELETE RESTRICT,
  current_article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  next_article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  status public.article_change_status NOT NULL DEFAULT 'aberto',
  observations TEXT,

  -- Transições
  yarn_change_started_at TIMESTAMPTZ,
  yarn_change_ended_at TIMESTAMPTZ,
  adjustment_started_at TIMESTAMPTZ,
  adjustment_ended_at TIMESTAMPTZ,
  monitoring_started_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Autoria
  created_by_id UUID,
  created_by_name TEXT,
  created_by_code TEXT,
  yarn_change_by_name TEXT,
  yarn_change_by_code TEXT,
  yarn_change_finished_by_name TEXT,
  yarn_change_finished_by_code TEXT,
  adjustment_by_name TEXT,
  adjustment_by_code TEXT,
  adjustment_finished_by_name TEXT,
  adjustment_finished_by_code TEXT,
  concluded_by_name TEXT,
  concluded_by_code TEXT,
  cancelled_by_name TEXT,
  cancelled_by_code TEXT,

  -- Acompanhamento / revisão final
  monitoring_turns NUMERIC,
  piece_defects_holes INTEGER,
  piece_defects_flaws INTEGER,
  final_report TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_article_change_orders_company_ot ON public.article_change_orders(company_id, ot_number) WHERE ot_number IS NOT NULL;
CREATE INDEX ix_article_change_orders_company_status ON public.article_change_orders(company_id, status);
CREATE INDEX ix_article_change_orders_machine ON public.article_change_orders(machine_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_change_orders TO authenticated;
GRANT ALL ON public.article_change_orders TO service_role;

ALTER TABLE public.article_change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select article_change_orders" ON public.article_change_orders
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "tenant insert article_change_orders" ON public.article_change_orders
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant update article_change_orders" ON public.article_change_orders
  FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id()) WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant delete article_change_orders" ON public.article_change_orders
  FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Trigger de numeração
CREATE OR REPLACE FUNCTION public.assign_ot_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ot_number IS NULL THEN
    SELECT COALESCE(MAX(ot_number), 0) + 1
      INTO NEW.ot_number
    FROM public.article_change_orders
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_ot_number
  BEFORE INSERT ON public.article_change_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_ot_number();

CREATE TRIGGER trg_article_change_orders_updated_at
  BEFORE UPDATE ON public.article_change_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Fitas / fios da OT
CREATE TABLE public.article_change_yarns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.article_change_orders(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feeder_type public.article_change_feeder_type NOT NULL,
  feeder_position INTEGER NOT NULL,
  yarn_type_id UUID REFERENCES public.yarn_types(id) ON DELETE SET NULL,
  yarn_label TEXT,
  lfa NUMERIC,
  stretch NUMERIC,
  observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_article_change_yarns_slot ON public.article_change_yarns(order_id, feeder_type, feeder_position);
CREATE INDEX ix_article_change_yarns_order ON public.article_change_yarns(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_change_yarns TO authenticated;
GRANT ALL ON public.article_change_yarns TO service_role;

ALTER TABLE public.article_change_yarns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant select article_change_yarns" ON public.article_change_yarns
  FOR SELECT TO authenticated USING (company_id = public.get_user_company_id());
CREATE POLICY "tenant insert article_change_yarns" ON public.article_change_yarns
  FOR INSERT TO authenticated WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant update article_change_yarns" ON public.article_change_yarns
  FOR UPDATE TO authenticated USING (company_id = public.get_user_company_id()) WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "tenant delete article_change_yarns" ON public.article_change_yarns
  FOR DELETE TO authenticated USING (company_id = public.get_user_company_id());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.article_change_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.article_change_yarns;