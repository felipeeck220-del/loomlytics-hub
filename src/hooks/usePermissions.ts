import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

export type AppRole = 'admin' | 'lider' | 'mecanico' | 'revisador';

/** Which sidebar/route keys each role can access by default */
const ROLE_ALLOWED_KEYS: Record<AppRole, string[]> = {
  admin: ['dashboard', 'machines', 'clients-articles', 'production', 'revision', 'mecanica', 'outsource', 'weavers', 'reports', 'contas-pagar', 'residuos', 'invoices', 'settings'],
  lider: ['machines', 'clients-articles', 'revision', 'mecanica', 'weavers'],
  mecanico: ['machines', 'mecanica'],
  revisador: ['revision'],
};

/** Overridable permission keys that admin can grant to non-admin users */
export const OVERRIDE_PERMISSIONS = [
  { key: 'financial', label: 'Financeiro', description: 'Ver valores (R$/kg, receita) em todo o sistema' },
  { key: 'dashboard', label: 'Dashboard', description: 'Acessar painel de indicadores e visão geral' },
  { key: 'production', label: 'Produção', description: 'Registrar e visualizar produção diária' },
  { key: 'reports', label: 'Relatórios', description: 'Acessar relatórios e análises' },
  { key: 'outsource', label: 'Terceirizado', description: 'Acessar módulo de terceirização' },
] as const;

/** Route path → nav key mapping */
const ROUTE_KEY_MAP: Record<string, string> = {
  '': 'dashboard',
  machines: 'machines',
  'clients-articles': 'clients-articles',
  production: 'production',
  revision: 'revision',
  mecanica: 'mecanica',
  outsource: 'outsource',
  weavers: 'weavers',
  reports: 'reports',
  'contas-pagar': 'contas-pagar',
  residuos: 'residuos',
  settings: 'settings',
};

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role || 'admin') as AppRole;
  const overrides = user?.permission_overrides || [];

  return useMemo(() => {
    const baseKeys = ROLE_ALLOWED_KEYS[role] || ROLE_ALLOWED_KEYS.admin;
    
    // Merge base keys with overridden route keys (exclude 'financial' which is not a route)
    const routeOverrides = overrides.filter(k => k !== 'financial');
    const allowedKeys = [...new Set([...baseKeys, ...routeOverrides])];

    const hasFinancialOverride = overrides.includes('financial');

    return {
      role,
      /** Check if user can access a given nav key */
      canAccess: (key: string) => allowedKeys.includes(key),
      /** Filter nav items to only allowed ones */
      filterNavItems: <T extends { key: string }>(items: T[]) =>
        items.filter(item => allowedKeys.includes(item.key)),
      /** Check if user can see financial data (revenue, value/kg, etc.) */
      canSeeFinancial: role === 'admin' || hasFinancialOverride,
      /** Check if a route path is allowed */
      canAccessRoute: (path: string) => {
        const key = ROUTE_KEY_MAP[path];
        if (!key) return true;
        return allowedKeys.includes(key);
      },
      /** The default route for this role (first allowed key) */
      defaultRoute: allowedKeys[0] === 'dashboard' ? '' : allowedKeys[0],
      allowedKeys,
    };
  }, [role, overrides]);
}
