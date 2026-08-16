-- RPC para ajustar palete (substituir ou lançar para expedição)
-- Ajustada para zera o saldo atual na máquina e aplicar o novo valor conforme a ação
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
    -- Somamos as entradas on_machine e subtraímos as saídas on_machine
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'in' AND on_machine THEN pieces ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'in' AND on_machine THEN weight_kg ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'out' AND on_machine THEN pieces ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'out' AND on_machine THEN weight_kg ELSE 0 END), 0)
    INTO v_current_pc_in, v_current_kg_in, v_current_pc_out, v_current_kg_out
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id
      AND client_id = p_client_id
      AND article_id = p_article_id
      AND machine_id = p_machine_id;

    v_net_pc := v_current_pc_in - v_current_pc_out;
    v_net_kg := v_current_kg_in - v_current_kg_out;

    -- 2. Zera o saldo atual na máquina com um movimento de saída "on_machine" do saldo LÍQUIDO
    IF v_net_pc > 0 OR v_net_kg > 0 THEN
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'out', v_net_pc, v_net_kg, true, 'Ajuste de palete (zeramento para nova ação)');
    END IF;

    -- 3. Aplica a nova ação
    IF p_action = 'substitute' THEN
        -- Apenas insere o novo valor como entrada "on_machine"
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'in', p_pieces, p_weight_kg, true, COALESCE(p_description, 'Recontagem de palete na máquina'));
    ELSIF p_action = 'to_expedition' THEN
        -- Insere o novo valor como entrada normal (expedição)
        INSERT INTO public.manual_stock_movements (company_id, created_by, client_id, article_id, machine_id, type, pieces, weight_kg, on_machine, description)
        VALUES (p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 'in', p_pieces, p_weight_kg, false, COALESCE(p_description, 'Palete lançado para expedição'));
    END IF;
END;
$$;