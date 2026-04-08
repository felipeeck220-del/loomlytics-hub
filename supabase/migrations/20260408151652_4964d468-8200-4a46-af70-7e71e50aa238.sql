UPDATE public.company_settings
SET enabled_nav_items = enabled_nav_items || '["faturamento-total"]'::jsonb
WHERE NOT (enabled_nav_items @> '["faturamento-total"]'::jsonb);