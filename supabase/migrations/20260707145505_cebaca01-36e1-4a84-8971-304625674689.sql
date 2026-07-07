UPDATE public.company_settings
SET enabled_nav_items = enabled_nav_items || '["freight-orders"]'::jsonb
WHERE company_id = (SELECT id FROM public.companies WHERE slug='trama-certa')
  AND NOT (enabled_nav_items ? 'freight-orders');