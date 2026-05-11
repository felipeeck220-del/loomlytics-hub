import { supabase } from '@/integrations/supabase/client';

export interface ReportFilter {
  company_id: string;
  date_from?: string;
  date_to?: string;
  shift?: string;
  machine_id?: string;
  client_id?: string;
  article_id?: string;
}

export const getReportKpis = async (filters: ReportFilter) => {
  const { data, error } = await supabase.rpc('get_report_kpis', {
    p_company_id: filters.company_id,
    p_date_from: filters.date_from || null,
    p_date_to: filters.date_to || null,
    p_shift: filters.shift || 'all',
    p_machine_id: filters.machine_id || null,
    p_client_id: filters.client_id || null,
    p_article_id: filters.article_id || null,
  });

  if (error) throw error;
  return data[0];
};

export const getReportByShift = async (filters: Omit<ReportFilter, 'shift'>) => {
  const { data, error } = await supabase.rpc('get_report_by_shift', {
    p_company_id: filters.company_id,
    p_date_from: filters.date_from || null,
    p_date_to: filters.date_to || null,
    p_machine_id: filters.machine_id || null,
    p_client_id: filters.client_id || null,
    p_article_id: filters.article_id || null,
  });

  if (error) throw error;
  return data;
};

export const getReportByMachine = async (filters: ReportFilter) => {
  const { data, error } = await supabase.rpc('get_report_by_machine', {
    p_company_id: filters.company_id,
    p_date_from: filters.date_from || null,
    p_date_to: filters.date_to || null,
    p_shift: filters.shift || 'all',
    p_client_id: filters.client_id || null,
    p_article_id: filters.article_id || null,
  });

  if (error) throw error;
  return data;
};

export const getReportByClient = async (filters: ReportFilter) => {
  const { data, error } = await supabase.rpc('get_report_by_client', {
    p_company_id: filters.company_id,
    p_date_from: filters.date_from || null,
    p_date_to: filters.date_to || null,
    p_shift: filters.shift || 'all',
    p_machine_id: filters.machine_id || null,
    p_article_id: filters.article_id || null,
  });

  if (error) throw error;
  return data;
};

export const getReportByArticle = async (filters: ReportFilter) => {
  const { data, error } = await supabase.rpc('get_report_by_article', {
    p_company_id: filters.company_id,
    p_date_from: filters.date_from || null,
    p_date_to: filters.date_to || null,
    p_shift: filters.shift || 'all',
    p_machine_id: filters.machine_id || null,
    p_client_id: filters.client_id || null,
  });

  if (error) throw error;
  return data;
};

export const getReportEvolution = async (filters: ReportFilter) => {
  const { data, error } = await supabase.rpc('get_report_evolution', {
    p_company_id: filters.company_id,
    p_date_from: filters.date_from || null,
    p_date_to: filters.date_to || null,
    p_shift: filters.shift || 'all',
    p_machine_id: filters.machine_id || null,
    p_client_id: filters.client_id || null,
    p_article_id: filters.article_id || null,
  });

  if (error) throw error;
  return data;
};
