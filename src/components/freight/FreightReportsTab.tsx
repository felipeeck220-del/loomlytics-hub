import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FreightOrder } from '@/hooks/useFreightOrders';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, Truck, Building2, Package, DollarSign, Weight as WeightIcon, FileText, Eye } from 'lucide-react';
import { sanitizePdfText } from '@/lib/pdfUtils';
import { useIsMobile } from '@/hooks/use-mobile';

function fmtKg(n: number): string {
  return `${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}
function fmtMoney(n: number | null | undefined): string {
  return `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[parseInt(m, 10) - 1]}/${y}`;
}

interface Props {
  orders: FreightOrder[];
  hasFullAccess: boolean;
  isFreteiro: boolean;
  companyName: string;
  companyLogoUrl?: string | null;
  onOpenDetails?: (order: FreightOrder) => void;
}

export function FreightReportsTab({ orders, hasFullAccess, isFreteiro, companyName, companyLogoUrl, onOpenDetails }: Props) {
  // Padrão: mês atual (YYYY-MM). Se não houver dados no mês, o usuário troca no filtro.
  const currentMonthKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [month, setMonth] = useState<string>(currentMonthKey);
  const [search, setSearch] = useState('');
  const [freighterFilter, setFreighterFilter] = useState<string>('all');
  const [costCompanyFilter, setCostCompanyFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const isMobile = useIsMobile();

  // Only completed OFRs are considered "realizados" para relatório
  const baseOrders = useMemo(
    () => orders.filter(o => o.status === 'completed'),
    [orders]
  );

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const o of baseOrders) set.add(monthKey(o.completed_at || o.created_at));
    return Array.from(set).sort().reverse();
  }, [baseOrders]);

  const availableFreighters = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of baseOrders) if (o.freighter_id) map.set(o.freighter_id, o.freighter?.name || '—');
    return Array.from(map.entries());
  }, [baseOrders]);

  const availableCostCompanies = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of baseOrders) {
      const id = o.cost_company_id || 'none';
      map.set(id, o.cost_company_name || o.cost_company?.name || 'Sem rateio');
    }
    return Array.from(map.entries());
  }, [baseOrders]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return baseOrders.filter(o => {
      if (month !== 'all' && monthKey(o.completed_at || o.created_at) !== month) return false;
      if (freighterFilter !== 'all' && o.freighter_id !== freighterFilter) return false;
      if (costCompanyFilter !== 'all') {
        const id = o.cost_company_id || 'none';
        if (id !== costCompanyFilter) return false;
      }
      if (!term) return true;
      return (
        o.ofr_number?.toLowerCase().includes(term) ||
        (o.freighter?.name || '').toLowerCase().includes(term) ||
        (o.cost_company_name || o.cost_company?.name || '').toLowerCase().includes(term) ||
        (o.pickup_location || '').toLowerCase().includes(term) ||
        (o.delivery_location || '').toLowerCase().includes(term) ||
        (o.delivery_doc_number || '').toLowerCase().includes(term)
      );
    });
  }, [baseOrders, month, freighterFilter, costCompanyFilter, search]);

  // Reset paginação quando filtros mudam
  useEffect(() => { setPage(1); }, [month, freighterFilter, costCompanyFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  const kpis = useMemo(() => {
    let ofrs = 0, kg = 0, pieces = 0, boxes = 0, freight = 0;
    for (const o of filtered) {
      ofrs += 1;
      for (const it of (o.items || [])) {
        kg += Number(it.weight_kg || 0);
        pieces += Number(it.pieces || 0);
        boxes += Number(it.boxes || 0);
      }
      freight += Number(o.freight_total || 0);
    }
    return { ofrs, kg, pieces, boxes, freight };
  }, [filtered]);

  const byFreighter = useMemo(() => {
    const map = new Map<string, { name: string; ofrs: number; kg: number; freight: number }>();
    for (const o of filtered) {
      const key = o.freighter_id || 'none';
      const name = o.freighter?.name || '—';
      const row = map.get(key) || { name, ofrs: 0, kg: 0, freight: 0 };
      row.ofrs += 1;
      row.kg += (o.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
      row.freight += Number(o.freight_total || 0);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.freight - a.freight);
  }, [filtered]);

  const byCostCompany = useMemo(() => {
    const map = new Map<string, { name: string; ofrs: number; kg: number; freight: number }>();
    for (const o of filtered) {
      const name = o.cost_company_name || o.cost_company?.name || 'Sem rateio';
      const key = o.cost_company_id || 'none';
      const row = map.get(key) || { name, ofrs: 0, kg: 0, freight: 0 };
      row.ofrs += 1;
      row.kg += (o.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
      row.freight += Number(o.freight_total || 0);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.freight - a.freight);
  }, [filtered]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { key: string; ofrs: number; kg: number; freight: number }>();
    for (const o of filtered) {
      const key = monthKey(o.completed_at || o.created_at);
      const row = map.get(key) || { key, ofrs: 0, kg: 0, freight: 0 };
      row.ofrs += 1;
      row.kg += (o.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
      row.freight += Number(o.freight_total || 0);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

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

  const exportPdf = async () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 15;
    const now = new Date();
    const periodo = month === 'all' ? 'Todos os meses' : monthLabel(month);
    const reportTitle = isFreteiro ? 'Relatório de Fretes - Freteiro' : 'Relatório de Fretes';
    const dateStr = `Emitido em ${now.toLocaleString('pt-BR')}`;

    const logoInfo = companyLogoUrl ? await loadLogo(companyLogoUrl) : null;

    const grayBg: [number, number, number] = [249, 250, 251];
    const border: [number, number, number] = [229, 231, 235];
    const textDark: [number, number, number] = [17, 24, 39];
    const textMid: [number, number, number] = [75, 85, 99];

    const fitBox = (w: number, h: number, mw: number, mh: number) => {
      if (!w || !h) return { width: mw, height: mh };
      const s = Math.min(mw / w, mh / h);
      return { width: w * s, height: h * s };
    };

    let y = margin;
    const addHeader = () => {
      const headerH = 25;
      const leftX = margin + 5;
      const rightX = pageW - margin - 5;
      pdf.setFillColor(...grayBg);
      pdf.rect(margin, y, pageW - 2 * margin, headerH, 'F');
      pdf.setDrawColor(...border);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, y, pageW - 2 * margin, headerH, 'S');

      if (logoInfo) {
        try {
          const s = fitBox(logoInfo.width, logoInfo.height, 24, 14);
          pdf.addImage(logoInfo.data, 'PNG', leftX, y + 2.5, s.width, s.height);
        } catch { /* noop */ }
      } else if (companyName) {
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...textDark);
        pdf.text(sanitizePdfText(companyName), leftX, y + 10);
      }
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...textMid);
      pdf.text(dateStr, leftX, y + 22);

      pdf.setFontSize(14); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...textDark);
      const titleW = pdf.getTextWidth(reportTitle);
      pdf.text(sanitizePdfText(reportTitle), (pageW - titleW) / 2, y + 12);

      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...textMid);
      const pText = `Período: ${periodo}`;
      const pW = pdf.getTextWidth(pText);
      pdf.text(sanitizePdfText(pText), rightX - pW, y + 22);

      y += headerH + 8;
    };
    addHeader();

    // KPIs
    autoTable(pdf, {
      startY: y,
      head: [['OFRs', 'Peso total', 'Peças', 'Caixas', 'Total frete']],
      body: [[String(kpis.ofrs), fmtKg(kpis.kg), String(kpis.pieces), String(kpis.boxes), fmtMoney(kpis.freight)]],
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
      styles: { fontSize: 9, halign: 'center' },
      margin: { left: 12, right: 12 },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;

    if (!isFreteiro && byFreighter.length) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text('Por Freteiro', 12, y); y += 2;
      autoTable(pdf, {
        startY: y,
        head: [['Freteiro', 'OFRs', 'Peso', 'Total frete']],
        body: byFreighter.map(r => [sanitizePdfText(r.name), String(r.ofrs), fmtKg(r.kg), fmtMoney(r.freight)]),
        theme: 'striped',
        headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
        styles: { fontSize: 9 },
        margin: { left: 12, right: 12 },
      });
      y = (pdf as any).lastAutoTable.finalY + 6;
    }

    if (byCostCompany.length) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text('Por Empresa (Rateio de custo)', 12, y); y += 2;
      autoTable(pdf, {
        startY: y,
        head: [['Empresa', 'OFRs', 'Peso', 'Total frete']],
        body: byCostCompany.map(r => [sanitizePdfText(r.name), String(r.ofrs), fmtKg(r.kg), fmtMoney(r.freight)]),
        theme: 'striped',
        headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
        styles: { fontSize: 9 },
        margin: { left: 12, right: 12 },
      });
      y = (pdf as any).lastAutoTable.finalY + 6;
    }

    if (byMonth.length > 1) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text('Por Mês', 12, y); y += 2;
      autoTable(pdf, {
        startY: y,
        head: [['Mês', 'OFRs', 'Peso', 'Total frete']],
        body: byMonth.map(r => [monthLabel(r.key), String(r.ofrs), fmtKg(r.kg), fmtMoney(r.freight)]),
        theme: 'striped',
        headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
        styles: { fontSize: 9 },
        margin: { left: 12, right: 12 },
      });
      y = (pdf as any).lastAutoTable.finalY + 6;
    }

    // Detalhamento OFRs
    pdf.addPage();
    y = margin;
    addHeader();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...textDark);
    pdf.text(sanitizePdfText('Detalhamento das OFRs'), margin, y);
    y += 4;
    autoTable(pdf, {
      startY: y,
      head: [['OFR', 'Data', 'Freteiro', 'Rateio', 'Coleta', 'Entrega', 'NF/ROM', 'Peso', 'Frete']],
      body: filtered.map(o => {
        const kg = (o.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
        return [
          `#${o.ofr_number}`,
          fmtDate(o.completed_at || o.created_at),
          sanitizePdfText(o.freighter?.name || '—'),
          sanitizePdfText(o.cost_company_name || o.cost_company?.name || '—'),
          sanitizePdfText(o.pickup_location || '—'),
          sanitizePdfText(o.delivery_location || '—'),
          o.delivery_doc_number ? `${o.delivery_doc_type === 'rom' ? 'ROM' : 'NF'} ${o.delivery_doc_number}` : '—',
          fmtKg(kg),
          fmtMoney(o.freight_total),
        ];
      }),
      theme: 'striped',
      headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
      styles: { fontSize: 8 },
      margin: { left: 8, right: 8 },
    });

    pdf.save(`relatorio-fretes-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-2 md:items-center bg-card p-3 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            placeholder="Pesquisar OFR, freteiro, empresa, coleta, entrega, NF..."
            className="border-none shadow-none focus-visible:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {availableMonths.map(m => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isFreteiro && (
          <Select value={freighterFilter} onValueChange={setFreighterFilter}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Freteiro" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos freteiros</SelectItem>
              {availableFreighters.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={costCompanyFilter} onValueChange={setCostCompanyFilter}>
          <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Empresa (Rateio)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as empresas</SelectItem>
            {availableCostCompanies.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={exportPdf} className="gap-2" disabled={!filtered.length}>
          <Download className="h-4 w-4" /> PDF
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={<FileText className="h-4 w-4" />} label="OFRs" value={String(kpis.ofrs)} tone="sky" />
        <KpiCard icon={<WeightIcon className="h-4 w-4" />} label="Peso total" value={fmtKg(kpis.kg)} tone="emerald" />
        <KpiCard icon={<Package className="h-4 w-4" />} label="Peças" value={String(kpis.pieces)} tone="indigo" />
        <KpiCard icon={<Package className="h-4 w-4" />} label="Caixas" value={String(kpis.boxes)} tone="violet" />
        <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Total frete" value={fmtMoney(kpis.freight)} tone="amber" />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhuma OFR finalizada encontrada para os filtros selecionados.
        </div>
      )}

      {filtered.length > 0 && (
        <>
          {/* Groupings (admin/lider) */}
          {!isFreteiro && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <GroupCard title="Por Freteiro" icon={<Truck className="h-4 w-4" />} rows={byFreighter} isMobile={isMobile} />
              <GroupCard title="Por Empresa (Rateio de custo)" icon={<Building2 className="h-4 w-4" />} rows={byCostCompany} highlight isMobile={isMobile} />
            </div>
          )}

          {/* Freteiro: destaque por Empresa (Rateio) */}
          {isFreteiro && (
            <GroupCard title="Por Empresa (Rateio de custo)" icon={<Building2 className="h-4 w-4" />} rows={byCostCompany} highlight isMobile={isMobile} />
          )}

          {/* Por mês */}
          {byMonth.length > 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm">Por Mês</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground text-left">
                        <th className="py-2 pr-3">Mês</th>
                        <th className="py-2 pr-3 text-right">OFRs</th>
                        <th className="py-2 pr-3 text-right">Peso</th>
                        <th className="py-2 pr-3 text-right">Total frete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byMonth.map(r => (
                        <tr key={r.key} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{monthLabel(r.key)}</td>
                          <td className="py-2 pr-3 text-right">{r.ofrs}</td>
                          <td className="py-2 pr-3 text-right">{fmtKg(r.kg)}</td>
                          <td className="py-2 pr-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{fmtMoney(r.freight)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detalhamento individual */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">
                  {isFreteiro ? 'Meus Fretes' : 'Detalhamento das OFRs'} ({filtered.length})
                </h3>
              </div>
              {isMobile ? (
                <div className="space-y-2">
                  {paginated.map(o => {
                    const kg = (o.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
                    const rateio = o.cost_company_name || o.cost_company?.name || '—';
                    return (
                      <div key={o.id} className="rounded-lg border bg-muted/20 p-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-sm">#{o.ofr_number}</span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{fmtDate(o.completed_at || o.created_at)}</span>
                          </div>
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Ver relatório completo" onClick={() => onOpenDetails?.(o)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          <Badge className="text-[10px] bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border border-indigo-600/40 uppercase font-bold">{rateio}</Badge>
                          {!isFreteiro && o.freighter?.name && (
                            <Badge variant="outline" className="text-[10px]">
                              <Truck className="h-3 w-3 mr-1" />{o.freighter.name}
                            </Badge>
                          )}
                          {o.delivery_doc_number && (
                            <Badge variant="secondary" className="text-[10px]">
                              {o.delivery_doc_type === 'rom' ? 'ROM' : 'NF'} {o.delivery_doc_number}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground break-words mb-1.5">
                          <span className="font-medium text-foreground">{o.pickup_location}</span>
                          <span className="mx-1">→</span>
                          <span className="font-medium text-foreground">{o.delivery_location}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <div className="rounded bg-background/60 p-1.5 text-center">
                            <div className="text-muted-foreground">Peso</div>
                            <div className="font-bold">{fmtKg(kg)}</div>
                          </div>
                          <div className="rounded bg-background/60 p-1.5 text-center">
                            <div className="text-muted-foreground">Frete</div>
                            <div className="font-bold text-emerald-700 dark:text-emerald-400">{fmtMoney(o.freight_total)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground text-left">
                      <th className="py-2 pr-3">OFR</th>
                      <th className="py-2 pr-3">Data</th>
                      {!isFreteiro && <th className="py-2 pr-3">Freteiro</th>}
                      <th className="py-2 pr-3">Rateio</th>
                      <th className="py-2 pr-3">Coleta → Entrega</th>
                      <th className="py-2 pr-3">NF/ROM</th>
                      <th className="py-2 pr-3 text-right">Peso</th>
                      <th className="py-2 pr-3 text-right">Frete</th>
                      <th className="py-2 pr-3 text-right w-10">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(o => {
                      const kg = (o.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
                      const rateio = o.cost_company_name || o.cost_company?.name || '—';
                      return (
                        <tr key={o.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 pr-3 font-semibold">#{o.ofr_number}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(o.completed_at || o.created_at)}</td>
                          {!isFreteiro && <td className="py-2 pr-3">{o.freighter?.name || '—'}</td>}
                          <td className="py-2 pr-3">
                            <Badge className="text-[10px] bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border border-indigo-600/40 uppercase font-bold">
                              {rateio}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 text-xs">{o.pickup_location} → {o.delivery_location}</td>
                          <td className="py-2 pr-3 text-xs">
                            {o.delivery_doc_number ? `${o.delivery_doc_type === 'rom' ? 'ROM' : 'NF'} ${o.delivery_doc_number}` : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right">{fmtKg(kg)}</td>
                          <td className="py-2 pr-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{fmtMoney(o.freight_total)}</td>
                          <td className="py-2 pr-3 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="Ver relatório completo da OFR"
                              onClick={() => onOpenDetails?.(o)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
              {filtered.length > pageSize && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="text-muted-foreground">
                    Mostrando {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} de {filtered.length}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 px-2" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((p, idx, arr) => (
                        <React.Fragment key={p}>
                          {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-muted-foreground">…</span>}
                          <Button
                            size="sm"
                            variant={p === currentPage ? 'default' : 'outline'}
                            className="h-7 min-w-7 px-2"
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </Button>
                        </React.Fragment>
                      ))}
                    <Button size="sm" variant="outline" className="h-7 px-2" disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'sky' | 'emerald' | 'indigo' | 'violet' | 'amber' }) {
  const map: Record<string, string> = {
    sky: 'from-sky-500/10 to-sky-500/5 border-sky-500/30 text-sky-700 dark:text-sky-300',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    indigo: 'from-indigo-500/10 to-indigo-500/5 border-indigo-500/30 text-indigo-700 dark:text-indigo-300',
    violet: 'from-violet-500/10 to-violet-500/5 border-violet-500/30 text-violet-700 dark:text-violet-300',
    amber: 'from-amber-500/10 to-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-300',
  };
  return (
    <Card className={`bg-gradient-to-br ${map[tone]} border`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide opacity-80">
          {icon}<span>{label}</span>
        </div>
        <div className="text-lg md:text-xl font-bold mt-1 text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function GroupCard({
  title, icon, rows, highlight, isMobile,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{ name: string; ofrs: number; kg: number; freight: number }>;
  highlight?: boolean;
  isMobile?: boolean;
}) {
  const totalFreight = rows.reduce((s, r) => s + r.freight, 0);
  return (
    <Card className={highlight ? 'border-indigo-500/40' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        ) : isMobile ? (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const pct = totalFreight > 0 ? (r.freight / totalFreight) * 100 : 0;
              return (
                <div key={i} className="rounded-lg border bg-muted/20 p-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="font-semibold text-sm break-words flex-1 min-w-0">{r.name}</div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{pct.toFixed(1)}%</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    <div className="rounded bg-background/60 p-1.5 text-center">
                      <div className="text-muted-foreground">OFRs</div>
                      <div className="font-bold">{r.ofrs}</div>
                    </div>
                    <div className="rounded bg-background/60 p-1.5 text-center">
                      <div className="text-muted-foreground">Peso</div>
                      <div className="font-bold">{fmtKg(r.kg)}</div>
                    </div>
                    <div className="rounded bg-background/60 p-1.5 text-center">
                      <div className="text-muted-foreground">Frete</div>
                      <div className="font-bold text-emerald-700 dark:text-emerald-400">{fmtMoney(r.freight)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground text-left">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3 text-right">OFRs</th>
                  <th className="py-2 pr-3 text-right">Peso</th>
                  <th className="py-2 pr-3 text-right">Total frete</th>
                  <th className="py-2 pr-3 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3 text-right">{r.ofrs}</td>
                    <td className="py-2 pr-3 text-right">{fmtKg(r.kg)}</td>
                    <td className="py-2 pr-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{fmtMoney(r.freight)}</td>
                    <td className="py-2 pr-3 text-right text-xs text-muted-foreground">
                      {totalFreight > 0 ? `${((r.freight / totalFreight) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}