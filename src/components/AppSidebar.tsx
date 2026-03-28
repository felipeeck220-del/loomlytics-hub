import {
  LayoutDashboard, Settings2, Users, FileText, ClipboardList, HardHat, Factory, Settings, Search, Wrench, Lock,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useMemo } from 'react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, useSidebar,
} from '@/components/ui/sidebar';

const allItems = [
  { title: 'Dashboard', path: '', icon: LayoutDashboard, key: 'dashboard' },
  { title: 'Máquinas', path: 'machines', icon: Settings2, key: 'machines' },
  { title: 'Clientes & Artigos', path: 'clients-articles', icon: Users, key: 'clients-articles' },
  { title: 'Produção', path: 'production', icon: ClipboardList, key: 'production' },
  { title: 'Revisão', path: 'revision', icon: Search, key: 'revision' },
  { title: 'Mecânica', path: 'mecanica', icon: Wrench, key: 'mecanica' },
  { title: 'Terceirizado', path: 'outsource', icon: Factory, key: 'outsource' },
  { title: 'Tecelões', path: 'weavers', icon: HardHat, key: 'weavers' },
  { title: 'Relatórios', path: 'reports', icon: FileText, key: 'reports' },
  { title: 'Configurações', path: 'settings', icon: Settings, key: 'settings' },
];

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const { user } = useAuth();
  const { filterNavItems } = usePermissions();
  const { sidebarLocked } = useSubscription();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [enabledNavItems, setEnabledNavItems] = useState<string[] | null>(null);

  const slugPrefix = `/${user?.company_slug || ''}`;

  useEffect(() => {
    if (!user?.company_id) return;
    (supabase.from as any)('companies')
      .select('logo_url')
      .eq('id', user.company_id)
      .single()
      .then(({ data }: any) => {
        if (data?.logo_url) setLogoUrl(data.logo_url);
      });

    (supabase.from as any)('company_settings')
      .select('enabled_nav_items')
      .eq('company_id', user.company_id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.enabled_nav_items) {
          setEnabledNavItems(data.enabled_nav_items);
        }
      });
  }, [user?.company_id]);

  const items = useMemo(() => {
    const companyFiltered = enabledNavItems
      ? allItems.filter(item => enabledNavItems.includes(item.key))
      : allItems;
    const roleFiltered = filterNavItems(companyFiltered);
    return roleFiltered.map(item => ({
      ...item,
      url: item.path ? `${slugPrefix}/${item.path}` : slugPrefix,
    }));
  }, [enabledNavItems, slugPrefix, filterNavItems]);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="px-4 h-14 flex items-center border-b border-sidebar-border">
        {logoUrl ? (
          <div className="flex items-center justify-center w-full">
            <img src={logoUrl} alt="Logo" className="max-h-10 w-full object-contain rounded-lg" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Factory className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  MalhaGest
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Gestão Têxtil
                </span>
              </div>
            )}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-muted-foreground/50 text-[10px] uppercase tracking-widest font-medium px-3 mb-1">
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {items.map((item) => {
                const isLocked = sidebarLocked && item.key !== 'settings';
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild>
                      {isLocked ? (
                        <div
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground/40 cursor-not-allowed transition-all duration-150 text-[13px]"
                          title="Assinatura inativa"
                        >
                          <Lock className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>{item.title}</span>}
                        </div>
                      ) : (
                        <NavLink
                          to={item.url}
                          end={item.path === ''}
                          onClick={() => { if (isMobile) setOpenMobile(false); }}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150 text-[13px]"
                          activeClassName="bg-primary/10 text-primary font-medium"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
