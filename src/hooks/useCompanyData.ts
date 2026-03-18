import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Machine, Client, Article, Weaver, Production, MachineLog, ArticleMachineTurns, CompanyShiftSettings } from '@/types';
import { DEFAULT_SHIFT_SETTINGS } from '@/types';

const sb = (table: string) => (supabase.from as any)(table);

export function useCompanyData() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';

  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineLogs, setMachineLogs] = useState<MachineLog[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [weavers, setWeavers] = useState<Weaver[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [articleMachineTurns, setArticleMachineTurns] = useState<ArticleMachineTurns[]>([]);
  const [shiftSettings, setShiftSettings] = useState<CompanyShiftSettings>(DEFAULT_SHIFT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Fetch all rows from a table, paginating past the 1000-row default limit
  const fetchAll = async (table: string, query: { column: string; value: string }, orderCol: string, ascending = true) => {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await sb(table)
        .select('*')
        .eq(query.column, query.value)
        .order(orderCol, { ascending })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error || !data) break;
      allData = allData.concat(data);
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
    return allData;
  };

  // Load all data once we have the company ID from the authenticated user
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const [mData, cData, aData, wData, pData, mlRes, amtData, csRes] = await Promise.all([
        fetchAll('machines', { column: 'company_id', value: companyId }, 'number'),
        fetchAll('clients', { column: 'company_id', value: companyId }, 'name'),
        fetchAll('articles', { column: 'company_id', value: companyId }, 'name'),
        fetchAll('weavers', { column: 'company_id', value: companyId }, 'code'),
        fetchAll('productions', { column: 'company_id', value: companyId }, 'date', false),
        sb('machine_logs').select('*'),
        fetchAll('article_machine_turns', { column: 'company_id', value: companyId }, 'created_at'),
        sb('company_settings').select('*').eq('company_id', companyId).single(),
      ]);

      setMachines(mData.map(mapMachine));
      if (mlRes.data) setMachineLogs(mlRes.data.map(mapMachineLog));
      setClients(cData.map(mapClient));
      setArticles(aData.map(mapArticle));
      setWeavers(wData.map(mapWeaver));
      setProductions(pData.map(mapProduction));
      setArticleMachineTurns(amtData.map(mapArticleMachineTurns));
      if (csRes.data) {
        setShiftSettings({
          shift_manha_start: csRes.data.shift_manha_start || DEFAULT_SHIFT_SETTINGS.shift_manha_start,
          shift_manha_end: csRes.data.shift_manha_end || DEFAULT_SHIFT_SETTINGS.shift_manha_end,
          shift_tarde_start: csRes.data.shift_tarde_start || DEFAULT_SHIFT_SETTINGS.shift_tarde_start,
          shift_tarde_end: csRes.data.shift_tarde_end || DEFAULT_SHIFT_SETTINGS.shift_tarde_end,
          shift_noite_start: csRes.data.shift_noite_start || DEFAULT_SHIFT_SETTINGS.shift_noite_start,
          shift_noite_end: csRes.data.shift_noite_end || DEFAULT_SHIFT_SETTINGS.shift_noite_end,
        });
      }
      setLoading(false);
    })();
  }, [companyId]);

  // Mappers from DB rows to app types
  const mapMachine = (r: any): Machine => ({
    id: r.id, company_id: r.company_id, number: r.number, name: r.name,
    rpm: r.rpm, status: r.status, article_id: r.article_id || undefined,
    observations: r.observations || undefined, created_at: r.created_at,
  });
  const mapMachineLog = (r: any): MachineLog => ({
    id: r.id, machine_id: r.machine_id, status: r.status,
    started_at: r.started_at, ended_at: r.ended_at || undefined,
  });
  const mapClient = (r: any): Client => ({
    id: r.id, company_id: r.company_id, name: r.name,
    contact: r.contact || undefined, observations: r.observations || undefined, created_at: r.created_at,
  });
  const mapArticle = (r: any): Article => ({
    id: r.id, company_id: r.company_id, name: r.name, client_id: r.client_id,
    client_name: r.client_name || undefined, weight_per_roll: Number(r.weight_per_roll),
    value_per_kg: Number(r.value_per_kg), turns_per_roll: Number(r.turns_per_roll),
    observations: r.observations || undefined, created_at: r.created_at,
  });
  const mapWeaver = (r: any): Weaver => ({
    id: r.id, company_id: r.company_id, code: r.code, name: r.name,
    phone: r.phone || undefined, shift_type: r.shift_type,
    fixed_shift: r.fixed_shift || undefined, start_time: r.start_time || undefined,
    end_time: r.end_time || undefined, created_at: r.created_at,
  });
  const mapProduction = (r: any): Production => ({
    id: r.id, company_id: r.company_id, date: r.date, shift: r.shift,
    machine_id: r.machine_id || '', machine_name: r.machine_name || '',
    weaver_id: r.weaver_id || '', weaver_name: r.weaver_name || '',
    article_id: r.article_id || '', article_name: r.article_name || '',
    rpm: Number(r.rpm), rolls_produced: Number(r.rolls_produced),
    weight_kg: Number(r.weight_kg), revenue: Number(r.revenue),
    efficiency: Number(r.efficiency), created_at: r.created_at,
  });
  const mapArticleMachineTurns = (r: any): ArticleMachineTurns => ({
    id: r.id, article_id: r.article_id, machine_id: r.machine_id,
    company_id: r.company_id, turns_per_roll: Number(r.turns_per_roll),
    observations: r.observations || undefined, created_at: r.created_at,
  });

  // Getters (return current state)
  const getMachines = useCallback(() => machines, [machines]);
  const getMachineLogs = useCallback(() => machineLogs, [machineLogs]);
  const getClients = useCallback(() => clients, [clients]);
  const getArticles = useCallback(() => articles, [articles]);
  const getWeavers = useCallback(() => weavers, [weavers]);
  const getProductions = useCallback(() => productions, [productions]);
  const getArticleMachineTurns = useCallback(() => articleMachineTurns, [articleMachineTurns]);

  // Savers (write to DB and update state)
  const saveMachines = useCallback(async (data: Machine[]) => {
    if (!companyId) return;
    await sb('machines').delete().eq('company_id', companyId);
    if (data.length > 0) {
      const rows = data.map(m => ({
        id: m.id, company_id: companyId, number: m.number, name: m.name,
        rpm: m.rpm, status: m.status, article_id: m.article_id || null,
        observations: m.observations || null, created_at: m.created_at,
      }));
      await sb('machines').insert(rows);
    }
    setMachines(data);
  }, [companyId]);

  const saveMachineLogs = useCallback(async (data: MachineLog[]) => {
    if (!companyId) return;
    const rows = data.map(l => ({
      id: l.id, machine_id: l.machine_id, status: l.status,
      started_at: l.started_at, ended_at: l.ended_at || null,
    }));
    if (rows.length > 0) {
      await sb('machine_logs').upsert(rows);
    }
    setMachineLogs(data);
  }, [companyId]);

  const saveClients = useCallback(async (data: Client[]) => {
    if (!companyId) return;
    await sb('clients').delete().eq('company_id', companyId);
    if (data.length > 0) {
      const rows = data.map(c => ({
        id: c.id, company_id: companyId, name: c.name,
        contact: c.contact || null, observations: c.observations || null, created_at: c.created_at,
      }));
      await sb('clients').insert(rows);
    }
    setClients(data);
  }, [companyId]);

  const saveArticles = useCallback(async (data: Article[]) => {
    if (!companyId) return;
    await sb('articles').delete().eq('company_id', companyId);
    if (data.length > 0) {
      const rows = data.map(a => ({
        id: a.id, company_id: companyId, name: a.name, client_id: a.client_id || null,
        client_name: a.client_name || null, weight_per_roll: a.weight_per_roll,
        value_per_kg: a.value_per_kg, turns_per_roll: a.turns_per_roll,
        observations: a.observations || null, created_at: a.created_at,
      }));
      await sb('articles').insert(rows);
    }
    setArticles(data);
  }, [companyId]);

  const saveWeavers = useCallback(async (data: Weaver[]) => {
    if (!companyId) return;
    await sb('weavers').delete().eq('company_id', companyId);
    if (data.length > 0) {
      const rows = data.map(w => ({
        id: w.id, company_id: companyId, code: w.code, name: w.name,
        phone: w.phone || null, shift_type: w.shift_type,
        fixed_shift: w.fixed_shift || null, start_time: w.start_time || null,
        end_time: w.end_time || null, created_at: w.created_at,
      }));
      await sb('weavers').insert(rows);
    }
    setWeavers(data);
  }, [companyId]);

  const saveProductions = useCallback(async (data: Production[]) => {
    if (!companyId) return;
    await sb('productions').delete().eq('company_id', companyId);
    if (data.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize).map(p => ({
          id: p.id, company_id: companyId, date: p.date, shift: p.shift,
          machine_id: p.machine_id || null, machine_name: p.machine_name || null,
          weaver_id: p.weaver_id || null, weaver_name: p.weaver_name || null,
          article_id: p.article_id || null, article_name: p.article_name || null,
          rpm: p.rpm, rolls_produced: p.rolls_produced, weight_kg: p.weight_kg,
          revenue: p.revenue, efficiency: p.efficiency, created_at: p.created_at,
        }));
        await sb('productions').insert(batch);
      }
    }
    setProductions(data);
  }, [companyId]);

  // Incremental: insert only new records (no delete-all)
  const addProductions = useCallback(async (newRecords: Production[]) => {
    if (!companyId || newRecords.length === 0) return;
    const rows = newRecords.map(p => ({
      id: p.id, company_id: companyId, date: p.date, shift: p.shift,
      machine_id: p.machine_id || null, machine_name: p.machine_name || null,
      weaver_id: p.weaver_id || null, weaver_name: p.weaver_name || null,
      article_id: p.article_id || null, article_name: p.article_name || null,
      rpm: p.rpm, rolls_produced: p.rolls_produced, weight_kg: p.weight_kg,
      revenue: p.revenue, efficiency: p.efficiency, created_at: p.created_at,
    }));
    const { error } = await sb('productions').insert(rows);
    if (error) throw error;
    const withCompanyId = newRecords.map(r => ({ ...r, company_id: companyId }));
    setProductions(prev => [...prev, ...withCompanyId]);
  }, [companyId]);

  // Incremental: delete specific records and insert replacements
  const updateProductions = useCallback(async (idsToDelete: string[], newRecords: Production[]) => {
    if (!companyId) return;
    if (idsToDelete.length > 0) {
      await sb('productions').delete().in('id', idsToDelete);
    }
    if (newRecords.length > 0) {
      const rows = newRecords.map(p => ({
        id: p.id, company_id: companyId, date: p.date, shift: p.shift,
        machine_id: p.machine_id || null, machine_name: p.machine_name || null,
        weaver_id: p.weaver_id || null, weaver_name: p.weaver_name || null,
        article_id: p.article_id || null, article_name: p.article_name || null,
        rpm: p.rpm, rolls_produced: p.rolls_produced, weight_kg: p.weight_kg,
        revenue: p.revenue, efficiency: p.efficiency, created_at: p.created_at,
      }));
      await sb('productions').insert(rows);
    }
    setProductions(prev => {
      const remaining = prev.filter(p => !idsToDelete.includes(p.id));
      return [...remaining, ...newRecords];
    });
  }, [companyId]);

  // Incremental: delete specific records
  const deleteProductions = useCallback(async (ids: string[]) => {
    if (!companyId || ids.length === 0) return;
    await sb('productions').delete().in('id', ids);
    setProductions(prev => prev.filter(p => !ids.includes(p.id)));
  }, [companyId]);

  const saveArticleMachineTurns = useCallback(async (articleId: string, data: ArticleMachineTurns[]) => {
    if (!companyId) return;
    await sb('article_machine_turns').delete().eq('article_id', articleId);
    if (data.length > 0) {
      const rows = data.map(t => ({
        id: t.id, article_id: t.article_id, machine_id: t.machine_id,
        company_id: companyId, turns_per_roll: t.turns_per_roll,
        observations: t.observations || null, created_at: t.created_at,
      }));
      await sb('article_machine_turns').insert(rows);
    }
    // Refresh all article machine turns
    const amtData = await fetchAll('article_machine_turns', { column: 'company_id', value: companyId }, 'created_at');
    setArticleMachineTurns(amtData.map(mapArticleMachineTurns));
  }, [companyId]);

  const saveShiftSettings = useCallback(async (data: CompanyShiftSettings) => {
    if (!companyId) return;
    const { error } = await sb('company_settings')
      .update(data)
      .eq('company_id', companyId);
    if (error) throw error;
    setShiftSettings(data);
  }, [companyId]);

  return {
    loading,
    dbCompanyId: companyId,
    shiftSettings,
    getMachines, saveMachines,
    getMachineLogs, saveMachineLogs,
    getClients, saveClients,
    getArticles, saveArticles,
    getWeavers, saveWeavers,
    getProductions, saveProductions, addProductions, updateProductions, deleteProductions,
    getArticleMachineTurns, saveArticleMachineTurns,
    saveShiftSettings,
  };
}
