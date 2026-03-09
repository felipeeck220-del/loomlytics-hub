import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Machine, Client, Article, Weaver, Production, MachineLog } from '@/types';

function getKey(companyId: string, entity: string) {
  return `malharia_${companyId}_${entity}`;
}

export function useCompanyData() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';

  const load = useCallback(<T>(entity: string): T[] => {
    if (!companyId) return [];
    return JSON.parse(localStorage.getItem(getKey(companyId, entity)) || '[]');
  }, [companyId]);

  const save = useCallback(<T>(entity: string, data: T[]) => {
    if (!companyId) return;
    localStorage.setItem(getKey(companyId, entity), JSON.stringify(data));
  }, [companyId]);

  // Machines
  const getMachines = useCallback(() => load<Machine>('machines'), [load]);
  const saveMachines = useCallback((data: Machine[]) => save('machines', data), [save]);

  // Machine Logs
  const getMachineLogs = useCallback(() => load<MachineLog>('machine_logs'), [load]);
  const saveMachineLogs = useCallback((data: MachineLog[]) => save('machine_logs', data), [save]);

  // Clients
  const getClients = useCallback(() => load<Client>('clients'), [load]);
  const saveClients = useCallback((data: Client[]) => save('clients', data), [save]);

  // Articles
  const getArticles = useCallback(() => load<Article>('articles'), [load]);
  const saveArticles = useCallback((data: Article[]) => save('articles', data), [save]);

  // Weavers
  const getWeavers = useCallback(() => load<Weaver>('weavers'), [load]);
  const saveWeavers = useCallback((data: Weaver[]) => save('weavers', data), [save]);

  // Productions
  const getProductions = useCallback(() => load<Production>('productions'), [load]);
  const saveProductions = useCallback((data: Production[]) => save('productions', data), [save]);

  return {
    getMachines, saveMachines,
    getMachineLogs, saveMachineLogs,
    getClients, saveClients,
    getArticles, saveArticles,
    getWeavers, saveWeavers,
    getProductions, saveProductions,
  };
}
