CREATE OR REPLACE FUNCTION public.get_faturamento_available_months(p_company_id UUID)
RETURNS TABLE (month_str TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH all_dates AS (
        SELECT date FROM public.productions WHERE company_id = p_company_id
        UNION ALL
        SELECT date FROM public.outsource_productions WHERE company_id = p_company_id
        UNION ALL
        SELECT date FROM public.residue_sales WHERE company_id = p_company_id
    )
    SELECT DISTINCT substring(date, 1, 7)
    FROM all_dates
    WHERE date IS NOT NULL AND date ~ '^\d{4}-\d{2}'
    ORDER BY 1 DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_faturamento_available_months(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_faturamento_available_months(UUID) TO service_role;
