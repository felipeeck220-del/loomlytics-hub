import {
  LayoutDashboard, Settings2, Users, FileText, ClipboardList, HardHat, Factory, Settings,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
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
  { title: 'Terceirizado', path: 'outsource', icon: Factory, key: 'outsource' },
  { title: 'Tecelões', path: 'weavers', icon: HardHat, key: 'weavers' },
  { title: 'Relatórios', path: 'reports', icon: FileText, key: 'reports' },
  { title: 'Configurações', path: 'settings', icon: Settings, key: 'settings' },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { user } = useAuth();
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
    const filtered = enabledNavItems
      ? allItems.filter(item => enabledNavItems.includes(item.key))
      : allItems;
    return filtered.map(item => ({
      ...item,
      url: item.path ? `${slugPrefix}/${item.path}` : slugPrefix,
    }));
  }, [enabledNavItems, slugPrefix]);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border">
        {logoUrl ? (
          <div className="flex items-center justify-center w-full">
            <img src={logoUrl} alt="Logo" className="max-h-12 w-full object-contain rounded-xl" />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="icon-box icon-box-primary shrink-0" style={{ width: 36, height: 36 }}>
              <Factory className="h-4 w-4 text-white" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-sm font-display font-bold text-sidebar-foreground tracking-tight">
                  MalhaGest
                </span>
                <span className="text-[10px] font-light text-muted-foreground uppercase tracking-widest">
                  Gestão Têxtil
                </span>
              </div>
            )}
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground/60 text-[10px] uppercase tracking-widest font-medium px-3 mb-1">
            {!collapsed && 'Navegação'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {items.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.path === ''}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="text-[13px]">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
