import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { sanitizePdfText } from './pdfUtils';
import type { FreightOrder } from '@/hooks/useFreightOrders';

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtNumberBR(n: number, dec = 2): string {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function duration(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso || !toIso) return '—';
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`;
}

async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateFreightOrderPdf(order: FreightOrder, companyName: string, companyLogoUrl?: string | null) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  let y = 12;

  // Header
  if (companyLogoUrl) {
    const logo = await fetchImageDataUrl(companyLogoUrl);
    if (logo) {
      const fmt = logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      try { pdf.addImage(logo, fmt as any, 12, y, 22, 14); } catch { /* ignore */ }
    }
  }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
  pdf.text(sanitizePdfText(companyName), pageW / 2, y + 6, { align: 'center' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
  pdf.text(`Emitido em ${fmtDateTime(new Date().toISOString())}`, pageW / 2, y + 11, { align: 'center' });
  y += 20;
  pdf.setDrawColor(200); pdf.line(12, y, pageW - 12, y); y += 6;

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
  pdf.text(sanitizePdfText(`RELATÓRIO DE ORDEM DE FRETE — OFR #${order.ofr_number}`), pageW / 2, y, { align: 'center' });
  y += 8;

  // Dados gerais
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
  const rows: [string, string][] = [
    ['Freteiro', sanitizePdfText(order.freighter?.name || '—')],
    ['Veículo', sanitizePdfText(order.freighter?.vehicle || '—')],
    ['Telefone', sanitizePdfText(order.freighter?.phone || '—')],
    ['Local de coleta', sanitizePdfText(order.pickup_location)],
    ['Local de entrega', sanitizePdfText(order.delivery_location)],
    ['Observações', sanitizePdfText(order.observations || '—')],
  ];
  autoTable(pdf, {
    startY: y,
    theme: 'plain',
    body: rows,
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
    margin: { left: 12, right: 12 },
  });
  y = (pdf as any).lastAutoTable.finalY + 4;

  // Itens
  const totalPieces = (order.items || []).reduce((s, i) => s + Number(i.pieces || 0), 0);
  const totalKg = (order.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
  autoTable(pdf, {
    startY: y,
    head: [['Artigo', 'Peças', 'Peso (kg)']],
    body: (order.items || []).map(i => [
      sanitizePdfText(i.article?.name || i.article_name || '—'),
      String(i.pieces || 0),
      fmtNumberBR(Number(i.weight_kg || 0)),
    ]),
    foot: [['TOTAL', String(totalPieces), fmtNumberBR(totalKg)]],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: 'bold' },
    styles: { fontSize: 9 },
    margin: { left: 12, right: 12 },
  });
  y = (pdf as any).lastAutoTable.finalY + 4;

  // Linha do tempo
  autoTable(pdf, {
    startY: y,
    head: [['Etapa', 'Início', 'Fim', 'Duração']],
    body: [
      ['Aberto (criação)', fmtDateTime(order.created_at), fmtDateTime(order.pickup_started_at), duration(order.created_at, order.pickup_started_at)],
      ['Coleta em curso', fmtDateTime(order.pickup_started_at), fmtDateTime(order.delivery_started_at), duration(order.pickup_started_at, order.delivery_started_at)],
      ['Entrega em curso', fmtDateTime(order.delivery_started_at), fmtDateTime(order.completed_at), duration(order.delivery_started_at, order.completed_at)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [15, 118, 110] },
    styles: { fontSize: 9 },
    margin: { left: 12, right: 12 },
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  // Fotos
  if ((order.photos || []).length > 0) {
    if (y > pageH - 90) { pdf.addPage(); y = 15; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
    pdf.text('Fotos da entrega', 12, y); y += 4;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    const photoW = 80, photoH = 60, gap = 8;
    let x = 12;
    for (const p of order.photos || []) {
      const { data } = await supabase.storage.from('freight-photos').createSignedUrl(p.storage_path, 300);
      if (!data?.signedUrl) continue;
      const dataUrl = await fetchImageDataUrl(data.signedUrl);
      if (!dataUrl) continue;
      const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      try { pdf.addImage(dataUrl, fmt as any, x, y, photoW, photoH); } catch { /* ignore */ }
      if (p.description) pdf.text(sanitizePdfText(p.description).slice(0, 60), x, y + photoH + 4);
      x += photoW + gap;
      if (x + photoW > pageW - 12) { x = 12; y += photoH + 12; }
    }
    y += photoH + 12;
  }

  // Rodapé auditoria
  if (y > pageH - 22) { pdf.addPage(); y = 15; }
  pdf.setDrawColor(220); pdf.line(12, y, pageW - 12, y); y += 5;
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(90);
  const created = order.creator ? `${sanitizePdfText(order.creator.name)} #${order.creator.code}` : '—';
  const completedBy = order.completer ? `${sanitizePdfText(order.completer.name)} #${order.completer.code}` : '—';
  pdf.text(`Criada por: ${created} em ${fmtDateTime(order.created_at)}`, 12, y); y += 4;
  pdf.text(`Finalizada por: ${completedBy} em ${fmtDateTime(order.completed_at)}`, 12, y);

  pdf.save(`OFR-${order.ofr_number}.pdf`);
}