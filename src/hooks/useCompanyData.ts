import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Machine, Client, Article, Weaver, Production, MachineLog } from '@/types';

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
  const [loading, setLoading] = useState(true);

  // Find company UUID from localStorage company_id
  const [dbCompanyId, setDbCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      // Try to find company by admin_email
      const { data } = await sb('companies').select('id').eq('admin_email', user.email).maybeSingle();
      if (data) {
        setDbCompanyId(data.id);
      } else {
        setLoading(false);
      }
    })();
  }, [user?.email]);

  // Load all data once we have the company ID
  useEffect(() => {
    if (!dbCompanyId) return;
    (async () => {
      setLoading(true);
      const [mRes, mlRes, cRes, aRes, wRes, pRes] = await Promise.all([
        sb('machines').select('*').eq('company_id', dbCompanyId).order('number'),
        sb('machine_logs').select('*'),
        sb('clients').select('*').eq('company_id', dbCompanyId).order('name'),
        sb('articles').select('*').eq('company_id', dbCompanyId).order('name'),
        sb('weavers').select('*').eq('company_id', dbCompanyId).order('code'),
        sb('productions').select('*').eq('company_id', dbCompanyId).order('date', { ascending: false }),
      ]);

      if (mRes.data) setMachines(mRes.data.map(mapMachine));
      if (mlRes.data) setMachineLogs(mlRes.data.map(mapMachineLog));
      if (cRes.data) setClients(cRes.data.map(mapClient));
      if (aRes.data) setArticles(aRes.data.map(mapArticle));
      if (wRes.data) setWeavers(wRes.data.map(mapWeaver));
      if (pRes.data) setProductions(pRes.data.map(mapProduction));
      setLoading(false);
    })();
  }, [dbCompanyId]);

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

  // Getters (return current state)
  const getMachines = useCallback(() => machines, [machines]);
  const getMachineLogs = useCallback(() => machineLogs, [machineLogs]);
  const getClients = useCallback(() => clients, [clients]);
  const getArticles = useCallback(() => articles, [articles]);
  const getWeavers = useCallback(() => weavers, [weavers]);
  const getProductions = useCallback(() => productions, [productions]);

  // Savers (write to DB and update state)
  const saveMachines = useCallback(async (data: Machine[]) => {
    if (!dbCompanyId) return;
    // Delete all and re-insert (simple approach for now)
    await sb('machines').delete().eq('company_id', dbCompanyId);
    if (data.length > 0) {
      const rows = data.map(m => ({
        id: m.id, company_id: dbCompanyId, number: m.number, name: m.name,
        rpm: m.rpm, status: m.status, article_id: m.article_id || null,
        observations: m.observations || null, created_at: m.created_at,
      }));
      await sb('machines').insert(rows);
    }
    setMachines(data);
  }, [dbCompanyId]);

  const saveMachineLogs = useCallback(async (data: MachineLog[]) => {
    if (!dbCompanyId) return;
    // For logs, we upsert
    const rows = data.map(l => ({
      id: l.id, machine_id: l.machine_id, status: l.status,
      started_at: l.started_at, ended_at: l.ended_at || null,
    }));
    if (rows.length > 0) {
      await sb('machine_logs').upsert(rows);
    }
    setMachineLogs(data);
  }, [dbCompanyId]);

  const saveClients = useCallback(async (data: Client[]) => {
    if (!dbCompanyId) return;
    await sb('clients').delete().eq('company_id', dbCompanyId);
    if (data.length > 0) {
      const rows = data.map(c => ({
        id: c.id, company_id: dbCompanyId, name: c.name,
        contact: c.contact || null, observations: c.observations || null, created_at: c.created_at,
      }));
      await sb('clients').insert(rows);
    }
    setClients(data);
  }, [dbCompanyId]);

  const saveArticles = useCallback(async (data: Article[]) => {
    if (!dbCompanyId) return;
    await sb('articles').delete().eq('company_id', dbCompanyId);
    if (data.length > 0) {
      const rows = data.map(a => ({
        id: a.id, company_id: dbCompanyId, name: a.name, client_id: a.client_id || null,
        client_name: a.client_name || null, weight_per_roll: a.weight_per_roll,
        value_per_kg: a.value_per_kg, turns_per_roll: a.turns_per_roll,
        observations: a.observations || null, created_at: a.created_at,
      }));
      await sb('articles').insert(rows);
    }
    setArticles(data);
  }, [dbCompanyId]);

  const saveWeavers = useCallback(async (data: Weaver[]) => {
    if (!dbCompanyId) return;
    await sb('weavers').delete().eq('company_id', dbCompanyId);
    if (data.length > 0) {
      const rows = data.map(w => ({
        id: w.id, company_id: dbCompanyId, code: w.code, name: w.name,
        phone: w.phone || null, shift_type: w.shift_type,
        fixed_shift: w.fixed_shift || null, start_time: w.start_time || null,
        end_time: w.end_time || null, created_at: w.created_at,
      }));
      await sb('weavers').insert(rows);
    }
    setWeavers(data);
  }, [dbCompanyId]);

  const saveProductions = useCallback(async (data: Production[]) => {
    if (!dbCompanyId) return;
    await sb('productions').delete().eq('company_id', dbCompanyId);
    if (data.length > 0) {
      // Batch insert for large datasets
      const batchSize = 500;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize).map(p => ({
          id: p.id, company_id: dbCompanyId, date: p.date, shift: p.shift,
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
  }, [dbCompanyId]);

  return {
    loading,
    dbCompanyId,
    getMachines, saveMachines,
    getMachineLogs, saveMachineLogs,
    getClients, saveClients,
    getArticles, saveArticles,
    getWeavers, saveWeavers,
    getProductions, saveProductions,
  };
}
