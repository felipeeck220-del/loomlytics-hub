UPDATE machines SET name = 'TEAR 03' WHERE id = 'b1627906-c869-5cb2-bcf8-8741d9c57a03';
UPDATE machines SET name = 'TEAR 04' WHERE id = 'de89d53a-4a01-5288-8683-cbdde60e8222';
UPDATE productions SET machine_id = 'b1627906-c869-5cb2-bcf8-8741d9c57a03' WHERE machine_name = 'TEAR 03' AND machine_id IS NULL AND company_id = 'a664927c-a285-4997-8faa-8c90985c6fac';
UPDATE productions SET machine_id = 'de89d53a-4a01-5288-8683-cbdde60e8222' WHERE machine_name = 'TEAR 04' AND machine_id IS NULL AND company_id = 'a664927c-a285-4997-8faa-8c90985c6fac';