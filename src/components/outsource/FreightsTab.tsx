 import { useState, useMemo, useCallback, useRef } from 'react';
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
   const [open, setOpen] = useState(false);
   const [editId, setEditId] = useState<string | null>(null);
   const [searchQuery, setSearchQuery] = useState('');
   const [fromOpen, setFromOpen] = useState(false);
   const [toOpen, setToOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [filterCompany, setFilterCompany] = useState<string>('_all');
 
   const [form, setForm] = useState({
     outsource_company_id: '',
     date: format(new Date(), 'yyyy-MM-dd'),
     nf_rom: '',
     weight_kg: '',
     freight_per_kg: '',
     observations: '',
   });
 
   const resetForm = () => {
     setForm({
       outsource_company_id: '',
       date: format(new Date(), 'yyyy-MM-dd'),
       nf_rom: '',
       weight_kg: '',
       freight_per_kg: '',
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
     intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
     return decPart !== undefined ? `${intPart},${decPart}` : intPart;
   };
 
   const formatRepasseInput = (value: string): string => {
     const digits = value.replace(/\D/g, '');
     if (!digits) return '';
     const padded = digits.padStart(3, '0');
     const last3 = padded.slice(-3);
     const intPart = last3[0] === '0' ? '0' : last3[0];
     const decPart = last3.slice(1);
     return `${intPart},${decPart}`;
   };
 
   const saveMutation = useMutation({
     mutationFn: async () => {
       const data = {
         company_id: companyId,
         outsource_company_id: form.outsource_company_id,
         date: form.date,
         nf_rom: form.nf_rom || null,
         weight_kg: parseBrNumber(form.weight_kg),
         freight_per_kg: parseBrNumber(form.freight_per_kg),
         observations: form.observations || null,
         created_by_name: userName || null,
         created_by_code: userCode || null,
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
       weight_kg: f.weight_kg.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
       freight_per_kg: formatRepasseInput(String(Math.round(f.freight_per_kg * 100))),
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
      let result = [...freights];

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
          const companyName = (f.outsource_company_name || 'não informado').toLowerCase();
          const nfRom = (f.nf_rom || '').toLowerCase();
          return companyName.includes(q) || nfRom.includes(q);
        });
      }
      return result;
    }, [freights, searchQuery, filterMonth, filterFrom, filterTo, filterCompany]);

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
      
      const cols = [20, 50, 30, 25, 25, 30]; 
      const scale = (pw - 2 * m) / cols.reduce((a, b) => a + b, 0);
      const scaledCols = cols.map(w => w * scale);
      
      let x = m;
      const headers = ['Data', 'Malharia', 'ROM/NF', 'Peso (kg)', 'Frete/kg', 'Total'];
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
          f.outsource_company_name || 'Não Informado',
          f.nf_rom || '-',
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
      
      x = m + scaledCols[0] + scaledCols[1] + scaledCols[2];
      pdf.text(`${formatWeight(totalWeight)} kg`, x + 2, y + 5); x += scaledCols[3];
      pdf.text('-', x + 2, y + 5); x += scaledCols[4];
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
               <Button size="sm" className="gap-1.5 whitespace-nowrap" disabled={companies.length === 0}>
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
                 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <div className="space-y-2">
                     <Label>Romaneio/NF</Label>
                     <Input placeholder="Opcional" value={form.nf_rom} onChange={e => setForm(f => ({ ...f, nf_rom: e.target.value }))} />
                   </div>
                   <div className="space-y-2">
                     <Label>Peso (kg) *</Label>
                     <Input type="text" inputMode="decimal" placeholder="0,00" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: formatBrInput(e.target.value, 2) }))} />
                   </div>
                   <div className="space-y-2">
                     <Label>Frete/kg *</Label>
                     <Input type="text" inputMode="decimal" placeholder="0,00" value={form.freight_per_kg} onChange={e => setForm(f => ({ ...f, freight_per_kg: formatRepasseInput(e.target.value) }))} />
                   </div>
                 </div>
                 <div className="space-y-2">
                   <Label>Observações</Label>
                   <Textarea value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
                 </div>
                 {parseBrNumber(form.weight_kg) > 0 && parseBrNumber(form.freight_per_kg) > 0 && (
                   <div className="p-3 bg-muted rounded-md flex justify-between items-center text-sm">
                     <span className="text-muted-foreground">Total Estimado:</span>
                     <span className="font-bold text-blue-600">{formatCurrency(parseBrNumber(form.weight_kg) * parseBrNumber(form.freight_per_kg))}</span>
                   </div>
                 )}
               </div>
               <DialogFooter>
                 <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                 <Button onClick={() => saveMutation.mutate()} disabled={!form.outsource_company_id || !form.weight_kg || !form.freight_per_kg || saveMutation.isPending}>
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
                <Select value={filterCompany} onValueChange={setFilterCompany}>
                  <SelectTrigger className="w-[180px] h-8 text-xs capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todas as malharias</SelectItem>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
 
         <div className="overflow-auto">
           <Table>
             <TableHeader>
               <TableRow>
                 <TableHead>Data</TableHead>
                 <TableHead>Malharia</TableHead>
                 <TableHead>Romaneio/NF</TableHead>
                 <TableHead className="text-right">Peso (kg)</TableHead>
                 <TableHead className="text-right">Frete/kg</TableHead>
                 <TableHead className="text-right font-bold text-blue-600">Frete Total</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
               </TableRow>
             </TableHeader>
             <TableBody>
               {filteredFreights.map(f => (
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
                    <TableCell className="font-medium">{f.outsource_company_name || 'Não Informado'}</TableCell>
                   <TableCell>{f.nf_rom || '—'}</TableCell>
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
               {filteredFreights.length === 0 && (
                 <TableRow>
                   <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado.</TableCell>
                 </TableRow>
               )}
             </TableBody>
           </Table>
         </div>
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