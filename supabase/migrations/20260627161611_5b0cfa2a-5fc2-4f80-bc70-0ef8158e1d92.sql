UPDATE public.company_settings cs
SET enabled_nav_items = cs.enabled_nav_items || '["estoque-fio"]'::jsonb
FROM public.companies c
WHERE cs.company_id = c.id
  AND c.slug = 'trama-certa'
  AND NOT (cs.enabled_nav_items @> '["estoque-fio"]'::jsonb);