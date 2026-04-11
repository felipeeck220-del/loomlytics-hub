import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, ChevronDown, ChevronUp, Filter, X, Plus, Pencil, Trash2, RefreshCw, LogIn, Monitor, Smartphone, Tablet, Globe, MapPin } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Action labels ───────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  machine_create: 'Máquina criada', machine_update: 'Máquina editada', machine_status_change: 'Status da máquina alterado', machine_delete: 'Máquina excluída',
  production_create: 'Produção registrada', production_update: 'Produção editada', production_delete: 'Produção excluída',
  defect_create: 'Falha registrada', defect_delete: 'Falha excluída', defect_update: 'Falha editada',
  maintenance_manual_add: 'Manutenção adicionada',
  user_create: 'Usuário criado', user_update: 'Usuário editado', user_delete: 'Usuário excluído',
  user_deactivate: 'Usuário desativado', user_reactivate: 'Usuário reativado',
  user_password_change: 'Senha alterada', user_permissions_update: 'Permissões alteradas',
  client_create: 'Cliente criado', client_update: 'Cliente editado', client_delete: 'Cliente excluído',
  article_create: 'Artigo criado', article_update: 'Artigo editado', article_delete: 'Artigo excluído',
  weaver_create: 'Tecelão criado', weaver_update: 'Tecelão editado', weaver_delete: 'Tecelão excluído',
  invoice_create: 'NF criada', invoice_confirm: 'NF conferida', invoice_cancel: 'NF cancelada',
  account_create: 'Conta criada', account_update: 'Conta editada', account_pay: 'Conta paga', account_delete: 'Conta excluída',
  residue_material_create: 'Material criado', residue_material_update: 'Material editado', residue_material_delete: 'Material excluído',
  residue_sale_create: 'Venda de resíduo', residue_sale_delete: 'Venda de resíduo excluída',
  outsource_company_create: 'Terceirizada criada', outsource_company_update: 'Terceirizada editada', outsource_company_delete: 'Terceirizada excluída',
  outsource_production_create: 'Produção terceirizada', outsource_production_delete: 'Produção terceirizada excluída',
  yarn_type_create: 'Tipo de fio criado', yarn_type_update: 'Tipo de fio editado', yarn_type_delete: 'Tipo de fio excluído',
  outsource_yarn_stock_create: 'Estoque fio criado', outsource_yarn_stock_update: 'Estoque fio editado', outsource_yarn_stock_delete: 'Estoque fio excluído',
  shift_settings_update: 'Turnos alterados', company_logo_update: 'Logo atualizada', production_mode_change: 'Modo de produção alterado',
};

// ─── Action type → icon + color ─────────────────────────────
function getActionIcon(action: string) {
  if (action.includes('_delete') || action.includes('_cancel')) return { icon: Trash2, color: 'text-destructive bg-destructive/10' };
  if (action.includes('_create') || action.includes('_add')) return { icon: Plus, color: 'text-success bg-success/10' };
  if (action.includes('_update') || action.includes('_change') || action.includes('_confirm') || action.includes('_pay') || action.includes('_reactivate')) return { icon: Pencil, color: 'text-info bg-info/10' };
  if (action.includes('_deactivate')) return { icon: X, color: 'text-warning bg-warning/10' };
  return { icon: RefreshCw, color: 'text-muted-foreground bg-muted' };
}

// ─── Action → module badge ──────────────────────────────────
function getModuleBadge(action: string): { label: string; color: string } {
  if (action.startsWith('machine_') || action.startsWith('maintenance_')) return { label: 'Máquinas', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
  if (action.startsWith('production_')) return { label: 'Produção', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
  if (action.startsWith('defect_')) return { label: 'Revisão', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
  if (action.startsWith('user_')) return { label: 'Usuários', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' };
  if (action.startsWith('client_') || action.startsWith('article_')) return { label: 'Artigos', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' };
  if (action.startsWith('weaver_')) return { label: 'Tecelões', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
  if (action.startsWith('invoice_') || action.startsWith('yarn_type_') || action.startsWith('outsource_yarn_')) return { label: 'Notas Fiscais', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' };
  if (action.startsWith('account_')) return { label: 'Contas', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  if (action.startsWith('residue_')) return { label: 'Resíduos', color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400' };
  if (action.startsWith('outsource_')) return { label: 'Terceirizados', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' };
  if (action.startsWith('shift_') || action.startsWith('company_') || action.startsWith('production_mode')) return { label: 'Configurações', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' };
  return { label: 'Sistema', color: 'bg-muted text-muted-foreground' };
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  lider: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  mecanico: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  revisador: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', lider: 'Líder', mecanico: 'Mecânico', revisador: 'Revisador' };

interface AuditLog { id: string; user_name: string | null; user_code: string | null; user_role: string | null; action: string; details: Record<string, any> | null; created_at: string; }
interface LoginLog { id: string; user_name: string | null; user_code: string | null; user_role: string | null; ip_address: string | null; device_type: string | null; browser: string | null; os: string | null; location_country: string | null; location_city: string | null; created_at: string; }
interface Props { open: boolean; onOpenChange: (open: boolean) => void; companyId: string; }

const PAGE_SIZE = 50;

// ─── Group logs by day ──────────────────────────────────────
function groupByDay<T extends { created_at: string }>(items: T[]): { label: string; items: T[] }[] {
  const groups: Record<string, T[]> = {};
  items.forEach(item => {
    const d = new Date(item.created_at);
    let label: string;
    if (isToday(d)) label = 'Hoje';
    else if (isYesterday(d)) label = 'Ontem';
    else label = format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });
  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === 'Mobile') return <Smartphone className="h-3.5 w-3.5" />;
  if (type === 'Tablet') return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export default function AuditHistoryModal({ open, onOpenChange, companyId }: Props) {
  const [activeTab, setActiveTab] = useState('actions');

  // ─── ACTIONS STATE ────────────────────────────────────────
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [filterModule, setFilterModule] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [users, setUsers] = useState<Array<{ name: string; code: string }>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // ─── LOGINS STATE ─────────────────────────────────────────
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginHasMore, setLoginHasMore] = useState(true);
  const [loginPage, setLoginPage] = useState(0);
  const [loginFilterUser, setLoginFilterUser] = useState('all');

  const initialLoadDone = useRef(false);

  // ─── Fetch helpers ────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    const { data } = await (supabase.from as any)('profiles').select('name, code').eq('company_id', companyId).order('code');
    if (data) setUsers(data);
  }, [companyId]);

  const fetchActions = useCallback(async () => {
    const { data } = await (supabase.from as any)('audit_logs').select('action').eq('company_id', companyId).limit(1000);
    if (data) setAvailableActions([...new Set(data.map((d: any) => d.action))].sort() as string[]);
  }, [companyId]);

  const MODULE_PREFIXES: Record<string, string[]> = {
    'Máquinas': ['machine_', 'maintenance_'],
    'Produção': ['production_'],
    'Revisão': ['defect_'],
    'Usuários': ['user_'],
    'Artigos': ['client_', 'article_'],
    'Tecelões': ['weaver_'],
    'Notas Fiscais': ['invoice_', 'yarn_type_', 'outsource_yarn_'],
    'Contas': ['account_'],
    'Resíduos': ['residue_'],
    'Terceirizados': ['outsource_company_', 'outsource_production_'],
    'Configurações': ['shift_', 'company_', 'production_mode'],
  };

  const doFetch = useCallback(async (pageNum: number, append: boolean, filters: { user: string; action: string; module: string; search: string; dateFrom: string; dateTo: string }) => {
    setLoading(true);
    let query = (supabase.from as any)('audit_logs')
      .select('id, user_name, user_code, user_role, action, details, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (filters.user !== 'all') query = query.eq('user_code', filters.user);
    if (filters.action !== 'all') query = query.eq('action', filters.action);
    if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
    if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59`);

    const { data, error } = await query;
    if (!error && data) {
      let filtered = data as AuditLog[];
      // Module filter (client-side)
      if (filters.module !== 'all' && MODULE_PREFIXES[filters.module]) {
        const prefixes = MODULE_PREFIXES[filters.module];
        filtered = filtered.filter(l => prefixes.some(p => l.action.startsWith(p)));
      }
      // Search filter (client-side)
      if (filters.search) {
        const s = filters.search.toLowerCase();
        filtered = filtered.filter(l =>
          (l.user_name || '').toLowerCase().includes(s) ||
          (ACTION_LABELS[l.action] || l.action).toLowerCase().includes(s) ||
          JSON.stringify(l.details || {}).toLowerCase().includes(s)
        );
      }
      if (append) setLogs(prev => [...prev, ...filtered]);
      else setLogs(filtered);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [companyId]);

  const fetchLogins = useCallback(async (pageNum: number, append: boolean, userFilter: string) => {
    setLoginLoading(true);
    let query = (supabase.from as any)('login_history')
      .select('id, user_name, user_code, user_role, ip_address, device_type, browser, os, location_country, location_city, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (userFilter !== 'all') query = query.eq('user_code', userFilter);

    const { data, error } = await query;
    if (!error && data) {
      if (append) setLoginLogs(prev => [...prev, ...data]);
      else setLoginLogs(data);
      setLoginHasMore(data.length === PAGE_SIZE);
    }
    setLoginLoading(false);
  }, [companyId]);

  // ─── Init ─────────────────────────────────────────────────
  useEffect(() => {
    if (open && companyId) {
      initialLoadDone.current = true;
      setFilterUser('all'); setFilterAction('all'); setFilterModule('all');
      setSearch(''); setDateFrom(''); setDateTo('');
      setPage(0); setExpandedId(null);
      setLoginPage(0); setLoginFilterUser('all');
      fetchUsers();
      fetchActions();
      doFetch(0, false, { user: 'all', action: 'all', module: 'all', search: '', dateFrom: '', dateTo: '' });
      fetchLogins(0, false, 'all');
    } else {
      initialLoadDone.current = false;
    }
  }, [open, companyId, fetchUsers, fetchActions, doFetch, fetchLogins]);

  const currentFilters = { user: filterUser, action: filterAction, module: filterModule, search, dateFrom, dateTo };
  const handleFilter = () => { setPage(0); doFetch(0, false, currentFilters); };
  const handleClear = () => {
    setFilterUser('all'); setFilterAction('all'); setFilterModule('all');
    setSearch(''); setDateFrom(''); setDateTo(''); setPage(0);
    doFetch(0, false, { user: 'all', action: 'all', module: 'all', search: '', dateFrom: '', dateTo: '' });
  };
  const loadMore = () => { const next = page + 1; setPage(next); doFetch(next, true, currentFilters); };

  // Auto-filter on select/date change
  useEffect(() => {
    if (!initialLoadDone.current) return;
    setPage(0);
    doFetch(0, false, { user: filterUser, action: filterAction, module: filterModule, search, dateFrom, dateTo });
  }, [filterUser, filterAction, filterModule, dateFrom, dateTo]);
  const loadMoreLogins = () => { const next = loginPage + 1; setLoginPage(next); fetchLogins(next, true, loginFilterUser); };

  const formatDetails = (details: Record<string, any> | null) => {
    if (!details || Object.keys(details).length === 0) return null;
    return Object.entries(details).map(([key, value]) => ({
      label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    }));
  };

  const hasActiveFilters = filterUser !== 'all' || filterAction !== 'all' || filterModule !== 'all' || search || dateFrom || dateTo;

  const actionGroups = groupByDay(logs);
  const loginGroups = groupByDay(loginLogs);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[85vw] max-w-5xl h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle className="font-display text-lg">Histórico</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3 shrink-0">
            <TabsList className="h-9">
              <TabsTrigger value="actions" className="gap-1.5 text-sm"><RefreshCw className="h-3.5 w-3.5" /> Ações</TabsTrigger>
              <TabsTrigger value="logins" className="gap-1.5 text-sm"><LogIn className="h-3.5 w-3.5" /> Logins</TabsTrigger>
            </TabsList>
          </div>

          {/* ─── ACTIONS TAB ─── */}
          <TabsContent value="actions" className="flex-1 flex flex-col min-h-0 mt-0 overflow-hidden">
            {/* Filters */}
            <div className="px-6 py-3 border-b border-border space-y-3 shrink-0">
              <div className="flex flex-wrap gap-2">
                <Select value={filterUser} onValueChange={v => setFilterUser(v)}>
                  <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Usuário" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map(u => <SelectItem key={u.code} value={u.code}>{u.name} #{u.code}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={filterModule} onValueChange={v => setFilterModule(v)}>
                  <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Módulo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os módulos</SelectItem>
                    {Object.keys(MODULE_PREFIXES).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={filterAction} onValueChange={v => setFilterAction(v)}>
                  <SelectTrigger className="w-[170px] h-9 text-sm"><SelectValue placeholder="Ação" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as ações</SelectItem>
                    {availableActions.map(a => <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>)}
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar..." className="pl-8 h-9 w-[130px] text-sm" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFilter()} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" className="h-9 w-[140px] text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" className="h-9 w-[140px] text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                <Button size="sm" onClick={handleFilter} className="h-9"><Filter className="h-3.5 w-3.5 mr-1" /> Filtrar</Button>
                {hasActiveFilters && <Button size="sm" variant="ghost" onClick={handleClear} className="h-9 text-muted-foreground"><X className="h-3.5 w-3.5 mr-1" /> Limpar</Button>}
              </div>
            </div>

            {/* Actions list grouped by day */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              {loading && logs.length === 0 ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhum registro encontrado</div>
              ) : (
                <div className="space-y-6">
                  {actionGroups.map(group => (
                    <div key={group.label}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                        <div className="flex-1 h-px bg-border" />
                        <Badge variant="secondary" className="text-[10px]">{group.items.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {group.items.map(log => {
                          const details = formatDetails(log.details);
                          const isExpanded = expandedId === log.id;
                          const actionMeta = getActionIcon(log.action);
                          const moduleMeta = getModuleBadge(log.action);
                          const ActionIcon = actionMeta.icon;
                          return (
                            <div key={log.id} className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  <div className={`rounded-full p-2 shrink-0 mt-0.5 ${actionMeta.color}`}>
                                    <ActionIcon className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold text-foreground">
                                        {log.user_name || 'Sistema'}
                                        {log.user_code && <span className="text-muted-foreground font-mono"> #{log.user_code}</span>}
                                      </span>
                                      <Badge className={`text-[11px] px-2 py-0.5 ${ROLE_COLORS[log.user_role || ''] || 'bg-muted text-muted-foreground'}`}>
                                        {ROLE_LABELS[log.user_role || ''] || log.user_role}
                                      </Badge>
                                      <Badge className={`text-[11px] px-2 py-0.5 ${moduleMeta.color}`}>{moduleMeta.label}</Badge>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-sm text-foreground">{ACTION_LABELS[log.action] || log.action}</span>
                                      <span className="text-xs text-muted-foreground font-mono ml-auto shrink-0">
                                        {format(new Date(log.created_at), 'HH:mm', { locale: ptBR })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                {details && details.length > 0 && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </Button>
                                )}
                              </div>
                              {isExpanded && details && (
                                <div className="mt-3 ml-11 pl-3 border-l-2 border-primary/20 space-y-1">
                                  {details.map((d, i) => (
                                    <div key={i} className="text-sm">
                                      <span className="text-muted-foreground">{d.label}:</span>{' '}
                                      <span className="text-foreground">{d.value}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {hasMore && logs.length > 0 && (
                <div className="flex justify-center py-3">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Carregar mais
                  </Button>
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground text-right px-6 py-2 border-t border-border shrink-0">
              {logs.length} registro{logs.length !== 1 ? 's' : ''}
            </div>
          </TabsContent>

          {/* ─── LOGINS TAB ─── */}
          <TabsContent value="logins" className="flex-1 flex flex-col min-h-0 mt-0">
            <div className="px-6 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Select value={loginFilterUser} onValueChange={v => { setLoginFilterUser(v); setLoginPage(0); fetchLogins(0, false, v); }}>
                  <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue placeholder="Usuário" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os usuários</SelectItem>
                    {users.map(u => <SelectItem key={u.code} value={u.code}>{u.name} #{u.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              {loginLoading && loginLogs.length === 0 ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : loginLogs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhum login registrado ainda</div>
              ) : (
                <div className="space-y-6">
                  {loginGroups.map(group => (
                    <div key={group.label}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                        <div className="flex-1 h-px bg-border" />
                        <Badge variant="secondary" className="text-[10px]">{group.items.length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {group.items.map(log => (
                          <div key={log.id} className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start gap-3">
                              <div className="rounded-full p-2 shrink-0 mt-0.5 text-success bg-success/10">
                                <LogIn className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-foreground">
                                    {log.user_name || 'Usuário'}
                                    {log.user_code && <span className="text-muted-foreground font-mono"> #{log.user_code}</span>}
                                  </span>
                                  <Badge className={`text-[11px] px-2 py-0.5 ${ROLE_COLORS[log.user_role || ''] || 'bg-muted text-muted-foreground'}`}>
                                    {ROLE_LABELS[log.user_role || ''] || log.user_role}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground font-mono ml-auto shrink-0">
                                    {format(new Date(log.created_at), 'HH:mm', { locale: ptBR })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 mt-2 flex-wrap text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1.5">
                                    <DeviceIcon type={log.device_type} />
                                    {log.device_type || 'Desktop'}
                                  </span>
                                  {log.browser && (
                                    <span className="flex items-center gap-1.5">
                                      <Globe className="h-3.5 w-3.5" />
                                      {log.browser}{log.os ? ` / ${log.os}` : ''}
                                    </span>
                                  )}
                                  {log.ip_address && (
                                    <span className="font-mono text-xs">{log.ip_address}</span>
                                  )}
                                  {(log.location_city || log.location_country) && (
                                    <span className="flex items-center gap-1.5">
                                      <MapPin className="h-3.5 w-3.5" />
                                      {[log.location_city, log.location_country].filter(Boolean).join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {loginHasMore && loginLogs.length > 0 && (
                <div className="flex justify-center py-3">
                  <Button variant="outline" size="sm" onClick={loadMoreLogins} disabled={loginLoading}>
                    {loginLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Carregar mais
                  </Button>
                </div>
              )}
            </div>
            <div className="text-xs text-muted-foreground text-right px-6 py-2 border-t border-border shrink-0">
              {loginLogs.length} login{loginLogs.length !== 1 ? 's' : ''}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
