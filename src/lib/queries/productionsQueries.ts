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
  // Using RPC to ensure performance and proper count
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

  if (error) {
    console.error('Error in fetch_productions_page RPC:', error);
    // Fallback to direct query if RPC fails (e.g. not created yet or wrong params)
    let q = supabase
      .from('productions')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .gte('date', filter.startDate)
      .lte('date', filter.endDate)
      .order('date', { ascending: false })
      .order('id', { ascending: true });

    if (filter.shift && filter.shift !== 'all') q = q.eq('shift', filter.shift);
    if (filter.machineId && filter.machineId !== 'all') q = q.eq('machine_id', filter.machineId);
    if (filter.articleId && filter.articleId !== 'all') q = q.eq('article_id', filter.articleId);

    const page = filter.page ?? 0;
    const pageSize = filter.pageSize ?? 50;
    q = q.range(page * pageSize, (page + 1) * pageSize - 1);

    const { data: qData, error: qError, count } = await q;
    if (qError) throw qError;

    return {
      items: (qData || []).map(mapProduction),
      total: count ?? 0,
      page,
      pageSize,
      hasMore: ((page + 1) * pageSize) < (count ?? 0),
    };
  }

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
   // Use direct query to bypass RPC limit if it's hitting one, 
   // or just use RPC but ensure we aren't limited by PostgREST defaults if it returns a list
   // Actually the RPC returns a single row. If the user says it's limited, 
   // it might be because the RPC itself has a limit internally or the fallback does.
   
   let query = supabase.rpc('get_production_stats', {
     p_company_id: companyId,
     p_start_date: startDate,
     p_end_date: endDate,
     p_shift: filter?.shift ?? 'all',
     p_machine_id: filter?.machineId || null,
     p_article_id: filter?.articleId || null,
   });
 
   const { data, error } = await query;

  if (error) {
    console.error('Error in get_production_stats RPC:', error);
    // Fallback if RPC fails
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('productions')
      .select('weight_kg, revenue, rolls_produced, efficiency')
      .eq('company_id', companyId)
      .gte('date', startDate)
      .lte('date', endDate);
      
    if (fallbackError) throw fallbackError;
    
    if (!fallbackData || fallbackData.length === 0) {
      return { total_weight: 0, total_revenue: 0, total_rolls: 0, avg_efficiency: 0, record_count: 0 };
    }
    
    const stats = fallbackData.reduce((acc, curr) => {
      acc.total_weight += Number(curr.weight_kg);
      acc.total_revenue += Number(curr.revenue);
      acc.total_rolls += Number(curr.rolls_produced);
      if (Number(curr.rolls_produced) > 0) {
        acc.eff_sum += Number(curr.efficiency);
        acc.eff_count += 1;
      }
      return acc;
    }, { total_weight: 0, total_revenue: 0, total_rolls: 0, eff_sum: 0, eff_count: 0 });
    
    return {
      total_weight: stats.total_weight,
      total_revenue: stats.total_revenue,
      total_rolls: stats.total_rolls,
      avg_efficiency: stats.eff_count > 0 ? stats.eff_sum / stats.eff_count : 0,
      record_count: fallbackData.length
    };
  }
  
   return data?.[0] || { total_weight: 0, total_revenue: 0, total_rolls: 0, avg_efficiency: 0, record_count: 0 };
 }
 
 export async function getProductionShiftStats(
   companyId: string,
   startDate: string,
   endDate: string,
   articleId?: string
 ) {
   const { data, error } = await supabase.rpc('get_production_shift_stats', {
     p_company_id: companyId,
     p_start_date: startDate,
     p_end_date: endDate,
     p_article_id: articleId || null
   });
   if (error) {
     console.error('Error fetching shift stats:', error);
     return [];
   }
    return data || [];
  }
 
 export async function getProductionTrendStats(
   companyId: string,
   startDate: string,
   endDate: string,
   filter?: { shift?: string; articleId?: string }
 ) {
   const { data, error } = await supabase.rpc('get_production_trend_stats', {
     p_company_id: companyId,
     p_start_date: startDate,
     p_end_date: endDate,
     p_shift: filter?.shift ?? 'all',
     p_article_id: filter?.articleId || null
   });
   if (error) {
     console.error('Error fetching trend stats:', error);
     return [];
   }
   return data || [];
 }
 
 export async function getProductionMachineStats(
   companyId: string,
   startDate: string,
   endDate: string,
   articleId?: string,
   limit: number = 5
 ) {
   const { data, error } = await supabase.rpc('get_production_machine_stats', {
     p_company_id: companyId,
     p_start_date: startDate,
     p_end_date: endDate,
     p_article_id: articleId || null,
     p_limit: limit
   });
   if (error) {
     console.error('Error fetching machine stats:', error);
     return [];
   }
   return data || [];
 }
