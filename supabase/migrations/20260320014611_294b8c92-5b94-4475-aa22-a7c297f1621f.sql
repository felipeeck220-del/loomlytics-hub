
DELETE FROM productions WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
DELETE FROM article_machine_turns WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
DELETE FROM outsource_productions WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
DELETE FROM machine_logs WHERE machine_id IN (SELECT id FROM machines WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711');
DELETE FROM articles WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
DELETE FROM machines WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
DELETE FROM weavers WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
DELETE FROM clients WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
DELETE FROM outsource_companies WHERE company_id = '5f9c3749-39e8-4caf-a3af-2f6affb92711';
