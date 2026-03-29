UPDATE productions p
SET machine_id = m.id
FROM machines m
WHERE p.machine_id IS NULL
AND p.machine_name = m.name
AND p.company_id = m.company_id;