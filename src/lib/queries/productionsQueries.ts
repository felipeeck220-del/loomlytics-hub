import { supabase } from '@/integrations/supabase/client';
import type { Production, ShiftType } from '@/types';

export interface ProductionFilter {
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;
  shift?: ShiftType | 'all';
  machineId?: string;
  articleId?: string;
  page?: number;
  pageSize?: number;
}

const normalizeShift = (shift: string): ShiftType => {
  if (!shift) return 'manha';
  const lower = shift.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (lower.startsWith('manha')) return 'manha';
  if (lower.startsWith('tarde')) return 'tarde';
  if (lower.startsWith('noite')) return 'noite';
  return 'manha';
};

export const mapProduction = (r: any): Production => ({
  id: r.id,
  company_id: r.company_id,
  date: r.date,
  shift: normalizeShift(r.shift),
  machine_id: r.machine_id || '',
  machine_name: r.machine_name || '',
  weaver_id: r.weaver_id || '',
  weaver_name: r.weaver_name || '',
  article_id: r.article_id || '',
  article_name: r.article_name || '',
  rpm: Number(r.rpm),
  rolls_produced: Number(r.rolls_produced),
  weight_kg: Number(r.weight_kg),
  revenue: Number(r.revenue),
  efficiency: Number(r.efficiency),
  created_at: r.created_at,
  created_by_name: r.created_by_name || undefined,
  created_by_code: r.created_by_code || undefined,
});

export async function fetchProductionsPage(
  companyId: string,
  filter: ProductionFilter
) {
  const { data, error } = await supabase.rpc('fetch_productions_page', {
    p_company_id: companyId,
    p_start_date: filter.startDate,
    p_end_date: filter.endDate,
    p_page: filter.page ?? 0,
    p_page_size: filter.pageSize ?? 50,
    p_shift: filter.shift ?? 'all',
    p_machine_id: filter.machineId || null,
    p_article_id: filter.articleId || null,
  });

  if (error) throw error;

   const totalCount = (data && data.length > 0 && 'total_count' in data[0]) ? Number(data[0].total_count) : 0;

  return {
    items: (data || []).map(mapProduction),
    total: totalCount,
    page: filter.page ?? 0,
    pageSize: filter.pageSize ?? 50,
    hasMore: ((filter.page ?? 0) + 1) * (filter.pageSize ?? 50) < totalCount,
  };
}

export async function getProductionStats(
  companyId: string,
  startDate: string,
  endDate: string,
  filter?: { shift?: string; machineId?: string; articleId?: string }
) {
  const { data, error } = await supabase.rpc('get_production_stats', {
    p_company_id: companyId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_shift: filter?.shift ?? 'all',
    p_machine_id: filter?.machineId || null,
    p_article_id: filter?.articleId || null,
  });

  if (error) throw error;
  return data?.[0] || { total_weight: 0, total_revenue: 0, total_rolls: 0, avg_efficiency: 0, record_count: 0 };
}