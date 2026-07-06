import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Search, Factory, ArrowRight, Loader2, History } from 'lucide-react';

const sb = (table: string) => (supabase.from as any)(table);

interface ChangeRow {
  id: string;
  machine_id: string;
  current_article_id: string | null;
  next_article_id: string | null;
  concluded_at: string | null;
  ot_number: number | null;
}

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
};

export default function ArtigosEmProducaoTab() {
  const { getMachines, getArticles, getClients, refreshData } = useSharedCompanyData() as any;
  const { user } = useAuth();
  const companyId = user?.company_id || '';

  const machines = getMachines();
  const articles = getArticles();
  const clients = getClients();

  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const articleById = useMemo(() => {
    const m: Record<string, any> = {};
    articles.forEach((a: any) => { m[a.id] = a; });
    return m;
  }, [articles]);

  const clientById = useMemo(() => {
    const m: Record<string, any> = {};
    clients.forEach((c: any) => { m[c.id] = c; });
    return m;
  }, [clients]);

  const articleLabel = (id: string | null | undefined) => {
    if (!id) return '—';
    const a = articleById[id];
    if (!a) return '—';
    const cname = a.client_name || (a.client_id ? clientById[a.client_id]?.name : '') || '';
    return cname ? `${a.name} (${cname})` : a.name;
  };

  const fetchChanges = async () => {
    if (!companyId) return;
    const { data, error } = await sb('article_change_orders')
      .select('id, machine_id, current_article_id, next_article_id, concluded_at, ot_number, status')
      .eq('company_id', companyId)
      .eq('status', 'concluida')
      .not('concluded_at', 'is', null)
      .order('concluded_at', { ascending: false })
      .limit(200);
    if (!error) setChanges((data || []) as ChangeRow[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchChanges();
    if (!companyId) return;
    const ch = supabase
      .channel('artigos-em-producao')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_change_orders', filter: `company_id=eq.${companyId}` }, () => {
        fetchChanges();
        try { refreshData?.(); } catch {}
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${companyId}` }, () => {
        try { refreshData?.(); } catch {}
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Last change per machine
  const lastChangeByMachine = useMemo(() => {
    const m: Record<string, ChangeRow> = {};
    changes.forEach(c => {
      if (!m[c.machine_id]) m[c.machine_id] = c;
    });
    return m;
  }, [changes]);

  const filteredMachines = useMemo(() => {
    const s = search.trim().toLowerCase();
    const sorted = [...machines].sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
    if (!s) return sorted;
    return sorted.filter((m: any) => {
      const art = m.article_id ? articleById[m.article_id] : null;
      const artName = art?.name?.toLowerCase() || '';
      const cliName = (art?.client_name || (art?.client_id ? clientById[art.client_id]?.name : '') || '').toLowerCase();
      return (m.name || '').toLowerCase().includes(s) || artName.includes(s) || cliName.includes(s);
    });
  }, [machines, articleById, clientById, search]);

  const filteredChanges = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return changes;
    return changes.filter(c => {
      const mach = machines.find((m: any) => m.id === c.machine_id);
      const machName = mach?.name?.toLowerCase() || '';
      const prev = articleLabel(c.current_article_id).toLowerCase();
      const next = articleLabel(c.next_article_id).toLowerCase();
      return machName.includes(s) || prev.includes(s) || next.includes(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes, machines, search, articleById, clientById]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="card-glass p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Factory className="h-4 w-4" /> Artigos em Produção
            </h2>
            <p className="text-sm text-muted-foreground">Atualização em tempo real conforme finalizações de OT</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por máquina, artigo ou cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* Machines grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMachines.map((m: any) => {
            const art = m.article_id ? articleById[m.article_id] : null;
            const last = lastChangeByMachine[m.id];
            const cliName = art?.client_name || (art?.client_id ? clientById[art.client_id]?.name : '') || '—';
            return (
              <div key={m.id} className="rounded-lg border border-border bg-background p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="font-display font-semibold text-foreground">{m.name}</p>
                  <span className="text-xs text-muted-foreground">#{m.number}</span>
                </div>
                {art ? (
                  <div className="text-sm space-y-0.5">
                    <p className="text-muted-foreground">Artigo: <span className="font-semibold text-foreground">{art.name}</span></p>
                    <p className="text-muted-foreground">Cliente: <span className="text-foreground">{cliName}</span></p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Sem artigo atual</p>
                )}
                {last && (
                  <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                    Última troca: <span className="text-foreground">{fmtDateTime(last.concluded_at)}</span>
                    {last.ot_number ? <> · OT #{String(last.ot_number).padStart(3, '0')}</> : null}
                  </div>
                )}
              </div>
            );
          })}
          {filteredMachines.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-8">Nenhuma máquina encontrada</div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="card-glass p-5 space-y-3">
        <div>
          <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
            <History className="h-4 w-4" /> Histórico de Trocas de Artigo
          </h2>
          <p className="text-sm text-muted-foreground">Registrado a cada finalização de OT ({filteredChanges.length} registros)</p>
        </div>
        {filteredChanges.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">Nenhuma troca de artigo registrada</div>
        ) : (
          <div className="space-y-2">
            {filteredChanges.map(c => {
              const mach = machines.find((m: any) => m.id === c.machine_id);
              return (
                <div key={c.id} className="rounded-lg border border-border bg-background p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="sm:w-40">
                    <p className="font-semibold text-foreground text-sm">{mach?.name || 'Máquina removida'}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(c.concluded_at)}{c.ot_number ? ` · OT #${String(c.ot_number).padStart(3, '0')}` : ''}</p>
                  </div>
                  <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                    <span className="text-muted-foreground line-through">{articleLabel(c.current_article_id)}</span>
                    <ArrowRight className="h-4 w-4 text-primary hidden sm:inline" />
                    <span className="text-foreground font-semibold">{articleLabel(c.next_article_id)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
