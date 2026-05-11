-- Função para KPIs Gerais
CREATE OR REPLACE FUNCTION public.get_report_kpis(
    p_company_id UUID,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_shift TEXT DEFAULT 'all',
    p_machine_id UUID DEFAULT NULL,
    p_client_id UUID DEFAULT NULL,
    p_article_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_rolls BIGINT,
    total_weight NUMERIC,
    total_revenue NUMERIC,
    avg_efficiency NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(p.rolls_produced), 0)::BIGINT as total_rolls,
        COALESCE(SUM(p.weight_kg), 0)::NUMERIC as total_weight,
        COALESCE(SUM(p.revenue), 0)::NUMERIC as total_revenue,
        CASE 
            WHEN SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END) > 0 
            THEN SUM(p.efficiency * p.weight_kg) / SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END)
            ELSE 0 
        END::NUMERIC as avg_efficiency
    FROM public.productions p
    LEFT JOIN public.articles a ON p.article_id = a.id
    WHERE p.company_id = p_company_id
      AND (p_date_from IS NULL OR p.date >= p_date_from)
      AND (p_date_to IS NULL OR p.date <= p_date_to)
      AND (p_shift = 'all' OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Função por Turno
CREATE OR REPLACE FUNCTION public.get_report_by_shift(
    p_company_id UUID,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_machine_id UUID DEFAULT NULL,
    p_client_id UUID DEFAULT NULL,
    p_article_id UUID DEFAULT NULL
)
RETURNS TABLE (
    shift TEXT,
    rolos BIGINT,
    kg NUMERIC,
    faturamento NUMERIC,
    eficiencia NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.shift,
        SUM(p.rolls_produced)::BIGINT as rolos,
        SUM(p.weight_kg)::NUMERIC as kg,
        SUM(p.revenue)::NUMERIC as faturamento,
        CASE 
            WHEN SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END) > 0 
            THEN SUM(p.efficiency * p.weight_kg) / SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END)
            ELSE 0 
        END::NUMERIC as eficiencia
    FROM public.productions p
    LEFT JOIN public.articles a ON p.article_id = a.id
    WHERE p.company_id = p_company_id
      AND (p_date_from IS NULL OR p.date >= p_date_from)
      AND (p_date_to IS NULL OR p.date <= p_date_to)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
    GROUP BY p.shift;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Função por Máquina
CREATE OR REPLACE FUNCTION public.get_report_by_machine(
    p_company_id UUID,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_shift TEXT DEFAULT 'all',
    p_client_id UUID DEFAULT NULL,
    p_article_id UUID DEFAULT NULL
)
RETURNS TABLE (
    machine_id UUID,
    machine_name TEXT,
    rolos BIGINT,
    kg NUMERIC,
    faturamento NUMERIC,
    eficiencia NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.machine_id,
        COALESCE(m.name, p.machine_name, 'Sem Máquina') as machine_name,
        SUM(p.rolls_produced)::BIGINT as rolos,
        SUM(p.weight_kg)::NUMERIC as kg,
        SUM(p.revenue)::NUMERIC as faturamento,
        CASE 
            WHEN SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END) > 0 
            THEN SUM(p.efficiency * p.weight_kg) / SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END)
            ELSE 0 
        END::NUMERIC as eficiencia
    FROM public.productions p
    LEFT JOIN public.machines m ON p.machine_id = m.id
    LEFT JOIN public.articles a ON p.article_id = a.id
    WHERE p.company_id = p_company_id
      AND (p_date_from IS NULL OR p.date >= p_date_from)
      AND (p_date_to IS NULL OR p.date <= p_date_to)
      AND (p_shift = 'all' OR p.shift = p_shift)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
    GROUP BY p.machine_id, m.name, p.machine_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Função por Cliente
CREATE OR REPLACE FUNCTION public.get_report_by_client(
    p_company_id UUID,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_shift TEXT DEFAULT 'all',
    p_machine_id UUID DEFAULT NULL,
    p_article_id UUID DEFAULT NULL
)
RETURNS TABLE (
    client_id UUID,
    client_name TEXT,
    rolos BIGINT,
    kg NUMERIC,
    faturamento NUMERIC,
    eficiencia NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.client_id,
        COALESCE(c.name, p.client_name, 'Sem Cliente') as client_name,
        SUM(p.rolls_produced)::BIGINT as rolos,
        SUM(p.weight_kg)::NUMERIC as kg,
        SUM(p.revenue)::NUMERIC as faturamento,
        CASE 
            WHEN SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END) > 0 
            THEN SUM(p.efficiency * p.weight_kg) / SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END)
            ELSE 0 
        END::NUMERIC as eficiencia
    FROM public.productions p
    LEFT JOIN public.articles a ON p.article_id = a.id
    LEFT JOIN public.clients c ON a.client_id = c.id
    WHERE p.company_id = p_company_id
      AND (p_date_from IS NULL OR p.date >= p_date_from)
      AND (p_date_to IS NULL OR p.date <= p_date_to)
      AND (p_shift = 'all' OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
    GROUP BY a.client_id, c.name, p.client_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Função por Artigo
CREATE OR REPLACE FUNCTION public.get_report_by_article(
    p_company_id UUID,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_shift TEXT DEFAULT 'all',
    p_machine_id UUID DEFAULT NULL,
    p_client_id UUID DEFAULT NULL
)
RETURNS TABLE (
    article_id UUID,
    article_name TEXT,
    rolos BIGINT,
    kg NUMERIC,
    faturamento NUMERIC,
    eficiencia NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.article_id,
        COALESCE(a.name, p.article_name, 'Sem Artigo') as article_name,
        SUM(p.rolls_produced)::BIGINT as rolos,
        SUM(p.weight_kg)::NUMERIC as kg,
        SUM(p.revenue)::NUMERIC as faturamento,
        CASE 
            WHEN SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END) > 0 
            THEN SUM(p.efficiency * p.weight_kg) / SUM(CASE WHEN p.efficiency > 0 THEN p.weight_kg ELSE 0 END)
            ELSE 0 
        END::NUMERIC as eficiencia
    FROM public.productions p
    LEFT JOIN public.articles a ON p.article_id = a.id
    WHERE p.company_id = p_company_id
      AND (p_date_from IS NULL OR p.date >= p_date_from)
      AND (p_date_to IS NULL OR p.date <= p_date_to)
      AND (p_shift = 'all' OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
    GROUP BY p.article_id, a.name, p.article_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Função para Evolução (Gráfico)
CREATE OR REPLACE FUNCTION public.get_report_evolution(
    p_company_id UUID,
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL,
    p_shift TEXT DEFAULT 'all',
    p_machine_id UUID DEFAULT NULL,
    p_client_id UUID DEFAULT NULL,
    p_article_id UUID DEFAULT NULL
)
RETURNS TABLE (
    date DATE,
    rolos BIGINT,
    faturamento NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.date,
        SUM(p.rolls_produced)::BIGINT as rolos,
        SUM(p.revenue)::NUMERIC as faturamento
    FROM public.productions p
    LEFT JOIN public.articles a ON p.article_id = a.id
    WHERE p.company_id = p_company_id
      AND (p_date_from IS NULL OR p.date >= p_date_from)
      AND (p_date_to IS NULL OR p.date <= p_date_to)
      AND (p_shift = 'all' OR p.shift = p_shift)
      AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
      AND (p_client_id IS NULL OR a.client_id = p_client_id)
      AND (p_article_id IS NULL OR p.article_id = p_article_id)
    GROUP BY p.date
    ORDER BY p.date ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;