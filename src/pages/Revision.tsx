import { useState, useMemo, useRef, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
 import { Plus, CalendarIcon, Trash2, Loader2, AlertTriangle, Search, Scale, Ruler, Pencil, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, type ShiftType, type DefectRecord, type MeasureType, getCompanyShiftLabels } from '@/types';
import { formatNumber } from '@/lib/formatters';

const SHIFTS: ShiftType[] = ['manha', 'tarde', 'noite'];

export default function RevisionPage() {
  const { getMachines, getWeavers, getArticles, getDefectRecords, addDefectRecords, updateDefectRecords, deleteDefectRecords, shiftSettings, loading } = useSharedCompanyData();
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const { logAction, userName, userCode } = useAuditLog();

  const machines = getMachines();
  const weavers = getWeavers();
  const articles = getArticles();
  const defectRecords = getDefectRecords();

  const sortedMachines = useMemo(() => [...machines].sort((a, b) => a.number - b.number), [machines]);

  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DefectRecord | null>(null);
  const [saving, setSaving] = useState(false);
   const [searchTerm, setSearchTerm] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterMonth, setFilterMonth] = useState<string>('all');
    const [filterArticle, setFilterArticle] = useState<string>('all');
   const [currentPage, setCurrentPage] = useState(1);
   const pageSize = 20;
  const [showDelete, setShowDelete] = useState<DefectRecord | null>(null);
  const [deleteWord, setDeleteWord] = useState('');

  const [form, setForm] = useState({
    date: new Date(),
    shift: '' as ShiftType | '',
    machine_id: '',
    weaver_id: '',
    article_id: '',
    defect_name: '',
    measure_type: 'kg' as MeasureType,
    measure_value: '',
    observations: '',
  });

   const [machineSearch, setMachineSearch] = useState('');
    const [articleSearch, setArticleSearch] = useState('');
    const [articleFilterSearch, setArticleFilterSearch] = useState('');
   const [weaverSearch, setWeaverSearch] = useState('');
   const machineSearchRef = useRef<HTMLInputElement>(null);
   const articleSearchRef = useRef<HTMLInputElement>(null);
   const weaverSearchRef = useRef<HTMLInputElement>(null);

  const getArticleLabel = (a: { name: string; client_name?: string }) =>
    a.client_name ? `${a.name} (${a.client_name})` : a.name;

   const filteredMachinesModal = useMemo(() => {
     if (!machineSearch) return sortedMachines;
     const s = machineSearch.toLowerCase();
     return sortedMachines.filter(m => m.name.toLowerCase().includes(s) || String(m.number).includes(s));
   }, [sortedMachines, machineSearch]);

   const filteredArticlesModal = useMemo(() => {
     if (!articleSearch) return articles;
     const s = articleSearch.toLowerCase();
     return articles.filter(a => a.name.toLowerCase().includes(s) || (a.client_name || '').toLowerCase().includes(s));
   }, [articles, articleSearch]);
 
   const filteredArticlesFilter = useMemo(() => {
     const sorted = [...articles].sort((a, b) => a.name.localeCompare(b.name));
     if (!articleFilterSearch) return sorted;
     const s = articleFilterSearch.toLowerCase();
     return sorted.filter(a => a.name.toLowerCase().includes(s) || (a.client_name || '').toLowerCase().includes(s));
   }, [articles, articleFilterSearch]);

  const filteredWeaversModal = useMemo(() => {
    if (!weaverSearch) return weavers;
    const s = weaverSearch.toLowerCase();
    return weavers.filter(w => w.name.toLowerCase().includes(s) || w.code.toLowerCase().includes(s));
  }, [weavers, weaverSearch]);

  // Available months for filter
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    defectRecords.forEach(d => {
      if (d.date) monthSet.add(d.date.substring(0, 7)); // yyyy-MM
    });
    return Array.from(monthSet).sort().reverse();
  }, [defectRecords]);

    const filtered = useMemo(() => {
      let data = defectRecords;
      if (filterDateFrom) data = data.filter(d => d.date >= filterDateFrom);
      if (filterDateTo) data = data.filter(d => d.date <= filterDateTo);
      if (filterMonth !== 'all' && !filterDateFrom && !filterDateTo) {
        data = data.filter(d => d.date?.startsWith(filterMonth));
      }
      if (filterArticle !== 'all') {
        data = data.filter(d => d.article_id === filterArticle);
      }
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        data = data.filter(d =>
          (d.machine_name || '').toLowerCase().includes(s) ||
          (d.article_name || '').toLowerCase().includes(s) ||
          (d.weaver_name || '').toLowerCase().includes(s)
        );
      }
      return data;
    }, [defectRecords, filterDateFrom, filterDateTo, filterMonth, filterArticle, searchTerm]);
 
   const totalPages = Math.ceil(filtered.length / pageSize);
   const paginatedData = useMemo(() => {
     const start = (currentPage - 1) * pageSize;
     return filtered.slice(start, start + pageSize);
   }, [filtered, currentPage]);
 
    useEffect(() => {
      setCurrentPage(1);
    }, [searchTerm, filterDateFrom, filterDateTo, filterMonth, filterArticle]);
   const exportToPdf = async () => {
     const { default: jsPDF } = await import('jspdf');
     const pdf = new jsPDF();
     const pageWidth = pdf.internal.pageSize.getWidth();
     const margin = 15;
     
     pdf.setFontSize(18);
     pdf.setTextColor(40, 40, 40);
     pdf.text('Relatório de Revisão (Falhas)', margin, 20);
     
     pdf.setFontSize(10);
     pdf.setTextColor(100, 100, 100);
     const periodLabel = (filterDateFrom || filterDateTo)
       ? `Período: ${filterDateFrom ? format(new Date(filterDateFrom + 'T12:00:00'), 'dd/MM/yyyy') : ''} até ${filterDateTo ? format(new Date(filterDateTo + 'T12:00:00'), 'dd/MM/yyyy') : ''}`
       : filterMonth !== 'all' 
         ? `Mês: ${formatMonthLabel(filterMonth)}`
         : 'Período: Total';
         
     const articleLabel = filterArticle !== 'all' 
       ? `Artigo: ${articles.find(a => a.id === filterArticle)?.name || ''}`
       : 'Artigo: Todos';
       
     pdf.text(`${periodLabel} | ${articleLabel}`, margin, 28);
     
     pdf.setDrawColor(200, 200, 200);
     pdf.line(margin, 35, pageWidth - margin, 35);
     
     pdf.setFontSize(11);
     pdf.setTextColor(60, 60, 60);
     pdf.text(`Total de Falhas: ${stats.total}`, margin, 45);
     pdf.text(`Total em Kg: ${formatNumber(stats.totalKg)} kg`, margin + 60, 45);
     pdf.text(`Total em Metros: ${formatNumber(stats.totalMetros)} m`, margin + 120, 45);
     
     let y = 55;
     pdf.setFillColor(240, 240, 240);
     pdf.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
     
     pdf.setFontSize(9);
     pdf.setFont('helvetica', 'bold');
     pdf.setTextColor(0, 0, 0);
     
      const cols = [
        { name: 'Data', w: 22 },
        { name: 'Máquina', w: 20 },
        { name: 'Artigo', w: 60 },
        { name: 'Valor', w: 30 },
        { name: 'Defeito', w: 48 }
      ];
     
     let currentX = margin;
     cols.forEach(col => {
       pdf.text(col.name, currentX + 2, y + 5.5);
       currentX += col.w;
     });
     
     y += 8;
     pdf.setFont('helvetica', 'normal');
     pdf.setFontSize(8);
     
     filtered.forEach((d, i) => {
       if (y > 270) {
         pdf.addPage();
         y = 20;
       }
       if (i % 2 === 0) {
         pdf.setFillColor(252, 252, 252);
         pdf.rect(margin, y, pageWidth - 2 * margin, 7, 'F');
       }
       currentX = margin;
       const dateText = format(new Date(d.date + 'T12:00:00'), 'dd/MM/yy');
       const machineText = d.machine_name || '';
       const articleText = d.article_name || '';
        const valueText = `${formatNumber(d.measure_value)} ${d.measure_type === 'kg' ? 'kg' : 'm'}`;
        let defectText = d.observations || '';
        const match = defectText.match(/^\[(.+?)\]/);
        if (match) defectText = match[1];
        const rowData = [dateText, machineText, articleText, valueText, defectText];
        rowData.forEach((text, idx) => {
          const truncated = String(text).substring(0, idx === 2 ? 40 : 25);
          pdf.text(truncated, currentX + 2, y + 5);
          currentX += cols[idx].w;
        });
       y += 7;
     });
 
     // Total row at the end of the table
     if (y > 270) {
       pdf.addPage();
       y = 20;
     }
     pdf.setFillColor(230, 230, 230);
     pdf.rect(margin, y, pageWidth - 2 * margin, 8, 'F');
     pdf.setFont('helvetica', 'bold');
     pdf.setFontSize(9);
     pdf.text('TOTAL', margin + 2, y + 5.5);
     
      // Total values for columns (kg and metros)
      const totalValueText = `${formatNumber(stats.totalKg)} kg / ${formatNumber(stats.totalMetros)} m`;
      const valueColX = margin + cols[0].w + cols[1].w + cols[2].w;
      pdf.text(totalValueText, valueColX + 2, y + 5.5);
 
     const fileName = `revisao_${format(new Date(), 'yyyy-MM-dd_HHmm')}.pdf`;
     pdf.save(fileName);
     toast.success('PDF gerado com sucesso!');
   };


  const stats = useMemo(() => {
    const totalKg = filtered.filter(d => d.measure_type === 'kg').reduce((s, d) => s + d.measure_value, 0);
    const totalMetros = filtered.filter(d => d.measure_type === 'metro').reduce((s, d) => s + d.measure_value, 0);
    return { total: filtered.length, totalKg, totalMetros };
  }, [filtered]);

  const openNew = () => {
    setEditingRecord(null);
    setForm({ date: new Date(), shift: '', machine_id: '', weaver_id: '', article_id: '', defect_name: '', measure_type: 'kg', measure_value: '', observations: '' });
     setMachineSearch('');
     setArticleSearch('');
     setWeaverSearch('');
    setShowModal(true);
  };

  const openEdit = (record: DefectRecord) => {
    setEditingRecord(record);
    // Parse defect_name and observations from stored observations field
    let defectName = '';
    let obs = '';
    if (record.observations) {
      const match = record.observations.match(/^\[(.+?)\]\s*(.*)/);
      if (match) {
        defectName = match[1];
        obs = match[2];
      } else {
        defectName = record.observations;
      }
    }
    setForm({
      date: new Date(record.date + 'T12:00:00'),
      shift: record.shift as ShiftType,
      machine_id: record.machine_id,
      weaver_id: record.weaver_id,
      article_id: record.article_id,
      defect_name: defectName,
      measure_type: record.measure_type,
      measure_value: String(record.measure_value),
      observations: obs,
    });
     setMachineSearch('');
     setArticleSearch('');
     setWeaverSearch('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.shift || !form.machine_id || !form.article_id || !form.weaver_id || !form.measure_value || !form.defect_name) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const machine = machines.find(m => m.id === form.machine_id);
      const article = articles.find(a => a.id === form.article_id);
      const weaver = weavers.find(w => w.id === form.weaver_id);
      const obsText = form.observations ? `[${form.defect_name}] ${form.observations}` : form.defect_name;

      if (editingRecord) {
        const updated: DefectRecord = {
          ...editingRecord,
          machine_id: form.machine_id,
          article_id: form.article_id,
          weaver_id: form.weaver_id,
          date: format(form.date, 'yyyy-MM-dd'),
          shift: form.shift as ShiftType,
          measure_type: form.measure_type,
          measure_value: parseFloat(form.measure_value),
          machine_name: machine?.name,
          article_name: article?.name,
          weaver_name: weaver?.name,
          observations: obsText,
        };
        await updateDefectRecords(updated);
        logAction('defect_update', { machine: machine?.name, article: article?.name, date: form.date, shift: form.shift });
        toast.success('Falha atualizada com sucesso!');
      } else {
        const record: DefectRecord = {
          id: crypto.randomUUID(),
          company_id: '',
          machine_id: form.machine_id,
          article_id: form.article_id,
          weaver_id: form.weaver_id,
          date: format(form.date, 'yyyy-MM-dd'),
          shift: form.shift as ShiftType,
          measure_type: form.measure_type,
          measure_value: parseFloat(form.measure_value),
          machine_name: machine?.name,
          article_name: article?.name,
          weaver_name: weaver?.name,
          observations: obsText,
          created_by_name: userName || undefined,
          created_by_code: userCode || undefined,
          created_at: new Date().toISOString(),
        };
        await addDefectRecords([record]);
       logAction('defect_create', { machine: machine?.name, article: article?.name, date: form.date, shift: form.shift });
       toast.success('Falha registrada com sucesso!');
       // Reset only defect specific fields to allow registering multiple flaws for the same setup
       setForm(f => ({
         ...f,
         defect_name: '',
         measure_value: '',
         observations: '',
       }));
     }
     // Don't close modal automatically as requested
     if (editingRecord) {
       setShowModal(false);
     }
    } catch (e) {
      toast.error(editingRecord ? 'Erro ao atualizar falha' : 'Erro ao registrar falha');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDelete || deleteWord !== 'EXCLUIR') return;
    try {
      await deleteDefectRecords([showDelete.id]);
      logAction('defect_delete', { machine: showDelete.machine_name, date: showDelete.date });
      toast.success('Registro excluído');
      setShowDelete(null);
      setDeleteWord('');
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const formatMonthLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, 1);
    return format(date, 'MMM/yyyy', { locale: ptBR });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revisão</h1>
          <p className="text-sm text-muted-foreground">Registre falhas de produção por tecelão</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Registrar Falha
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Total de Falhas</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />{stats.total}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Total em Kg</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Scale className="h-5 w-5 text-warning" />{formatNumber(stats.totalKg)} kg</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-medium">Total em Metros</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Ruler className="h-5 w-5 text-info" />{formatNumber(stats.totalMetros)} m</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
       <div className="flex flex-wrap gap-3 items-end">
         <div className="space-y-1.5">
           <Label className="text-xs">De</Label>
           <Popover>
             <PopoverTrigger asChild>
               <Button variant="outline" size="sm" className="gap-2 justify-start w-[140px]">
                 <CalendarIcon className="h-3 w-3" />
                 {filterDateFrom ? format(new Date(filterDateFrom + 'T12:00:00'), 'dd/MM/yy') : 'Início'}
               </Button>
             </PopoverTrigger>
             <PopoverContent className="w-auto p-0" align="start">
               <Calendar
                 mode="single"
                 selected={filterDateFrom ? new Date(filterDateFrom + 'T12:00:00') : undefined}
                 onSelect={d => { setFilterDateFrom(d ? format(d, 'yyyy-MM-dd') : ''); if (d) setFilterMonth('all'); }}
                 locale={ptBR}
                 className="p-3 pointer-events-auto"
               />
             </PopoverContent>
           </Popover>
         </div>
 
         <div className="space-y-1.5">
           <Label className="text-xs">Até</Label>
           <Popover>
             <PopoverTrigger asChild>
               <Button variant="outline" size="sm" className="gap-2 justify-start w-[140px]">
                 <CalendarIcon className="h-3 w-3" />
                 {filterDateTo ? format(new Date(filterDateTo + 'T12:00:00'), 'dd/MM/yy') : 'Fim'}
               </Button>
             </PopoverTrigger>
             <PopoverContent className="w-auto p-0" align="start">
               <Calendar
                 mode="single"
                 selected={filterDateTo ? new Date(filterDateTo + 'T12:00:00') : undefined}
                 onSelect={d => { setFilterDateTo(d ? format(d, 'yyyy-MM-dd') : ''); if (d) setFilterMonth('all'); }}
                 locale={ptBR}
                 className="p-3 pointer-events-auto"
               />
             </PopoverContent>
           </Popover>
         </div>
 
         <Select value={filterMonth} onValueChange={v => { setFilterMonth(v); if (v !== 'all') { setFilterDateFrom(''); setFilterDateTo(''); } }}>
          <SelectTrigger className="min-w-[150px] w-auto">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {availableMonths.map(m => (
              <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterArticle} onValueChange={v => { setFilterArticle(v); setArticleFilterSearch(''); }}>
          <SelectTrigger className="min-w-[180px] w-auto">
            <SelectValue placeholder="Filtrar por Artigo" />
          </SelectTrigger>
          <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false}>
            <div className="px-2 pb-2 relative">
              <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar artigo..." 
                value={articleFilterSearch} 
                onChange={e => setArticleFilterSearch(e.target.value)} 
                className="h-8 pl-8" 
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <SelectItem value="all">Todos os artigos</SelectItem>
            {filteredArticlesFilter.map(a => (
              <SelectItem key={a.id} value={a.id}>{getArticleLabel(a)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por máquina, artigo ou tecelão..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" className="gap-2" onClick={exportToPdf} disabled={filtered.length === 0}>
          <FileText className="h-4 w-4" /> Exportar PDF
        </Button>

        {(filterDateFrom || filterDateTo || filterMonth !== 'all' || filterArticle !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterMonth('all'); setFilterArticle('all'); }}>Limpar filtros</Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Turno</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead>Artigo</TableHead>
              <TableHead>Tecelão</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Obs</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
             {paginatedData.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Nenhuma falha registrada{(filterDateFrom || filterDateTo) ? ' neste período' : filterMonth !== 'all' ? ' neste mês' : ''}
                 </TableCell>
               </TableRow>
             ) : paginatedData.map(d => (
              <TableRow key={d.id}>
                <TableCell>{format(new Date(d.date + 'T12:00:00'), 'dd/MM/yyyy')}</TableCell>
                <TableCell><Badge variant="outline">{companyShiftLabels[d.shift] || d.shift}</Badge></TableCell>
                <TableCell className="font-medium">{d.machine_name}</TableCell>
                <TableCell>{d.article_name}</TableCell>
                <TableCell>{d.weaver_name}{(() => { const w = weavers.find(w => w.id === d.weaver_id); return w ? ` #${w.code}` : ''; })()}</TableCell>
                <TableCell><Badge variant={d.measure_type === 'kg' ? 'secondary' : 'outline'}>{d.measure_type === 'kg' ? 'Kg' : 'Metro'}</Badge></TableCell>
                <TableCell className="text-right font-mono">{formatNumber(d.measure_value)} {d.measure_type === 'kg' ? 'kg' : 'm'}</TableCell>
                <TableCell className="max-w-[120px] truncate text-muted-foreground text-xs">{d.observations || '—'}</TableCell>
                <TableCell className="text-xs text-primary font-medium whitespace-nowrap">
                  {d.created_by_name ? `${d.created_by_name}${d.created_by_code ? ` #${d.created_by_code}` : ''}` : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(d)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setShowDelete(d); setDeleteWord(''); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
       </div>
 
       {/* Pagination */}
       {totalPages > 1 && (
         <div className="flex items-center justify-center gap-2 py-4">
           <Button 
             variant="outline" 
             size="sm" 
             onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
             disabled={currentPage === 1}
           >
             Anterior
           </Button>
           <div className="flex items-center gap-1">
             {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
               <Button
                 key={page}
                 variant={currentPage === page ? "default" : "outline"}
                 size="sm"
                 className="w-8 h-8 p-0"
                 onClick={() => setCurrentPage(page)}
               >
                 {page}
               </Button>
             ))}
           </div>
           <Button 
             variant="outline" 
             size="sm" 
             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
             disabled={currentPage === totalPages}
           >
             Próximo
           </Button>
         </div>
       )}
 
       {/* Register/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto" onEscapeKeyDown={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {editingRecord ? 'Editar Falha' : 'Registrar Falha'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Row 1: Date + Shift */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <CalendarIcon className="h-4 w-4" />
                      {format(form.date, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.date} onSelect={d => d && setForm(f => ({ ...f, date: d }))} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Turno *</Label>
                <Select value={form.shift} onValueChange={v => setForm(f => ({ ...f, shift: v as ShiftType }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                  <SelectContent>
                    {SHIFTS.map(s => <SelectItem key={s} value={s}>{companyShiftLabels[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Machine + Article */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               <div className="space-y-1.5">
                 <Label>Máquina *</Label>
                 <Select value={form.machine_id} onValueChange={v => { setForm(f => ({ ...f, machine_id: v })); setMachineSearch(''); }}>
                   <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                   <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false}>
                     <div className="px-2 pb-2 relative">
                       <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
                       <Input 
                         ref={machineSearchRef} 
                         placeholder="Buscar máquina..." 
                         value={machineSearch} 
                         onChange={e => setMachineSearch(e.target.value)} 
                         className="h-8 pl-8" 
                         onKeyDown={(e) => e.stopPropagation()}
                         autoFocus 
                       />
                     </div>
                     {filteredMachinesModal.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                   </SelectContent>
                 </Select>
               </div>
              <div className="space-y-1.5">
                <Label>Artigo *</Label>
                <Select value={form.article_id} onValueChange={v => { setForm(f => ({ ...f, article_id: v })); setArticleSearch(''); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o artigo" /></SelectTrigger>
                  <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false}>
                     <div className="px-2 pb-2 relative">
                       <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
                       <Input 
                         ref={articleSearchRef} 
                         placeholder="Buscar artigo..." 
                         value={articleSearch} 
                         onChange={e => setArticleSearch(e.target.value)} 
                         className="h-8 pl-8" 
                         onKeyDown={(e) => e.stopPropagation()}
                         autoFocus 
                       />
                     </div>
                    {filteredArticlesModal.map(a => <SelectItem key={a.id} value={a.id}>{getArticleLabel(a)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Weaver + Defect Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               <div className="space-y-1.5">
                 <Label>Tecelão *</Label>
                 <Select value={form.weaver_id} onValueChange={v => { setForm(f => ({ ...f, weaver_id: v })); setWeaverSearch(''); }}>
                   <SelectTrigger><SelectValue placeholder="Selecione o tecelão" /></SelectTrigger>
                   <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false}>
                     <div className="px-2 pb-2 relative">
                       <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
                       <Input 
                         ref={weaverSearchRef} 
                         placeholder="Buscar tecelão..." 
                         value={weaverSearch} 
                         onChange={e => setWeaverSearch(e.target.value)} 
                         className="h-8 pl-8" 
                         onKeyDown={(e) => e.stopPropagation()}
                         autoFocus 
                       />
                     </div>
                     {filteredWeaversModal.map(w => <SelectItem key={w.id} value={w.id}>{w.code} - {w.name}</SelectItem>)}
                   </SelectContent>
                 </Select>
               </div>
              <div className="space-y-1.5">
                <Label>Falha (Nome) *</Label>
                <Input placeholder="Ex: Furo, Mancha, Barramento..." value={form.defect_name} onChange={e => setForm(f => ({ ...f, defect_name: e.target.value }))} />
              </div>
            </div>

            {/* Row 4: Measure type + value + observations */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Medida *</Label>
                <Select value={form.measure_type} onValueChange={v => setForm(f => ({ ...f, measure_type: v as MeasureType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Quilogramas (kg)</SelectItem>
                    <SelectItem value="metro">Metros (m)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor *</Label>
                <Input type="number" step="0.01" min="0" placeholder={form.measure_type === 'kg' ? 'Ex: 2.5' : 'Ex: 10'} value={form.measure_value} onChange={e => setForm(f => ({ ...f, measure_value: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Input placeholder="Detalhes adicionais..." value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2 mt-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingRecord ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingRecord ? 'Salvar Alterações' : 'Registrar Falha'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!showDelete} onOpenChange={() => { setShowDelete(null); setDeleteWord(''); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Excluir Registro</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Digite <strong>EXCLUIR</strong> para confirmar.</p>
          <Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="EXCLUIR" />
          <Button variant="destructive" disabled={deleteWord !== 'EXCLUIR'} onClick={handleDelete} className="w-full">Excluir</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
