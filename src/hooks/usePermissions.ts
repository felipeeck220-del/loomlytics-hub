import { useAuth } from '@/contexts/AuthContext';
import { useMemo } from 'react';

export type AppRole = 'admin' | 'lider' | 'mecanico' | 'revisador';

/** Which sidebar/route keys each role can access */
const ROLE_ALLOWED_KEYS: Record<AppRole, string[]> = {
  admin: ['dashboard', 'machines', 'clients-articles', 'production', 'revision', 'outsource', 'weavers', 'reports', 'settings'],
  lider: ['dashboard', 'machines', 'clients-articles', 'production', 'revision', 'outsource', 'weavers', 'reports'],
  mecanico: ['machines'],
  revisador: ['production', 'revision'],
};

/** Route path → nav key mapping */
const ROUTE_KEY_MAP: Record<string, string> = {
  '': 'dashboard',
  machines: 'machines',
  'clients-articles': 'clients-articles',
  production: 'production',
  revision: 'revision',
  outsource: 'outsource',
  weavers: 'weavers',
  reports: 'reports',
  settings: 'settings',
};

export function usePermissions() {
  const { user } = useAuth();
  const role = (user?.role || 'admin') as AppRole;

  return useMemo(() => {
    const allowedKeys = ROLE_ALLOWED_KEYS[role] || ROLE_ALLOWED_KEYS.admin;

    return {
      role,
      /** Check if user can access a given nav key */
      canAccess: (key: string) => allowedKeys.includes(key),
      /** Filter nav items to only allowed ones */
      filterNavItems: <T extends { key: string }>(items: T[]) =>
        items.filter(item => allowedKeys.includes(item.key)),
      /** Check if user can see financial data (revenue, value/kg, etc.) */
      canSeeFinancial: role === 'admin',
      /** Check if a route path is allowed */
      canAccessRoute: (path: string) => {
        const key = ROUTE_KEY_MAP[path];
        if (!key) return true; // unknown routes are allowed (will 404)
        return allowedKeys.includes(key);
      },
      /** The default route for this role (first allowed key) */
      defaultRoute: allowedKeys[0] === 'dashboard' ? '' : allowedKeys[0],
      allowedKeys,
    };
  }, [role]);
}