import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useMemo } from 'react';
import { Lock } from 'lucide-react';
import {
  LayoutDashboard, Settings2, ClipboardList, Factory, Settings, Search, Wrench, AlertTriangle, Repeat, Truck,
} from 'lucide-react';

const allItems = [
  { title: 'Dashboard', path: '', icon: LayoutDashboard, key: 'dashboard' },
  { title: 'Máquinas', path: 'machines', icon: Settings2, key: 'machines' },
  { title: 'Produção', path: 'production', icon: ClipboardList, key: 'production' },
  { title: 'Revisão', path: 'revision', icon: Search, key: 'revision' },
  { title: 'Mecânica', path: 'mecanica', icon: Wrench, key: 'mecanica' },
  { title: 'OM', path: 'mecanica/om', icon: ClipboardList, key: 'mecanica-om' },
  { title: 'OC', path: 'mecanica/oc', icon: AlertTriangle, key: 'mecanica-oc' },
  { title: 'OT', path: 'mecanica/ot', icon: Repeat, key: 'mecanica-ot' },
  { title: 'Terceirizado', path: 'outsource', icon: Factory, key: 'outsource' },
  { title: 'Ordem de Frete', path: 'freight-orders', icon: Truck, key: 'freight-orders' },
  { title: 'Configurações', path: 'settings', icon: Settings, key: 'settings' },
];

/** Keys shown in the mobile footer per role */
const MOBILE_FOOTER_KEYS: Record<string, string[]> = {
  admin: ['dashboard', 'production', 'outsource', 'settings'],
  lider: ['mecanica-oc', 'mecanica-ot'],
  lider_noite: ['mecanica-oc', 'mecanica-ot'],
  mecanico: ['mecanica-om', 'mecanica-oc', 'mecanica-ot'],
  lider_mecanica: ['mecanica-om', 'mecanica-oc', 'mecanica-ot'],
  revisador: ['production', 'revision'],
  freteiro: ['freight-orders'],
  lider_frete: ['freight-orders'],
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
  const [openOMCount, setOpenOMCount] = useState(0);
  const [openOCCount, setOpenOCCount] = useState(0);
  const [openOTCount, setOpenOTCount] = useState(0);
  const [otReadyCount, setOtReadyCount] = useState(0);

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

  // Contagem em tempo real de OMs/OCs em aberto (status = 'aberto')
  useEffect(() => {
    if (!user?.company_id) return;
    const companyId = user.company_id;
    let cancelled = false;

    const load = async () => {
      const { data } = await (supabase.from as any)('maintenance_orders')
        .select('type,status')
        .eq('company_id', companyId)
        .eq('status', 'aberto');
      if (cancelled) return;
      const rows = (data || []) as Array<{ type: string; status: string }>;
      const oc = rows.filter(r => r.type === 'manutencao_corretiva').length;
      const om = rows.length - oc;
      setOpenOMCount(om);
      setOpenOCCount(oc);
    };

    load();
    const channel = (supabase as any)
      .channel(`footer-mo-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_orders', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.company_id]);

  // Contagem OT em tempo real
  useEffect(() => {
    if (!user?.company_id) return;
    const companyId = user.company_id;
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase.from as any)('article_change_orders')
        .select('status')
        .eq('company_id', companyId)
        .in('status', ['aberto', 'aguardando_regulagem', 'em_regulagem']);
      if (cancelled) return;
      const rows = (data || []) as Array<{ status: string }>;
      setOpenOTCount(rows.filter(r => r.status === 'aberto').length);
      setOtReadyCount(rows.filter(r => r.status === 'aguardando_regulagem' || r.status === 'em_regulagem').length);
    };
    load();
    const channel = (supabase as any)
      .channel(`footer-ot-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_orders', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.company_id]);

  const items = useMemo(() => {
    const footerKeys = getMobileFooterKeys(role);
    const footerItems = allItems.filter(i => footerKeys.includes(i.key));

    // Apply company-level filtering (mecanica-om/oc herdam do toggle 'mecanica')
    const mecanicaEnabled = !enabledNavItems || enabledNavItems.includes('mecanica');
    const companyFiltered = enabledNavItems
      ? footerItems.filter(i => {
          if (i.key === 'mecanica-om' || i.key === 'mecanica-oc' || i.key === 'mecanica-ot') return mecanicaEnabled;
          return enabledNavItems.includes(i.key);
        })
      : footerItems;

    // Apply role-level filtering
    const roleFiltered = filterNavItems(companyFiltered);

    // OT sempre visível no rodapé para mecânico e líder de mecânica
    return roleFiltered.map(item => ({
      ...item,
      url: item.path ? `${slugPrefix}/${item.path}` : slugPrefix,
    }));
  }, [role, enabledNavItems, slugPrefix, filterNavItems, otReadyCount]);

  const isActive = (item: typeof items[0]) => {
    if (item.path === '') {
      return location.pathname === slugPrefix || location.pathname === `${slugPrefix}/`;
    }
    const fullPath = `${slugPrefix}/${item.path}`;
    // Rotas de mecanica precisam de match exato para não destacar Mecânica junto com OM/OC
    if (item.key === 'mecanica' || item.key === 'mecanica-om' || item.key === 'mecanica-oc' || item.key === 'mecanica-ot') {
      return location.pathname === fullPath;
    }
    return location.pathname.startsWith(fullPath);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
      <div className="flex items-center justify-around h-14 px-1">
        {items.map((item) => {
          const active = isActive(item);
          const locked = sidebarLocked && item.key !== 'settings';
          const badgeCount =
            item.key === 'mecanica-om' ? openOMCount :
            item.key === 'mecanica-oc' ? openOCCount :
            item.key === 'mecanica-ot' ? (openOTCount + otReadyCount) : 0;
          const badgeColor =
            item.key === 'mecanica-oc' ? 'bg-red-500' :
            item.key === 'mecanica-ot' ? 'bg-amber-500' : 'bg-primary';
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
              <div className="relative">
                {locked ? (
                  <Lock className="h-5 w-5" />
                ) : (
                  <item.icon className="h-5 w-5" />
                )}
                {!locked && badgeCount > 0 && (
                  <span className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full ${badgeColor} text-white text-[9px] font-bold flex items-center justify-center leading-none`}>
                    {badgeCount}
                  </span>
                )}
              </div>
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
