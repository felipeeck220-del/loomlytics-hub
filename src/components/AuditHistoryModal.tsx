import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ChevronDown, ChevronUp, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ACTION_LABELS: Record<string, string> = {
  machine_create: 'Máquina criada',
  machine_update: 'Máquina editada',
  machine_status_change: 'Status da máquina alterado',
  machine_delete: 'Máquina excluída',
  production_create: 'Produção registrada',
  production_update: 'Produção editada',
  production_delete: 'Produção excluída',
  defect_create: 'Falha registrada',
  defect_delete: 'Falha excluída',
  maintenance_manual_add: 'Manutenção adicionada',
  user_create: 'Usuário criado',
  user_update: 'Usuário editado',
  user_delete: 'Usuário excluído',
  user_deactivate: 'Usuário desativado',
  user_reactivate: 'Usuário reativado',
  user_password_change: 'Senha alterada',
  user_permissions_update: 'Permissões alteradas',
  client_create: 'Cliente criado',
  client_update: 'Cliente editado',
  client_delete: 'Cliente excluído',
  article_create: 'Artigo criado',
  article_update: 'Artigo editado',
  article_delete: 'Artigo excluído',
  weaver_create: 'Tecelão criado',
  weaver_update: 'Tecelão editado',
  weaver_delete: 'Tecelão excluído',
  invoice_create: 'NF criada',
  invoice_confirm: 'NF conferida',
  invoice_cancel: 'NF cancelada',
  account_create: 'Conta criada',
  account_update: 'Conta editada',
  account_pay: 'Conta paga',
  account_delete: 'Conta excluída',
  residue_material_create: 'Material criado',
  residue_material_update: 'Material editado',
  residue_material_delete: 'Material excluído',
  residue_sale_create: 'Venda de resíduo',
  residue_sale_delete: 'Venda de resíduo excluída',
  outsource_company_create: 'Malharia terceirizada criada',
  outsource_company_update: 'Malharia terceirizada editada',
  outsource_company_delete: 'Malharia terceirizada excluída',
  outsource_production_create: 'Produção terceirizada',
  outsource_production_delete: 'Produção terceirizada excluída',
  yarn_type_create: 'Tipo de fio criado',
  yarn_type_update: 'Tipo de fio editado',
  yarn_type_delete: 'Tipo de fio excluído',
  outsource_yarn_stock_create: 'Estoque fio terceiro criado',
  outsource_yarn_stock_update: 'Estoque fio terceiro editado',
  outsource_yarn_stock_delete: 'Estoque fio terceiro excluído',
  shift_settings_update: 'Turnos alterados',
  company_logo_update: 'Logo atualizada',
  production_mode_change: 'Modo de produção alterado',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  lider: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  mecanico: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  revisador: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  lider: 'Líder',
  mecanico: 'Mecânico',
  revisador: 'Revisador',
};

interface AuditLog {
  id: string;
  user_name: string | null;
  user_code: string | null;
  user_role: string | null;
  action: string;
  details: Record<string, any> | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}

const PAGE_SIZE = 50;

export default function AuditHistoryModal({ open, onOpenChange, companyId }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Users list for filter
  const [users, setUsers] = useState<Array<{ name: string; code: string }>>([]);

  // Expanded details
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Available actions from logs
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  const fetchUsers = useCallback(async () => {
    const { data } = await (supabase.from as any)('profiles')
      .select('name, code')
      .eq('company_id', companyId)
      .order('code');
    if (data) setUsers(data);
  }, [companyId]);

  const fetchActions = useCallback(async () => {
    const { data } = await (supabase.from as any)('audit_logs')
      .select('action')
      .eq('company_id', companyId);
    if (data) {
      const unique = [...new Set(data.map((d: any) => d.action))].sort() as string[];
      setAvailableActions(unique);
    }
  }, [companyId]);

  const fetchLogs = useCallback(async (pageNum: number, append = false) => {
    setLoading(true);
    let query = (supabase.from as any)('audit_logs')
      .select('id, user_name, user_code, user_role, action, details, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

    if (filterUser !== 'all') {
      query = query.eq('user_code', filterUser);
    }
    if (filterAction !== 'all') {
      query = query.eq('action', filterAction);
    }
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    const { data, error } = await query;
    if (!error && data) {
      let filtered = data as AuditLog[];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(l =>
          (l.user_name || '').toLowerCase().includes(s) ||
          (ACTION_LABELS[l.action] || l.action).toLowerCase().includes(s) ||
          JSON.stringify(l.details || {}).toLowerCase().includes(s)
        );
      }
      if (append) {
        setLogs(prev => [...prev, ...filtered]);
      } else {
        setLogs(filtered);
      }
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [companyId, filterUser, filterAction, dateFrom, dateTo, search]);

  useEffect(() => {
    if (open && companyId) {
      fetchUsers();
      fetchActions();
      setPage(0);
      fetchLogs(0);
    }
  }, [open, companyId, fetchUsers, fetchActions, fetchLogs]);

  const handleFilter = () => {
    setPage(0);
    fetchLogs(0);
  };

  const handleClear = () => {
    setFilterUser('all');
    setFilterAction('all');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
    setTimeout(() => fetchLogs(0), 0);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchLogs(next, true);
  };

  const formatDetails = (details: Record<string, any> | null) => {
    if (!details || Object.keys(details).length === 0) return null;
    return Object.entries(details).map(([key, value]) => {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return { label, value: val };
    });
  };

  const hasActiveFilters = filterUser !== 'all' || filterAction !== 'all' || search || dateFrom || dateTo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-4xl h-[80vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle className="font-display text-lg">Histórico de Ações</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-border space-y-3 shrink-0">
          <div className="flex flex-wrap gap-2">
            <Select value={filterUser} onValueChange={v => { setFilterUser(v); }}>
              <SelectTrigger className="w-[160px] h-9 text-sm">
                <SelectValue placeholder="Usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.code} value={u.code}>{u.name} #{u.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterAction} onValueChange={v => { setFilterAction(v); }}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="Tipo de ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {availableActions.map(a => (
                  <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-8 h-9 w-[140px] text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFilter()}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="h-9 w-[140px] text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="De" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" className="h-9 w-[140px] text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="Até" />

            <Button size="sm" variant="default" onClick={handleFilter} className="h-9">
              <Filter className="h-3.5 w-3.5 mr-1" /> Filtrar
            </Button>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={handleClear} className="h-9 text-muted-foreground">
                <X className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Log List — scrollable area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
          <div className="space-y-1">
            {loading && logs.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhum registro encontrado
              </div>
            ) : (
              logs.map(log => {
                const details = formatDetails(log.details);
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id} className="rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground font-mono">
                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                          <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[log.user_role || ''] || 'bg-muted text-muted-foreground'}`}>
                            {ROLE_LABELS[log.user_role || ''] || log.user_role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-sm font-medium text-foreground">
                            {log.user_name || 'Sistema'}
                            {log.user_code && <span className="text-muted-foreground font-mono"> #{log.user_code}</span>}
                          </span>
                          <span className="text-muted-foreground">—</span>
                          <span className="text-sm text-foreground">
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </div>
                      </div>
                      {details && details.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                    {isExpanded && details && (
                      <div className="mt-2 pl-2 border-l-2 border-primary/20 space-y-0.5">
                        {details.map((d, i) => (
                          <div key={i} className="text-xs">
                            <span className="text-muted-foreground">{d.label}:</span>{' '}
                            <span className="text-foreground">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {hasMore && logs.length > 0 && (
              <div className="flex justify-center py-3">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="text-xs text-muted-foreground text-right px-6 py-2 border-t border-border shrink-0">
          {logs.length} registro{logs.length !== 1 ? 's' : ''} exibido{logs.length !== 1 ? 's' : ''}
        </div>
      </DialogContent>
    </Dialog>
  );
}