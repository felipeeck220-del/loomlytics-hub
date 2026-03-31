import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatWeight, formatNumber } from '@/lib/formatters';
import {
  Plus, Trash2, Edit, Factory, Building2, DollarSign, Scale, TrendingUp,
  Loader2, Package, Users, FileBarChart, CalendarIcon, Filter, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const sb = (table: string) => (supabase.from as any)(table);

interface OutsourceCompany {
  id: string;
  company_id: string;
  name: string;
  contact?: string;
  observations?: string;
  created_at: string;
}

interface OutsourceProduction {
  id: string;
  company_id: string;
  outsource_company_id: string;
  article_id: string;
  article_name?: string;
  outsource_company_name?: string;
  client_name?: string;
  date: string;
  weight_kg: number;
  rolls: number;
  client_value_per_kg: number;
  outsource_value_per_kg: number;
  profit_per_kg: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  observations?: string;
  created_at: string;
}

export default function Outsource() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();

  // Fetch outsource companies
  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ['outsource_companies', companyId],
    queryFn: async () => {
      const { data, error } = await sb('outsource_companies')
        .select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return data as OutsourceCompany[];
    },
    enabled: !!companyId,
  });

  // Fetch outsource productions
  const { data: productions = [], isLoading: loadingProductions } = useQuery({
    queryKey: ['outsource_productions', companyId],
    queryFn: async () => {
      const { data, error } = await sb('outsource_productions')
        .select('*').eq('company_id', companyId).order('date', { ascending: false });
      if (error) throw error;
      return (data as OutsourceProduction[]).map(p => ({
        ...p,
        weight_kg: Number(p.weight_kg),
        rolls: Number(p.rolls),
        client_value_per_kg: Number(p.client_value_per_kg),
        outsource_value_per_kg: Number(p.outsource_value_per_kg),
        profit_per_kg: Number(p.profit_per_kg),
        total_revenue: Number(p.total_revenue),
        total_cost: Number(p.total_cost),
        total_profit: Number(p.total_profit),
      }));
    },
    enabled: !!companyId,
  });

  // Fetch articles for selection
  const { data: articles = [] } = useQuery({
    queryKey: ['articles', companyId],
    queryFn: async () => {
      const { data, error } = await sb('articles')
        .select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!companyId,
  });

  // KPIs
  const totals = useMemo(() => {
    const totalRevenue = productions.reduce((s, p) => s + p.total_revenue, 0);
    const totalCost = productions.reduce((s, p) => s + p.total_cost, 0);
    const totalProfit = productions.reduce((s, p) => s + p.total_profit, 0);
    const totalWeight = productions.reduce((s, p) => s + p.weight_kg, 0);
    const totalRolls = productions.reduce((s, p) => s + p.rolls, 0);
    return { totalRevenue, totalCost, totalProfit, totalWeight, totalRolls };
  }, [productions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Building2 className="h-7 w-7 text-primary" />
          Terceirizado
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie malharias terceirizadas e acompanhe o lucro sobre os repasses
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <KpiCard icon={Package} label="Rolos" value={formatNumber(totals.totalRolls)} color="border-l-amber-500" />
        <KpiCard icon={Scale} label="Peso Total" value={formatWeight(totals.totalWeight)} color="border-l-orange-500" />
        <KpiCard icon={DollarSign} label="Receita (Cliente)" value={formatCurrency(totals.totalRevenue)} color="border-l-emerald-500" />
        <KpiCard icon={DollarSign} label="Custo (Repasse)" value={formatCurrency(totals.totalCost)} color="border-l-red-500" />
        <KpiCard icon={TrendingUp} label="Lucro" value={formatCurrency(totals.totalProfit)} color={totals.totalProfit >= 0 ? "border-l-primary" : "border-l-destructive"} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="productions" className="space-y-4">
         <TabsList>
           <TabsTrigger value="productions" className="gap-1.5">
             <Package className="h-4 w-4" /> Produções
           </TabsTrigger>
           <TabsTrigger value="companies" className="gap-1.5">
             <Factory className="h-4 w-4" /> Malharias
           </TabsTrigger>
           <TabsTrigger value="reports" className="gap-1.5">
             <FileBarChart className="h-4 w-4" /> Relatórios
           </TabsTrigger>
         </TabsList>

         <TabsContent value="productions">
           <ProductionsTab
             productions={productions}
             companies={companies}
             articles={articles}
             companyId={companyId}
             loading={loadingProductions}
           />
         </TabsContent>

         <TabsContent value="companies">
           <CompaniesTab
             companies={companies}
             companyId={companyId}
             loading={loadingCompanies}
           />
         </TabsContent>

         <TabsContent value="reports">
           <ReportsTab productions={productions} loading={loadingProductions} />
         </TabsContent>
       </Tabs>
     </div>
   );
 }

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <Card className={`border-l-4 ${color}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="text-lg font-bold text-foreground truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Companies Tab ───────────────────────────────────────────
function CompaniesTab({ companies, companyId, loading }: {
  companies: OutsourceCompany[];
  companyId: string;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', contact: '', observations: '' });

  const resetForm = () => { setForm({ name: '', contact: '', observations: '' }); setEditId(null); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editId) {
        const { error } = await sb('outsource_companies').update({
          name: form.name, contact: form.contact || null, observations: form.observations || null,
        }).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await sb('outsource_companies').insert({
          company_id: companyId, name: form.name,
          contact: form.contact || null, observations: form.observations || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource_companies'] });
      toast({ title: editId ? 'Malharia atualizada!' : 'Malharia cadastrada!' });
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('outsource_companies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource_companies'] });
      toast({ title: 'Malharia removida!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const openEdit = (c: OutsourceCompany) => {
    setEditId(c.id);
    setForm({ name: c.name, contact: c.contact || '', observations: c.observations || '' });
    setOpen(true);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Malharias Terceirizadas</CardTitle>
          <CardDescription>Empresas que tecem para você</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Nova Malharia</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Malharia' : 'Nova Malharia'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Malharia São José" />
              </div>
              <div className="space-y-2">
                <Label>Contato</Label>
                <Input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Telefone ou email" />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editId ? 'Salvar' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma malharia cadastrada ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.contact || '—'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{c.observations || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm('Remover malharia?')) deleteMutation.mutate(c.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Productions Tab ─────────────────────────────────────────
function ProductionsTab({ productions, companies, articles, companyId, loading }: {
  productions: OutsourceProduction[];
  companies: OutsourceCompany[];
  articles: any[];
  companyId: string;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [articleSearch, setArticleSearch] = useState('');
  const [articleDropdownOpen, setArticleDropdownOpen] = useState(false);
  const articleSearchRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    outsource_company_id: '', article_id: '', date: format(new Date(), 'yyyy-MM-dd'),
    weight_kg: '', rolls: '', outsource_value_per_kg: '', observations: '',
  });

  const filteredArticles = useMemo(() => {
    if (!articleSearch.trim()) return articles;
    const search = articleSearch.toLowerCase();
    return articles.filter(a =>
      a.name?.toLowerCase().includes(search) ||
      a.client_name?.toLowerCase().includes(search)
    );
  }, [articles, articleSearch]);

  const resetForm = () => {
    setForm({
      outsource_company_id: '', article_id: '', date: format(new Date(), 'yyyy-MM-dd'),
      weight_kg: '', rolls: '', outsource_value_per_kg: '', observations: '',
    });
    setEditId(null);
  };

  const selectedArticle = articles.find(a => a.id === form.article_id);
  const clientValuePerKg = selectedArticle ? Number(selectedArticle.value_per_kg) : 0;
  const outsourceValuePerKg = Number(form.outsource_value_per_kg) || 0;
  const weightKg = Number(form.weight_kg) || 0;
  const profitPerKg = clientValuePerKg - outsourceValuePerKg;
  const totalRevenue = weightKg * clientValuePerKg;
  const totalCost = weightKg * outsourceValuePerKg;
  const totalProfit = weightKg * profitPerKg;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedCompany = companies.find(c => c.id === form.outsource_company_id);
      const row = {
        company_id: companyId,
        outsource_company_id: form.outsource_company_id,
        article_id: form.article_id,
        article_name: selectedArticle?.name || '',
        outsource_company_name: selectedCompany?.name || '',
        client_name: selectedArticle?.client_name || '',
        date: form.date,
        weight_kg: weightKg,
        rolls: Number(form.rolls) || 0,
        client_value_per_kg: clientValuePerKg,
        outsource_value_per_kg: outsourceValuePerKg,
        profit_per_kg: profitPerKg,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        observations: form.observations || null,
      };
      if (editId) {
        const { error } = await sb('outsource_productions').update(row).eq('id', editId);
        if (error) throw error;
      } else {
        const { error } = await sb('outsource_productions').insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource_productions'] });
      toast({ title: editId ? 'Registro atualizado!' : 'Produção registrada!' });
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('outsource_productions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource_productions'] });
      toast({ title: 'Registro removido!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const openEdit = (p: OutsourceProduction) => {
    setEditId(p.id);
    setForm({
      outsource_company_id: p.outsource_company_id,
      article_id: p.article_id,
      date: p.date,
      weight_kg: String(p.weight_kg),
      rolls: String(p.rolls),
      outsource_value_per_kg: String(p.outsource_value_per_kg),
      observations: p.observations || '',
    });
    setOpen(true);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Produções Terceirizadas</CardTitle>
          <CardDescription>Registros de produção com repasse</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" disabled={companies.length === 0}>
              <Plus className="h-4 w-4" /> Nova Produção
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Produção' : 'Registrar Produção Terceirizada'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Malharia *</Label>
                  <Select value={form.outsource_company_id} onValueChange={v => setForm(f => ({ ...f, outsource_company_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Artigo *</Label>
                <div className="relative">
                  <Input
                    ref={articleSearchRef}
                    placeholder="Pesquisar artigo..."
                    value={articleDropdownOpen ? articleSearch : (articles.find(a => a.id === form.article_id)?.name ? `${articles.find(a => a.id === form.article_id)?.name} — ${articles.find(a => a.id === form.article_id)?.client_name || 'Sem cliente'}` : '')}
                    onChange={e => { setArticleSearch(e.target.value); setArticleDropdownOpen(true); }}
                    onFocus={() => { setArticleDropdownOpen(true); setArticleSearch(''); }}
                    className="w-full"
                  />
                  {articleDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {filteredArticles.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum artigo encontrado</p>
                      ) : (
                        filteredArticles.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${form.article_id === a.id ? 'bg-accent text-accent-foreground' : ''}`}
                            onClick={() => {
                              setForm(f => ({ ...f, article_id: a.id }));
                              setArticleDropdownOpen(false);
                              setArticleSearch('');
                            }}
                          >
                            {a.name} — {a.client_name || 'Sem cliente'} ({formatCurrency(Number(a.value_per_kg))}/kg)
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Peso (kg) *</Label>
                  <Input type="number" step="0.01" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Rolos</Label>
                  <Input type="number" value={form.rolls} onChange={e => setForm(f => ({ ...f, rolls: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Valor Repasse (R$/kg) *</Label>
                  <Input type="number" step="0.01" value={form.outsource_value_per_kg} onChange={e => setForm(f => ({ ...f, outsource_value_per_kg: e.target.value }))} />
                </div>
              </div>

              {/* Preview calculations */}
              {form.article_id && form.weight_kg && form.outsource_value_per_kg && (
                <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do Cálculo</p>
                  <Separator />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Valor Cliente (o que ele paga)</p>
                      <p className="font-semibold text-foreground">{formatCurrency(clientValuePerKg)}/kg</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Valor Repasse (o que você paga)</p>
                      <p className="font-semibold text-foreground">{formatCurrency(outsourceValuePerKg)}/kg</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Lucro/kg</p>
                      <p className={`font-semibold ${profitPerKg >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {formatCurrency(profitPerKg)}/kg
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Receita (Cliente)</p>
                      <p className="font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Custo (Repasse)</p>
                      <p className="font-bold text-foreground">{formatCurrency(totalCost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Lucro Total</p>
                      <p className={`font-bold ${totalProfit >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {formatCurrency(totalProfit)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!form.outsource_company_id || !form.article_id || !form.weight_kg || !form.outsource_value_per_kg || saveMutation.isPending}
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editId ? 'Salvar' : 'Registrar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Cadastre uma malharia primeiro na aba "Malharias".</p>
        ) : productions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma produção terceirizada registrada.</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Malharia</TableHead>
                  <TableHead>Artigo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Peso (kg)</TableHead>
                  <TableHead className="text-right">Rolos</TableHead>
                  <TableHead className="text-right">R$/kg Cliente</TableHead>
                  <TableHead className="text-right">R$/kg Repasse</TableHead>
                  <TableHead className="text-right">Lucro/kg</TableHead>
                  <TableHead className="text-right">Lucro Total</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productions.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.date}</TableCell>
                    <TableCell className="font-medium">{p.outsource_company_name || '—'}</TableCell>
                    <TableCell>{p.article_name || '—'}</TableCell>
                    <TableCell>{p.client_name || '—'}</TableCell>
                    <TableCell className="text-right">{formatWeight(p.weight_kg)}</TableCell>
                    <TableCell className="text-right">{p.rolls}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.client_value_per_kg)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.outsource_value_per_kg)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.profit_per_kg >= 0 ? 'default' : 'destructive'} className={p.profit_per_kg >= 0 ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>
                        {formatCurrency(p.profit_per_kg)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      <span className={p.total_profit >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                        {formatCurrency(p.total_profit)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Remover registro?')) deleteMutation.mutate(p.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Reports Tab ─────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-use-before-define
function ReportsTab({ productions, loading }: {
  productions: OutsourceProduction[];
  loading: boolean;
}) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [profitFilter, setProfitFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const filtered = useMemo(() => {
    let result = [...productions];
    if (startDate) {
      const start = format(startDate, 'yyyy-MM-dd');
      result = result.filter(p => p.date >= start);
    }
    if (endDate) {
      const end = format(endDate, 'yyyy-MM-dd');
      result = result.filter(p => p.date <= end);
    }
    if (profitFilter === 'profit') result = result.filter(p => p.total_profit > 0);
    else if (profitFilter === 'loss') result = result.filter(p => p.total_profit < 0);
    return result;
  }, [productions, startDate, endDate, profitFilter]);

  const totals = useMemo(() => ({
    revenue: filtered.reduce((s, p) => s + p.total_revenue, 0),
    cost: filtered.reduce((s, p) => s + p.total_cost, 0),
    profit: filtered.reduce((s, p) => s + p.total_profit, 0),
    weight: filtered.reduce((s, p) => s + p.weight_kg, 0),
    rolls: filtered.reduce((s, p) => s + p.rolls, 0),
  }), [filtered]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><FileBarChart className="h-5 w-5" /> Relatório de Terceirizados</CardTitle>
        <CardDescription>Filtre por período e tipo de resultado</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Período</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                    {startDate ? format(startDate, 'dd/MM/yy') : 'Início'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartOpen(false); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">até</span>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                    {endDate ? format(endDate, 'dd/MM/yy') : 'Fim'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Resultado</Label>
              <Select value={profitFilter} onValueChange={(v: any) => setProfitFilter(v)}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="profit">Com Lucro</SelectItem>
                  <SelectItem value="loss">Com Prejuízo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(startDate || endDate || profitFilter !== 'all') && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setStartDate(undefined); setEndDate(undefined); setProfitFilter('all'); }}>
                ✕ Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Export PDF */}
        <div className="flex justify-end">
          <Button onClick={() => exportOutsourcePdf(filtered, totals)} className="btn-gradient" disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar PDF
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Registros</p>
            <p className="text-lg font-bold text-foreground">{filtered.length}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Peso Total</p>
            <p className="text-lg font-bold text-foreground">{formatWeight(totals.weight)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Receita</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totals.revenue)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Custo</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totals.cost)}</p>
          </div>
          <div className={cn("rounded-lg border p-3", totals.profit >= 0 ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : "border-destructive/30 bg-destructive/5")}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Lucro</p>
            <p className={cn("text-lg font-bold", totals.profit >= 0 ? "text-emerald-600" : "text-destructive")}>{formatCurrency(totals.profit)}</p>
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum registro encontrado para os filtros selecionados.</p>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Malharia</TableHead>
                  <TableHead>Artigo</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Peso (kg)</TableHead>
                  <TableHead className="text-right">Rolos</TableHead>
                  <TableHead className="text-right">R$/kg Cliente</TableHead>
                  <TableHead className="text-right">R$/kg Repasse</TableHead>
                  <TableHead className="text-right">Lucro/kg</TableHead>
                  <TableHead className="text-right">Lucro Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.date}</TableCell>
                    <TableCell className="font-medium">{p.outsource_company_name || '—'}</TableCell>
                    <TableCell>{p.article_name || '—'}</TableCell>
                    <TableCell>{p.client_name || '—'}</TableCell>
                    <TableCell className="text-right">{formatWeight(p.weight_kg)}</TableCell>
                    <TableCell className="text-right">{p.rolls}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.client_value_per_kg)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.outsource_value_per_kg)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.profit_per_kg >= 0 ? 'default' : 'destructive'} className={p.profit_per_kg >= 0 ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}>
                        {formatCurrency(p.profit_per_kg)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      <span className={p.total_profit >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                        {formatCurrency(p.total_profit)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function exportOutsourcePdf(
  data: OutsourceProduction[],
  totals: { revenue: number; cost: number; profit: number; weight: number; rolls: number },
) {
  const fmtN = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtR = (v: number) => `R$ ${fmtN(v, 2)}`;
  const date = new Date().toLocaleDateString('pt-BR');

  const rows = data.map(p => `
    <tr>
      <td>${p.date}</td>
      <td>${p.outsource_company_name || '—'}</td>
      <td>${p.article_name || '—'}</td>
      <td>${p.client_name || '—'}</td>
      <td class="right">${fmtN(p.weight_kg, 1)} kg</td>
      <td class="right">${p.rolls}</td>
      <td class="right">${fmtR(p.client_value_per_kg)}</td>
      <td class="right">${fmtR(p.outsource_value_per_kg)}</td>
      <td class="right ${p.profit_per_kg >= 0 ? 'profit' : 'loss'}">${fmtR(p.profit_per_kg)}</td>
      <td class="right bold ${p.total_profit >= 0 ? 'profit' : 'loss'}">${fmtR(p.total_profit)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title> </title>
  <style>
    @page { margin: 12mm 15mm; size: A4 landscape; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; }
    .header { background: linear-gradient(135deg, #1e3a5f, #2563eb); color: #fff; padding: 18px 24px; margin-bottom: 16px; }
    .header h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .header .meta { font-size: 11px; opacity: 0.85; }
    .kpis { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
    .kpi { flex: 1; min-width: 120px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; }
    .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 18px; font-weight: 700; margin-top: 2px; }
    .profit { color: #16a34a; }
    .loss { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) td { background: #fafbfc; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .total-row td { background: #e2e8f0 !important; font-weight: 700; border-top: 2px solid #94a3b8; }
    .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #94a3b8; text-align: center; }
  </style></head><body>
    <div class="header">
      <h1>Relatório de Terceirizados</h1>
      <div class="meta">Gerado em: ${date} · ${data.length} registros</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Rolos</div><div class="kpi-value">${fmtN(totals.rolls)}</div></div>
      <div class="kpi"><div class="kpi-label">Peso Total</div><div class="kpi-value">${fmtN(totals.weight, 1)} kg</div></div>
      <div class="kpi"><div class="kpi-label">Receita</div><div class="kpi-value">${fmtR(totals.revenue)}</div></div>
      <div class="kpi"><div class="kpi-label">Custo</div><div class="kpi-value">${fmtR(totals.cost)}</div></div>
      <div class="kpi"><div class="kpi-label">Lucro</div><div class="kpi-value ${totals.profit >= 0 ? 'profit' : 'loss'}">${fmtR(totals.profit)}</div></div>
    </div>
    <table>
      <thead><tr>
        <th>Data</th><th>Malharia</th><th>Artigo</th><th>Cliente</th>
        <th class="right">Peso</th><th class="right">Rolos</th>
        <th class="right">R$/kg Cliente</th><th class="right">R$/kg Repasse</th>
        <th class="right">Lucro/kg</th><th class="right">Lucro Total</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="4">TOTAL</td>
          <td class="right">${fmtN(totals.weight, 1)} kg</td>
          <td class="right">${fmtN(totals.rolls)}</td>
          <td colspan="2"></td>
          <td></td>
          <td class="right ${totals.profit >= 0 ? 'profit' : 'loss'}">${fmtR(totals.profit)}</td>
        </tr>
      </tbody>
    </table>
    <div class="footer">Relatório gerado automaticamente pelo sistema MalhaGest · ${date}</div>
  </body></html>`;

  // Direct PDF download
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
  if (bodyMatch) {
    const wrapper = document.createElement('div');
    if (styleMatch) {
      const styleEl = document.createElement('style');
      styleEl.textContent = styleMatch[1];
      wrapper.appendChild(styleEl);
    }
    wrapper.innerHTML += bodyMatch[1];
    document.body.appendChild(wrapper);
    wrapper.style.position = 'absolute';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = '210mm';
    wrapper.style.background = '#fff';
    wrapper.style.zIndex = '-9999';
    wrapper.style.overflow = 'hidden';
    wrapper.style.height = 'auto';

    const fileName = `relatorio_terceirizados_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;

    import('html2pdf.js').then(({ default: html2pdf }) => {
      html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(wrapper).save().then(() => {
        document.body.removeChild(wrapper);
      });
    });
  }
}
