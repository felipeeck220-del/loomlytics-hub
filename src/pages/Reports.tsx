import { useState, useMemo, useRef, useEffect } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarIcon, Loader2, RotateCcw, Download, Clock, Search,
  Package, TrendingUp, DollarSign, Gauge, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SHIFT_LABELS, type ShiftType, getCompanyShiftLabels } from '@/types';
import { formatNumber, formatCurrency, formatWeight, formatPercent } from '@/lib/formatters';
import { usePermissions } from '@/hooks/usePermissions';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';

const CHART_COLORS = [
  'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(221, 83%, 53%)',
  'hsl(0, 84%, 60%)', 'hsl(280, 60%, 50%)', 'hsl(199, 89%, 48%)',
];

const SHIFT_CHART_COLORS: Record<string, string> = {
  'Manhã': 'hsl(38, 92%, 50%)',
  'Tarde': 'hsl(25, 95%, 53%)',
  'Noite': 'hsl(221, 83%, 53%)',
};

export default function Reports() {
  const { getProductions, getMachines, getClients, getArticles, shiftSettings, loading } = useSharedCompanyData();
  const companyShiftLabels = useMemo(() => getCompanyShiftLabels(shiftSettings), [shiftSettings]);
  const { canSeeFinancial } = usePermissions();
  const { user } = useAuth();
  const productions = getProductions();
  const machines = getMachines();
  const clients = getClients();
  const articles = getArticles();
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  // Fetch company logo
  useEffect(() => {
    if (!user?.company_id) return;
    (supabase.from as any)('companies')
      .select('logo_url')
      .eq('id', user.company_id)
      .single()
      .then(({ data }: any) => {
        if (data?.logo_url) setCompanyLogoUrl(data.logo_url);
      });
  }, [user?.company_id]);


        {/* EXPORTAR RELATÓRIOS */}
        <TabsContent value="exportar" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4 text-muted-foreground" />
                Exportar Relatórios
              </CardTitle>
              <CardDescription>Exporte relatórios detalhados em PDF com base nos filtros aplicados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Export toggles */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Modo:</Label>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                    <Button
                      size="sm"
                      variant={exportMode === 'admin' ? 'default' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setExportMode('admin')}
                    >
                      Admin
                    </Button>
                    <Button
                      size="sm"
                      variant={exportMode === 'employee' ? 'default' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setExportMode('employee')}
                    >
                      Equipe
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Label className="text-sm font-medium">Formato:</Label>
                  <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                    <Button
                      size="sm"
                      variant={exportFormat === 'pdf' ? 'default' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setExportFormat('pdf')}
                    >
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant={exportFormat === 'csv' ? 'default' : 'ghost'}
                      className="h-7 text-xs"
                      onClick={() => setExportFormat('csv')}
                    >
                      CSV
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    id="include-charts"
                    checked={includeCharts}
                    onCheckedChange={setIncludeCharts}
                    disabled={exportFormat === 'csv'}
                  />
                  <Label htmlFor="include-charts" className={cn("text-sm cursor-pointer", exportFormat === 'csv' && "text-muted-foreground/50")}>
                    Incluir gráficos {exportFormat === 'csv' && '(só PDF)'}
                  </Label>
                </div>
              </div>

              <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/50 border border-border">
                {exportMode === 'admin' ? (
                  <p>📊 <strong>Modo Admin:</strong> Inclui todos os dados financeiros (faturamento, valor por kg, receitas) além de rolos, peso e eficiência.</p>
                ) : (
                  <p>👷 <strong>Modo Equipe:</strong> Inclui apenas dados de produção (rolos, peso, eficiência). Dados financeiros são omitidos.</p>
                )}
              </div>

              {/* Export options */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">Exportação Geral</p>
                <ExportButton
                  label="Relatório Completo"
                  description={`${exportMode === 'admin' ? 'Todos os dados' : 'Dados de produção'} em ${exportFormat === 'pdf' ? 'PDF estilizado' : 'CSV'}`}
                  onClick={() => handleExport('completo', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-foreground mb-3">Exportação Específica</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <ExportButton
                    label="Por Artigo"
                    description="Rolos, Kg, Valor"
                    onClick={() => handleExport('artigo', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                  />
                  <ExportButton
                    label="Por Máquina"
                    description="Performance individual"
                    onClick={() => handleExport('maquina', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                  />
                  <ExportButton
                    label="Por Turno"
                    description="Análise comparativa"
                    onClick={() => handleExport('turno', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                  />
                  <ExportButton
                    label="Por Cliente"
                    description="Produção por cliente"
                    onClick={() => handleExport('cliente', exportMode, includeCharts, exportFormat, filtered, byShift, byMachine, byClient, periodLabel, companyLogoUrl)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {productions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Registre produções para ver os relatórios detalhados</p>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function KpiCard({ label, value, subtitle, icon, borderColor, extra }: {
  label: string; value: string; subtitle?: string; icon: React.ReactNode; borderColor: string; extra?: React.ReactNode;
}) {
  return (
    <Card className={cn("border-l-4", borderColor)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-display font-bold text-foreground">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {extra}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function ExportButton({ label, description, onClick }: {
  label: string; description: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-lg border border-border hover:bg-muted/50 hover:border-primary/30 transition-all cursor-pointer group"
    >
      <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
    </button>
  );
}

// --- Export handler (generates CSV for now) ---

function handleExport(
  type: string,
  mode: 'admin' | 'employee',
  _includeCharts: boolean,
  exportFormat: 'pdf' | 'csv',
  filtered: any[],
  byShift: any[],
  byMachine: any[],
  byClient: any[],
  periodLabel: string,
  logoUrl?: string | null,
) {
  const isAdmin = mode === 'admin';

  const fmtN = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtK = (v: number) => fmtN(v, 2);
  const fmtR = (v: number) => `R$ ${fmtN(v, 2)}`;

  // Build table data
  const sections: { title: string; headers: string[]; rows: (string | number)[][] }[] = [];

  if (type === 'completo' || type === 'turno') {
    const headers = isAdmin ? ['Turno', 'Rolos', 'Peso (kg)', 'Faturamento'] : ['Turno', 'Rolos', 'Peso (kg)'];
    const rows = byShift.map(s => isAdmin ? [s.name, fmtN(s.rolos), fmtK(s.kg), fmtR(s.faturamento)] : [s.name, fmtN(s.rolos), fmtK(s.kg)]);
    const tR = byShift.reduce((a, s) => a + s.rolos, 0), tK = byShift.reduce((a, s) => a + s.kg, 0), tF = byShift.reduce((a, s) => a + s.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK)]);
    sections.push({ title: 'Por Turno', headers, rows });
  }

  if (type === 'completo' || type === 'maquina') {
    const headers = isAdmin ? ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)', 'Faturamento'] : ['Máquina', 'Rolos', 'Peso (kg)', 'Eficiência (%)'];
    const rows = byMachine.map(m => isAdmin ? [m.name, fmtN(m.rolos), fmtK(m.kg), fmtN(m.eficiencia, 1), fmtR(m.faturamento)] : [m.name, fmtN(m.rolos), fmtK(m.kg), fmtN(m.eficiencia, 1)]);
    const tR = byMachine.reduce((a, m) => a + m.rolos, 0), tK = byMachine.reduce((a, m) => a + m.kg, 0);
    const avgE = byMachine.length ? byMachine.reduce((a, m) => a + m.eficiencia, 0) / byMachine.length : 0;
    const tF = byMachine.reduce((a, m) => a + m.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtN(avgE, 1), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK), fmtN(avgE, 1)]);
    sections.push({ title: 'Por Máquina', headers, rows });
  }

  if (type === 'completo' || type === 'cliente') {
    const headers = isAdmin ? ['Cliente', 'Rolos', 'Peso (kg)', 'Faturamento'] : ['Cliente', 'Rolos', 'Peso (kg)'];
    const rows = byClient.map(c => isAdmin ? [c.name, fmtN(c.rolos), fmtK(c.kg), fmtR(c.faturamento)] : [c.name, fmtN(c.rolos), fmtK(c.kg)]);
    const tR = byClient.reduce((a, c) => a + c.rolos, 0), tK = byClient.reduce((a, c) => a + c.kg, 0), tF = byClient.reduce((a, c) => a + c.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK)]);
    sections.push({ title: 'Por Cliente', headers, rows });
  }

  if (type === 'completo' || type === 'artigo') {
    const articleMap: Record<string, { name: string; rolos: number; kg: number; faturamento: number }> = {};
    filtered.forEach(p => {
      const key = p.article_id || 'sem-artigo';
      if (!articleMap[key]) articleMap[key] = { name: p.article_name || 'Sem artigo', rolos: 0, kg: 0, faturamento: 0 };
      articleMap[key].rolos += p.rolls_produced;
      articleMap[key].kg += p.weight_kg;
      articleMap[key].faturamento += p.revenue;
    });
    const headers = isAdmin ? ['Artigo', 'Rolos', 'Peso (kg)', 'Faturamento'] : ['Artigo', 'Rolos', 'Peso (kg)'];
    const artVals = Object.values(articleMap).sort((a, b) => b.rolos - a.rolos);
    const rows = artVals.map(a => isAdmin ? [a.name, fmtN(a.rolos), fmtK(a.kg), fmtR(a.faturamento)] : [a.name, fmtN(a.rolos), fmtK(a.kg)]);
    const tR = artVals.reduce((ac, a) => ac + a.rolos, 0), tK = artVals.reduce((ac, a) => ac + a.kg, 0), tF = artVals.reduce((ac, a) => ac + a.faturamento, 0);
    rows.push(isAdmin ? ['TOTAL', fmtN(tR), fmtK(tK), fmtR(tF)] : ['TOTAL', fmtN(tR), fmtK(tK)]);
    sections.push({ title: 'Por Artigo', headers, rows });
  }

  if (exportFormat === 'csv') {
    let csvContent = '';
    const BOM = '\uFEFF';
    const addLine = (values: (string | number)[]) => { csvContent += values.map(v => `"${v}"`).join(';') + '\n'; };
    sections.forEach(sec => {
      addLine([sec.title]);
      addLine(sec.headers);
      sec.rows.forEach(r => addLine(r));
      csvContent += '\n';
    });
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-${type}-${mode}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    // PDF via styled print window
    const modeLabel = mode === 'admin' ? 'Administrador' : 'Equipe';
    const date = new Date().toLocaleDateString('pt-BR');

    // Generate SVG bar chart HTML for a section
    const buildChart = (data: { label: string; value: number }[], color: string, unit: string) => {
      if (data.length === 0) return '';
      const maxVal = Math.max(...data.map(d => d.value), 1);
      const barH = 28;
      const gap = 6;
      const chartH = data.length * (barH + gap) + 10;
      const labelW = 120;
      const chartW = 500;
      const bars = data.map((d, i) => {
        const w = Math.max((d.value / maxVal) * (chartW - labelW - 60), 2);
        const y = i * (barH + gap) + 5;
        const valLabel = unit === 'R$' ? `R$ ${fmtN(d.value, 2)}` : fmtN(d.value, unit === '%' ? 1 : 0) + (unit === '%' ? '%' : unit === 'kg' ? ' kg' : '');
        return `
          <g>
            <text x="${labelW - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="11" fill="#475569">${d.label}</text>
            <rect x="${labelW}" y="${y}" width="${w}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
            <text x="${labelW + w + 6}" y="${y + barH / 2 + 4}" font-size="11" fill="#1e293b" font-weight="500">${valLabel}</text>
          </g>`;
      }).join('');
      return `<svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg" style="margin:12px 0 8px 0;">${bars}</svg>`;
    };

    let tablesHtml = sections.map(sec => {
      let chartHtml = '';
      if (_includeCharts) {
        // Determine chart data based on section title
        if (sec.title === 'Por Turno') {
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Eficiência por Turno (%)</p>';
          chartHtml += buildChart(byShift.map(s => ({ label: s.name, value: s.eficiencia })), '#f59e0b', '%');
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Rolos por Turno</p>';
          chartHtml += buildChart(byShift.map(s => ({ label: s.name, value: s.rolos })), '#2563eb', '');
          if (isAdmin) {
            chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Faturamento por Turno</p>';
            chartHtml += buildChart(byShift.map(s => ({ label: s.name, value: s.faturamento })), '#16a34a', 'R$');
          }
        } else if (sec.title === 'Por Máquina') {
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Eficiência por Máquina (%)</p>';
          chartHtml += buildChart(byMachine.slice(0, 10).map(m => ({ label: m.name, value: m.eficiencia })), '#f59e0b', '%');
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Rolos por Máquina</p>';
          chartHtml += buildChart(byMachine.slice(0, 10).map(m => ({ label: m.name, value: m.rolos })), '#2563eb', '');
        } else if (sec.title === 'Por Cliente') {
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Peso por Cliente (kg)</p>';
          chartHtml += buildChart(byClient.slice(0, 8).map(c => ({ label: c.name, value: c.kg })), '#8b5cf6', 'kg');
          if (isAdmin) {
            chartHtml += '<p style="font-size:12px;color:#64748b;margin:12px 0 2px;">Faturamento por Cliente</p>';
            chartHtml += buildChart(byClient.slice(0, 8).map(c => ({ label: c.name, value: c.faturamento })), '#16a34a', 'R$');
          }
        } else if (sec.title === 'Por Artigo') {
          const articleRows = sec.rows.slice(0, 10);
          chartHtml += '<p style="font-size:12px;color:#64748b;margin:8px 0 2px;">Rolos por Artigo</p>';
          chartHtml += buildChart(articleRows.map(r => ({ label: String(r[0]), value: parseFloat(String(r[1]).replace(/\./g, '').replace(',', '.')) || 0 })), '#0ea5e9', '');
        }
      }

      return `
        <div class="section">
          <h2>${sec.title}</h2>
          ${chartHtml}
          <table>
            <thead><tr>${sec.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
            <tbody>${sec.rows.map((r, ri) => `<tr class="${ri === sec.rows.length - 1 ? 'total-row' : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório</title>
    <style>
      @page { margin: 15mm 20mm; size: A4; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; padding: 0; }
      .header { background: linear-gradient(135deg, #1e3a5f, #2563eb); color: #fff; padding: 20px 24px; margin-bottom: 16px; display: flex; align-items: center; gap: 16px; }
      .header-logo { height: 48px; width: 48px; border-radius: 8px; object-fit: contain; background: rgba(255,255,255,0.15); padding: 4px; }
      .header-text h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
      .header .meta { font-size: 12px; opacity: 0.85; display: flex; gap: 16px; }
      .section { margin-bottom: 28px; }
      .section h2 { font-size: 15px; font-weight: 600; color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
      td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; }
      tr:nth-child(even) td { background: #fafbfc; }
      tr:hover td { background: #f0f4ff; }
      .total-row td { background: #e2e8f0 !important; font-weight: 700; border-top: 2px solid #94a3b8; }
      svg { display: block; }
      .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #94a3b8; text-align: center; }
    </style></head><body>
      <div class="header">
        ${logoUrl ? `<img src="${logoUrl}" class="header-logo" />` : ''}
        <div class="header-text">
          <h1>Relatório de Produção</h1>
          <div class="meta">
            <span>Período: ${periodLabel}</span>
            <span>Modo: ${modeLabel}</span>
            <span>Gerado em: ${date}</span>
          </div>
        </div>
      </div>
      ${tablesHtml}
      <div class="footer">Relatório gerado automaticamente pelo sistema MalhaGest · ${date}</div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 400);
    }
  }
}

function handleOutsourceExport(
  totals: { totalWeight: number; totalRolls: number; totalRevenue: number; totalCost: number; totalProfit: number; byCompany: any[]; byArticle: any[] },
  periodLabel: string,
  logoUrl?: string | null,
  canSeeFinancial = true,
) {
  const fmtN = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtK = (v: number) => fmtN(v, 2);
  const fmtR = (v: number) => `R$ ${fmtN(v, 2)}`;
  const date = new Date().toLocaleDateString('pt-BR');

  const companyHeaders = canSeeFinancial
    ? ['Malharia', 'Rolos', 'Peso (kg)', 'Receita', 'Custo', 'Lucro']
    : ['Malharia', 'Rolos', 'Peso (kg)'];
  const companyRows = totals.byCompany.map(c => canSeeFinancial
    ? [c.name, fmtN(c.rolls), fmtK(c.kg), fmtR(c.revenue), fmtR(c.cost), fmtR(c.profit)]
    : [c.name, fmtN(c.rolls), fmtK(c.kg)]);
  const companyTotal = canSeeFinancial
    ? ['TOTAL', fmtN(totals.totalRolls), fmtK(totals.totalWeight), fmtR(totals.totalRevenue), fmtR(totals.totalCost), fmtR(totals.totalProfit)]
    : ['TOTAL', fmtN(totals.totalRolls), fmtK(totals.totalWeight)];
  companyRows.push(companyTotal);

  const articleHeaders = canSeeFinancial
    ? ['Artigo', 'Cliente', 'Rolos', 'Peso (kg)', 'Receita', 'Custo', 'Lucro']
    : ['Artigo', 'Cliente', 'Rolos', 'Peso (kg)'];
  const articleRows = totals.byArticle.map(a => canSeeFinancial
    ? [a.name, a.client, fmtN(a.rolls), fmtK(a.kg), fmtR(a.revenue), fmtR(a.cost), fmtR(a.profit)]
    : [a.name, a.client, fmtN(a.rolls), fmtK(a.kg)]);

  const buildTable = (headers: string[], rows: (string | number)[][]) => `
    <table>
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, ri) => `<tr class="${ri === rows.length - 1 && r[0] === 'TOTAL' ? 'total-row' : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório Terceirizado</title>
  <style>
    @page { margin: 15mm 20mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; }
    .header { background: linear-gradient(135deg, #1e3a5f, #2563eb); color: #fff; padding: 20px 24px; margin-bottom: 16px; display: flex; align-items: center; gap: 16px; }
    .header-logo { height: 48px; width: 48px; border-radius: 8px; object-fit: contain; background: rgba(255,255,255,0.15); padding: 4px; }
    .header-text h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .header .meta { font-size: 12px; opacity: 0.85; display: flex; gap: 16px; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 15px; font-weight: 600; color: #2563eb; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
    .kpis { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .kpi { flex: 1; min-width: 140px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; }
    .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
    .kpi-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
    .profit { color: #16a34a; }
    .loss { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) td { background: #fafbfc; }
    .total-row td { background: #e2e8f0 !important; font-weight: 700; border-top: 2px solid #94a3b8; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #94a3b8; text-align: center; }
  </style></head><body>
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" class="header-logo" />` : ''}
      <div class="header-text">
        <h1>Relatório de Terceirizado</h1>
        <div class="meta">
          <span>Período: ${periodLabel}</span>
          <span>Gerado em: ${date}</span>
        </div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Rolos</div><div class="kpi-value">${fmtN(totals.totalRolls)}</div></div>
      <div class="kpi"><div class="kpi-label">Peso Total</div><div class="kpi-value">${fmtK(totals.totalWeight)} kg</div></div>
      ${canSeeFinancial ? `
        <div class="kpi"><div class="kpi-label">Receita</div><div class="kpi-value">${fmtR(totals.totalRevenue)}</div></div>
        <div class="kpi"><div class="kpi-label">Custo</div><div class="kpi-value">${fmtR(totals.totalCost)}</div></div>
        <div class="kpi"><div class="kpi-label">Lucro</div><div class="kpi-value ${totals.totalProfit >= 0 ? 'profit' : 'loss'}">${fmtR(totals.totalProfit)}</div></div>
      ` : ''}
    </div>
    <div class="section">
      <h2>Por Malharia</h2>
      ${buildTable(companyHeaders, companyRows)}
    </div>
    ${articleRows.length > 0 ? `
      <div class="section">
        <h2>Por Artigo</h2>
        ${buildTable(articleHeaders, articleRows)}
      </div>
    ` : ''}
    <div class="footer">Relatório gerado automaticamente pelo sistema MalhaGest · ${date}</div>
  </body></html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
