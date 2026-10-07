export type ExportStatus = 'ambos' | 'aberto' | 'encerradas';
export type ExportDataType = 'ambos' | 'entrada' | 'saida';

interface InvoiceItem { yarn_type_id?: string | null; weight_kg: number }
interface Invoice {
  id: string; type: string; invoice_number: string; issue_date: string;
  parent_invoice_id?: string | null; items?: InvoiceItem[];
}
interface ExitLink { entry_invoice_id: string; exit_invoice_id: string; yarn_type_id?: string | null; deduct_kg: number }
export interface ClientInvoiceExportRow {
  id: string; yarn_id: string; yarn_name: string; invoice_number: string;
  issue_date: string; weight_entrada: number; weight_saida: number; saldo: number;
  status: 'Em Aberto' | 'Encerrada';
}

/** One statement row per entry NF/yarn; consumption is lifetime, not clipped by the entry date filter. */
export function buildClientInvoiceExportRows(invoices: Invoice[], links: ExitLink[], yarns: { id: string; name: string }[]): ClientInvoiceExportRow[] {
  const exits = invoices.filter(invoice => invoice.type === 'saida');
  return invoices.filter(invoice => invoice.type === 'entrada').flatMap(entry => {
    const weights = new Map<string, number>();
    for (const item of entry.items || []) {
      const id = item.yarn_type_id || '';
      weights.set(id, (weights.get(id) || 0) + Number(item.weight_kg || 0));
    }
    if (!weights.size) weights.set('', 0);
    const entryLinks = links.filter(link => link.entry_invoice_id === entry.id);
    const linkedIds = new Set(entryLinks.map(link => link.exit_invoice_id));
    const legacyWeight = exits.filter(exit => exit.parent_invoice_id === entry.id && !linkedIds.has(exit.id))
      .reduce((sum, exit) => sum + (exit.items || []).reduce((total, item) => total + Number(item.weight_kg || 0), 0), 0);
    const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
    return [...weights].map(([yarnId, weight]) => {
      const share = totalWeight > 0 ? weight / totalWeight : 1 / weights.size;
      const consumed = entryLinks.reduce((sum, link) => sum + Number(link.deduct_kg || 0) * (link.yarn_type_id ? (link.yarn_type_id === yarnId ? 1 : 0) : share), 0) + legacyWeight * share;
      const saldo = Math.max(0, Number((weight - consumed).toFixed(3)));
      return { id: entry.id, yarn_id: yarnId, yarn_name: yarns.find(yarn => yarn.id === yarnId)?.name || 'Fio não informado', invoice_number: entry.invoice_number, issue_date: entry.issue_date, weight_entrada: weight, weight_saida: consumed, saldo, status: saldo <= 0.001 ? 'Encerrada' as const : 'Em Aberto' as const };
    });
  });
}

export function filterClientInvoiceExportRows(rows: ClientInvoiceExportRow[], filters: { month: string; from: string; to: string; status: ExportStatus; yarn?: string }) {
  return rows.filter(row =>
    (filters.month === 'all' || row.issue_date.startsWith(filters.month)) &&
    (!filters.from || row.issue_date >= filters.from) && (!filters.to || row.issue_date <= filters.to) &&
    (filters.status === 'ambos' || row.status === (filters.status === 'aberto' ? 'Em Aberto' : 'Encerrada')) &&
    (!filters.yarn || filters.yarn === 'all' || row.yarn_id === filters.yarn)
  ).sort((a, b) => Number(a.status === 'Encerrada') - Number(b.status === 'Encerrada') || a.yarn_name.localeCompare(b.yarn_name, 'pt-BR') || a.invoice_number.localeCompare(b.invoice_number, 'pt-BR', { numeric: true }) || a.id.localeCompare(b.id));
}