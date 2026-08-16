-- leia o arquivo mestre.md (OBRIGATÓRIO LER ANTES DE ATUALIZAR O PROJETO) e prossiga -> exclua Estoque Malha (Manual) que acabamos de criar e todos os seus codigos
DROP FUNCTION IF EXISTS public.get_manual_stock_movements_independent(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_manual_stock_estoque_independent(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.save_manual_stock_entry(jsonb);
DROP TABLE IF EXISTS public.manual_stock_movements CASCADE;