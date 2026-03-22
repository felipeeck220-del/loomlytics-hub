import { useState, useMemo, useCallback } from 'react';
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
  Loader2, Package, Users
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard icon={Package} label="Rolos" value={formatNumber(totals.totalRolls)} color="border-l-amber-500" />
        <KpiCard icon={Scale} label="Peso Total" value={formatWeight(totals.totalWeight)} color="border-l-orange-500" />
        <KpiCard icon={DollarSign} label="Receita (Repasse)" value={formatCurrency(totals.totalRevenue)} color="border-l-emerald-500" />
        <KpiCard icon={DollarSign} label="Custo (Artigo)" value={formatCurrency(totals.totalCost)} color="border-l-red-500" />
        <KpiCard icon={TrendingUp} label="Lucro" value={formatCurrency(totals.totalProfit)} color="border-l-primary" />
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
        <p className="text-lg font-bold text-foreground">{value}</p>
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
  const [form, setForm] = useState({
    outsource_company_id: '', article_id: '', date: format(new Date(), 'yyyy-MM-dd'),
    weight_kg: '', rolls: '', outsource_value_per_kg: '', observations: '',
  });

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
                <Select value={form.article_id} onValueChange={v => setForm(f => ({ ...f, article_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um artigo" /></SelectTrigger>
                  <SelectContent>
                    {articles.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} — {a.client_name || 'Sem cliente'} ({formatCurrency(Number(a.value_per_kg))}/kg)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      <p className="text-muted-foreground text-xs">Custo Artigo</p>
                      <p className="font-semibold text-foreground">{formatCurrency(clientValuePerKg)}/kg</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Valor Cobrado (Repasse)</p>
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
                      <p className="text-muted-foreground text-xs">Receita (Repasse)</p>
                      <p className="font-bold text-foreground">{formatCurrency(totalRevenue)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Custo (Artigo)</p>
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
