-- Corrigindo a RPC para garantir substituição e diferencial na expedição
CREATE OR REPLACE FUNCTION public.adjust_manual_machine_pallet(
    p_company_id uuid,
    p_author_id uuid,
    p_client_id uuid,
    p_article_id uuid,
    p_machine_id uuid,
    p_pieces integer,
    p_weight_kg numeric,
    p_action text, -- 'substitute' ou 'to_expedition'
    p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_pc_in integer;
    v_current_kg_in numeric;
    v_current_pc_out integer;
    v_current_kg_out numeric;
    v_net_pc integer;
    v_net_kg numeric;
BEGIN
    -- 1. Pega saldo líquido atual NA MÁQUINA para este trio
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'in' THEN pieces ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'in' THEN weight_kg ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'out' THEN pieces ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'out' THEN weight_kg ELSE 0 END), 0)
    INTO v_current_pc_in, v_current_kg_in, v_current_pc_out, v_current_kg_out
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id
      AND client_id = p_client_id
      AND article_id = p_article_id
      AND machine_id = p_machine_id
      AND on_machine = true;

    v_net_pc := v_current_pc_in - v_current_pc_out;
    v_net_kg := v_current_kg_in - v_current_kg_out;

    -- 2. Zera o saldo atual na máquina sempre (movimento de saída "on_machine")
    IF v_net_pc > 0 OR v_net_kg > 0 THEN
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'out', v_net_pc, v_net_kg, true, 'Ajuste de palete (zeramento para nova ação)');
    END IF;

    -- 3. Aplica a nova ação
    IF p_action = 'substitute' THEN
        -- Apenas insere o novo valor como entrada "on_machine" (SUBSTITUI o que foi zerado)
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'in', p_pieces, p_weight_kg, true, COALESCE(p_description, 'Recontagem de palete na máquina'));
    
    ELSIF p_action = 'to_expedition' THEN
        -- REGRA: Peças em máquina JÁ CONTAM no "Disponível".
        -- Se eu tinha 5 na máquina e informo que o palete agora tem 20, a diferença é 15.
        -- Como zeramos os 5 acima, temos que adicionar apenas a diferença para que o "Disponível" reflita o novo total.
        -- Cálculo: Se p_pieces = 20 e v_net_pc = 5, inserimos 15 na expedição. Total final = 20.
        
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (
            p_company_id, 
            p_author_id, 
            p_client_id, 
            p_article_id, 
            p_machine_id, 
            'in', 
            p_pieces - v_net_pc, 
            p_weight_kg - v_net_kg, 
            false, 
            COALESCE(p_description, 'Diferença de palete lançada para expedição')
        );
    END IF;
END;
$$;