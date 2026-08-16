
-- Refatoração definitiva da RPC adjust_manual_machine_pallet para garantir substituição real.
-- O problema anterior era o cálculo do saldo atual (v_current_pc/kg) que não considerava saídas (out).
-- Agora usamos o saldo LÍQUIDO (Entradas - Saídas) para garantir que o zeramento seja exato.

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
    v_net_pc integer;
    v_net_kg numeric;
BEGIN
    -- 1. Calcula o saldo LÍQUIDO atual NA MÁQUINA para este trio
    -- Saldo = (Soma de In) - (Soma de Out) onde on_machine = true
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'in' THEN pieces ELSE -pieces END), 0),
        COALESCE(SUM(CASE WHEN type = 'in' THEN weight_kg ELSE -weight_kg END), 0)
    INTO v_net_pc, v_net_kg
    FROM public.manual_stock_movements
    WHERE company_id = p_company_id
      AND client_id = p_client_id
      AND article_id = p_article_id
      AND machine_id = p_machine_id
      AND on_machine = true;

    -- 2. Zera o saldo atual na máquina sempre (movimento de compensação)
    -- Se o saldo é positivo, fazemos um 'out' do valor total.
    -- Se por algum erro for negativo, faríamos um 'in', mas a lógica aqui foca em zerar o estado.
    IF v_net_pc <> 0 OR v_net_kg <> 0 THEN
        INSERT INTO public.manual_stock_movements (
            company_id, created_by, client_id, article_id, machine_id, 
            type, pieces, weight_kg, on_machine, description
        )
        VALUES (
            p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 
            CASE WHEN v_net_pc > 0 THEN 'out' ELSE 'in' END, 
            ABS(v_net_pc), ABS(v_net_kg), true, 
            'Ajuste de palete (zeramento para substituição absoluta)'
        );
    END IF;

    -- 3. Aplica a nova contagem (Substituição)
    IF p_action = 'substitute' THEN
        -- Insere o novo valor TOTAL como entrada na máquina
        INSERT INTO public.manual_stock_movements (
            company_id, created_by, client_id, article_id, machine_id, 
            type, pieces, weight_kg, on_machine, description
        )
        VALUES (
            p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 
            'in', p_pieces, p_weight_kg, true, 
            COALESCE(p_description, 'Recontagem de palete na máquina (substituição)')
        );
    
    ELSIF p_action = 'to_expedition' THEN
        -- Insere o novo valor TOTAL como entrada na expedição (on_machine = false)
        INSERT INTO public.manual_stock_movements (
            company_id, created_by, client_id, article_id, machine_id, 
            type, pieces, weight_kg, on_machine, description
        )
        VALUES (
            p_company_id, p_author_id, p_client_id, p_article_id, p_machine_id, 
            'in', p_pieces, p_weight_kg, false, 
            COALESCE(p_description, 'Palete lançado para expedição (substituição)')
        );
    END IF;
END;
$$;
