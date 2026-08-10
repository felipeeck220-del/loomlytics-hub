
DELETE FROM public.manual_stock_movements 
WHERE company_id = 'a664927c-a285-4997-8faa-8c90985c6fac'
  AND type = 'release'
  AND created_at > now() - interval '1 hour'
  AND reason LIKE '%removido (libera reserva · sem máquina)%';
