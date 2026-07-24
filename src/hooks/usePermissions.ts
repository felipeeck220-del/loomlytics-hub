import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

export type AppRole = 'admin' | 'lider' | 'lider_noite' | 'lider_mecanica' | 'mecanico' | 'eletricista' | 'revisador' | 'expedicao' | 'freteiro' | 'lider_frete';

/** Which sidebar/route keys each role can access by default */
const ROLE_ALLOWED_KEYS: Record<AppRole, string[]> = {
  admin: ['dashboard', 'faturamento-total', 'machines', 'clients-articles', 'production', 'revision', 'mecanica', 'mecanica-om', 'mecanica-oc', 'mecanica-oe', 'mecanica-ot', 'outsource', 'weavers', 'reports', 'contas-pagar', 'residuos', 'estoque-malha', 'billing-orders', 'freight-orders', 'invoices', 'client-invoices', 'fechamento', 'settings'],
  lider: ['mecanica-oc', 'mecanica-oe', 'mecanica-ot'],
  lider_noite: ['mecanica-oc', 'mecanica-oe', 'mecanica-ot'],
  lider_mecanica: ['mecanica-om', 'mecanica-oc', 'mecanica-oe', 'mecanica-ot', 'mecanica'],
  mecanico: ['mecanica-om', 'mecanica-oc', 'mecanica-oe', 'mecanica-ot', 'mecanica'],
  eletricista: ['mecanica-oe'],
  revisador: ['revision'],
  expedicao: ['billing-orders', 'estoque-malha', 'clients-articles'],
  freteiro: ['freight-orders'],
  lider_frete: ['freight-orders'],
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
  'mecanica/om': 'mecanica-om',
  'mecanica/oc': 'mecanica-oc',
  'mecanica/oe': 'mecanica-oe',
  'mecanica/ot': 'mecanica-ot',
  outsource: 'outsource',
  weavers: 'weavers',
  reports: 'reports',
  'contas-pagar': 'contas-pagar',
  residuos: 'residuos',
  'estoque-malha': 'estoque-malha',
  'billing-orders': 'billing-orders',
  'freight-orders': 'freight-orders',
  invoices: 'invoices',
  'client-invoices': 'client-invoices',
  fechamento: 'fechamento',
  'faturamento-total': 'faturamento-total',
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
      defaultRoute: (() => {
        const first = allowedKeys[0];
        if (!first || first === 'dashboard') return '';
        // Reverse-map nav key back to its route path
        const entry = Object.entries(ROUTE_KEY_MAP).find(([, k]) => k === first);
        return entry ? entry[0] : first;
      })(),
      allowedKeys,
    };
  }, [role, overrides]);
}
