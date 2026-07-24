import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { sanitizePdfText } from '@/lib/pdfUtils';
import { loadLogoForPdf } from '@/lib/clientInvoicePdf';
import { supabase } from '@/integrations/supabase/client';
import { MACHINE_STATUS_LABELS } from '@/types/machine';
import type {
  Machine, MaintenanceOrder, MaintenanceOrderItem, MaintenanceOrderType,
  NeedleInventory, SinkerInventory, Cylinder,
} from '@/types';

type ProgressNote = {
  id: string; ts: string; author: string | null;
  kind: 'observacao' | 'item'; text: string;
};

const TYPE_LABELS: Record<MaintenanceOrderType, string> = {
  manutencao_preventiva: 'Manutenção Preventiva',
  manutencao_corretiva: 'Manutenção Corretiva',
  manutencao_eletrica: 'Manutenção Elétrica',
  troca_artigo: 'Troca de Artigo',
  troca_agulhas: 'Troca de Agulheiro',
};

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

export interface GenerateOmReportOptions {
  order: MaintenanceOrder;
  items: MaintenanceOrderItem[];
  machine?: Machine | null;
  needles: NeedleInventory[];
  sinkers: SinkerInventory[];
  cylinders: Cylinder[];
  companyId: string;
  authorLabel?: string | null;
  renderAuthor?: (name?: string | null, userId?: string | null) => string;
}

export async function generateOmReportPdf(opts: GenerateOmReportOptions) {
  const {
    order: o, items: its, machine, needles, sinkers, cylinders,
    companyId, authorLabel,
  } = opts;
  const renderAuthor = opts.renderAuthor ?? ((name?: string | null) => (name || '—'));

  const [{ data: company }, needleRefsRes, sinkerRefsRes, articleRes] = await Promise.all([
    (supabase.from as any)('companies').select('name, logo_url').eq('id', companyId).maybeSingle(),
    (supabase.from as any)('machine_needle_refs').select('needle_id, position').eq('machine_id', o.machine_id),
    (supabase.from as any)('machine_sinker_refs').select('sinker_id').eq('machine_id', o.machine_id),
    machine?.article_id
      ? (supabase.from as any)('articles').select('name, clients(name)').eq('id', machine.article_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const logo = await loadLogoForPdf(company?.logo_url || null);
  const cyl = machine?.cylinder_id ? cylinders.find(c => c.id === machine.cylinder_id) : null;
  const usedNeedles = ((needleRefsRes?.data as any[]) || []).map(r => {
    const n = needles.find(x => x.id === r.needle_id);
    return n ? `${n.brand} ${n.reference_code}${r.position ? ` (${r.position})` : ''}` : '';
  }).filter(Boolean);
  const usedSinkers = ((sinkerRefsRes?.data as any[]) || []).map(r => {
    const s = sinkers.find(x => x.id === r.sinker_id);
    return s ? `${s.brand} ${s.reference_code}` : '';
  }).filter(Boolean);
  const articleLabel = (articleRes as any)?.data
    ? `${(articleRes as any).data.name}${(articleRes as any).data.clients?.name ? ` (${(articleRes as any).data.clients.name})` : ''}`
    : '—';

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
  const isCorrective = (o as any).type === 'manutencao_corretiva';
  const orderLabel = isCorrective ? 'OC' : 'OM';
  const orderTitleLong = isCorrective ? 'ORDEM DE CORRETIVA' : 'ORDEM DE MANUTENÇÃO';
  const orderNumRaw = isCorrective ? ((o as any).oc_number ?? (o as any).om_number) : (o as any).om_number;
  const orderNumStr = orderNumRaw != null ? String(orderNumRaw).padStart(3, '0') : '—';
  const reportTitle = `RELATÓRIO DE ${orderTitleLong} — ${orderLabel} #${orderNumStr}`;
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

  pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
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
  const periodText = `Status: ${(o.status || '').toUpperCase()}`;
  const pW = pdf.getTextWidth(periodText);
  pdf.text(periodText, rightX - pW, y + 22);

  y += headerH + 8;
  pdf.setTextColor(...colors.textDark);

  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
  pdf.text(sanitizePdfText(`${TYPE_LABELS[o.type]}   ·   ${machine?.name || 'Máquina'}`), margin, y);
  y += 5;
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...colors.textMid);
  pdf.text(sanitizePdfText(`Prioridade: ${o.priority === 'prioritaria' ? 'Prioritária' : 'Normal'}`), margin, y);
  y += 6;
  pdf.setTextColor(...colors.textDark);

  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
  pdf.text('Dados da Máquina', margin, y); y += 2;
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 }, 2: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 } },
    body: [
      ['Máquina', sanitizePdfText(machine?.name || '—'), 'Nº', String(machine?.number ?? '—')],
      ['Tipo de Máquina', machine?.machine_type === 'dupla' ? 'Dupla' : (machine?.machine_type === 'mono' ? 'Mono' : '—'), 'Modelo', sanitizePdfText(machine?.model || '—')],
      ['Marca (Cilindro)', sanitizePdfText(cyl?.brand || '—'), 'Modelo (Cilindro)', sanitizePdfText(cyl?.model || '—')],
      ['Diâmetro', cyl?.diameter ? sanitizePdfText(`${cyl.diameter}"`) : '', 'Finura', cyl?.fineness ? sanitizePdfText(cyl.fineness) : ''],
      ['Qtd. Agulhas', String(cyl?.needle_quantity ?? machine?.needle_quantity ?? '—'), 'Alimentadores', String(cyl?.feeder_quantity ?? machine?.feeder_quantity ?? '—')],
      ['Nº de Série', sanitizePdfText(machine?.serial_number || '—'), 'Ano', String(machine?.year || '—')],
      ['RPM Alvo', String(machine?.rpm ?? '—'), 'Modo de Produção', machine?.production_mode === 'iot' ? 'IoT (Automático)' : (machine?.production_mode === 'voltas' ? 'Voltas' : 'Rolos')],
      ['Status Atual', sanitizePdfText(machine ? MACHINE_STATUS_LABELS[machine.status] : '—'), 'Artigo Atual', sanitizePdfText(articleLabel)],
      ['Ref. Agulhas em Uso', sanitizePdfText(usedNeedles.join(' · ') || '—'), 'Ref. Platinas em Uso', sanitizePdfText(usedSinkers.join(' · ') || '—')],
      ['Última Troca Agulha', machine?.last_needle_change_at ? format(new Date(machine.last_needle_change_at), 'dd/MM/yyyy') : '—', 'Última Troca Platina', machine?.last_sinker_change_at ? format(new Date(machine.last_sinker_change_at), 'dd/MM/yyyy') : '—'],
      ['Intervalo Manut. (dias)', String(machine?.maintenance_interval_days ?? '—'), 'Meta Manut. (kg)', String(machine?.maintenance_kg_target ?? '—')],
    ],
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...colors.textDark);
  pdf.text('Dados da Ordem', margin, y); y += 2;
  autoTable(pdf, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 }, 2: { fontStyle: 'bold', fillColor: [249, 250, 251], cellWidth: 42 } },
    body: [
      ['Criada por', sanitizePdfText(renderAuthor(o.created_by_name, o.created_by_id)), 'Criada em', format(new Date(o.created_at), 'dd/MM/yyyy HH:mm')],
      ['Iniciada por', sanitizePdfText(renderAuthor(o.started_by_name, o.started_by_id)), 'Início', o.started_at ? format(new Date(o.started_at), 'dd/MM/yyyy HH:mm') : '—'],
      ['Finalizada por', sanitizePdfText(renderAuthor(o.finished_by_name, o.finished_by_id)), 'Fim', o.finished_at ? format(new Date(o.finished_at), 'dd/MM/yyyy HH:mm') : '—'],
      ['Duração total', fmtDuration(o.duration_seconds || 0), 'Itens trocados', String(its.length)],
    ],
  });
  y = (pdf as any).lastAutoTable.finalY + 6;

  if (o.description) {
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
    pdf.text('Descrição / Serviço', margin, y); y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    const desc = pdf.splitTextToSize(sanitizePdfText(o.description), pageW - margin * 2);
    pdf.text(desc, margin, y); y += desc.length * 5 + 4;
  }

  if (its.length > 0) {
    autoTable(pdf, {
      startY: y,
      head: [['Tipo', 'Referência', 'Qtd']],
      body: its.map(it => {
        const ref = it.needle_id ? `Agulha ${needles.find(n => n.id === it.needle_id)?.reference_code || ''}` :
                    it.sinker_id ? `Platina ${sinkers.find(s => s.id === it.sinker_id)?.reference_code || ''}` :
                    it.cylinder_id ? `Cilindro ${cylinders.find(c => c.id === it.cylinder_id)?.brand || ''}` :
                    it.description || '—';
        return [it.item_type, sanitizePdfText(ref), String(it.quantity)];
      }),
      theme: 'striped',
      margin: { left: margin, right: margin },
      styles: { fontSize: 10, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  const notes = Array.isArray(o.progress_notes) ? o.progress_notes as ProgressNote[] : [];
  if (notes.length > 0) {
    autoTable(pdf, {
      startY: y,
      head: [['Data/Hora', 'Tipo', 'Autor', 'Descrição']],
      body: notes.map(n => [
        format(new Date(n.ts), 'dd/MM/yyyy HH:mm'),
        n.kind === 'item' ? 'Item' : 'Observação',
        sanitizePdfText(n.author || '—'),
        sanitizePdfText(n.text),
      ]),
      theme: 'striped',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: { 3: { cellWidth: 'auto' } },
    });
    y = (pdf as any).lastAutoTable.finalY + 6;
  }

  // ============ FOTOS (OC) + OBSERVAÇÕES FINAIS na MESMA página ============
  // Carrega fotos da OC (privadas via signed URL) e converte para dataURL
  type LoadedPhoto = { dataUrl: string; description: string; author: string | null; ts: string; w: number; h: number };
  const photos: LoadedPhoto[] = [];
  const rawPhotos = Array.isArray((o as any).oc_photos) ? ((o as any).oc_photos as Array<{ path: string; description: string; author: string | null; ts: string }>) : [];
  if (rawPhotos.length > 0) {
    for (const p of rawPhotos.slice(0, 2)) {
      try {
        const { data: signed } = await (supabase as any).storage.from('oc-photos').createSignedUrl(p.path, 300);
        const url = signed?.signedUrl;
        if (!url) continue;
        const res = await fetch(url);
        const blob = await res.blob();
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        const dims = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ w: 0, h: 0 });
          img.src = dataUrl;
        });
        photos.push({ dataUrl, description: p.description || '', author: p.author || null, ts: p.ts, w: dims.w, h: dims.h });
      } catch (e) { /* pula foto com erro */ }
    }
  }

  const hasPhotos = photos.length > 0;
  const hasFinishNotes = !!o.finish_notes;
  if (hasPhotos || hasFinishNotes) {
    // Reserva espaço: fotos ocupam ~70mm em bloco lado-a-lado; notas ocupam ~30mm.
    const photoBlockH = hasPhotos ? 75 : 0;
    const notesBlockH = hasFinishNotes ? 40 : 0;
    const titleH = 8;
    const needed = titleH + photoBlockH + notesBlockH + 10;
    if (y + needed > pageH - 15) {
      pdf.addPage();
      y = margin;
    }

    if (hasPhotos) {
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.textDark);
      pdf.text('Fotos do Problema (OC)', margin, y); y += 5;

      const usableW = pageW - margin * 2;
      const gap = 4;
      const cellW = photos.length > 1 ? (usableW - gap) / 2 : usableW * 0.55;
      const imgMaxH = 55;
      const descH = 15;
      photos.forEach((ph, idx) => {
        const x = margin + idx * (cellW + gap);
        const startY = y;
        // moldura
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.rect(x, startY, cellW, imgMaxH + descH, 'S');
        // imagem centralizada
        const box = fitBox(ph.w, ph.h, cellW - 4, imgMaxH - 4);
        try {
          const fmt = ph.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          pdf.addImage(ph.dataUrl, fmt, x + (cellW - box.width) / 2, startY + 2, box.width, box.height);
        } catch { /* ignore */ }
        // descrição
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
        pdf.setTextColor(...colors.textDark);
        const descLines = pdf.splitTextToSize(sanitizePdfText(ph.description || '—'), cellW - 4);
        const shown = (descLines as string[]).slice(0, 3);
        pdf.text(shown, x + 2, startY + imgMaxH + 4);
        pdf.setFontSize(7); pdf.setTextColor(...colors.textMid);
        const meta = `${format(new Date(ph.ts), 'dd/MM/yyyy HH:mm')}${ph.author ? ` · ${sanitizePdfText(ph.author)}` : ''}`;
        pdf.text(meta, x + 2, startY + imgMaxH + descH - 2);
      });
      y += photoBlockH;
    }

    if (hasFinishNotes) {
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colors.textDark);
      pdf.text('Observações Finais', margin, y); y += 5;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
      const t = pdf.splitTextToSize(sanitizePdfText(o.finish_notes!), pageW - margin * 2);
      pdf.text(t, margin, y);
    }
  }

  pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
  pdf.text(sanitizePdfText(`Relatório gerado por ${authorLabel || '—'} em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`), margin, pageH - 6);

  pdf.save(`${orderLabel}-${orderNumStr}-${(machine?.name || 'maquina').replace(/\s+/g, '_')}.pdf`);
}

export async function fetchLastFinalizedOmForMachine(
  companyId: string,
  machineId: string,
): Promise<{ order: MaintenanceOrder; items: MaintenanceOrderItem[] } | null> {
  const { data: order } = await (supabase.from as any)('maintenance_orders')
    .select('*')
    .eq('company_id', companyId)
    .eq('machine_id', machineId)
    .eq('status', 'finalizada')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order) return null;
  const { data: items } = await (supabase.from as any)('maintenance_order_items')
    .select('*')
    .eq('order_id', (order as any).id);
  return { order: order as MaintenanceOrder, items: (items as MaintenanceOrderItem[]) || [] };
}