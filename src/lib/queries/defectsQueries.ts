import { supabase } from '@/integrations/supabase/client';
import type { DefectRecord, ShiftType } from '@/types';

export interface DefectFilter {
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;
  shift?: ShiftType | 'all';
  machineId?: string;
  articleId?: string;
  weaverId?: string;
  searchTerm?: string;
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

export const mapDefectRecord = (r: any): DefectRecord => ({
  id: r.id,
  company_id: r.company_id,
  machine_id: r.machine_id || '',
  article_id: r.article_id || '',
  weaver_id: r.weaver_id || '',
  date: r.date,
  shift: normalizeShift(r.shift),
  measure_type: r.measure_type || 'kg',
  measure_value: Number(r.measure_value),
  machine_name: r.machine_name || undefined,
  article_name: r.article_name || undefined,
  weaver_name: r.weaver_name || undefined,
  observations: r.observations || undefined,
  created_by_name: r.created_by_name || undefined,
  created_by_code: r.created_by_code || undefined,
  created_at: r.created_at,
});

export async function fetchDefectsPage(
  companyId: string,
  filter: DefectFilter
) {
  // We'll use RPC if available, or complex query
  // For now, let's use a standard query since we might not have a specific RPC for defects yet
  let q = supabase
    .from('defect_records')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .gte('date', filter.startDate)
    .lte('date', filter.endDate)
    .order('date', { ascending: false })
    .order('id', { ascending: true });

  if (filter.shift && filter.shift !== 'all') q = q.eq('shift', filter.shift);
  if (filter.machineId && filter.machineId !== 'all') q = q.eq('machine_id', filter.machineId);
  if (filter.articleId && filter.articleId !== 'all') q = q.eq('article_id', filter.articleId);
  if (filter.weaverId && filter.weaverId !== 'all') q = q.eq('weaver_id', filter.weaverId);
  
  if (filter.searchTerm) {
    const s = `%${filter.searchTerm}%`;
    q = q.or(`machine_name.ilike.${s},article_name.ilike.${s},weaver_name.ilike.${s},observations.ilike.${s}`);
  }

  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 50;
  q = q.range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    items: (data || []).map(mapDefectRecord),
    total: count ?? 0,
    page,
    pageSize,
    hasMore: ((page + 1) * pageSize) < (count ?? 0),
  };
}
