import { describe, expect, it } from 'vitest';
import { buildClientInvoiceExportRows, filterClientInvoiceExportRows } from './clientInvoiceExport';

describe('client invoice statement', () => {
  const invoices = [
    { id: 'open', type: 'entrada', invoice_number: '290696', issue_date: '2026-06-25', items: [{ yarn_type_id: 'cotton', weight_kg: 100 }] },
    { id: 'closed', type: 'entrada', invoice_number: '20', issue_date: '2026-06-26', items: [{ yarn_type_id: 'cotton', weight_kg: 50 }] },
    { id: 'exit', type: 'saida', invoice_number: '21', issue_date: '2026-07-01', parent_invoice_id: 'open', items: [{ weight_kg: 30 }] },
    { id: 'legacy', type: 'saida', invoice_number: '22', issue_date: '2026-07-02', parent_invoice_id: 'closed', items: [{ weight_kg: 50 }] },
  ];
  const yarns = [{ id: 'cotton', name: 'Algodão' }];
  const links = [{ entry_invoice_id: 'open', exit_invoice_id: 'exit', deduct_kg: 30, yarn_type_id: 'cotton' }];
  it('does not count modern and legacy links twice and includes later exits in current balances', () => {
    const rows = buildClientInvoiceExportRows(invoices, links, yarns);
    expect(rows.find(row => row.id === 'open')?.saldo).toBe(70);
    expect(rows.find(row => row.id === 'closed')?.status).toBe('Encerrada');
    expect(filterClientInvoiceExportRows(rows, { month: '2026-06', from: '', to: '', status: 'ambos' }).map(row => row.id)).toEqual(['open', 'closed']);
  });
  it('filters period, status and yarn without truncating older records', () => {
    const rows = buildClientInvoiceExportRows(invoices, links, yarns);
    expect(filterClientInvoiceExportRows(rows, { month: 'all', from: '2026-06-26', to: '', status: 'encerradas', yarn: 'cotton' })).toHaveLength(1);
    expect(filterClientInvoiceExportRows(rows, { month: 'all', from: '', to: '', status: 'aberto', yarn: 'missing' })).toHaveLength(0);
    const many = Array.from({ length: 1118 }, (_, index) => ({ ...invoices[0], id: String(index) }));
    expect(buildClientInvoiceExportRows(many, [], yarns)).toHaveLength(1118);
  });
});