import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber, getDateLimits, isDateValid } from '@/lib/formatters';
import { sanitizePdfText } from '@/lib/pdfUtils';
import {
  Plus, Trash2, Edit, Loader2, Package, DollarSign, Scale, Search,
  Recycle, Download, Filter, Hash, CalendarIcon
} from 'lucide-react';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, getFriendlyErrorMessage } from '@/lib/utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const sb = (table: string) => (supabase.from as any)(table);

interface ResidueMaterial {
  id: string;
  company_id: string;
  name: string;
  unit: string;
  default_price: number;
  created_at: string;
}

interface ResidueSale {
  id: string;
  company_id: string;
  material_id: string;
  material_name: string | null;
  client_name: string;
  date: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  romaneio: string | null;
  observations: string | null;
  created_by_name: string | null;
  created_by_code: string | null;
  created_at: string;
}

export default function ResidueSales() {
  const { user } = useAuth();
  const companyId = user?.company_id || '';
  const queryClient = useQueryClient();
  const { userCode, userName } = useAuditLog();
  const [companyName, setCompanyName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [deleteMatConfirmId, setDeleteMatConfirmId] = useState<string | null>(null);
  const [deleteSaleConfirmId, setDeleteSaleConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    sb('companies').select('name, logo_url').eq('id', companyId).single().then(({ data }: any) => {
      if (data?.name) setCompanyName(data.name);
      if (data?.logo_url) setCompanyLogoUrl(data.logo_url);
    });
  }, [companyId]);

  // ===== Fetch Materials =====
  const { data: materials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ['residue_materials', companyId],
    queryFn: async () => {
      const { data, error } = await sb('residue_materials')
        .select('*').eq('company_id', companyId).order('name');
      if (error) throw error;
      return (data || []) as ResidueMaterial[];
    },
    enabled: !!companyId,
  });

  // ===== Fetch Sales =====
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['residue_sales', companyId],
    queryFn: async () => {
      const { data, error } = await sb('residue_sales')
        .select('*').eq('company_id', companyId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ResidueSale[];
    },
    enabled: !!companyId,
  });

  // ===== Material CRUD =====
  const [matDialogOpen, setMatDialogOpen] = useState(false);
  const [editingMat, setEditingMat] = useState<ResidueMaterial | null>(null);
  const [matName, setMatName] = useState('');
  const [matUnit, setMatUnit] = useState('kg');
  const [matPrice, setMatPrice] = useState('');

  const openNewMat = () => { setEditingMat(null); setMatName(''); setMatUnit('kg'); setMatPrice(''); setMatDialogOpen(true); };
  const openEditMat = (m: ResidueMaterial) => {
    setEditingMat(m); setMatName(m.name); setMatUnit(m.unit);
    setMatPrice(m.default_price.toFixed(2).replace('.', ','));
    setMatDialogOpen(true);
  };

  const saveMat = useMutation({
    mutationFn: async () => {
      const price = parseFloat(matPrice.replace(',', '.')) || 0;
      if (!matName.trim()) throw new Error('Nome obrigatório');
      if (editingMat) {
        const { error } = await sb('residue_materials').update({ name: matName.trim(), unit: matUnit, default_price: price }).eq('id', editingMat.id);
        if (error) throw error;
      } else {
        const { error } = await sb('residue_materials').insert({ company_id: companyId, name: matName.trim(), unit: matUnit, default_price: price });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_materials'] });
      setMatDialogOpen(false);
      toast({ title: editingMat ? 'Material atualizado' : 'Material cadastrado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const deleteMat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('residue_materials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_materials'] });
      toast({ title: 'Material removido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  // ===== Sale CRUD =====
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [saleClient, setSaleClient] = useState('');
  const [saleMaterialId, setSaleMaterialId] = useState('');
  const [saleQty, setSaleQty] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleRomaneio, setSaleRomaneio] = useState('');
  const [saleObs, setSaleObs] = useState('');
  const [saleDate, setSaleDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const selectedMaterial = materials.find(m => m.id === saleMaterialId);

  const openNewSale = () => {
    setSaleClient(''); setSaleMaterialId(''); setSaleQty(''); setSalePrice('');
    setSaleRomaneio(''); setSaleObs(''); setSaleDate(format(new Date(), 'yyyy-MM-dd'));
    setSaleDialogOpen(true);
  };

  // When material changes, update price and unit
  useEffect(() => {
    if (selectedMaterial) {
      setSalePrice(selectedMaterial.default_price.toFixed(2).replace('.', ','));
    }
  }, [saleMaterialId]);

  const parseBR = (v: string) => parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;

  const saleTotal = useMemo(() => {
    return parseBR(saleQty) * parseBR(salePrice);
  }, [saleQty, salePrice]);

  const saveSale = useMutation({
    mutationFn: async () => {
      if (!saleClient.trim()) throw new Error('Cliente obrigatório');
      if (!saleMaterialId) throw new Error('Selecione um material');
      if (!saleDate) throw new Error('Data obrigatória');
      if (!isDateValid(saleDate)) throw new Error('Data fora do intervalo permitido (±5 anos)');
      const qty = parseBR(saleQty);
      const price = parseBR(salePrice);
      if (qty <= 0) throw new Error('Quantidade deve ser maior que zero');
      if (price <= 0) throw new Error('Preço deve ser maior que zero');

      const mat = materials.find(m => m.id === saleMaterialId)!;
      const { error } = await sb('residue_sales').insert({
        company_id: companyId,
        material_id: saleMaterialId,
        material_name: mat.name,
        client_name: saleClient.trim(),
        date: saleDate,
        quantity: qty,
        unit: mat.unit,
        unit_price: price,
        total: qty * price,
        romaneio: saleRomaneio.trim() || null,
        observations: saleObs.trim() || null,
        created_by_name: userName || null,
        created_by_code: userCode || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_sales'] });
      // Keep dialog open, reset fields except client
      setSaleMaterialId(''); setSaleQty(''); setSalePrice('');
      setSaleRomaneio(''); setSaleObs('');
      toast({ title: 'Venda registrada' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb('residue_sales').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['residue_sales'] });
      toast({ title: 'Registro removido' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
  });

  // ===== Filters =====
  const [filterMonth, setFilterMonth] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [searchText, setSearchText] = useState('');

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    sales.forEach(s => {
      if (s.date && s.date.length >= 7) {
        const ym = s.date.substring(0, 7);
        const year = parseInt(ym.substring(0, 4));
        if (year >= 2020 && year <= 2099) months.add(ym);
      }
    });
    const now = format(new Date(), 'yyyy-MM');
    months.add(now);
    return Array.from(months).sort().reverse();
  }, [sales]);

  const filteredSales = useMemo(() => {
    let filtered = sales;

    if (filterMonth !== 'all') {
      filtered = filtered.filter(s => s.date.startsWith(filterMonth));
    }
    if (dateFrom) {
      const from = format(dateFrom, 'yyyy-MM-dd');
      filtered = filtered.filter(s => s.date >= from);
    }
    if (dateTo) {
      const to = format(dateTo, 'yyyy-MM-dd');
      filtered = filtered.filter(s => s.date <= to);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(s =>
        (s.material_name || '').toLowerCase().includes(q) ||
        s.client_name.toLowerCase().includes(q) ||
        (s.romaneio || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [sales, filterMonth, dateFrom, dateTo, searchText]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    const totalValue = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const totalQtyKg = filteredSales.filter(s => s.unit === 'kg').reduce((sum, s) => sum + s.quantity, 0);
    const totalQtyUn = filteredSales.filter(s => s.unit === 'unidade').reduce((sum, s) => sum + s.quantity, 0);
    return { totalValue, totalQtyKg, totalQtyUn, count: filteredSales.length };
  }, [filteredSales]);

  const clearFilters = () => {
    setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined); setSearchText('');
  };

  // ===== Format helpers =====
  const formatQtyInput = (value: string) => {
    // Allow digits, comma, dot
    const clean = value.replace(/[^\d,.]/g, '');
    return clean;
  };

  const formatPriceInput = (value: string) => {
    const clean = value.replace(/[^\d,.]/g, '');
    return clean;
  };

  const { minDate, maxDate } = getDateLimits();

  // ===== PDF Export (padrão Relatórios > Exportar) =====
  const exportPDF = async () => {
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    const colors = {
      grayBg: [249, 250, 251] as [number, number, number],
      border: [229, 231, 235] as [number, number, number],
      textDark: [17, 24, 39] as [number, number, number],
      textMid: [75, 85, 99] as [number, number, number],
    };

    // Load logo
    let logoInfo: { data: string; width: number; height: number } | null = null;
    if (companyLogoUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = companyLogoUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        logoInfo = { data: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight };
      } catch { /* ignore */ }
    }

    const fitWithinBox = (w: number, h: number, mw: number, mh: number) => {
      if (!w || !h) return { width: mw, height: mh };
      const s = Math.min(mw / w, mh / h);
      return { width: w * s, height: h * s };
    };

    const dateStr = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

    let periodLabel = 'Todo período';
    if (filterMonth !== 'all') {
      const [yr, mo] = filterMonth.split('-');
      const d = new Date(parseInt(yr), parseInt(mo) - 1);
      periodLabel = format(d, 'MMMM yyyy', { locale: ptBR });
    } else if (dateFrom && dateTo) {
      periodLabel = `${format(dateFrom, 'dd/MM/yyyy')} — ${format(dateTo, 'dd/MM/yyyy')}`;
    }

    // Header (padrão Relatórios)
    const headerH = 25;
    const leftX = margin + 5;
    const rightX = pw - margin - 5;
    const reportTitle = 'Vendas de Resíduos';

    pdf.setFillColor(...colors.grayBg);
    pdf.rect(margin, y, pw - 2 * margin, headerH, 'F');
    pdf.setDrawColor(...colors.border);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, pw - 2 * margin, headerH, 'S');

    // Left: logo or company name + date
    if (logoInfo) {
      try {
        const logoSize = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
        pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, logoSize.width, logoSize.height);
      } catch {
        if (companyName) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colors.textDark);
          pdf.text(sanitizePdfText(companyName), leftX, y + 10);
        }
      }
    } else if (companyName) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.textDark);
      pdf.text(companyName, leftX, y + 10);
    }
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.textMid);
    pdf.text(dateStr, leftX, y + 22);

    // Center: title
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.textDark);
    const titleW = pdf.getTextWidth(reportTitle);
    pdf.text(reportTitle, (pw - titleW) / 2, y + 14);

    // Right: period
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...colors.textMid);
    const pLabelW = pdf.getTextWidth(periodLabel);
    pdf.text(periodLabel, rightX - pLabelW, y + 22);

    y += headerH + 10;

    // Table
    const rows = filteredSales.map(s => [
      s.date.split('-').reverse().join('/'),
      s.material_name || '-',
      s.client_name,
      `${formatNumber(s.quantity, 2)} ${s.unit === 'kg' ? 'kg' : 'un'}`,
      formatCurrency(s.unit_price),
      formatCurrency(s.total),
      s.romaneio || '-',
    ]);

    autoTable(pdf, {
      startY: y,
      head: [['Data', 'Material', 'Cliente', 'Qtd', 'Preço Unit.', 'Total', 'Romaneio']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [60, 60, 60] },
      margin: { left: margin, right: margin },
    });

    // Totals
    const finalY = (pdf as any).lastAutoTable?.finalY || y;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.textDark);
    pdf.text(`Total: ${formatCurrency(kpis.totalValue)} | Registros: ${kpis.count}`, margin, finalY + 8);

    pdf.save(`vendas-residuos-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF exportado' });
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Recycle className="h-6 w-6 text-primary" />
            Vendas de Resíduos
          </h1>
          <p className="text-sm text-muted-foreground">Controle de vendas de papelão, plástico, óleo e outros materiais</p>
        </div>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList>
          <TabsTrigger value="sales">Registros de Venda</TabsTrigger>
          <TabsTrigger value="materials">Materiais</TabsTrigger>
        </TabsList>

        {/* ======= MATERIAIS TAB ======= */}
        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Materiais Cadastrados
              </CardTitle>
              <Button size="sm" onClick={openNewMat}>
                <Plus className="h-4 w-4 mr-1" /> Novo Material
              </Button>
            </CardHeader>
            <CardContent>
              {loadingMaterials ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : materials.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum material cadastrado</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Preço Padrão</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materials.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{m.unit === 'kg' ? 'Quilograma (kg)' : 'Unidade (un)'}</Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(m.default_price)}/{m.unit === 'kg' ? 'kg' : 'un'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditMat(m)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteMatConfirmId(m.id)}>
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
        </TabsContent>

        {/* ======= REGISTROS DE VENDA TAB ======= */}
        <TabsContent value="sales" className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs font-medium">Total Vendido</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatCurrency(kpis.totalValue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Scale className="h-4 w-4" />
                  <span className="text-xs font-medium">Peso (kg)</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatNumber(kpis.totalQtyKg, 1)} kg</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Package className="h-4 w-4" />
                  <span className="text-xs font-medium">Unidades</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{formatNumber(kpis.totalQtyUn, 0)} un</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Hash className="h-4 w-4" />
                  <span className="text-xs font-medium">Registros</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-foreground">{kpis.count}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="p-3 flex flex-wrap items-center gap-2">
              <Select value={filterMonth} onValueChange={v => { setFilterMonth(v); setDateFrom(undefined); setDateTo(undefined); }}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {availableMonths.map(ym => {
                    const [y, m] = ym.split('-');
                    const d = new Date(parseInt(y), parseInt(m) - 1);
                    return <SelectItem key={ym} value={ym}>{format(d, 'MMMM yyyy', { locale: ptBR })}</SelectItem>;
                  })}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", dateFrom && "text-primary border-primary")}>
                    <CalendarIcon className="h-3 w-3" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={d => { setDateFrom(d); setFilterMonth('all'); }} /></PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1", dateTo && "text-primary border-primary")}>
                    <CalendarIcon className="h-3 w-3" />
                    {dateTo ? format(dateTo, 'dd/MM/yy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={d => { setDateTo(d); setFilterMonth('all'); }} /></PopoverContent>
              </Popover>

              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="pl-7 h-8 text-xs w-[150px]"
                />
              </div>

              {(filterMonth !== 'all' || dateFrom || dateTo || searchText) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>Limpar</Button>
              )}

              <div className="flex-1" />

              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={exportPDF} disabled={filteredSales.length === 0}>
                <Download className="h-3 w-3" /> PDF
              </Button>

              <Button size="sm" className="h-8 text-xs" onClick={openNewSale} disabled={materials.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Nova Venda
              </Button>
            </CardContent>
          </Card>

          {/* Sales Table */}
          <Card>
            <CardContent className="p-0">
              {loadingSales ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filteredSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {materials.length === 0 ? 'Cadastre um material primeiro na aba "Materiais"' : 'Nenhum registro encontrado'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Material</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Romaneio</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {s.date.split('-').reverse().join('/')}
                            <br />
                            <span className="text-muted-foreground">
                              {s.created_at ? format(new Date(s.created_at), 'HH:mm') : ''}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">{s.material_name || '-'}</TableCell>
                          <TableCell>{s.client_name}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(s.quantity, 2)} {s.unit === 'kg' ? 'kg' : 'un'}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(s.unit_price)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(s.total)}</TableCell>
                          <TableCell>{s.romaneio || '-'}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteSaleConfirmId(s.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Material Dialog ===== */}
      <Dialog open={matDialogOpen} onOpenChange={setMatDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingMat ? 'Editar Material' : 'Novo Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={matName} onChange={e => setMatName(e.target.value)} placeholder="Ex: Papelão" />
            </div>
            <div>
              <Label>Unidade de Medida *</Label>
              <Select value={matUnit} onValueChange={setMatUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">Quilograma (kg)</SelectItem>
                  <SelectItem value="unidade">Unidade (un)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preço Padrão (R$/{matUnit === 'kg' ? 'kg' : 'un'})</Label>
              <Input value={matPrice} onChange={e => setMatPrice(formatPriceInput(e.target.value))} placeholder="0,00" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={() => saveMat.mutate()} disabled={saveMat.isPending}>
              {saveMat.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Sale Dialog ===== */}
      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-[80vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Venda de Resíduo</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={saleDate} min={minDate} max={maxDate}
                onChange={e => setSaleDate(e.target.value)} />
            </div>
            <div>
              <Label>Cliente *</Label>
              <Input value={saleClient} onChange={e => setSaleClient(e.target.value)} placeholder="Nome do comprador" />
            </div>
            <div>
              <Label>Material *</Label>
              <Select value={saleMaterialId} onValueChange={setSaleMaterialId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {materials.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{selectedMaterial?.unit === 'unidade' ? 'Quantidade (un) *' : 'Peso (kg) *'}</Label>
              <Input value={saleQty} onChange={e => setSaleQty(formatQtyInput(e.target.value))}
                placeholder={selectedMaterial?.unit === 'unidade' ? '0' : '0,00'} />
            </div>
            <div>
              <Label>Preço (R$/{selectedMaterial?.unit === 'unidade' ? 'un' : 'kg'}) *</Label>
              <Input value={salePrice} onChange={e => setSalePrice(formatPriceInput(e.target.value))} placeholder="0,00" />
            </div>
            <div>
              <Label>Nº Romaneio</Label>
              <Input value={saleRomaneio} onChange={e => setSaleRomaneio(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={saleObs} onChange={e => setSaleObs(e.target.value)} placeholder="Opcional" rows={2} />
            </div>
          </div>

          {/* Total preview */}
          {saleMaterialId && parseBR(saleQty) > 0 && parseBR(salePrice) > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total:</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(saleTotal)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
            <Button onClick={() => saveSale.mutate()} disabled={saveSale.isPending}>
              {saveSale.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteMatConfirmId}
        onOpenChange={(v) => { if (!v) setDeleteMatConfirmId(null); }}
        title="Remover material"
        description="Tem certeza que deseja remover este material? Esta ação não pode ser desfeita."
        onConfirm={() => { if (deleteMatConfirmId) deleteMat.mutate(deleteMatConfirmId); setDeleteMatConfirmId(null); }}
      />
      <DeleteConfirmDialog
        open={!!deleteSaleConfirmId}
        onOpenChange={(v) => { if (!v) setDeleteSaleConfirmId(null); }}
        title="Remover registro de venda"
        description="Tem certeza que deseja remover este registro de venda? Esta ação não pode ser desfeita."
        onConfirm={() => { if (deleteSaleConfirmId) deleteSale.mutate(deleteSaleConfirmId); setDeleteSaleConfirmId(null); }}
      />
    </div>
  );
}
