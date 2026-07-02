
-- own_stock_movements: novas colunas para origem/fio/documento
ALTER TABLE public.own_stock_movements
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS outsource_company_id uuid REFERENCES public.outsource_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS yarn_type text,
  ADD COLUMN IF NOT EXISTS of_number text;

-- billing_order_pallets: vínculo com estoque próprio
ALTER TABLE public.billing_order_pallets
  ADD COLUMN IF NOT EXISTS own_article_id uuid REFERENCES public.own_stock_articles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS own_stock_movement_id uuid REFERENCES public.own_stock_movements(id) ON DELETE SET NULL;
