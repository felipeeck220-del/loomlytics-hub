import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useMemo } from 'react';
import { Lock } from 'lucide-react';
import {
  LayoutDashboard, Settings2, ClipboardList, Factory, Settings, Search, Wrench,
} from 'lucide-react';

const allItems = [
  { title: 'Dashboard', path: '', icon: LayoutDashboard, key: 'dashboard' },
  { title: 'Máquinas', path: 'machines', icon: Settings2, key: 'machines' },
  { title: 'Produção', path: 'production', icon: ClipboardList, key: 'production' },
  { title: 'Revisão', path: 'revision', icon: Search, key: 'revision' },
  { title: 'Mecânica', path: 'mecanica', icon: Wrench, key: 'mecanica' },
  { title: 'Terceirizado', path: 'outsource', icon: Factory, key: 'outsource' },
  { title: 'Configurações', path: 'settings', icon: Settings, key: 'settings' },
];

/** Keys shown in the mobile footer per role */
const MOBILE_FOOTER_KEYS: Record<string, string[]> = {
  admin: ['dashboard', 'production', 'outsource', 'settings'],
  lider: ['dashboard', 'machines', 'revision', 'settings'],
  mecanico: ['machines', 'mecanica'],
  revisador: ['production', 'revision'],
};

export function getMobileFooterKeys(role: string): string[] {
  return MOBILE_FOOTER_KEYS[role] || MOBILE_FOOTER_KEYS.admin;
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const { role, filterNavItems } = usePermissions();
  const { sidebarLocked } = useSubscription();
  const navigate = useNavigate();
  const location = useLocation();
  const [enabledNavItems, setEnabledNavItems] = useState<string[] | null>(null);

  const slugPrefix = `/${user?.company_slug || ''}`;

  useEffect(() => {
    if (!user?.company_id) return;
    (supabase.from as any)('company_settings')
      .select('enabled_nav_items')
      .eq('company_id', user.company_id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.enabled_nav_items) setEnabledNavItems(data.enabled_nav_items);
      });
  }, [user?.company_id]);

  const items = useMemo(() => {
    const footerKeys = getMobileFooterKeys(role);
    const footerItems = allItems.filter(i => footerKeys.includes(i.key));

    // Apply company-level filtering
    const companyFiltered = enabledNavItems
      ? footerItems.filter(i => enabledNavItems.includes(i.key))
      : footerItems;

    // Apply role-level filtering
    const roleFiltered = filterNavItems(companyFiltered);

    return roleFiltered.map(item => ({
      ...item,
      url: item.path ? `${slugPrefix}/${item.path}` : slugPrefix,
    }));
  }, [role, enabledNavItems, slugPrefix, filterNavItems]);

  const isActive = (item: typeof items[0]) => {
    if (item.path === '') {
      return location.pathname === slugPrefix || location.pathname === `${slugPrefix}/`;
    }
    return location.pathname.startsWith(`${slugPrefix}/${item.path}`);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
      <div className="flex items-center justify-around h-14 px-1">
        {items.map((item) => {
          const active = isActive(item);
          const locked = sidebarLocked && item.key !== 'settings';
          return (
            <button
              key={item.key}
              onClick={() => !locked && navigate(item.url)}
              disabled={locked}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                locked
                  ? 'text-muted-foreground/30 cursor-not-allowed'
                  : active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {locked ? (
                <Lock className="h-5 w-5" />
              ) : (
                <item.icon className="h-5 w-5" />
              )}
              <span className="text-[10px] font-medium leading-tight truncate max-w-[60px]">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area for devices with home indicator */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
