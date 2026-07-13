import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
 import { toast } from '@/hooks/use-toast';
 import { formatCurrency, formatWeight, getDateLimits } from '@/lib/formatters';
  import { Plus, Trash2, Edit, Loader2, Search, CalendarIcon, Download, FileText } from 'lucide-react';
  import { jsPDF } from 'jspdf';
  import { sanitizePdfText } from '@/lib/pdfUtils';
 import { format } from 'date-fns';
 import { ptBR } from 'date-fns/locale';
 import { cn, getFriendlyErrorMessage } from '@/lib/utils';
 import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
 
 const sb = (table: string) => (supabase.from as any)(table);
 
 interface OutsourceFreight {
   id: string;
   company_id: string;
   outsource_company_id: string;
   outsource_company_name?: string;
   date: string;
    nf_rom?: string;
    freteiro?: string;
    weight_kg: number;
    freight_per_kg: number;
    total_freight: number;
    observations?: string;
    created_by_name?: string;
    created_by_code?: string;
   created_at: string;
 }
 
 interface OutsourceCompany {
   id: string;
   name: string;
 }
 
  export function FreightsTab({ 
    freights, 
    companies, 
    companyId, 
    loading, 
    filterMonth, 
    setFilterMonth, 
    filterFrom, 
    setFilterFrom, 
    filterTo, 
    setFilterTo,
    companyName,
    logoUrl,
  }: {
    companyName?: string;
    logoUrl?: string | null;
   freights: OutsourceFreight[];
   companies: OutsourceCompany[];
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
    const { userCode, userName, logAction } = useAuditLog();
    const userNameRef = useRef(userName);
    const userCodeRef = useRef(userCode);
    useEffect(() => { userNameRef.current = userName; }, [userName]);
    useEffect(() => { userCodeRef.current = userCode; }, [userCode]);

    const [open, setOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [fromOpen, setFromOpen] = useState(false);
    const [toOpen, setToOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [filterCompany, setFilterCompany] = useState<string>('_all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Reset pagination when search or filters change
    useEffect(() => {
      setCurrentPage(1);
    }, [searchQuery, filterMonth, filterFrom, filterTo, filterCompany]);
 
    const [form, setForm] = useState({
      outsource_company_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      nf_rom: '',
      freteiro: '',
      weight_kg: '',
      freight_per_kg: '',
      total_freight: '',
      observations: '',
    });
 
    const resetForm = () => {
      setForm({
        outsource_company_id: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        nf_rom: '',
        freteiro: '',
        weight_kg: '',
        freight_per_kg: '',
        total_freight: '',
        observations: '',
      });
      setEditId(null);
    };
 
   const parseBrNumber = (str: string): number => {
     if (!str) return 0;
     return Number(str.replace(/\./g, '').replace(',', '.')) || 0;
   };
 
  const formatBrInput = (value: string, decimals: number): string => {
    let raw = value.replace(/[^\d,]/g, '');
    const parts = raw.split(',');
    let intPart = parts[0] || '';
    let decPart = parts.length > 1 ? parts[1].slice(0, decimals) : undefined;
    intPart = intPart.replace(/^0+(?=\d)/, '');
    if (!intPart) intPart = '0';
    // Adiciona separador de milhar
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return decPart !== undefined ? `${intPart},${decPart}` : intPart;
  };
 
    const formatRepasseInput = (value: string): string => {
      const digits = value.replace(/\D/g, '');
      if (!digits) return '';
      const val = parseInt(digits, 10);
      const intPart = Math.floor(val / 100).toString();
      const decPart = (val % 100).toString().padStart(2, '0');
      return `${intPart},${decPart}`;
    };
 
   const saveMutation = useMutation({
     mutationFn: async () => {
        const data = {
          company_id: companyId,
          outsource_company_id: form.outsource_company_id || null,
          date: form.date,
          nf_rom: form.nf_rom || null,
          freteiro: form.freteiro || null,
          weight_kg: parseBrNumber(form.weight_kg),
          freight_per_kg: parseBrNumber(form.freight_per_kg),
          total_freight: parseBrNumber(form.total_freight),
          observations: form.observations || null,
          created_by_name: userNameRef.current || null,
          created_by_code: userCodeRef.current || null,
        };
 
        if (editId) {
          const { error } = await supabase.from('outsource_freights').update(data).eq('id', editId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('outsource_freights').insert(data);
          if (error) throw error;
        }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['outsource_freights'] });
       logAction(editId ? 'outsource_freight_update' : 'outsource_freight_create', { date: form.date });
       toast({ title: editId ? 'Frete atualizado!' : 'Frete registrado!' });
       setOpen(false);
       resetForm();
     },
     onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
   });
 
    const deleteMutation = useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('outsource_freights').delete().eq('id', id);
        if (error) throw error;
      },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['outsource_freights'] });
       logAction('outsource_freight_delete', {});
       toast({ title: 'Registro removido!' });
     },
     onError: (e: any) => toast({ title: 'Erro', description: getFriendlyErrorMessage(e.message), variant: 'destructive' }),
   });
 
     const openEdit = (f: OutsourceFreight) => {
       setEditId(f.id);
       setForm({
         outsource_company_id: f.outsource_company_id,
         date: f.date,
         nf_rom: f.nf_rom || '',
         freteiro: f.freteiro || '',
         weight_kg: f.weight_kg ? f.weight_kg.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
         freight_per_kg: f.freight_per_kg ? formatRepasseInput(String(Math.round(f.freight_per_kg * 100))) : '',
         total_freight: f.total_freight ? formatRepasseInput(String(Math.round(f.total_freight * 100))) : '',
         observations: f.observations || '',
       });
       setOpen(true);
     };
 
   const availableMonths = useMemo(() => {
     const months = new Set<string>();
     freights.forEach(f => {
       if (f.date) months.add(f.date.substring(0, 7));
     });
     return Array.from(months).sort().reverse();
   }, [freights]);
 
    const filteredFreights = useMemo(() => {
      let result = [...freights].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Month filter
      if (filterMonth) {
        result = result.filter(f => f.date.startsWith(filterMonth));
      }

      // Date range filter
      if (filterFrom) {
        const from = format(filterFrom, 'yyyy-MM-dd');
        result = result.filter(f => f.date >= from);
      }
      if (filterTo) {
        const to = format(filterTo, 'yyyy-MM-dd');
        result = result.filter(f => f.date <= to);
      }

      // Company filter
      if (filterCompany !== '_all') {
        result = result.filter(f => f.outsource_company_id === filterCompany);
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter(f => {
          const companyName = (f.outsource_company_name || 'avulso').toLowerCase();
          const nfRom = (f.nf_rom || '').toLowerCase();
          const freteiro = (f.freteiro || '').toLowerCase();
          const observations = (f.observations || '').toLowerCase();
          return companyName.includes(q) || nfRom.includes(q) || freteiro.includes(q) || observations.includes(q);
        });
      }
      return result;
    }, [freights, searchQuery, filterMonth, filterFrom, filterTo, filterCompany]);

    const totalPages = Math.ceil(filteredFreights.length / itemsPerPage);

    const paginatedFreights = useMemo(() => {
      const startIndex = (currentPage - 1) * itemsPerPage;
      return filteredFreights.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredFreights, currentPage]);

    const hasActiveFilters = !!filterMonth || !!filterFrom || !!filterTo || filterCompany !== '_all';

    const exportPdf = async () => {
      const pdf = new jsPDF('p', 'mm', 'a4');
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

      const fitWithinBox = (width: number, height: number, maxWidth: number, maxHeight: number) => {
        if (!width || !height) return { width: maxWidth, height: maxHeight };
        const scale = Math.min(maxWidth / width, maxHeight / height);
        return { width: width * scale, height: height * scale };
      };

      let logoInfo = null;
      if (logoUrl) {
        logoInfo = await loadLogo(logoUrl);
      }

      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const m = 10;
      let y = m;

      const textDark: [number, number, number] = [17, 24, 39];
      const textMid: [number, number, number] = [75, 85, 99];
      const border: [number, number, number] = [229, 231, 235];
      const date = format(new Date(), 'dd/MM/yyyy HH:mm');

      // Header Box
      const headerH = 25;
      pdf.setFillColor(249, 250, 251);
      pdf.rect(m, y, pw - 2 * m, headerH, 'F');
      pdf.setDrawColor(...border);
      pdf.setLineWidth(0.5);
      pdf.rect(m, y, pw - 2 * m, headerH, 'S');

      const leftX = m + 5;
      const rightX = pw - m - 5;

      // Logo or Company Name
      if (logoInfo) {
        try {
          const logoSize = fitWithinBox(logoInfo.width, logoInfo.height, 24, 14);
          pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, logoSize.width, logoSize.height);
        } catch {
          if (companyName) {
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(...textDark);
            pdf.text(sanitizePdfText(companyName), leftX, y + 10);
          }
        }
      } else if (companyName) {
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...textDark);
        pdf.text(sanitizePdfText(companyName), leftX, y + 10);
      }

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textMid);
      pdf.text(date, leftX, y + 22);

      // Title
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...textDark);
      const titleText = 'CONTROLE DE FRETE';
      const titleW = pdf.getTextWidth(titleText);
      pdf.text(titleText, (pw - titleW) / 2, y + 10);

      // Period
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...textDark);
      const periodTitle = 'Período';
      pdf.text(periodTitle, rightX - pdf.getTextWidth(periodTitle), y + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textMid);
      
      let periodLabel = 'Todos os registros';
      if (filterMonth) {
        const [year, mo] = filterMonth.split('-');
        periodLabel = format(new Date(Number(year), Number(mo)-1, 1), 'MMMM/yyyy', { locale: ptBR });
      } else if (filterFrom && filterTo) {
        periodLabel = `${format(filterFrom, 'dd/MM/yy')} até ${format(filterTo, 'dd/MM/yy')}`;
      } else if (filterFrom) {
        periodLabel = `Desde ${format(filterFrom, 'dd/MM/yy')}`;
      } else if (filterTo) {
        periodLabel = `Até ${format(filterTo, 'dd/MM/yy')}`;
      }

      const periodLines = pdf.splitTextToSize(sanitizePdfText(periodLabel), 42) as string[];
      periodLines.slice(0, 2).forEach((line, index) => {
        pdf.text(line, rightX - pdf.getTextWidth(line), y + 16 + index * 5);
      });

      y += headerH + 10;

      // Header table
      pdf.setFillColor(241, 245, 249);
      pdf.rect(m, y, pw - 2*m, 8, 'F');
      pdf.setDrawColor(...border);
      pdf.setLineWidth(0.3);
      pdf.rect(m, y, pw - 2*m, 8, 'S');
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(71, 85, 105);
      
      const cols = [20, 40, 25, 30, 25, 20, 30]; 
      const scale = (pw - 2 * m) / cols.reduce((a, b) => a + b, 0);
      const scaledCols = cols.map(w => w * scale);
      
      let x = m;
      const headers = ['Data', 'Malharia', 'ROM/NF', 'Freteiro', 'Peso (kg)', 'Frete/kg', 'Total'];
      headers.forEach((h, i) => {
        pdf.text(sanitizePdfText(h), x + 2, y + 5.5);
        x += scaledCols[i];
      });
      y += 8;

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...textDark);
      let totalWeight = 0;
      let totalValue = 0;

      filteredFreights.forEach((f, index) => {
        const rowH = 7;
        if (y + rowH > ph - 20) {
          pdf.addPage();
          y = m;
        }
        
        if (index % 2 === 1) {
          pdf.setFillColor(250, 251, 252);
          pdf.rect(m, y, pw - 2 * m, rowH, 'F');
        }
        pdf.setDrawColor(241, 245, 249);
        pdf.setLineWidth(0.1);
        pdf.rect(m, y, pw - 2 * m, rowH, 'S');

        x = m;
        const dateStr = format(new Date(f.date + 'T12:00:00'), 'dd/MM/yyyy');
        const data = [
          dateStr,
          f.outsource_company_name || 'Avulso',
          f.nf_rom || '-',
          f.freteiro || '-',
          `${formatWeight(f.weight_kg)} kg`,
          formatCurrency(f.freight_per_kg),
          formatCurrency(f.total_freight)
        ];

        data.forEach((d, i) => {
          const text = sanitizePdfText(d);
          const fitText = text.length > 25 ? text.substring(0, 24) + '…' : text;
          pdf.text(fitText, x + 2, y + 5);
          x += scaledCols[i];
        });

        totalWeight += f.weight_kg;
        totalValue += f.total_freight;
        y += rowH;
      });

      // Totals Row
      if (y + 8 > ph - 20) {
        pdf.addPage();
        y = m;
      }
      pdf.setFillColor(226, 232, 240);
      pdf.rect(m, y, pw - 2 * m, 8, 'F');
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.3);
      pdf.line(m, y, pw - m, y);
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...textDark);
      pdf.text('TOTAL GERAL', m + 2, y + 5);
      
      x = m + scaledCols[0] + scaledCols[1] + scaledCols[2] + scaledCols[3];
      pdf.text(`${formatWeight(totalWeight)} kg`, x + 2, y + 5); x += scaledCols[4];
      pdf.text('-', x + 2, y + 5); x += scaledCols[5];
      pdf.text(formatCurrency(totalValue), x + 2, y + 5);

      // Footer
      y = ph - 10;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(148, 163, 184);
      const footer = `Relatório gerado automaticamente pelo sistema MalhaGest · ${date}`;
      const fw = pdf.getTextWidth(footer);
      pdf.text(footer, (pw - fw) / 2, y);

      pdf.save(`fretes_terceirizado_${format(new Date(), 'dd_MM_yyyy')}.pdf`);
      toast({ title: "PDF gerado com sucesso!" });
    };
 
   if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
 
   return (
     <Card>
       <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
         <div>
           <CardTitle className="text-lg">Controle de Frete</CardTitle>
           <CardDescription>Gerencie os custos de transporte de produções terceirizadas</CardDescription>
         </div>
         <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
           <div className="relative flex-1 sm:flex-none">
             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
             <Input placeholder="Buscar malharia, ROM..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9 w-full sm:w-56" />
           </div>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
             <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 whitespace-nowrap">
                  <Plus className="h-4 w-4" /> Registrar Frete
                </Button>
             </DialogTrigger>
              <DialogContent className="max-w-[95vw] sm:max-w-[500px]" onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
               <DialogHeader>
                 <DialogTitle>{editId ? 'Editar Frete' : 'Registrar Novo Frete'}</DialogTitle>
               </DialogHeader>
               <div className="space-y-4 py-2">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <Label>Malharia</Label>
                      <SearchableSelect 
                        value={form.outsource_company_id} 
                        onValueChange={v => setForm(f => ({ ...f, outsource_company_id: v === '_none' ? '' : v }))}
                        options={[
                          { value: '_none', label: 'SEM MALHARIA' },
                          ...companies.map(c => ({ value: c.id, label: c.name }))
                        ]}
                        placeholder="Pesquisar malharia..."
                        searchPlaceholder="Buscar malharia..."
                      />
                   </div>
                   <div className="space-y-2">
                     <Label>Data *</Label>
                     <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                   </div>
                 </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Romaneio/NF</Label>
                      <Input placeholder="Opcional" value={form.nf_rom} onChange={e => setForm(f => ({ ...f, nf_rom: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Freteiro</Label>
                      <Input placeholder="Nome do motorista/transportadora" value={form.freteiro} onChange={e => setForm(f => ({ ...f, freteiro: e.target.value }))} />
                    </div>
                  </div>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Peso (kg)</Label>
                      <Input type="text" inputMode="decimal" placeholder="0,00" value={form.weight_kg} onChange={e => {
                        const newWeight = formatBrInput(e.target.value, 2);
                        setForm(f => {
                          const w = parseBrNumber(newWeight);
                          const p = parseBrNumber(f.freight_per_kg);
                          const total = w > 0 && p > 0 ? formatRepasseInput(String(Math.round(w * p * 100))) : f.total_freight;
                          return { ...f, weight_kg: newWeight, total_freight: total };
                        });
                      }} />
                    </div>
                    <div className="space-y-2">
                      <Label>Frete/kg</Label>
                      <Input type="text" inputMode="decimal" placeholder="0,00" value={form.freight_per_kg} onChange={e => {
                        const newPrice = formatRepasseInput(e.target.value);
                        setForm(f => {
                          const w = parseBrNumber(f.weight_kg);
                          const p = parseBrNumber(newPrice);
                          const total = w > 0 && p > 0 ? formatRepasseInput(String(Math.round(w * p * 100))) : f.total_freight;
                          return { ...f, freight_per_kg: newPrice, total_freight: total };
                        });
                      }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Frete Total *</Label>
                    <Input type="text" inputMode="decimal" placeholder="0,00" className="font-bold text-blue-600" value={form.total_freight} onChange={e => setForm(f => ({ ...f, total_freight: formatRepasseInput(e.target.value) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
                  </div>
               </div>
               <DialogFooter>
                 <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                 <Button onClick={() => saveMutation.mutate()} disabled={!form.total_freight || saveMutation.isPending}>
                   {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                   {editId ? 'Salvar' : 'Registrar'}
                 </Button>
               </DialogFooter>
             </DialogContent>
           </Dialog>
         </div>
       </CardHeader>
       <CardContent className="space-y-4">
         {/* Filters same as productions */}
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
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Malharia</Label>
                <SearchableSelect 
                  value={filterCompany === '_all' ? '' : filterCompany} 
                  onValueChange={v => setFilterCompany(v || '_all')}
                  options={[{ value: '_all', label: 'Todas as malharias' }, ...companies.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="Todas as malharias"
                  searchPlaceholder="Buscar malharia..."
                  triggerClassName="w-[180px] h-8 text-xs"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5" onClick={exportPdf} disabled={filteredFreights.length === 0}>
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Button>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setFilterMonth(''); setFilterFrom(undefined); setFilterTo(undefined); setFilterCompany('_all'); }}>
                    ✕ Limpar
                  </Button>
                )}
              </div>
            </div>
          </div>
 
          {/* Mobile: card list */}
          <div className="md:hidden divide-y divide-border">
            {paginatedFreights.length > 0 ? (
              <>
                {paginatedFreights.map(f => {
                  const parts = f.date.split('-');
                  const dateStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : f.date;
                  return (
                    <div key={f.id} className="p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium">{dateStr}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteConfirmId(f.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="font-semibold text-sm break-words">{f.outsource_company_name || 'Avulso'}</div>
                      <div className="break-words"><span className="text-muted-foreground">Romaneio/NF:</span> {f.nf_rom || '—'}</div>
                      <div className="break-words"><span className="text-muted-foreground">Freteiro:</span> {f.freteiro || '—'}</div>
                      <div className="grid grid-cols-3 gap-1 pt-1">
                        <div><div className="text-[10px] text-muted-foreground">Peso</div><div className="tabular-nums font-medium">{formatWeight(f.weight_kg)}</div></div>
                        <div><div className="text-[10px] text-muted-foreground">Frete/kg</div><div className="tabular-nums">{formatCurrency(f.freight_per_kg)}</div></div>
                        <div><div className="text-[10px] text-muted-foreground">Total</div><div className="tabular-nums font-bold text-blue-600">{formatCurrency(f.total_freight)}</div></div>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{f.created_by_name || 'Sistema'} #{f.created_by_code || '0'} · {format(new Date(f.created_at), 'dd/MM/yy HH:mm')}</div>
                    </div>
                  );
                })}
                {filterCompany !== '_all' && (
                  <div className="p-3 bg-muted/50 text-xs font-bold flex items-center justify-between">
                    <span className="uppercase tracking-wider text-muted-foreground">Totais</span>
                    <span className="text-blue-600">{formatCurrency(filteredFreights.reduce((s, f) => s + f.total_freight, 0))} · {formatWeight(filteredFreights.reduce((s, f) => s + f.weight_kg, 0))}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">Nenhum registro encontrado.</div>
            )}
          </div>
         <div className="hidden md:block overflow-auto">
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Data</TableHead>
                 <TableHead>Malharia</TableHead>
                  <TableHead>Romaneio/NF</TableHead>
                  <TableHead>Freteiro</TableHead>
                 <TableHead className="text-right">Peso (kg)</TableHead>
                 <TableHead className="text-right">Frete/kg</TableHead>
                 <TableHead className="text-right font-bold text-blue-600">Frete Total</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
               </TableRow>
             </TableHeader>
              <TableBody>
                {paginatedFreights.length > 0 ? (
                  <>
                    {paginatedFreights.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="py-2">
                          <div className="flex flex-col">
                            <span className="text-xs font-medium">
                              {(() => { const parts = f.date.split('-'); return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : f.date; })()}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-tight whitespace-pre-line">
                              {f.created_by_name || 'Sistema'} #{f.created_by_code || '0'} - {"\n"}{format(new Date(f.created_at), 'dd/MM/yy HH:mm')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{f.outsource_company_name || 'Avulso'}</TableCell>
                        <TableCell>{f.nf_rom || '—'}</TableCell>
                        <TableCell>{f.freteiro || '—'}</TableCell>
                        <TableCell className="text-right">{formatWeight(f.weight_kg)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(f.freight_per_kg)}</TableCell>
                        <TableCell className="text-right font-bold text-blue-600">{formatCurrency(f.total_freight)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteConfirmId(f.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filterCompany !== '_all' && (
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell colSpan={4} className="text-right py-3 text-xs uppercase tracking-wider text-muted-foreground">
                          Totais Selecionados:
                        </TableCell>
                        <TableCell className="text-right text-foreground">
                          {formatWeight(filteredFreights.reduce((sum, f) => sum + f.weight_kg, 0))}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">-</TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatCurrency(filteredFreights.reduce((sum, f) => sum + f.total_freight, 0))}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
           </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center py-4 border-t gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;

                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Próxima
              </Button>
            </div>
          )}
        </CardContent>
       <DeleteConfirmDialog
         open={!!deleteConfirmId}
         onOpenChange={(v) => { if (!v) setDeleteConfirmId(null); }}
         title="Remover frete"
         description="Tem certeza que deseja remover este registro de frete? Esta ação não pode ser desfeita."
         onConfirm={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }}
       />
     </Card>
   );
 }