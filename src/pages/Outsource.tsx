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
import { formatCurrency, formatWeight, formatNumber, getDateLimits, isDateValid } from '@/lib/formatters';
import {
  Plus, Trash2, Edit, Factory, Building2, DollarSign, Scale, TrendingUp,
  Loader2, Package, Users, FileBarChart, CalendarIcon, Filter, Download, Search
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, getFriendlyErrorMessage } from '@/lib/utils';

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
  nf_rom?: string;
  created_at: string;
}

export default function Outsource() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  // Fetch company name and logo
  useEffect(() => {
    if (!companyId) return;
    sb('companies').select('name, logo_url').eq('id', companyId).single().then(({ data }: any) => {
      if (data?.name) setCompanyName(data.name);
      if (data?.logo_url) setCompanyLogoUrl(data.logo_url);
    });
  }, [companyId]);

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

  // Lifted filter state so KPIs reflect filtered data
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<Date | undefined>(undefined);
  const [filterTo, setFilterTo] = useState<Date | undefined>(undefined);

  const displayProductions = useMemo(() => {
    let result = productions;
    if (filterMonth) {
      result = result.filter(p => p.date.startsWith(filterMonth));
    }
    if (filterFrom) {
      const from = format(filterFrom, 'yyyy-MM-dd');
      result = result.filter(p => p.date >= from);
    }
    if (filterTo) {
      const to = format(filterTo, 'yyyy-MM-dd');
      result = result.filter(p => p.date <= to);
    }
    return result;
  }, [productions, filterMonth, filterFrom, filterTo]);

  // KPIs based on filtered productions
  const totals = useMemo(() => {
    const totalRevenue = displayProductions.reduce((s, p) => s + p.total_revenue, 0);
    const totalCost = displayProductions.reduce((s, p) => s + p.total_cost, 0);
    const totalProfit = displayProductions.reduce((s, p) => s + p.total_profit, 0);
    const totalWeight = displayProductions.reduce((s, p) => s + p.weight_kg, 0);
    const totalRolls = displayProductions.reduce((s, p) => s + p.rolls, 0);
    const totalLoss = displayProductions.filter(p => p.total_profit < 0).reduce((s, p) => s + p.total_profit, 0);
    return { totalRevenue, totalCost, totalProfit, totalWeight, totalRolls, totalLoss };
  }, [displayProductions]);

  const firstName = companyName.split(' ')[0] || 'Empresa';

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
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
        <KpiCard icon={Package} label="Rolos" value={formatNumber(totals.totalRolls)} color="border-l-amber-500" />
        <KpiCard icon={Scale} label="Peso Total" value={formatWeight(totals.totalWeight)} color="border-l-orange-500" />
        <KpiCard icon={DollarSign} label={`Receita (${firstName})`} value={formatCurrency(totals.totalRevenue)} color="border-l-emerald-500" />
        <KpiCard icon={DollarSign} label="Custo (Repasse)" value={formatCurrency(totals.totalCost)} color="border-l-red-500" />
        <KpiCard icon={TrendingUp} label={`Lucro (${firstName})`} value={formatCurrency(totals.totalProfit)} color={totals.totalProfit >= 0 ? "border-l-primary" : "border-l-destructive"} />
        <KpiCard icon={TrendingUp} label="Prejuízos" value={formatCurrency(totals.totalLoss)} color="border-l-destructive" />
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
             filterMonth={filterMonth}
             setFilterMonth={setFilterMonth}
             filterFrom={filterFrom}
             setFilterFrom={setFilterFrom}
             filterTo={filterTo}
             setFilterTo={setFilterTo}
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
           <ReportsTab productions={productions} companies={companies} loading={loadingProductions} companyName={companyName} companyLogoUrl={companyLogoUrl} />
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
  const [searchQuery, setSearchQuery] = useState('');

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
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
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
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const openEdit = (c: OutsourceCompany) => {
    setEditId(c.id);
    setForm({ name: c.name, contact: c.contact || '', observations: c.observations || '' });
    setOpen(true);
  };

  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q) || c.contact?.toLowerCase().includes(q));
  }, [companies, searchQuery]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-lg">Malharias Terceirizadas</CardTitle>
          <CardDescription>Empresas que tecem para você</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar malharia..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9 w-48" />
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
        </div>
      </CardHeader>
      <CardContent>
        {companies.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma malharia cadastrada ainda.</p>
        ) : filteredCompanies.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma malharia encontrada.</p>
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
              {filteredCompanies.map(c => (
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
function ProductionsTab({ productions, companies, articles, companyId, loading, filterMonth, setFilterMonth, filterFrom, setFilterFrom, filterTo, setFilterTo }: {
  productions: OutsourceProduction[];
  companies: OutsourceCompany[];
  articles: any[];
  companyId: string;
  loading: boolean;
  filterMonth: string;
  setFilterMonth: (v: string) => void;
  filterFrom: Date | undefined;
  setFilterFrom: (v: Date | undefined) => void;
  filterTo: Date | undefined;
  setFilterTo: (v: Date | undefined) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prodSearch, setProdSearch] = useState('');
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [articleSearch, setArticleSearch] = useState('');
  const [articleDropdownOpen, setArticleDropdownOpen] = useState(false);
   const articleSearchRef = useRef<HTMLInputElement>(null);
   const [articleHighlight, setArticleHighlight] = useState(-1);
   const weightRef = useRef<HTMLInputElement>(null);
   const nfRomRef = useRef<HTMLInputElement>(null);
   const dateTabCount = useRef(0);
   const companySelectRef = useRef<HTMLButtonElement>(null);
   const dateRef = useRef<HTMLInputElement>(null);
   const rollsRef = useRef<HTMLInputElement>(null);
   const repasseRef = useRef<HTMLInputElement>(null);
   const obsRef = useRef<HTMLTextAreaElement>(null);
  const [form, setForm] = useState({
    outsource_company_id: '', article_id: '', date: format(new Date(), 'yyyy-MM-dd'),
    weight_kg: '', rolls: '', outsource_value_per_kg: '', nf_rom: '', observations: '',
  });

  const filteredArticles = useMemo(() => {
    if (!articleSearch.trim()) return articles;
    const search = articleSearch.toLowerCase();
    return articles.filter(a =>
      a.name?.toLowerCase().includes(search) ||
      a.client_name?.toLowerCase().includes(search)
    );
  }, [articles, articleSearch]);

  const resetForm = (keepCompany = false) => {
    setForm(f => ({
      outsource_company_id: keepCompany ? f.outsource_company_id : '',
      article_id: '', date: format(new Date(), 'yyyy-MM-dd'),
      weight_kg: '', rolls: '', outsource_value_per_kg: '', nf_rom: '', observations: '',
    }));
    setEditId(null);
    setArticleSearch('');
    setArticleDropdownOpen(false);
  };

  // Brazilian number formatting helpers
  const parseBrNumber = (str: string): number => {
    if (!str) return 0;
    return Number(str.replace(/\./g, '').replace(',', '.')) || 0;
  };

  const formatBrInput = (value: string, decimals: number): string => {
    // Remove non-numeric except comma
    let raw = value.replace(/[^\d,]/g, '');
    const parts = raw.split(',');
    let intPart = parts[0] || '';
    let decPart = parts.length > 1 ? parts[1].slice(0, decimals) : undefined;
    // Add thousand separators
    intPart = intPart.replace(/^0+(?=\d)/, '');
    if (!intPart) intPart = '0';
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decPart !== undefined ? `${intPart},${decPart}` : intPart;
  };

  // Auto-format for values always < 10: typing "120" → "1,20"
  const formatRepasseInput = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    // Pad to at least 3 digits for formatting (e.g. "1" → "001" → "0,01")
    const padded = digits.padStart(3, '0');
    // Take last 3 digits only (max 9,99)
    const last3 = padded.slice(-3);
    const intPart = last3[0] === '0' ? '0' : last3[0];
    const decPart = last3.slice(1);
    return `${intPart},${decPart}`;
  };

  const selectedArticle = articles.find(a => a.id === form.article_id);
  const clientValuePerKg = selectedArticle ? Number(selectedArticle.value_per_kg) : 0;
  const outsourceValuePerKg = parseBrNumber(form.outsource_value_per_kg);
  const weightKg = parseBrNumber(form.weight_kg);
  const profitPerKg = clientValuePerKg - outsourceValuePerKg;
  const totalRevenue = weightKg * clientValuePerKg;
  const totalCost = weightKg * outsourceValuePerKg;
  const totalProfit = weightKg * profitPerKg;

  // Helper: adjust outsource yarn stock (deduct on production, add back on delete)
  const adjustOutsourceYarnStock = async (
    outsourceCompanyId: string,
    articleId: string,
    date: string,
    deltaKg: number // positive = deduct from stock, negative = add back
  ) => {
    // Find yarn_type_id from article
    const article = articles.find(a => a.id === articleId);
    const yarnTypeId = article?.yarn_type_id;
    if (!yarnTypeId || deltaKg === 0) return; // No yarn linked, skip

    const referenceMonth = date.substring(0, 7); // "YYYY-MM"

    // Check if stock record exists for this combination
    const { data: existing } = await sb('outsource_yarn_stock')
      .select('id, quantity_kg')
      .eq('company_id', companyId)
      .eq('outsource_company_id', outsourceCompanyId)
      .eq('yarn_type_id', yarnTypeId)
      .eq('reference_month', referenceMonth)
      .maybeSingle();

    if (existing) {
      const newQty = Math.max(0, Number(existing.quantity_kg) - deltaKg);
      await sb('outsource_yarn_stock')
        .update({ quantity_kg: newQty })
        .eq('id', existing.id);
    }
    // If no stock record exists, we can't deduct (no stock was registered)
  };

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
        nf_rom: form.nf_rom || null,
      };
      if (editId) {
        // Get old record to calculate delta
        const oldRecord = productions.find(p => p.id === editId);
        const oldWeight = oldRecord?.weight_kg || 0;
        const oldOutsourceCompanyId = oldRecord?.outsource_company_id || form.outsource_company_id;
        const oldArticleId = oldRecord?.article_id || form.article_id;
        const oldDate = oldRecord?.date || form.date;

        const { error } = await sb('outsource_productions').update(row).eq('id', editId);
        if (error) throw error;

        // Reverse old deduction, apply new deduction
        if (oldWeight > 0) {
          await adjustOutsourceYarnStock(oldOutsourceCompanyId, oldArticleId, oldDate, -oldWeight);
        }
        if (weightKg > 0) {
          await adjustOutsourceYarnStock(form.outsource_company_id, form.article_id, form.date, weightKg);
        }
      } else {
        const { error } = await sb('outsource_productions').insert(row);
        if (error) throw error;

        // Deduct yarn from outsource stock
        if (weightKg > 0) {
          await adjustOutsourceYarnStock(form.outsource_company_id, form.article_id, form.date, weightKg);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource_productions'] });
      queryClient.invalidateQueries({ queryKey: ['outsource_yarn_stock'] });
      toast({ title: editId ? 'Registro atualizado!' : 'Produção registrada!' });
      if (editId) {
        setOpen(false);
        resetForm();
      } else {
        // Keep modal open with same malharia, clear rest
        resetForm(true);
        // Focus date field after reset
        setTimeout(() => {
          const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]');
          dateInput?.focus();
        }, 100);
      }
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Get record before deleting to add back yarn stock
      const record = productions.find(p => p.id === id);
      
      const { error } = await sb('outsource_productions').delete().eq('id', id);
      if (error) throw error;

      // Add back yarn to outsource stock
      if (record && record.weight_kg > 0) {
        await adjustOutsourceYarnStock(
          record.outsource_company_id,
          record.article_id,
          record.date,
          -record.weight_kg // negative = add back
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outsource_productions'] });
      queryClient.invalidateQueries({ queryKey: ['outsource_yarn_stock'] });
      toast({ title: 'Registro removido!' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const formatNumberToBr = (num: number, decimals: number): string => {
    return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const openEdit = (p: OutsourceProduction) => {
    setEditId(p.id);
    setForm({
      outsource_company_id: p.outsource_company_id,
      article_id: p.article_id,
      date: p.date,
      weight_kg: formatNumberToBr(p.weight_kg, 2),
      rolls: String(p.rolls),
      outsource_value_per_kg: formatRepasseInput(String(Math.round(p.outsource_value_per_kg * 100))),
      nf_rom: p.nf_rom || '',
      observations: p.observations || '',
    });
    setOpen(true);
  };

   const handleSaveWithValidation = async () => {
     if (!form.outsource_company_id || !form.article_id || !form.weight_kg || !form.outsource_value_per_kg) return;
     if (saveMutation.isPending) return;
     if (!isDateValid(form.date)) {
       toast({ title: 'Data inválida', description: 'O ano deve estar entre os últimos 5 e próximos 5 anos.', variant: 'destructive' });
       return;
     }

     // Check NF/ROM duplicate per malharia (same outsource company)
     if (form.nf_rom && form.nf_rom.trim()) {
       const { data: existing } = await sb('outsource_productions')
         .select('id, date')
         .eq('company_id', companyId)
         .eq('outsource_company_id', form.outsource_company_id)
         .eq('nf_rom', form.nf_rom.trim())
         .limit(1);
       const selectedCompanyName = companies.find(c => c.id === form.outsource_company_id)?.name || 'malharia';
       if (existing && existing.length > 0 && existing[0].id !== editId) {
         toast({
           title: 'NF/ROM duplicada',
           description: `O número "${form.nf_rom}" já está cadastrado para ${selectedCompanyName} (data: ${existing[0].date}). Verifique antes de continuar.`,
           variant: 'destructive',
         });
         return;
       }
     }
     saveMutation.mutate();
   };

   // Available months for filter
   const availableMonths = useMemo(() => {
     const months = new Set<string>();
     productions.forEach(p => {
       if (p.date && p.date.length >= 7 && p.date >= '2020' && p.date <= '2099') {
         months.add(p.date.substring(0, 7));
       }
     });
     return Array.from(months).sort().reverse();
   }, [productions]);

   const filteredProductions = useMemo(() => {
     let result = [...productions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

     // Month filter
     if (filterMonth) {
       result = result.filter(p => p.date.startsWith(filterMonth));
     }

     // Date range filter
     if (filterFrom) {
       const from = format(filterFrom, 'yyyy-MM-dd');
       result = result.filter(p => p.date >= from);
     }
     if (filterTo) {
       const to = format(filterTo, 'yyyy-MM-dd');
       result = result.filter(p => p.date <= to);
     }

     // Text search
     if (prodSearch.trim()) {
       const q = prodSearch.toLowerCase();
       result = result.filter(p =>
         p.outsource_company_name?.toLowerCase().includes(q) ||
         p.article_name?.toLowerCase().includes(q) ||
         p.client_name?.toLowerCase().includes(q) ||
         p.nf_rom?.toLowerCase().includes(q)
       );
     }
     return result;
   }, [productions, prodSearch, filterMonth, filterFrom, filterTo]);

   const hasActiveFilters = !!filterMonth || !!filterFrom || !!filterTo;

   if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-lg">Produções Terceirizadas</CardTitle>
          <CardDescription>Registros de produção com repasse</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar malharia, artigo, NF..." value={prodSearch} onChange={e => setProdSearch(e.target.value)} className="pl-9 h-9 w-56" />
          </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" disabled={companies.length === 0}>
              <Plus className="h-4 w-4" /> Nova Produção
            </Button>
          </DialogTrigger>
          <DialogContent
            className="w-[95vw] sm:w-[90vw] sm:max-w-3xl max-h-[80vh] overflow-y-auto"
            onEscapeKeyDown={e => e.preventDefault()}
            onInteractOutside={e => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{editId ? 'Editar Produção' : 'Registrar Produção Terceirizada'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2" onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
              // Ctrl+Enter to save
              if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                handleSaveWithValidation();
                return;
              }
              // Don't hijack arrows when article dropdown is open
              if (articleDropdownOpen) return;
              if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
              // Don't hijack arrows in text inputs for cursor movement (left/right)
              const active = document.activeElement as HTMLInputElement;
              if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && active?.tagName === 'INPUT' && active?.type !== 'date') return;
              if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && active?.tagName === 'TEXTAREA') return;
              const fields: (HTMLElement | null)[] = [
                companySelectRef.current,
                dateRef.current,
                articleSearchRef.current,
                weightRef.current,
                rollsRef.current,
                repasseRef.current,
                nfRomRef.current,
                obsRef.current,
              ];
              const idx = fields.findIndex(f => f === active || f?.contains(active));
              if (idx === -1) return;
              e.preventDefault();
              const dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
              const next = Math.max(0, Math.min(idx + dir, fields.length - 1));
              fields[next]?.focus();
            }}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Malharia *</Label>
                  <Select value={form.outsource_company_id} onValueChange={v => setForm(f => ({ ...f, outsource_company_id: v }))}>
                    <SelectTrigger ref={companySelectRef}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                   <Label>Data *</Label>
                   <Input ref={dateRef} type="date" min={getDateLimits().minDate} max={getDateLimits().maxDate} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                     onFocus={() => { dateTabCount.current = 0; }}
                     onKeyDown={e => {
                       if (e.key === 'Tab' && !e.shiftKey) {
                         dateTabCount.current++;
                         // Date input has 3 segments (day/month/year), after 3rd tab go to article
                         if (dateTabCount.current >= 3) {
                           e.preventDefault();
                           dateTabCount.current = 0;
                           articleSearchRef.current?.focus();
                         }
                       }
                     }}
                   />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Artigo *</Label>
                <div className="relative">
                  <Input
                    ref={articleSearchRef}
                    placeholder="Pesquisar artigo..."
                    value={articleDropdownOpen ? articleSearch : (articles.find(a => a.id === form.article_id)?.name ? `${articles.find(a => a.id === form.article_id)?.name} — ${articles.find(a => a.id === form.article_id)?.client_name || 'Sem cliente'}` : '')}
                    onChange={e => { setArticleSearch(e.target.value); setArticleDropdownOpen(true); setArticleHighlight(0); }}
                    onFocus={() => { setArticleDropdownOpen(true); setArticleSearch(''); setArticleHighlight(0); }}
                    onBlur={(e) => {
                      // Delay to allow click on dropdown items
                      setTimeout(() => setArticleDropdownOpen(false), 200);
                    }}
                    onKeyDown={e => {
                      if (!articleDropdownOpen) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setArticleHighlight(h => {
                          const next = Math.min(h + 1, filteredArticles.length - 1);
                          document.querySelector(`[data-article-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
                          return next;
                        });
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setArticleHighlight(h => {
                          const next = Math.max(h - 1, 0);
                          document.querySelector(`[data-article-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
                          return next;
                        });
                      } else if (e.key === 'Enter' && articleHighlight >= 0 && filteredArticles[articleHighlight]) {
                        e.preventDefault();
                        const a = filteredArticles[articleHighlight];
                        setForm(f => ({ ...f, article_id: a.id }));
                        setArticleDropdownOpen(false);
                        setArticleSearch('');
                        setArticleHighlight(-1);
                        // Focus next field (weight)
                        setTimeout(() => weightRef.current?.focus(), 50);
                      } else if (e.key === 'Tab') {
                        // If dropdown is open and item highlighted, select it
                        if (articleHighlight >= 0 && filteredArticles[articleHighlight]) {
                          const a = filteredArticles[articleHighlight];
                          setForm(f => ({ ...f, article_id: a.id }));
                        }
                        setArticleDropdownOpen(false);
                        setArticleSearch('');
                        setArticleHighlight(-1);
                      } else if (e.key === 'Escape') {
                        setArticleDropdownOpen(false);
                        setArticleSearch('');
                      }
                    }}
                    className="w-full"
                  />
                  {articleDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      {filteredArticles.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum artigo encontrado</p>
                      ) : (
                        filteredArticles.map((a, idx) => (
                          <button
                            key={a.id}
                            type="button"
                            tabIndex={-1}
                            data-article-idx={idx}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground',
                              (idx === articleHighlight || form.article_id === a.id) && 'bg-accent text-accent-foreground'
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm(f => ({ ...f, article_id: a.id }));
                              setArticleDropdownOpen(false);
                              setArticleSearch('');
                              setTimeout(() => weightRef.current?.focus(), 50);
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Peso (kg) *</Label>
                  <Input ref={weightRef} type="text" inputMode="decimal" placeholder="0,00" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: formatBrInput(e.target.value, 2) }))} />
                </div>
                <div className="space-y-2">
                  <Label>Rolos</Label>
                  <Input ref={rollsRef} type="number" value={form.rolls} onChange={e => setForm(f => ({ ...f, rolls: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Valor Repasse (R$/kg) *</Label>
                  <Input ref={repasseRef} type="text" inputMode="decimal" placeholder="0,00" value={form.outsource_value_per_kg} onChange={e => setForm(f => ({ ...f, outsource_value_per_kg: formatRepasseInput(e.target.value) }))} />
                </div>
                 <div className="space-y-2">
                   <Label>NF/ROM</Label>
                   <Input
                     ref={nfRomRef}
                     placeholder="Nota fiscal ou romaneio"
                     value={form.nf_rom}
                     onChange={e => setForm(f => ({ ...f, nf_rom: e.target.value }))}
                     onKeyDown={e => {
                       if (e.key === 'Enter') {
                         e.preventDefault();
                         handleSaveWithValidation();
                       }
                     }}
                   />
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
                <Textarea ref={obsRef} value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
               <Button
                 onClick={() => handleSaveWithValidation()}
                 disabled={!form.outsource_company_id || !form.article_id || !form.weight_kg || !form.outsource_value_per_kg || saveMutation.isPending}
               >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editId ? 'Salvar' : 'Registrar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Mês</Label>
              <Select value={filterMonth || '_all'} onValueChange={v => { setFilterMonth(v === '_all' ? '' : v); setFilterFrom(undefined); setFilterTo(undefined); }}>
                <SelectTrigger className="w-[160px] h-8 text-xs capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos os meses</SelectItem>
                  {availableMonths.map(m => {
                    const [y, mo] = m.split('-');
                    const label = format(new Date(Number(y), Number(mo) - 1, 1), 'MMMM/yyyy', { locale: ptBR });
                    return <SelectItem key={m} value={m} className="capitalize">{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Período</Label>
              <div className="flex items-center gap-2">
                <Popover open={fromOpen} onOpenChange={setFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !filterFrom && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                      {filterFrom ? format(filterFrom, 'dd/MM/yy') : 'De'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterFrom} onSelect={(d) => { setFilterFrom(d); setFromOpen(false); setFilterMonth(''); }} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">até</span>
                <Popover open={toOpen} onOpenChange={setToOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !filterTo && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                      {filterTo ? format(filterTo, 'dd/MM/yy') : 'Até'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterTo} onSelect={(d) => { setFilterTo(d); setToOpen(false); setFilterMonth(''); }} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setFilterMonth(''); setFilterFrom(undefined); setFilterTo(undefined); }}>
                ✕ Limpar
              </Button>
            )}
          </div>
        </div>
        {companies.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Cadastre uma malharia primeiro na aba "Malharias".</p>
        ) : productions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma produção terceirizada registrada.</p>
        ) : filteredProductions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum resultado encontrado.</p>
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
                  <TableHead>NF/ROM</TableHead>
                  <TableHead className="w-20">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProductions.map(p => {
                  const dateStr = p.date;
                  const createdAt = new Date(p.created_at);
                  const timeStr = !isNaN(createdAt.getTime()) ? format(createdAt, 'HH:mm') : '';
                  return (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">
                      <div>{dateStr}</div>
                      {timeStr && <div className="text-xs text-muted-foreground">{timeStr}</div>}
                    </TableCell>
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
                    <TableCell className="whitespace-nowrap">{p.nf_rom || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Remover registro?')) deleteMutation.mutate(p.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
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
function ReportsTab({ productions, companies, loading, companyName, companyLogoUrl }: {
  productions: OutsourceProduction[];
  companies: OutsourceCompany[];
  loading: boolean;
  companyName?: string;
  companyLogoUrl?: string | null;
}) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [profitFilter, setProfitFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('_all');
  const [companySearch, setCompanySearch] = useState('');

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    productions.forEach(p => {
      if (p.date && p.date.length >= 7 && p.date >= '2020' && p.date <= '2099') {
        months.add(p.date.substring(0, 7));
      }
    });
    return Array.from(months).sort().reverse();
  }, [productions]);

  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies;
    const q = companySearch.toLowerCase();
    return companies.filter(c => c.name.toLowerCase().includes(q));
  }, [companies, companySearch]);

  const filtered = useMemo(() => {
    let result = [...productions];
    if (selectedCompanyId !== '_all') {
      result = result.filter(p => p.outsource_company_id === selectedCompanyId);
    }
    if (reportMonth) {
      result = result.filter(p => p.date.startsWith(reportMonth));
    }
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
  }, [productions, startDate, endDate, profitFilter, reportMonth, selectedCompanyId]);

  const totals = useMemo(() => ({
    revenue: filtered.reduce((s, p) => s + p.total_revenue, 0),
    cost: filtered.reduce((s, p) => s + p.total_cost, 0),
    profit: filtered.reduce((s, p) => s + p.total_profit, 0),
    weight: filtered.reduce((s, p) => s + p.weight_kg, 0),
    rolls: filtered.reduce((s, p) => s + p.rolls, 0),
  }), [filtered]);

  const periodLabel = useMemo(() => {
    const today = format(new Date(), 'dd/MM/yyyy');
    if (startDate && endDate) return `${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`;
    if (startDate) return `${format(startDate, 'dd/MM/yyyy')} a ${today}`;
    if (endDate) return `Até ${format(endDate, 'dd/MM/yyyy')}`;
    if (reportMonth) {
      const [y, mo] = reportMonth.split('-');
      return format(new Date(Number(y), Number(mo) - 1, 1), 'MMMM/yyyy', { locale: ptBR });
    }
    return 'Todo período';
  }, [startDate, endDate, reportMonth]);

  const hasActiveFilters = !!reportMonth || !!startDate || !!endDate || profitFilter !== 'all' || selectedCompanyId !== '_all';

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><FileBarChart className="h-5 w-5" /> Relatório de Terceirizados</CardTitle>
        <CardDescription>Filtre por período, malharia e tipo de resultado</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Mês</Label>
              <Select value={reportMonth || '_all'} onValueChange={v => { setReportMonth(v === '_all' ? '' : v); setStartDate(undefined); setEndDate(undefined); }}>
                <SelectTrigger className="w-[160px] h-8 text-xs capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos os meses</SelectItem>
                  {availableMonths.map(m => {
                    const [y, mo] = m.split('-');
                    const label = format(new Date(Number(y), Number(mo) - 1, 1), 'MMMM/yyyy', { locale: ptBR });
                    return <SelectItem key={m} value={m} className="capitalize">{label}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Período</Label>
              <div className="flex items-center gap-2">
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                      {startDate ? format(startDate, 'dd/MM/yy') : 'De'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartOpen(false); setReportMonth(''); }} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">até</span>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[120px] justify-start text-left font-normal h-8 text-xs", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3 shrink-0" />
                      {endDate ? format(endDate, 'dd/MM/yy') : 'Até'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); setReportMonth(''); }} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Malharia</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-[180px] justify-between h-8 text-xs font-normal">
                    <span className="truncate">
                      {selectedCompanyId === '_all' ? 'Todas as malharias' : companies.find(c => c.id === selectedCompanyId)?.name || 'Selecione'}
                    </span>
                    <Search className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <div className="flex items-center border-b px-2 py-1.5">
                    <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    <Input placeholder="Buscar malharia..." value={companySearch} onChange={e => setCompanySearch(e.target.value)} className="h-7 border-0 p-0 text-xs shadow-none focus-visible:ring-0" />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    <button type="button" className={cn("w-full text-left px-3 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground", selectedCompanyId === '_all' && 'bg-accent text-accent-foreground')} onClick={() => { setSelectedCompanyId('_all'); setCompanySearch(''); }}>
                      Todas as malharias
                    </button>
                    {filteredCompanies.map(c => (
                      <button key={c.id} type="button" className={cn("w-full text-left px-3 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground", selectedCompanyId === c.id && 'bg-accent text-accent-foreground')} onClick={() => { setSelectedCompanyId(c.id); setCompanySearch(''); }}>
                        {c.name}
                      </button>
                    ))}
                    {filteredCompanies.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nenhuma encontrada</p>}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
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
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setStartDate(undefined); setEndDate(undefined); setProfitFilter('all'); setReportMonth(''); setSelectedCompanyId('_all'); }}>
                ✕ Limpar
              </Button>
            )}
          </div>
        </div>

        {/* Export PDFs */}
        <div className="flex justify-end gap-2 flex-wrap">
          {selectedCompanyId === '_all' ? (
            <>
              <Button onClick={() => exportByCompanyPdf(filtered, periodLabel, companyName, companyLogoUrl)} variant="outline" disabled={filtered.length === 0}>
                <Factory className="h-4 w-4 mr-2" /> Exportar por Malharia
              </Button>
              <Button onClick={() => exportOutsourcePdf(filtered, totals, periodLabel, companyName, companyLogoUrl)} className="btn-gradient" disabled={filtered.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Exportar PDF
              </Button>
            </>
          ) : (
            <Button onClick={() => {
              const selectedName = companies.find(c => c.id === selectedCompanyId)?.name || '';
              exportByCompanyPdf(filtered, periodLabel, companyName, companyLogoUrl);
            }} className="btn-gradient" disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-2" /> Exportar PDF ({companies.find(c => c.id === selectedCompanyId)?.name})
            </Button>
          )}
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
  periodLabel: string,
  companyName?: string,
  logoUrl?: string | null,
) {
  const fmtN = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtR = (v: number) => `R$ ${fmtN(v, 2)}`;
  const date = new Date().toLocaleString('pt-BR');

  const fileName = `relatorio_terceirizados_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;

  // Load logo if available
  const loadLogo = (url: string): Promise<{ data: string; width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  const doExport = async () => {
    let logoInfo: { data: string; width: number; height: number } | null = null;
    if (logoUrl) {
      logoInfo = await loadLogo(logoUrl);
    }

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('l', 'mm', 'a4'); // landscape
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const m = 12;
    let y = m;

    const textDark: [number, number, number] = [17, 24, 39];
    const textMid: [number, number, number] = [75, 85, 99];
    const border: [number, number, number] = [229, 231, 235];

    const fitWithinBox = (width: number, height: number, maxWidth: number, maxHeight: number) => {
      if (!width || !height) return { width: maxWidth, height: maxHeight };
      const scale = Math.min(maxWidth / width, maxHeight / height);
      return {
        width: width * scale,
        height: height * scale,
      };
    };

    const headerH = 25;
    pdf.setFillColor(249, 250, 251);
    pdf.rect(m, y, pw - 2 * m, headerH, 'F');
    pdf.setDrawColor(...border);
    pdf.setLineWidth(0.5);
    pdf.rect(m, y, pw - 2 * m, headerH, 'S');

    const leftX = m + 5;
    const rightX = pw - m - 5;
    const titleMaxWidth = pw - 2 * m - 100;

    if (logoInfo) {
      try {
        const logoSize = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
        pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, logoSize.width, logoSize.height);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...textMid);
        pdf.text(date, leftX, y + 22);
      } catch {
        if (companyName) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...textDark);
          pdf.text(companyName, leftX, y + 10);
        }
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...textMid);
        pdf.text(date, leftX, y + 22);
      }
    } else {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...textDark);
      if (companyName) pdf.text(companyName, leftX, y + 10);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textMid);
      pdf.text(date, leftX, y + 22);
    }

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...textDark);
    const titleText = 'RELATÓRIO DE TERCEIRIZADOS';
    const titleLines = pdf.splitTextToSize(titleText, titleMaxWidth) as string[];
    let titleY = y + 10;
    titleLines.forEach((line) => {
      const titleW = pdf.getTextWidth(line);
      pdf.text(line, (pw - titleW) / 2, titleY);
      titleY += 6;
    });

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...textDark);
    const periodTitle = 'Período';
    pdf.text(periodTitle, rightX - pdf.getTextWidth(periodTitle), y + 10);

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...textMid);
    const periodLines = pdf.splitTextToSize(periodLabel, 42) as string[];
    periodLines.slice(0, 2).forEach((line, index) => {
      const piW = pdf.getTextWidth(line);
      pdf.text(line, rightX - piW, y + 16 + index * 5);
    });

    y += headerH + 10;

    // KPIs
    const kpis = [
      { label: 'Rolos', value: fmtN(totals.rolls) },
      { label: 'Peso Total', value: `${fmtN(totals.weight, 1)} kg` },
      { label: 'Receita', value: fmtR(totals.revenue) },
      { label: 'Custo', value: fmtR(totals.cost) },
      { label: 'Lucro', value: fmtR(totals.profit) },
    ];
    const kpiW = (pw - 2 * m - 4 * 4) / 5;
    kpis.forEach((kpi, i) => {
      const x = m + i * (kpiW + 4);
      pdf.setDrawColor(...border);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(x, y, kpiW, 16, 2, 2, 'S');
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textMid);
      pdf.text(kpi.label.toUpperCase(), x + 4, y + 6);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...textDark);
      pdf.text(kpi.value, x + 4, y + 13);
    });
    y += 22;

    // Table
    const headers = ['Data', 'Malharia', 'Artigo', 'Cliente', 'Peso', 'Rolos', 'R$/kg Cli', 'R$/kg Rep', 'Lucro/kg', 'Lucro Total'];
    const colWidths = [22, 35, 30, 30, 22, 16, 22, 22, 22, 28];
    const totalW = colWidths.reduce((a, b) => a + b, 0);
    const scale = (pw - 2 * m) / totalW;
    const cols = colWidths.map(w => w * scale);
    const rowH = 7;

    const drawHeader = () => {
      if (y + rowH * 2 > ph - m) {
        pdf.addPage();
        y = m;
      }
      pdf.setFillColor(241, 245, 249);
      pdf.rect(m, y, pw - 2 * m, 8, 'F');
      pdf.setDrawColor(...border);
      pdf.rect(m, y, pw - 2 * m, 8);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(71, 85, 105);
      let x = m;
      headers.forEach((h, i) => {
        pdf.text(h, x + 2, y + 5.5);
        x += cols[i];
      });
      y += 8;
    };

    drawHeader();

    // Data rows
    data.forEach((p, ri) => {
      if (y + rowH > ph - m) {
        pdf.addPage();
        y = m;
        drawHeader();
      }

      if (ri % 2 === 1) {
        pdf.setFillColor(250, 251, 252);
        pdf.rect(m, y, pw - 2 * m, rowH, 'F');
      }
      pdf.setDrawColor(241, 245, 249);
      pdf.setLineWidth(0.1);
      pdf.rect(m, y, pw - 2 * m, rowH);

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textDark);

      const cells = [
        p.date, p.outsource_company_name || '—', p.article_name || '—', p.client_name || '—',
        `${fmtN(p.weight_kg, 1)} kg`, String(p.rolls),
        fmtR(p.client_value_per_kg), fmtR(p.outsource_value_per_kg),
        fmtR(p.profit_per_kg), fmtR(p.total_profit),
      ];

      let x = m;
      cells.forEach((cell, ci) => {
        const text = cell.length > 18 ? cell.substring(0, 17) + '…' : cell;
        pdf.text(text, x + 2, y + 5);
        x += cols[ci];
      });
      y += rowH;
    });

    // Total row
    if (y + rowH > ph - m) {
      pdf.addPage();
      y = m;
    }
    pdf.setFillColor(226, 232, 240);
    pdf.rect(m, y, pw - 2 * m, rowH, 'F');
    pdf.setDrawColor(148, 163, 184);
    pdf.setLineWidth(0.5);
    pdf.line(m, y, pw - m, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...textDark);
    pdf.text('TOTAL', m + 2, y + 5);
    let x = m + cols[0] + cols[1] + cols[2] + cols[3];
    pdf.text(`${fmtN(totals.weight, 1)} kg`, x + 2, y + 5); x += cols[4];
    pdf.text(String(totals.rolls), x + 2, y + 5); x += cols[5] + cols[6] + cols[7] + cols[8];
    pdf.text(fmtR(totals.profit), x + 2, y + 5);
    y += rowH + 8;

    // Footer
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    const footer = `Relatório gerado automaticamente pelo sistema MalhaGest · ${date}`;
    const fw = pdf.getTextWidth(footer);
    pdf.text(footer, (pw - fw) / 2, y);

    pdf.save(fileName);
  };

  doExport();
}

function exportByCompanyPdf(
  data: OutsourceProduction[],
  periodLabel: string,
  companyName?: string,
  logoUrl?: string | null,
) {
  const fmtN = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtR = (v: number) => `R$ ${fmtN(v, 2)}`;
  const date = new Date().toLocaleString('pt-BR');
  const fileName = `relatorio_por_malharia_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;

  // Group by outsource company
  const grouped = new Map<string, OutsourceProduction[]>();
  data.forEach(p => {
    const key = p.outsource_company_name || 'Sem nome';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  });

  const loadLogo = (url: string): Promise<{ data: string; width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  const doExport = async () => {
    let logoInfo: { data: string; width: number; height: number } | null = null;
    if (logoUrl) logoInfo = await loadLogo(logoUrl);

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const m = 12;
    let y = m;

    const textDark: [number, number, number] = [17, 24, 39];
    const textMid: [number, number, number] = [75, 85, 99];
    const border: [number, number, number] = [229, 231, 235];

    const fitWithinBox = (width: number, height: number, maxWidth: number, maxHeight: number) => {
      if (!width || !height) return { width: maxWidth, height: maxHeight };
      const scale = Math.min(maxWidth / width, maxHeight / height);
      return { width: width * scale, height: height * scale };
    };

    // Header
    const headerH = 25;
    pdf.setFillColor(249, 250, 251);
    pdf.rect(m, y, pw - 2 * m, headerH, 'F');
    pdf.setDrawColor(...border);
    pdf.setLineWidth(0.5);
    pdf.rect(m, y, pw - 2 * m, headerH, 'S');

    const leftX = m + 5;
    const rightX = pw - m - 5;

    if (logoInfo) {
      try {
        const logoSize = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
        pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, logoSize.width, logoSize.height);
      } catch {}
    } else if (companyName) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...textDark);
      pdf.text(companyName, leftX, y + 10);
    }
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...textMid);
    pdf.text(date, leftX, y + 22);

    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...textDark);
    const titleText = 'RELATÓRIO POR MALHARIA';
    const titleW = pdf.getTextWidth(titleText);
    pdf.text(titleText, (pw - titleW) / 2, y + 10);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...textDark);
    const periodTitle = 'Período';
    pdf.text(periodTitle, rightX - pdf.getTextWidth(periodTitle), y + 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...textMid);
    const periodLines = pdf.splitTextToSize(periodLabel, 42) as string[];
    periodLines.slice(0, 2).forEach((line, index) => {
      pdf.text(line, rightX - pdf.getTextWidth(line), y + 16 + index * 5);
    });

    y += headerH + 10;

    // Grand totals
    const grandTotalWeight = data.reduce((s, p) => s + p.weight_kg, 0);
    const grandTotalProfit = data.reduce((s, p) => s + p.total_profit, 0);
    const grandTotalRevenue = data.reduce((s, p) => s + p.total_revenue, 0);
    const grandTotalCost = data.reduce((s, p) => s + p.total_cost, 0);

    const kpis = [
      { label: 'Malharias', value: String(grouped.size) },
      { label: 'Peso Total', value: `${fmtN(grandTotalWeight, 1)} kg` },
      { label: 'Receita', value: fmtR(grandTotalRevenue) },
      { label: 'Custo', value: fmtR(grandTotalCost) },
      { label: 'Lucro Total', value: fmtR(grandTotalProfit) },
    ];
    const kpiW = (pw - 2 * m - 4 * 4) / 5;
    kpis.forEach((kpi, i) => {
      const x = m + i * (kpiW + 4);
      pdf.setDrawColor(...border);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(x, y, kpiW, 16, 2, 2, 'S');
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textMid);
      pdf.text(kpi.label.toUpperCase(), x + 4, y + 6);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...textDark);
      pdf.text(kpi.value, x + 4, y + 13);
    });
    y += 22;

    // Per-company sections
    const sortedCompanies = [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    sortedCompanies.forEach(([companyLabel, prods]) => {
      // Check space for company header + at least 2 rows
      if (y + 30 > ph - m) {
        pdf.addPage();
        y = m;
      }

      // Company totals
      const cWeight = prods.reduce((s, p) => s + p.weight_kg, 0);
      const cRolls = prods.reduce((s, p) => s + p.rolls, 0);
      const cRevenue = prods.reduce((s, p) => s + p.total_revenue, 0);
      const cCost = prods.reduce((s, p) => s + p.total_cost, 0);
      const cProfit = prods.reduce((s, p) => s + p.total_profit, 0);

      // Company header bar
      pdf.setFillColor(219, 234, 254);
      pdf.rect(m, y, pw - 2 * m, 10, 'F');
      pdf.setDrawColor(147, 197, 253);
      pdf.setLineWidth(0.3);
      pdf.rect(m, y, pw - 2 * m, 10, 'S');
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 64, 175);
      pdf.text(`🏭 ${companyLabel}`, m + 4, y + 7);

      // Summary on right side of bar
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 64, 175);
      const summary = `${fmtN(cWeight, 1)} kg · ${cRolls} rolos · Lucro: ${fmtR(cProfit)}`;
      pdf.text(summary, pw - m - 4 - pdf.getTextWidth(summary), y + 7);
      y += 14;

      // Group by article within this company
      const articleMap = new Map<string, { weight: number; rolls: number; revenue: number; cost: number; profit: number; client: string }>();
      prods.forEach(p => {
        const artKey = p.article_name || 'Sem artigo';
        if (!articleMap.has(artKey)) {
          articleMap.set(artKey, { weight: 0, rolls: 0, revenue: 0, cost: 0, profit: 0, client: p.client_name || '—' });
        }
        const a = articleMap.get(artKey)!;
        a.weight += p.weight_kg;
        a.rolls += p.rolls;
        a.revenue += p.total_revenue;
        a.cost += p.total_cost;
        a.profit += p.total_profit;
      });

      // Article table header
      const headers = ['Artigo', 'Cliente', 'Kg Produzidos', 'Rolos', 'Receita', 'Custo', 'Lucro'];
      const colWidths = [40, 35, 30, 20, 35, 35, 35];
      const totalW = colWidths.reduce((a, b) => a + b, 0);
      const scale = (pw - 2 * m) / totalW;
      const cols = colWidths.map(w => w * scale);
      const rowH = 7;

      // Draw header
      if (y + rowH * 2 > ph - m) {
        pdf.addPage();
        y = m;
      }
      pdf.setFillColor(241, 245, 249);
      pdf.rect(m, y, pw - 2 * m, 8, 'F');
      pdf.setDrawColor(...border);
      pdf.rect(m, y, pw - 2 * m, 8);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(71, 85, 105);
      let x = m;
      headers.forEach((h, i) => {
        pdf.text(h, x + 2, y + 5.5);
        x += cols[i];
      });
      y += 8;

      // Article rows
      const sortedArticles = [...articleMap.entries()].sort((a, b) => b[1].profit - a[1].profit);
      sortedArticles.forEach(([artName, stats], ri) => {
        if (y + rowH > ph - m) {
          pdf.addPage();
          y = m;
        }
        if (ri % 2 === 1) {
          pdf.setFillColor(250, 251, 252);
          pdf.rect(m, y, pw - 2 * m, rowH, 'F');
        }
        pdf.setDrawColor(241, 245, 249);
        pdf.setLineWidth(0.1);
        pdf.rect(m, y, pw - 2 * m, rowH);

        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...textDark);

        const cells = [
          artName, stats.client, `${fmtN(stats.weight, 1)} kg`, String(stats.rolls),
          fmtR(stats.revenue), fmtR(stats.cost), fmtR(stats.profit),
        ];

        x = m;
        cells.forEach((cell, ci) => {
          const text = cell.length > 22 ? cell.substring(0, 21) + '…' : cell;
          if (ci === 6) {
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(stats.profit >= 0 ? 22 : 220, stats.profit >= 0 ? 163 : 38, stats.profit >= 0 ? 74 : 38);
          }
          pdf.text(text, x + 2, y + 5);
          if (ci === 6) {
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(...textDark);
          }
          x += cols[ci];
        });
        y += rowH;
      });

      // Company total row
      if (y + rowH > ph - m) {
        pdf.addPage();
        y = m;
      }
      pdf.setFillColor(226, 232, 240);
      pdf.rect(m, y, pw - 2 * m, rowH, 'F');
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.3);
      pdf.line(m, y, pw - m, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...textDark);
      pdf.text('TOTAL', m + 2, y + 5);
      x = m + cols[0] + cols[1];
      pdf.text(`${fmtN(cWeight, 1)} kg`, x + 2, y + 5); x += cols[2];
      pdf.text(String(cRolls), x + 2, y + 5); x += cols[3];
      pdf.text(fmtR(cRevenue), x + 2, y + 5); x += cols[4];
      pdf.text(fmtR(cCost), x + 2, y + 5); x += cols[5];
      pdf.setTextColor(cProfit >= 0 ? 22 : 220, cProfit >= 0 ? 163 : 38, cProfit >= 0 ? 74 : 38);
      pdf.text(fmtR(cProfit), x + 2, y + 5);
      pdf.setTextColor(...textDark);
      y += rowH + 8;
    });

    // Footer
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(148, 163, 184);
    const footer = `Relatório gerado automaticamente pelo sistema MalhaGest · ${date}`;
    const fw = pdf.getTextWidth(footer);
    if (y + 10 > ph - m) { pdf.addPage(); y = m; }
    pdf.text(footer, (pw - fw) / 2, y);

    pdf.save(fileName);
  };

  doExport();
}
