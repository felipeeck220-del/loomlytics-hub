
-- Remove push_subscriptions duplicadas pelo mesmo endpoint (mesmo device
-- reassinado por outro user), mantendo apenas a linha mais recente.
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.endpoint = b.endpoint
  AND a.updated_at < b.updated_at;
