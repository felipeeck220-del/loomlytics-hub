import {
  LayoutDashboard, Settings2, Users, FileText, ClipboardList, HardHat, Factory, Settings, Search, Wrench, Lock, LogOut, Download, Smartphone, Share2, Receipt, Recycle, FileSpreadsheet, DollarSign, Warehouse, AlertTriangle, Repeat, Truck, Zap, PauseCircle,
} from 'lucide-react';
import { useInstallApp } from '@/hooks/useInstallApp';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getMobileFooterKeys } from '@/components/MobileBottomNav';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useMemo } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';

/** Keys of features not yet finished — shown with a lock in the sidebar */
const COMING_SOON_KEYS = new Set<string>([]);

/** Keys of features in testing phase — shown with "Em teste" badge but accessible */
const TESTING_KEYS = new Set(['contas-pagar', 'fechamento']);

const allItems = [
  { title: 'Ordens', path: 'ordens', icon: PauseCircle, key: 'ordens' },
  { title: 'Dashboard', path: '', icon: LayoutDashboard, key: 'dashboard' },
  { title: 'Faturamento Total', path: 'faturamento-total', icon: DollarSign, key: 'faturamento-total' },
  { title: 'Máquinas', path: 'machines', icon: Settings2, key: 'machines' },
  { title: 'Clientes & Artigos', path: 'clients-articles', icon: Users, key: 'clients-articles' },
  { title: 'Produção', path: 'production', icon: ClipboardList, key: 'production' },
  { title: 'Revisão', path: 'revision', icon: Search, key: 'revision' },
  { title: 'Mecânica', path: 'mecanica', icon: Wrench, key: 'mecanica', end: true },
  { title: 'OM', path: 'mecanica/om', icon: ClipboardList, key: 'mecanica-om', nonAdminOnly: true, end: true },
  { title: 'OC', path: 'mecanica/oc', icon: AlertTriangle, key: 'mecanica-oc', nonAdminOnly: true, end: true },
  { title: 'OE', path: 'mecanica/oe', icon: Zap, key: 'mecanica-oe', nonAdminOnly: true, end: true },
  { title: 'OT', path: 'mecanica/ot', icon: Repeat, key: 'mecanica-ot', nonAdminOnly: true, end: true },
  { title: 'Terceirizado', path: 'outsource', icon: Factory, key: 'outsource' },
  { title: 'Tecelões', path: 'weavers', icon: HardHat, key: 'weavers' },
  { title: 'Relatórios', path: 'reports', icon: FileText, key: 'reports' },
  { title: 'Contas a Pagar', path: 'contas-pagar', icon: Receipt, key: 'contas-pagar' },
  { title: 'Vendas de Resíduos', path: 'residuos', icon: Recycle, key: 'residuos' },
  { title: 'Estoque Malha', path: 'estoque-malha', icon: Warehouse, key: 'estoque-malha' },
  { title: 'Ordem de Faturamento (OF)', path: 'billing-orders', icon: ClipboardList, key: 'billing-orders' },
  { title: 'Ordem de Frete (OFR)', path: 'freight-orders', icon: Truck, key: 'freight-orders' },
  { title: 'Notas Fiscais', path: 'invoices', icon: FileText, key: 'invoices' },
  { title: 'Notas Fiscais (Clientes)', path: 'client-invoices', icon: FileText, key: 'client-invoices' },
  { title: 'Fechamento', path: 'fechamento', icon: FileSpreadsheet, key: 'fechamento' },
  { title: 'Configurações', path: 'settings', icon: Settings, key: 'settings' },
];

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const collapsed = state === 'collapsed';
  const { user, logout } = useAuth();
  const { role, filterNavItems } = usePermissions();
  const { sidebarLocked } = useSubscription();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('');
  const [enabledNavItems, setEnabledNavItems] = useState<string[] | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [openOMCount, setOpenOMCount] = useState(0);
  const [openOCCount, setOpenOCCount] = useState(0);
  const [openOECount, setOpenOECount] = useState(0);
  const [openOTCount, setOpenOTCount] = useState(0);
  const [otReadyCount, setOtReadyCount] = useState(0);
  const [moInProgressCount, setMoInProgressCount] = useState(0);
  const [otActiveStagesCount, setOtActiveStagesCount] = useState(0);
  const ordersInProgressCount = moInProgressCount + otActiveStagesCount;
  const isAdmin = role === 'admin';
  const { canInstall, platform, install, showIOSInstructions, setShowIOSInstructions } = useInstallApp();

  const slugPrefix = `/${user?.company_slug || ''}`;

  useEffect(() => {
    if (!user?.company_id) return;
    (supabase.from as any)('companies')
      .select('logo_url, name')
      .eq('id', user.company_id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data?.logo_url) setLogoUrl(data.logo_url);
        if (data?.name) setCompanyName(data.name);
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

  // Contagem em tempo real de OMs/OCs em aberto (status = 'aberto')
  useEffect(() => {
    if (!user?.company_id) return;
    const companyId = user.company_id;
    let cancelled = false;

    const load = async () => {
      const { data } = await (supabase.from as any)('maintenance_orders')
        .select('type,status')
        .eq('company_id', companyId)
        .in('status', ['aberto', 'em_curso']);
      if (cancelled) return;
      const rows = (data || []) as Array<{ type: string; status: string }>;
      const openRows = rows.filter(r => r.status === 'aberto');
      const oc = openRows.filter(r => r.type === 'manutencao_corretiva').length;
      const oe = openRows.filter(r => r.type === 'manutencao_eletrica').length;
      const om = openRows.length - oc - oe;
      const inProgress = rows.filter(r => r.status === 'em_curso').length;
      setOpenOMCount(om);
      setOpenOCCount(oc);
      setOpenOECount(oe);
      setMoInProgressCount(inProgress);
    };

    load();
    const channel = (supabase as any)
      .channel(`sidebar-mo-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_orders', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.company_id]);

  // Contagem em tempo real de OTs (aberto + prontas p/ regulagem)
  useEffect(() => {
    if (!user?.company_id) return;
    const companyId = user.company_id;
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase.from as any)('article_change_orders')
        .select('status')
        .eq('company_id', companyId)
        .in('status', ['aberto', 'aguardando_regulagem', 'em_regulagem', 'troca_fio_em_curso', 'em_acompanhamento']);
      if (cancelled) return;
      const rows = (data || []) as Array<{ status: string }>;
      setOpenOTCount(rows.filter(r => r.status === 'aberto').length);
      setOtReadyCount(rows.filter(r => r.status === 'aguardando_regulagem' || r.status === 'em_regulagem').length);
      const otActive = rows.filter(r => ['troca_fio_em_curso', 'aguardando_regulagem', 'em_regulagem', 'em_acompanhamento'].includes(r.status)).length;
      setOtActiveStagesCount(otActive);
    };
    load();
    const channel = (supabase as any)
      .channel(`sidebar-ot-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_orders', filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.company_id]);

  const items = useMemo(() => {
    const mecanicaEnabled = !enabledNavItems || enabledNavItems.includes('mecanica');
    const companyFiltered = enabledNavItems
      ? allItems.filter(item => {
          if (item.key === 'mecanica-om' || item.key === 'mecanica-oc' || item.key === 'mecanica-oe' || item.key === 'mecanica-ot') return mecanicaEnabled;
          return enabledNavItems.includes(item.key);
        })
      : allItems;
    const adminFiltered = companyFiltered.filter(item => !((item as any).nonAdminOnly && isAdmin));
    const roleFiltered = filterNavItems(adminFiltered);

    // OM/OC/OT aparecem no sidebar para mecânico e líder de mecânica (além do footer)
    const mecanicoFiltered = roleFiltered;

    // Mecânico: só vê OT quando existe pelo menos 1 pronta para regulagem
    const mecanicoOtVisible = user?.role === 'mecanico' ? otReadyCount > 0 : true;
    const otFiltered = mecanicoOtVisible ? mecanicoFiltered : mecanicoFiltered.filter(i => i.key !== 'mecanica-ot');

    // On mobile, hide items that are in the bottom nav
    const mobileFooterKeys = getMobileFooterKeys(user?.role || 'admin');
    const finalItems = isMobile
      ? otFiltered.filter(item => !mobileFooterKeys.includes(item.key))
      : otFiltered;

    const firstName = companyName.split(' ')[0];

    return finalItems.map(item => ({
      ...item,
      title: item.key === 'invoices' && firstName ? `Notas Fiscais (${firstName})` : item.title,
      url: item.path ? `${slugPrefix}/${item.path}` : slugPrefix,
    }));
  }, [enabledNavItems, slugPrefix, filterNavItems, isMobile, user?.role, companyName, otReadyCount]);

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="h-14 flex items-center justify-center border-b border-sidebar-border px-2">
        {logoUrl ? (
          <div className="flex items-center justify-center w-full">
            <img
              src={logoUrl}
              alt="Logo"
              className={collapsed ? "h-8 w-8 object-contain rounded-lg" : "max-h-10 w-full object-contain rounded-lg"}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2.5">
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
      <SidebarContent className={collapsed ? "px-0 py-3" : "px-2 py-3"}>
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
                const isComingSoon = COMING_SOON_KEYS.has(item.key);
                const isTesting = TESTING_KEYS.has(item.key);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild>
                      {isLocked || isComingSoon ? (
                        <div
                          className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'} py-2 rounded-lg text-muted-foreground/40 cursor-not-allowed transition-all duration-150 text-[13px]`}
                          title={isComingSoon ? 'Em breve' : 'Assinatura inativa'}
                        >
                          <Lock className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <span className="flex items-center gap-2">
                              {item.title}
                              {isComingSoon && (
                                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium leading-none">
                                  Em breve
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <NavLink
                          to={item.url}
                          end={item.path === '' || (item as any).end === true}
                          onClick={() => { if (isMobile) setOpenMobile(false); }}
                          className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'} py-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-150 text-[13px]`}
                          activeClassName="bg-primary/10 text-primary font-medium"
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {!collapsed && (
                            <span className="flex items-center gap-2 flex-1">
                              {item.title}
                              {isTesting && (
                                <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-medium leading-none">
                                  Em teste
                                </span>
                              )}
                              {item.key === 'mecanica-om' && openOMCount > 0 && (
                                <span className="ml-auto text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                  {openOMCount}
                                </span>
                              )}
                              {item.key === 'mecanica-oc' && openOCCount > 0 && (
                                <span className="ml-auto text-[10px] bg-red-500/15 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                  {openOCCount}
                                </span>
                              )}
                              {item.key === 'mecanica-oe' && openOECount > 0 && (
                                <span className="ml-auto text-[10px] bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                  {openOECount}
                                </span>
                              )}
                              {item.key === 'mecanica-ot' && (openOTCount + otReadyCount) > 0 && (
                                <span className="ml-auto text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                                  {openOTCount + otReadyCount}
                                </span>
                              )}
                            </span>
                          )}
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

      {/* Install App + Logout */}
      <SidebarFooter className={`${collapsed ? 'px-0' : 'px-2'} py-3 border-t border-sidebar-border`}>
        <SidebarMenu>
          {canInstall && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <button
                  onClick={() => { install(); if (isMobile) setOpenMobile(false); }}
                  className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'} py-2 rounded-lg text-primary hover:bg-primary/10 transition-all duration-150 text-[13px] w-full`}
                >
                  {platform === 'ios' ? (
                    <Share2 className="h-4 w-4 shrink-0" />
                  ) : platform === 'android' ? (
                    <Smartphone className="h-4 w-4 shrink-0" />
                  ) : (
                    <Download className="h-4 w-4 shrink-0" />
                  )}
                  {!collapsed && (
                    <span>
                      {platform === 'ios' ? 'Instalar App (iOS)' : platform === 'android' ? 'Instalar App (Android)' : 'Instalar App'}
                    </span>
                  )}
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {!isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <button
                  onClick={() => setShowLogoutDialog(true)}
                  className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-3'} py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-all duration-150 text-[13px] w-full`}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Sair</span>}
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>

      {/* iOS install instructions */}
      <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Instalar no iPhone/iPad</DialogTitle>
            <DialogDescription>
              Siga os passos abaixo para instalar o MalhaGest como um app:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-sm font-bold text-primary">1</div>
              <p className="text-sm text-muted-foreground">Toque no ícone de <strong className="text-foreground">Compartilhar</strong> <Share2 className="inline h-4 w-4" /> na barra do Safari</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-sm font-bold text-primary">2</div>
              <p className="text-sm text-muted-foreground">Role para baixo e toque em <strong className="text-foreground">"Adicionar à Tela de Início"</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-sm font-bold text-primary">3</div>
              <p className="text-sm text-muted-foreground">Toque em <strong className="text-foreground">"Adicionar"</strong> para confirmar</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logout confirmation dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja sair do sistema?</AlertDialogTitle>
            <AlertDialogDescription>
              Você será desconectado e precisará fazer login novamente para acessar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={logout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
