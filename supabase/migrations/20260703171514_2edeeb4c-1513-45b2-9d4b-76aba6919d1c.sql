
ALTER TABLE public.maintenance_orders ADD COLUMN IF NOT EXISTS oc_number integer;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_orders_company_oc_number_uidx
  ON public.maintenance_orders(company_id, oc_number) WHERE oc_number IS NOT NULL;

-- Backfill: assign fresh oc_number per company (ordem cronológica) para as corretivas existentes
-- e libera seus om_number (que passam a valer somente para OM).
WITH ranked AS (
  SELECT id, company_id,
    ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
  FROM public.maintenance_orders
  WHERE type = 'manutencao_corretiva'
)
UPDATE public.maintenance_orders m
SET oc_number = r.rn, om_number = NULL
FROM ranked r
WHERE m.id = r.id;

-- Trigger unificado: OM usa numeração própria (não-corretivas); OC usa oc_number.
CREATE OR REPLACE FUNCTION public.assign_om_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'manutencao_corretiva' THEN
    IF NEW.oc_number IS NULL OR NEW.oc_number = 0 THEN
      SELECT COALESCE(MAX(oc_number), 0) + 1
        INTO NEW.oc_number
        FROM public.maintenance_orders
        WHERE company_id = NEW.company_id
          AND type = 'manutencao_corretiva';
    END IF;
    NEW.om_number := NULL;
  ELSE
    IF NEW.om_number IS NULL OR NEW.om_number = 0 THEN
      SELECT COALESCE(MAX(om_number), 0) + 1
        INTO NEW.om_number
        FROM public.maintenance_orders
        WHERE company_id = NEW.company_id
          AND type <> 'manutencao_corretiva';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
