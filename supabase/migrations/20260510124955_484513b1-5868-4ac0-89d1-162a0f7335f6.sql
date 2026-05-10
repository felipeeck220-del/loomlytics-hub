-- Função para buscar meses únicos com produção
CREATE OR REPLACE FUNCTION public.get_production_filter_months(p_company_id UUID)
RETURNS TABLE (month_str TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT to_char(date::date, 'YYYY-MM') as month_str
  FROM public.productions
  WHERE company_id = p_company_id
  ORDER BY month_str DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para buscar máquinas únicas com produção
CREATE OR REPLACE FUNCTION public.get_production_filter_machines(p_company_id UUID)
RETURNS TABLE (id UUID, name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT m.id, m.name
  FROM public.machines m
  JOIN public.productions p ON p.machine_id = m.id
  WHERE p.company_id = p_company_id
  ORDER BY m.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para buscar clientes únicos com produção
CREATE OR REPLACE FUNCTION public.get_production_filter_clients(p_company_id UUID)
RETURNS TABLE (id UUID, name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT c.id, c.name
  FROM public.clients c
  JOIN public.articles a ON a.client_id = c.id
  JOIN public.productions p ON p.article_id = a.id
  WHERE p.company_id = p_company_id
  ORDER BY c.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para buscar artigos únicos com produção
CREATE OR REPLACE FUNCTION public.get_production_filter_articles(p_company_id UUID)
RETURNS TABLE (id UUID, name TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT a.id, a.name
  FROM public.articles a
  JOIN public.productions p ON p.article_id = a.id
  WHERE p.company_id = p_company_id
  ORDER BY a.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;