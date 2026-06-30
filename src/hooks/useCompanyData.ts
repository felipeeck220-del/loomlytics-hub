import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
 import type { 
   Machine, Client, Article, Weaver, Production, MachineLog, 
   ArticleMachineTurns, CompanyShiftSettings, ShiftType, DefectRecord,
   NeedleInventory, NeedleTransaction,
   SinkerInventory, SinkerTransaction,
   Cylinder,
   MachineNeedleRef, MachineSinkerRef, NeedleRefPosition,
   MaterialProvider
 } from '@/types';
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
   const [defectRecords, setDefectRecords] = useState<DefectRecord[]>([]);
    const [needles, setNeedles] = useState<NeedleInventory[]>([]);
    const [needleTransactions, setNeedleTransactions] = useState<NeedleTransaction[]>([]);
    const [sinkers, setSinkers] = useState<SinkerInventory[]>([]);
    const [sinkerTransactions, setSinkerTransactions] = useState<SinkerTransaction[]>([]);
     const [cylinders, setCylinders] = useState<Cylinder[]>([]);
     const [machineNeedleRefs, setMachineNeedleRefs] = useState<MachineNeedleRef[]>([]);
     const [machineSinkerRefs, setMachineSinkerRefs] = useState<MachineSinkerRef[]>([]);
      const [materialProviders, setMaterialProviders] = useState<MaterialProvider[]>([]);
      const [materialProviderPrices, setMaterialProviderPrices] = useState<any[]>([]);
     const [yarnTypes, setYarnTypes] = useState<{ id: string; name: string; company_id: string }[]>([]);
   const [shiftSettings, setShiftSettings] = useState<CompanyShiftSettings>(DEFAULT_SHIFT_SETTINGS);
   const [loading, setLoading] = useState(true);
   const [loadingProgress, setLoadingProgress] = useState(0);

  // Fetch all rows from a table, paginating past the 1000-row default limit
  const fetchAll = useCallback(async (table: string, query: { column: string; value: string } | null, orderCol: string, ascending = true) => {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      let q = sb(table).select('*');
      if (query) {
        q = q.eq(query.column, query.value);
      }
      const { data, error } = await q
        .order(orderCol, { ascending })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error || !data) break;
      allData = allData.concat(data);
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
    return allData;
  }, []);

  // Mappers from DB rows to app types
  const mapMachine = (r: any): Machine => ({
    id: r.id, company_id: r.company_id, number: r.number, name: r.name,
    rpm: r.rpm, status: r.status, article_id: r.article_id || undefined,
     observations: r.observations || undefined, production_mode: r.production_mode || 'rolos',
     created_at: r.created_at,
     model: r.model || undefined, diameter: r.diameter || undefined, fineness: r.fineness || undefined,
     needle_quantity: r.needle_quantity ? Number(r.needle_quantity) : undefined,
     feeder_quantity: r.feeder_quantity ? Number(r.feeder_quantity) : undefined,
     serial_number: r.serial_number || undefined,
     year: r.year ? Number(r.year) : undefined,
      last_needle_change_at: r.last_needle_change_at || undefined,
      last_sinker_change_at: r.last_sinker_change_at || undefined,
      cylinder_id: r.cylinder_id || undefined,
      machine_type: r.machine_type || undefined,
      current_needle_id: r.current_needle_id || undefined,
      current_sinker_id: r.current_sinker_id || undefined,
      maintenance_interval_days: r.maintenance_interval_days != null ? Number(r.maintenance_interval_days) : undefined,
      maintenance_kg_target: r.maintenance_kg_target != null ? Number(r.maintenance_kg_target) : undefined,
    });
    const mapCylinder = (r: any): Cylinder => ({
      id: r.id, company_id: r.company_id, brand: r.brand,
      model: r.model || undefined, diameter: r.diameter || undefined,
      fineness: r.fineness || undefined, needle_quantity: r.needle_quantity ? Number(r.needle_quantity) : undefined,
      feeder_quantity: r.feeder_quantity ? Number(r.feeder_quantity) : undefined,
      sinker_quantity: r.sinker_quantity ? Number(r.sinker_quantity) : undefined,
      observations: r.observations || undefined, machine_id: r.machine_id || undefined,
      created_at: r.created_at, updated_at: r.updated_at,
    });
   const mapSinker = (r: any): SinkerInventory => ({
     id: r.id, company_id: r.company_id, provider: r.provider,
     brand: r.brand, reference_code: r.reference_code,
     current_quantity: Number(r.current_quantity),
     created_at: r.created_at, updated_at: r.updated_at,
   });
   const mapSinkerTransaction = (r: any): SinkerTransaction => ({
     id: r.id, company_id: r.company_id, sinker_id: r.sinker_id,
     type: r.type, exit_mode: r.exit_mode || undefined,
     quantity: Number(r.quantity), date: r.date,
     machine_id: r.machine_id || undefined,
     created_at: r.created_at, created_by_id: r.created_by_id || undefined,
     created_by_name: r.created_by_name || undefined,
     provider_id: r.provider_id || undefined,
     unit_price: r.unit_price != null ? Number(r.unit_price) : undefined,
   });
   const mapNeedle = (r: any): NeedleInventory => ({
     id: r.id, company_id: r.company_id, provider: r.provider,
     brand: r.brand, reference_code: r.reference_code,
     current_quantity: Number(r.current_quantity),
     created_at: r.created_at, updated_at: r.updated_at,
   });
   const mapNeedleTransaction = (r: any): NeedleTransaction => ({
     id: r.id, company_id: r.company_id, needle_id: r.needle_id,
     type: r.type, exit_mode: r.exit_mode || undefined,
     quantity: Number(r.quantity), date: r.date,
     machine_id: r.machine_id || undefined,
     created_at: r.created_at, created_by_id: r.created_by_id || undefined,
     created_by_name: r.created_by_name || undefined,
     provider_id: r.provider_id || undefined,
     unit_price: r.unit_price != null ? Number(r.unit_price) : undefined,
   });
  const mapMachineLog = (r: any): MachineLog => ({
    id: r.id, machine_id: r.machine_id, status: r.status,
    started_at: r.started_at, ended_at: r.ended_at || undefined,
    started_by_name: r.started_by_name || undefined,
    started_by_code: r.started_by_code || undefined,
    ended_by_name: r.ended_by_name || undefined,
    ended_by_code: r.ended_by_code || undefined,
  });
  const mapClient = (r: any): Client => ({
    id: r.id, company_id: r.company_id, name: r.name,
    contact: r.contact || undefined, observations: r.observations || undefined, created_at: r.created_at,
  });
  const mapArticle = (r: any): Article => ({
    id: r.id, company_id: r.company_id, name: r.name, client_id: r.client_id,
    client_name: r.client_name || undefined, yarn_type_id: r.yarn_type_id || undefined,
    weight_per_roll: Number(r.weight_per_roll),
    value_per_kg: Number(r.value_per_kg), turns_per_roll: Number(r.turns_per_roll),
    target_efficiency: Number(r.target_efficiency) || 80,
    observations: r.observations || undefined, created_at: r.created_at,
  });
  const mapWeaver = (r: any): Weaver => ({
    id: r.id, company_id: r.company_id, code: r.code, name: r.name,
    phone: r.phone || undefined, shift_type: r.shift_type,
    fixed_shift: r.fixed_shift || undefined, start_time: r.start_time || undefined,
    end_time: r.end_time || undefined, created_at: r.created_at,
  });
  const normalizeShift = (shift: string): ShiftType => {
    if (!shift) return 'manha';
    const lower = shift.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.startsWith('manha')) return 'manha';
    if (lower.startsWith('tarde')) return 'tarde';
    if (lower.startsWith('noite')) return 'noite';
    return 'manha';
  };
  const mapProduction = (r: any): Production => ({
    id: r.id, company_id: r.company_id, date: r.date,
    shift: normalizeShift(r.shift),
    machine_id: r.machine_id || '', machine_name: r.machine_name || '',
    weaver_id: r.weaver_id || '', weaver_name: r.weaver_name || '',
    article_id: r.article_id || '', article_name: r.article_name || '',
    rpm: Number(r.rpm), rolls_produced: Number(r.rolls_produced),
    weight_kg: Number(r.weight_kg), revenue: Number(r.revenue),
    efficiency: Number(r.efficiency), created_at: r.created_at,
    created_by_name: r.created_by_name || undefined,
    created_by_code: r.created_by_code || undefined,
  });
  const mapArticleMachineTurns = (r: any): ArticleMachineTurns => ({
    id: r.id, article_id: r.article_id, machine_id: r.machine_id,
    company_id: r.company_id, turns_per_roll: Number(r.turns_per_roll),
    observations: r.observations || undefined, created_at: r.created_at,
  });
  const mapDefectRecord = (r: any): DefectRecord => ({
    id: r.id, company_id: r.company_id, machine_id: r.machine_id || '',
    article_id: r.article_id || '', weaver_id: r.weaver_id || '',
    date: r.date, shift: normalizeShift(r.shift),
    measure_type: r.measure_type || 'kg', measure_value: Number(r.measure_value),
    machine_name: r.machine_name || undefined, article_name: r.article_name || undefined,
    weaver_name: r.weaver_name || undefined, observations: r.observations || undefined,
    created_by_name: r.created_by_name || undefined, created_by_code: r.created_by_code || undefined,
    created_at: r.created_at,
  });

   // Reusable data loader
   const loadAllData = useCallback(async () => {
     if (!companyId) {
       setLoading(false);
       return;
     }
     setLoading(true);
     setLoadingProgress(0);
     try {
       const tasks = [
         { name: 'machines', fn: () => fetchAll('machines', { column: 'company_id', value: companyId }, 'number') },
         { name: 'clients', fn: () => fetchAll('clients', { column: 'company_id', value: companyId }, 'name') },
         { name: 'articles', fn: () => fetchAll('articles', { column: 'company_id', value: companyId }, 'name') },
         { name: 'weavers', fn: () => fetchAll('weavers', { column: 'company_id', value: companyId }, 'code') },
         { name: 'productions', fn: () => fetchAll('productions', { column: 'company_id', value: companyId }, 'date', false) },
         { name: 'machine_logs', fn: () => fetchAll('machine_logs', { column: 'company_id', value: companyId }, 'started_at', false) },
         { name: 'article_machine_turns', fn: () => fetchAll('article_machine_turns', { column: 'company_id', value: companyId }, 'created_at') },
         { name: 'company_settings', fn: () => sb('company_settings').select('*').eq('company_id', companyId).maybeSingle() },
         { name: 'defect_records', fn: () => fetchAll('defect_records', { column: 'company_id', value: companyId }, 'date', false) },
         { name: 'needle_inventory', fn: () => fetchAll('needle_inventory', { column: 'company_id', value: companyId }, 'reference_code') },
          { name: 'needle_transactions', fn: () => fetchAll('needle_transactions', { column: 'company_id', value: companyId }, 'date', false) },
          { name: 'sinker_inventory', fn: () => fetchAll('sinker_inventory', { column: 'company_id', value: companyId }, 'reference_code') },
          { name: 'sinker_transactions', fn: () => fetchAll('sinker_transactions', { column: 'company_id', value: companyId }, 'date', false) },
          { name: 'cylinders', fn: () => fetchAll('cylinders', { column: 'company_id', value: companyId }, 'brand') },
          { name: 'yarn_types', fn: () => fetchAll('yarn_types', { column: 'company_id', value: companyId }, 'name') },
          { name: 'machine_needle_refs', fn: () => fetchAll('machine_needle_refs', { column: 'company_id', value: companyId }, 'created_at') },
          { name: 'machine_sinker_refs', fn: () => fetchAll('machine_sinker_refs', { column: 'company_id', value: companyId }, 'created_at') },
          { name: 'material_providers', fn: () => fetchAll('material_providers', { column: 'company_id', value: companyId }, 'name') },
          { name: 'material_provider_prices', fn: () => fetchAll('material_provider_prices', { column: 'company_id', value: companyId }, 'created_at') },
         ];
 
       let completed = 0;
       const results = await Promise.all(tasks.map(async (task) => {
         const result = await task.fn();
         completed++;
         setLoadingProgress((completed / tasks.length) * 100);
         return result;
       }));
 
        const [mData, cData, aData, wData, pData, mlRes, amtData, csRes, drRes, nData, ntData, sData, stData, cylData, ytData, mnrData, msrData, mpData, mppData] = results;
 
       setMachines(mData.map(mapMachine));
       setMachineLogs(mlRes.map(mapMachineLog));
       setClients(cData.map(mapClient));
       setArticles(aData.map(mapArticle));
       setWeavers(wData.map(mapWeaver));
       setProductions(pData.map(mapProduction));
       setArticleMachineTurns(amtData.map(mapArticleMachineTurns));
       setDefectRecords(drRes.map(mapDefectRecord));
       setNeedles(nData.map(mapNeedle));
        setNeedleTransactions(ntData.map(mapNeedleTransaction));
        setSinkers(sData.map(mapSinker));
        setSinkerTransactions(stData.map(mapSinkerTransaction));
         setCylinders(cylData.map(mapCylinder));
         setYarnTypes(ytData);
         setMachineNeedleRefs(mnrData as MachineNeedleRef[]);
         setMachineSinkerRefs(msrData as MachineSinkerRef[]);
         setMaterialProviders(mpData as MaterialProvider[]);
          setMaterialProviderPrices(mppData as any[]);
       
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
       setLoadingProgress(100);
     } catch (err) {
       console.error('Failed to load company data:', err);
     } finally {
       setTimeout(() => setLoading(false), 300); // Pequeno delay para a barra chegar a 100% suavemente
     }
   }, [companyId]);

  // Load all data once we have the company ID from the authenticated user
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Getters (return current state)
  const getMachines = useCallback(() => machines, [machines]);
  const getMachineLogs = useCallback(() => machineLogs, [machineLogs]);
  const getClients = useCallback(() => clients, [clients]);
  const getArticles = useCallback(() => articles, [articles]);
  const getWeavers = useCallback(() => weavers, [weavers]);
  const getProductions = useCallback(() => productions, [productions]);
  const getArticleMachineTurns = useCallback(() => articleMachineTurns, [articleMachineTurns]);
   const getDefectRecords = useCallback(() => defectRecords, [defectRecords]);
   const getNeedles = useCallback(() => needles, [needles]);
    const getNeedleTransactions = useCallback(() => needleTransactions, [needleTransactions]);
    const getSinkers = useCallback(() => sinkers, [sinkers]);
    const getSinkerTransactions = useCallback(() => sinkerTransactions, [sinkerTransactions]);
     const getCylinders = useCallback(() => cylinders, [cylinders]);
     const getYarnTypes = useCallback(() => yarnTypes, [yarnTypes]);

  // Savers (write to DB and update state)
  const saveMachines = useCallback(async (data: Machine[]) => {
    if (!companyId) return;
    // Find machines to delete (present in DB but not in new data)
    const currentIds = machines.map(m => m.id);
    const newIds = data.map(m => m.id);
    const idsToDelete = currentIds.filter(id => !newIds.includes(id));
    if (idsToDelete.length > 0) {
      await sb('machines').delete().in('id', idsToDelete);
    }
    if (data.length > 0) {
      const rows = data.map(m => ({
        id: m.id,
        company_id: companyId,
        number: m.number,
        name: m.name,
        rpm: m.rpm,
        status: m.status,
        article_id: m.article_id || null,
        observations: m.observations || null,
        production_mode: m.production_mode || 'rolos',
        created_at: m.created_at,
        model: m.model || null,
        diameter: m.diameter || null,
        fineness: m.fineness || null,
        needle_quantity: m.needle_quantity || null,
        feeder_quantity: m.feeder_quantity || null,
        serial_number: m.serial_number || null,
        year: m.year || null,
        last_needle_change_at: m.last_needle_change_at || null,
        last_sinker_change_at: m.last_sinker_change_at || null,
        cylinder_id: m.cylinder_id || null,
        machine_type: m.machine_type || null,
        current_needle_id: m.current_needle_id || null,
        current_sinker_id: m.current_sinker_id || null,
        maintenance_interval_days: m.maintenance_interval_days ?? null,
        maintenance_kg_target: m.maintenance_kg_target ?? null,
      }));
      const { error } = await sb('machines').upsert(rows);
      if (error) { console.error('Error saving machines:', error); throw error; }
    }
    setMachines(data);
  }, [companyId, machines]);

  const saveMachineLogs = useCallback(async (data: MachineLog[]) => {
    if (!companyId) return;
    const rows = data.map(l => ({
      id: l.id, company_id: companyId, machine_id: l.machine_id, status: l.status,
      started_at: l.started_at, ended_at: l.ended_at || null,
      started_by_name: l.started_by_name || null,
      started_by_code: l.started_by_code || null,
      ended_by_name: l.ended_by_name || null,
      ended_by_code: l.ended_by_code || null,
    }));
    if (rows.length > 0) {
      const { error } = await sb('machine_logs').upsert(rows);
      if (error) {
        console.error('Error saving machine logs:', error);
        throw error;
      }
    }
    setMachineLogs(data);
  }, [companyId]);

  const saveClients = useCallback(async (data: Client[]) => {
    if (!companyId) return;
    const currentIds = clients.map(c => c.id);
    const newIds = data.map(c => c.id);
    const idsToDelete = currentIds.filter(id => !newIds.includes(id));
    if (idsToDelete.length > 0) {
      await sb('clients').delete().in('id', idsToDelete);
    }
    if (data.length > 0) {
      const rows = data.map(c => ({
        id: c.id, company_id: companyId, name: c.name,
        contact: c.contact || null, observations: c.observations || null, created_at: c.created_at,
      }));
      const { error } = await sb('clients').upsert(rows);
      if (error) { console.error('Error saving clients:', error); throw error; }
    }
    setClients(data);
  }, [companyId, clients]);

  const saveArticles = useCallback(async (data: Article[]) => {
    if (!companyId) return;
    const currentIds = articles.map(a => a.id);
    const newIds = data.map(a => a.id);
    const idsToDelete = currentIds.filter(id => !newIds.includes(id));
    if (idsToDelete.length > 0) {
      await sb('articles').delete().in('id', idsToDelete);
    }
    if (data.length > 0) {
      const rows = data.map(a => ({
        id: a.id, company_id: companyId, name: a.name, client_id: a.client_id || null,
        client_name: a.client_name || null, weight_per_roll: a.weight_per_roll,
        value_per_kg: a.value_per_kg, turns_per_roll: a.turns_per_roll,
        target_efficiency: a.target_efficiency ?? 80,
        observations: a.observations || null, created_at: a.created_at,
      }));
      const { error } = await sb('articles').upsert(rows);
      if (error) { console.error('Error saving articles:', error); throw error; }
    }
    setArticles(data);
  }, [companyId, articles]);

  const saveWeavers = useCallback(async (data: Weaver[]) => {
    if (!companyId) return;
    const currentIds = weavers.map(w => w.id);
    const newIds = data.map(w => w.id);
    const idsToDelete = currentIds.filter(id => !newIds.includes(id));
    if (idsToDelete.length > 0) {
      await sb('weavers').delete().in('id', idsToDelete);
    }
    if (data.length > 0) {
      const rows = data.map(w => ({
        id: w.id, company_id: companyId, code: w.code, name: w.name,
        phone: w.phone || null, shift_type: w.shift_type,
        fixed_shift: w.fixed_shift || null, start_time: w.start_time || null,
        end_time: w.end_time || null, created_at: w.created_at,
      }));
      const { error } = await sb('weavers').upsert(rows);
      if (error) { console.error('Error saving weavers:', error); throw error; }
    }
    setWeavers(data);
  }, [companyId, weavers]);

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
          created_by_name: p.created_by_name || null,
          created_by_code: p.created_by_code || null,
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
      created_by_name: p.created_by_name || null,
      created_by_code: p.created_by_code || null,
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
        created_by_name: p.created_by_name || null,
        created_by_code: p.created_by_code || null,
      }));
      await sb('productions').insert(rows);
    }
    const withCompanyId = newRecords.map(r => ({ ...r, company_id: companyId }));
    setProductions(prev => {
      const remaining = prev.filter(p => !idsToDelete.includes(p.id));
      return [...remaining, ...withCompanyId];
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

  const addDefectRecords = useCallback(async (newRecords: DefectRecord[]) => {
    if (!companyId || newRecords.length === 0) return;
    const rows = newRecords.map(d => ({
      id: d.id, company_id: companyId, machine_id: d.machine_id || null,
      article_id: d.article_id || null, weaver_id: d.weaver_id || null,
      date: d.date, shift: d.shift, measure_type: d.measure_type,
      measure_value: d.measure_value, machine_name: d.machine_name || null,
      article_name: d.article_name || null, weaver_name: d.weaver_name || null,
      observations: d.observations || null, created_at: d.created_at,
      created_by_name: d.created_by_name || null,
      created_by_code: d.created_by_code || null,
    }));
    const { error } = await sb('defect_records').insert(rows);
    if (error) throw error;
    setDefectRecords(prev => [...newRecords.map(r => ({ ...r, company_id: companyId })), ...prev]);
  }, [companyId]);

  const updateDefectRecords = useCallback(async (record: DefectRecord) => {
    if (!companyId) return;
    const row = {
      machine_id: record.machine_id || null, article_id: record.article_id || null,
      weaver_id: record.weaver_id || null, date: record.date, shift: record.shift,
      measure_type: record.measure_type, measure_value: record.measure_value,
      machine_name: record.machine_name || null, article_name: record.article_name || null,
      weaver_name: record.weaver_name || null, observations: record.observations || null,
    };
    const { error } = await sb('defect_records').update(row).eq('id', record.id);
    if (error) throw error;
    setDefectRecords(prev => prev.map(d => d.id === record.id ? { ...d, ...record } : d));
  }, [companyId]);

  const deleteDefectRecords = useCallback(async (ids: string[]) => {
    if (!companyId || ids.length === 0) return;
    await sb('defect_records').delete().in('id', ids);
     setDefectRecords(prev => prev.filter(d => !ids.includes(d.id)));
   }, [companyId]);
 
   const saveNeedles = useCallback(async (data: NeedleInventory[]) => {
     if (!companyId) return;
     const currentIds = needles.map(n => n.id);
     const newIds = data.map(n => n.id);
     const idsToDelete = currentIds.filter(id => !newIds.includes(id));
     if (idsToDelete.length > 0) {
       await sb('needle_inventory').delete().in('id', idsToDelete);
     }
     if (data.length > 0) {
       const rows = data.map(n => ({
         id: n.id, company_id: companyId, provider: n.provider,
         brand: n.brand, reference_code: n.reference_code,
         current_quantity: n.current_quantity,
       }));
       const { error } = await sb('needle_inventory').upsert(rows);
       if (error) throw error;
     }
      setNeedles(data.map(n => ({ ...n, company_id: companyId })));
   }, [companyId, needles]);
 
   const addNeedleTransaction = useCallback(async (newRecord: NeedleTransaction) => {
     if (!companyId) return;
     const row = {
       id: newRecord.id, company_id: companyId, needle_id: newRecord.needle_id,
       type: newRecord.type, exit_mode: newRecord.exit_mode || null,
       quantity: newRecord.quantity, date: newRecord.date,
       machine_id: newRecord.machine_id || null,
       created_by_id: user?.id || null,
       created_by_name: newRecord.created_by_name || null,
       provider_id: newRecord.provider_id || null,
       unit_price: newRecord.unit_price ?? null,
     };
     const { error } = await sb('needle_transactions').insert(row);
     if (error) throw error;
      setNeedleTransactions(prev => [{ ...newRecord, company_id: companyId }, ...prev]);
 
     // Refresh inventory because the trigger updated it
     const nData = await fetchAll('needle_inventory', { column: 'company_id', value: companyId }, 'reference_code');
     setNeedles(nData.map(mapNeedle));
 
     // If it was a needle change, refresh machines too
     if (newRecord.exit_mode === 'troca_agulheiro') {
       const mData = await fetchAll('machines', { column: 'company_id', value: companyId }, 'number');
       setMachines(mData.map(mapMachine));
     }
   }, [companyId, user?.id]);
 
  const updateNeedleTransaction = useCallback(async (id: string, updates: Partial<NeedleTransaction>) => {
    if (!companyId) return;
    const row: any = {};
    if (updates.quantity !== undefined) row.quantity = updates.quantity;
    if (updates.date !== undefined) row.date = updates.date;
    if ('machine_id' in updates) row.machine_id = updates.machine_id || null;
    if (updates.needle_id !== undefined) row.needle_id = updates.needle_id;
    if (updates.type !== undefined) row.type = updates.type;
    if ('exit_mode' in updates) row.exit_mode = updates.exit_mode || null;
    const { error } = await sb('needle_transactions').update(row).eq('id', id);
    if (error) throw error;
    setNeedleTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    const nData = await fetchAll('needle_inventory', { column: 'company_id', value: companyId }, 'reference_code');
    setNeedles(nData.map(mapNeedle));
  }, [companyId]);

  const deleteNeedleTransaction = useCallback(async (id: string) => {
    if (!companyId) return;
    const { error } = await sb('needle_transactions').delete().eq('id', id);
    if (error) throw error;
    setNeedleTransactions(prev => prev.filter(t => t.id !== id));
    const nData = await fetchAll('needle_inventory', { column: 'company_id', value: companyId }, 'reference_code');
    setNeedles(nData.map(mapNeedle));
  }, [companyId]);
 
   const saveSinkers = useCallback(async (data: SinkerInventory[]) => {
     if (!companyId) return;
     const currentIds = sinkers.map(n => n.id);
     const newIds = data.map(n => n.id);
     const idsToDelete = currentIds.filter(id => !newIds.includes(id));
     if (idsToDelete.length > 0) {
       await sb('sinker_inventory').delete().in('id', idsToDelete);
     }
     if (data.length > 0) {
       const rows = data.map(n => ({
         id: n.id, company_id: companyId, provider: n.provider,
         brand: n.brand, reference_code: n.reference_code,
         current_quantity: n.current_quantity,
       }));
       const { error } = await sb('sinker_inventory').upsert(rows);
       if (error) throw error;
     }
      setSinkers(data.map(n => ({ ...n, company_id: companyId })));
   }, [companyId, sinkers]);
 
   const addSinkerTransaction = useCallback(async (newRecord: SinkerTransaction) => {
     if (!companyId) return;
     const row = {
       id: newRecord.id, company_id: companyId, sinker_id: newRecord.sinker_id,
       type: newRecord.type, exit_mode: newRecord.exit_mode || null,
       quantity: newRecord.quantity, date: newRecord.date,
       machine_id: newRecord.machine_id || null,
       created_by_id: user?.id || null,
       created_by_name: newRecord.created_by_name || null,
       provider_id: newRecord.provider_id || null,
       unit_price: newRecord.unit_price ?? null,
     };
     const { error } = await sb('sinker_transactions').insert(row);
     if (error) throw error;
      setSinkerTransactions(prev => [{ ...newRecord, company_id: companyId }, ...prev]);
 
     // Refresh inventory
     const sData = await fetchAll('sinker_inventory', { column: 'company_id', value: companyId }, 'reference_code');
     setSinkers(sData.map(mapSinker));
 
     // If it was a sinker change, refresh machines too
     if (newRecord.exit_mode === 'troca_platinas') {
       const mData = await fetchAll('machines', { column: 'company_id', value: companyId }, 'number');
       setMachines(mData.map(mapMachine));
     }
   }, [companyId, user?.id]);
 
  const updateSinkerTransaction = useCallback(async (id: string, updates: Partial<SinkerTransaction>) => {
    if (!companyId) return;
    const row: any = {};
    if (updates.quantity !== undefined) row.quantity = updates.quantity;
    if (updates.date !== undefined) row.date = updates.date;
    if ('machine_id' in updates) row.machine_id = updates.machine_id || null;
    if (updates.sinker_id !== undefined) row.sinker_id = updates.sinker_id;
    if (updates.type !== undefined) row.type = updates.type;
    if ('exit_mode' in updates) row.exit_mode = updates.exit_mode || null;
    const { error } = await sb('sinker_transactions').update(row).eq('id', id);
    if (error) throw error;
    setSinkerTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    const sData = await fetchAll('sinker_inventory', { column: 'company_id', value: companyId }, 'reference_code');
    setSinkers(sData.map(mapSinker));
  }, [companyId]);
 
  const deleteSinkerTransaction = useCallback(async (id: string) => {
    if (!companyId) return;
    const { error } = await sb('sinker_transactions').delete().eq('id', id);
    if (error) throw error;
    setSinkerTransactions(prev => prev.filter(t => t.id !== id));
    const sData = await fetchAll('sinker_inventory', { column: 'company_id', value: companyId }, 'reference_code');
    setSinkers(sData.map(mapSinker));
    }, [companyId]);
 
   const saveCylinders = useCallback(async (data: Cylinder[]) => {
     if (!companyId) return;
     const currentIds = cylinders.map(c => c.id);
     const newIds = data.map(c => c.id);
     const idsToDelete = currentIds.filter(id => !newIds.includes(id));
     if (idsToDelete.length > 0) {
       await sb('cylinders').delete().in('id', idsToDelete);
     }
     if (data.length > 0) {
      const rows = data.map(c => ({
        id: c.id, company_id: companyId, brand: c.brand,
        model: c.model || null, diameter: c.diameter || null,
        fineness: c.fineness || null, needle_quantity: c.needle_quantity || null,
        feeder_quantity: c.feeder_quantity || null, 
        sinker_quantity: c.sinker_quantity || null,
        observations: c.observations || null,
        machine_id: c.machine_id || null,
      }));
       const { error } = await sb('cylinders').upsert(rows);
       if (error) throw error;
     }
      setCylinders(data.map(c => ({ ...c, company_id: companyId })));
   }, [companyId, cylinders]);

   const assignCylinderToMachine = useCallback(async (cylinderId: string | null, machineId: string) => {
     if (!companyId) return;
     try {
       // 1. If a cylinder was previously on this machine, unassign it
       const prevMachine = machines.find(m => m.id === machineId);
       if (prevMachine?.cylinder_id) {
          await sb('cylinders').update({ machine_id: null }).eq('id', prevMachine.cylinder_id);
       }

       // 2. Update machine with new cylinder
       await sb('machines').update({ cylinder_id: cylinderId }).eq('id', machineId);

       // 3. Update cylinder with new machine
       if (cylinderId) {
         await sb('cylinders').update({ machine_id: machineId }).eq('id', cylinderId);
       }

       // Refresh data
       const mData = await fetchAll('machines', { column: 'company_id', value: companyId }, 'number');
       const cylData = await fetchAll('cylinders', { column: 'company_id', value: companyId }, 'brand');
       setMachines(mData.map(mapMachine));
       setCylinders(cylData.map(mapCylinder));
     } catch (err) {
       console.error('Error assigning cylinder:', err);
       throw err;
     }
   }, [companyId, machines, fetchAll]);

    return {
     loading,
     loadingProgress,
     refreshData: loadAllData,
    dbCompanyId: companyId,
    shiftSettings,
    getMachines, saveMachines,
    getMachineLogs, saveMachineLogs,
    getClients, saveClients,
    getArticles, saveArticles,
    getWeavers, saveWeavers,
    getProductions, saveProductions, addProductions, updateProductions, deleteProductions,
    getArticleMachineTurns, saveArticleMachineTurns,
     getDefectRecords, addDefectRecords, updateDefectRecords, deleteDefectRecords,
     getNeedles, saveNeedles, getNeedleTransactions, addNeedleTransaction,
      updateNeedleTransaction, deleteNeedleTransaction,
      getSinkers, saveSinkers, getSinkerTransactions, addSinkerTransaction,
      updateSinkerTransaction, deleteSinkerTransaction,
      getCylinders, saveCylinders, assignCylinderToMachine,
      getYarnTypes,
       saveShiftSettings,
      getMachineNeedleRefs: useCallback(() => machineNeedleRefs, [machineNeedleRefs]),
      getMachineSinkerRefs: useCallback(() => machineSinkerRefs, [machineSinkerRefs]),
      getMaterialProviders: useCallback(() => materialProviders, [materialProviders]),
      saveMaterialProvider: useCallback(async (provider: { id?: string; name: string }) => {
        if (!companyId) return null;
        if (provider.id) {
          const { error } = await sb('material_providers').update({ name: provider.name }).eq('id', provider.id);
          if (error) throw error;
          setMaterialProviders(prev => prev.map(p => p.id === provider.id ? { ...p, name: provider.name } : p));
          return provider.id;
        }
        const { data, error } = await sb('material_providers').insert({ company_id: companyId, name: provider.name }).select().single();
        if (error) throw error;
        setMaterialProviders(prev => [...prev, data as MaterialProvider].sort((a, b) => a.name.localeCompare(b.name)));
        return (data as MaterialProvider).id;
      }, [companyId]),
      deleteMaterialProvider: useCallback(async (id: string) => {
        if (!companyId) return;
        const { error } = await sb('material_providers').delete().eq('id', id);
        if (error) throw error;
        setMaterialProviders(prev => prev.filter(p => p.id !== id));
      }, [companyId]),
      getMaterialProviderPrices: useCallback(() => materialProviderPrices, [materialProviderPrices]),
      saveMaterialProviderPrice: useCallback(async (price: { id?: string; provider_id: string; needle_id?: string | null; sinker_id?: string | null; unit_price: number }) => {
        if (!companyId) return null;
        if (price.id) {
          const { data, error } = await sb('material_provider_prices').update({ unit_price: price.unit_price }).eq('id', price.id).select().single();
          if (error) throw error;
          setMaterialProviderPrices(prev => prev.map(p => p.id === price.id ? data : p));
          return price.id;
        }
        // Upsert: if a price already exists for the (provider, item) pair, update it
        const filterCol = price.needle_id ? 'needle_id' : 'sinker_id';
        const filterVal = price.needle_id || price.sinker_id;
        const { data: existing } = await sb('material_provider_prices')
          .select('id').eq('provider_id', price.provider_id).eq(filterCol, filterVal).maybeSingle();
        if (existing?.id) {
          const { data, error } = await sb('material_provider_prices').update({ unit_price: price.unit_price }).eq('id', existing.id).select().single();
          if (error) throw error;
          setMaterialProviderPrices(prev => prev.map(p => p.id === existing.id ? data : p));
          return existing.id;
        }
        const { data, error } = await sb('material_provider_prices').insert({
          company_id: companyId,
          provider_id: price.provider_id,
          needle_id: price.needle_id || null,
          sinker_id: price.sinker_id || null,
          unit_price: price.unit_price,
        }).select().single();
        if (error) throw error;
        setMaterialProviderPrices(prev => [...prev, data]);
        return data.id;
      }, [companyId]),
      deleteMaterialProviderPrice: useCallback(async (id: string) => {
        if (!companyId) return;
        const { error } = await sb('material_provider_prices').delete().eq('id', id);
        if (error) throw error;
        setMaterialProviderPrices(prev => prev.filter(p => p.id !== id));
      }, [companyId]),
      saveMachineRefs: useCallback(async (
        machineId: string,
        needleRefs: { needle_id: string; position: NeedleRefPosition }[],
        sinkerRefs: { sinker_id: string }[]
      ) => {
        if (!companyId || !machineId) return;
        // Replace strategy: delete current, insert new
        await sb('machine_needle_refs').delete().eq('machine_id', machineId);
        await sb('machine_sinker_refs').delete().eq('machine_id', machineId);
        if (needleRefs.length > 0) {
          const rows = needleRefs.map(r => ({
            company_id: companyId, machine_id: machineId,
            needle_id: r.needle_id, position: r.position,
          }));
          const { error } = await sb('machine_needle_refs').insert(rows);
          if (error) { console.error('Error saving needle refs:', error); throw error; }
        }
        if (sinkerRefs.length > 0) {
          const rows = sinkerRefs.map(r => ({
            company_id: companyId, machine_id: machineId, sinker_id: r.sinker_id,
          }));
          const { error } = await sb('machine_sinker_refs').insert(rows);
          if (error) { console.error('Error saving sinker refs:', error); throw error; }
        }
        // Refresh local state
        const [mnr, msr] = await Promise.all([
          fetchAll('machine_needle_refs', { column: 'company_id', value: companyId }, 'created_at'),
          fetchAll('machine_sinker_refs', { column: 'company_id', value: companyId }, 'created_at'),
        ]);
        setMachineNeedleRefs(mnr as MachineNeedleRef[]);
        setMachineSinkerRefs(msr as MachineSinkerRef[]);
      }, [companyId, fetchAll]),
     getProductionFilterMonths: useCallback(async () => {
       if (!companyId) return [];
       const { data, error } = await supabase.rpc('get_production_filter_months', { p_company_id: companyId });
       if (error) { console.error('Error fetching production filter months:', error); return []; }
       return (data as any[]).map(r => r.month_str);
     }, [companyId]),
     getProductionFilterMachines: useCallback(async () => {
       if (!companyId) return [];
       const { data, error } = await supabase.rpc('get_production_filter_machines', { p_company_id: companyId });
       if (error) { console.error('Error fetching production filter machines:', error); return []; }
       return data as { id: string, name: string }[];
     }, [companyId]),
     getProductionFilterClients: useCallback(async () => {
       if (!companyId) return [];
       const { data, error } = await supabase.rpc('get_production_filter_clients', { p_company_id: companyId });
       if (error) { console.error('Error fetching production filter clients:', error); return []; }
       return data as { id: string, name: string }[];
     }, [companyId]),
     getProductionFilterArticles: useCallback(async () => {
       if (!companyId) return [];
       const { data, error } = await supabase.rpc('get_production_filter_articles', { p_company_id: companyId });
       if (error) { console.error('Error fetching production filter articles:', error); return []; }
       return data as { id: string, name: string }[];
     }, [companyId]),
   };
 }
