import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { parseCompanyMaintenanceState, type CompanyMaintenanceState } from '@/lib/companyMaintenance';

interface MaintenanceContextValue {
  state: CompanyMaintenanceState | null;
  error: string | null;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setNewAppUrl: (url: string | null) => Promise<void>;
}

const CompanyMaintenanceContext = createContext<MaintenanceContextValue | null>(null);

export function CompanyMaintenanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? '';
  const [state, setState] = useState<CompanyMaintenanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const currentRequest = ++requestId.current;
    try {
      const { data, error: rpcError } = await supabase.rpc('get_company_maintenance_state');
      if (rpcError) throw rpcError;
      const next = parseCompanyMaintenanceState(data, companyId);
      if (currentRequest !== requestId.current) return;
      setState(next);
      setError(null);
    } catch (err) {
      if (currentRequest !== requestId.current) return;
      setError(getFriendlyErrorMessage(err));
    }
  }, [companyId]);

  useEffect(() => {
    setState(null);
    setError(null);
    void refresh();
    // Small, tenant-scoped access check also covers reconnects and missed updates.
    const timer = window.setInterval(() => void refresh(), 5000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      ++requestId.current;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [refresh]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!companyId) throw new Error('Empresa não encontrada.');
    const { data, error: rpcError } = await supabase.rpc('set_company_maintenance', { p_company_id: companyId, p_enabled: enabled });
    if (rpcError) throw rpcError;
    ++requestId.current;
    setState(parseCompanyMaintenanceState(data, companyId));
    setError(null);
  }, [companyId]);

  const setNewAppUrl = useCallback(async (url: string | null) => {
    if (!companyId) throw new Error('Empresa não encontrada.');
    const { data, error: rpcError } = await supabase.rpc('set_company_new_app_url', { p_company_id: companyId, p_url: url });
    if (rpcError) throw rpcError;
    ++requestId.current;
    setState(parseCompanyMaintenanceState(data, companyId));
    setError(null);
  }, [companyId]);

  const currentState = state?.company_id === companyId ? state : null;
  return (
    <CompanyMaintenanceContext.Provider value={{ state: currentState, error, refresh, setEnabled, setNewAppUrl }}>
      {children}
    </CompanyMaintenanceContext.Provider>
  );
}

export function useCompanyMaintenance() {
  const context = useContext(CompanyMaintenanceContext);
  if (!context) throw new Error('CompanyMaintenanceProvider is required');
  return context;
}