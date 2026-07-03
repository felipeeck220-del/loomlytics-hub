import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { sanitizePdfText } from '@/lib/pdfUtils';
import { loadLogoForPdf } from '@/lib/clientInvoicePdf';
import { supabase } from '@/integrations/supabase/client';

type Yarn = {
  feeder_type: 'fio' | 'elastano';
  feeder_position: number;
  yarn_type_id: string | null;
  lfa: number | null;
  stretch: number | null;
  observation: string | null;
};

type OT = {
  id: string;
  ot_number: number;
  machine_id: string;
  current_article_id: string | null;
  next_article_id: string | null;
  status: string;
  observations: string | null;
  yarn_change_started_at: string | null;
  yarn_change_ended_at: string | null;
  adjustment_started_at: string | null;
  adjustment_ended_at: string | null;
  monitoring_started_at: string | null;
  concluded_at: string | null;
  cancelled_at: string | null;
  created_by_name: string | null;
  yarn_change_by_name: string | null;
  yarn_change_finished_by_name: string | null;
  adjustment_by_name: string | null;
  adjustment_finished_by_name: string | null;
  concluded_by_name: string | null;
  cancelled_by_name: string | null;
  monitoring_turns: number | null;
  piece_defects_holes: number | null;
  piece_defects_flaws: number | null;
  final_report: string | null;
  created_at: string;
  yarns?: Yarn[];
};

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

function diffSec(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 1000));
}

export interface GenerateOtReportOptions {
  order: OT;
  machineName: string;
  currentArticleName: string;
  nextArticleName: string;
  yarnName: (id: string | null) => string;
  companyId: string;
  authorLabel?: string | null;
}

export async function generateOtReportPdf(opts: GenerateOtReportOptions) {
  const { order: o, machineName, currentArticleName, nextArticleName, yarnName, companyId, authorLabel } = opts;

  const { data: company } = await (supabase.from as any)('companies')
    .select('name, logo_url').eq('id', companyId).maybeSingle();
  const logo = await loadLogoForPdf(company?.logo_url || null);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const colors = {
    grayBg: [249, 250, 251] as [number, number, number],
    border: [229, 231, 235] as [number, number, number],
    textDark: [17, 24, 39] as [number, number, number],
    textMid: [75, 85, 99] as [number, number, number],
  };
  const fitBox = (w: number, h: number, mw: number, mh: number) => {
    if (!w || !h) return { width: mw, height: mh };
    const s = Math.min(mw / w, mh / h);
    return { width: w * s, height: h * s };
  };

  const dateStr = new Date().toLocaleString('pt-BR');
  const otNumStr = String(o.ot_number).padStart(3, '0');
  const reportTitle = `RELATÓRIO DE ORDEM DE TROCA DE ARTIGO — OT #${otNumStr}`;
  const cName = company?.name || '';
  const headerH = 25;
  const leftX = margin + 5;
  const rightX = pageW - margin - 5;
  const titleMaxWidth = pageW - 2 * margin - 90;

  pdf.setFillColor(...colors.grayBg);
  pdf.rect(margin, y, pageW - 2 * margin, headerH, 'F');
  pdf.setDrawColor(...colors.border);
  pdf.setLineWidth(0.5);
  pdf.rect(margin, y, pageW - 2 * margin, headerH, 'S');

  if (logo) {
    try {
      const ls = fitBox(logo.width, logo.height, 24, 14);
      pdf.addImage(logo.data, 'PNG', leftX, y + 2.5, ls.width, ls.height);
    } catch { /* ignore */ }
  } else if (cName) {
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...colors.textDark);
    pdf.text(sanitizePdfText(cName), leftX, y + 10);
  }
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.textMid);
  pdf.text(dateStr, leftX, y + 22);

  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.textDark);
  const titleLines = pdf.splitTextToSize(sanitizePdfText(reportTitle), titleMaxWidth) as string[];
  let titleY = y + 10;
  titleLines.forEach(line => {
    const tw = pdf.getTextWidth(line);
    pdf.text(line, (pageW - tw) / 2, titleY);
    titleY += 6;
  });

  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.textMid);
  const statusText = `Status: ${o.status.toUpperCase()}`;
  const pW = pdf.getTextWidth(statusText);
  pdf.text(statusText, rightX - pW, y + 22);

  y += headerH + 8;
  pdf.setTextColor(...colors.textDark);

  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(`Troca de Artigo   ·   ${machineName}`), margin, y);
  y += 6;

  // Artigo atual -> próximo
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
  pdf.text('Artigo', margin, y); y += 2;
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 }, 2: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 } },
    body: [
      ['Artigo atual', sanitizePdfText(currentArticleName), 'Próximo artigo', sanitizePdfText(nextArticleName)],
    ],
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Fitas
  if (o.yarns && o.yarns.length > 0) {
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
    pdf.text('Fitas configuradas', margin, y); y += 2;
    autoTable(pdf, {
      startY: y,
      head: [['Posição', 'Tipo de fio', 'LFA', 'Estiragem', 'Observação']],
      body: o.yarns.map(fy => [
        fy.feeder_type === 'elastano' ? 'ELASTANO' : `FITA ${fy.feeder_position}`,
        sanitizePdfText(yarnName(fy.yarn_type_id) || '—'),
        fy.lfa != null ? String(fy.lfa) : '—',
        fy.stretch != null ? String(fy.stretch) : '—',
        sanitizePdfText(fy.observation || '—'),
      ]),
      theme: 'striped',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [245, 158, 11], textColor: 255 },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  // Etapas / tempos
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
  pdf.text('Etapas e tempos', margin, y); y += 2;
  const renderAuthor = (n?: string | null) => n || '—';
  autoTable(pdf, {
    startY: y,
    head: [['Etapa', 'Início', 'Fim', 'Duração', 'Responsável']],
    body: [
      [
        'Troca de fio',
        o.yarn_change_started_at ? format(new Date(o.yarn_change_started_at), 'dd/MM/yyyy HH:mm') : '—',
        o.yarn_change_ended_at ? format(new Date(o.yarn_change_ended_at), 'dd/MM/yyyy HH:mm') : '—',
        fmtDuration(diffSec(o.yarn_change_started_at, o.yarn_change_ended_at)),
        sanitizePdfText(renderAuthor(o.yarn_change_finished_by_name || o.yarn_change_by_name)),
      ],
      [
        'Regulagem',
        o.adjustment_started_at ? format(new Date(o.adjustment_started_at), 'dd/MM/yyyy HH:mm') : '—',
        o.adjustment_ended_at ? format(new Date(o.adjustment_ended_at), 'dd/MM/yyyy HH:mm') : '—',
        fmtDuration(diffSec(o.adjustment_started_at, o.adjustment_ended_at)),
        sanitizePdfText(renderAuthor(o.adjustment_finished_by_name || o.adjustment_by_name)),
      ],
      [
        'Acompanhamento',
        o.monitoring_started_at ? format(new Date(o.monitoring_started_at), 'dd/MM/yyyy HH:mm') : '—',
        o.concluded_at ? format(new Date(o.concluded_at), 'dd/MM/yyyy HH:mm') : '—',
        fmtDuration(diffSec(o.monitoring_started_at, o.concluded_at)),
        sanitizePdfText(renderAuthor(o.concluded_by_name)),
      ],
    ],
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Autoria + criação
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 }, 2: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 } },
    body: [
      ['Criada por', sanitizePdfText(renderAuthor(o.created_by_name)), 'Criada em', format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')],
      ['Concluída por', sanitizePdfText(renderAuthor(o.concluded_by_name)), 'Concluída em', o.concluded_at ? format(new Date(o.concluded_at), 'dd/MM/yyyy HH:mm') : '—'],
      ['Voltas acompanhadas', String(o.monitoring_turns ?? '—'), 'Peça (furos / falhas)', `${o.piece_defects_holes ?? 0} / ${o.piece_defects_flaws ?? 0}`],
    ],
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Observações
  if (o.observations) {
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
    pdf.text('Observações', margin, y); y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    const t = pdf.splitTextToSize(sanitizePdfText(o.observations), pageW - margin * 2);
    pdf.text(t, margin, y); y += t.length * 5 + 4;
  }

  // Relatório final
  if (o.final_report) {
    if (y > pageH - 40) { pdf.addPage(); y = margin; }
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
    pdf.text('Relatório final', margin, y); y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    const t = pdf.splitTextToSize(sanitizePdfText(o.final_report), pageW - margin * 2);
    pdf.text(t, margin, y);
  }

  pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
  pdf.text(
    sanitizePdfText(`Relatório gerado por ${authorLabel || '—'} em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`),
    margin, pageH - 6,
  );

  pdf.save(`OT-${otNumStr}-${(machineName || 'maquina').replace(/\s+/g, '_')}.pdf`);
}