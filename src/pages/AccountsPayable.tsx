import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Trash2, Check, Pencil, Receipt, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/formatters';

interface AccountPayable {
  id: string;
  company_id: string;
  supplier_name: string;
  description: string;
  category: string | null;
  amount: number;
  due_date: string;
  whatsapp_number: string;
  status: string;
  paid_at: string | null;
  notification_sent: boolean;
  observations: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ['Insumos', 'Peças', 'Agulhas', 'Serviços', 'Outros'];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  pago: { label: 'Pago', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  vencido: { label: 'Vencido', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

const emptyForm = {
  supplier_name: '',
  description: '',
  category: '',
  amount: '',
  due_date: '',
  whatsapp_number: '',
  observations: '',
};

export default function AccountsPayable() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const companyId = user?.company_id;

  // Fetch accounts
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts_payable', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('accounts_payable')
        .select('*')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as AccountPayable[];
    },
    enabled: !!companyId,
  });

  // Filtered accounts
  const filtered = useMemo(() => {
    let result = accounts;
    if (filterStatus !== 'all') {
      result = result.filter(a => a.status === filterStatus);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(a =>
        a.supplier_name.toLowerCase().includes(term) ||
        a.description.toLowerCase().includes(term)
      );
    }
    return result;
  }, [accounts, filterStatus, searchTerm]);

  // Totals
  const totals = useMemo(() => {
    const pendente = accounts.filter(a => a.status === 'pendente').reduce((s, a) => s + Number(a.amount), 0);
    const vencido = accounts.filter(a => a.status === 'vencido').reduce((s, a) => s + Number(a.amount), 0);
    const pago = accounts.filter(a => a.status === 'pago').reduce((s, a) => s + Number(a.amount), 0);
    return { pendente, vencido, pago };
  }, [accounts]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const row = {
        company_id: companyId,
        supplier_name: data.supplier_name,
        description: data.description,
        category: data.category || null,
        amount: parseFloat(data.amount.replace(',', '.')),
        due_date: data.due_date,
        whatsapp_number: data.whatsapp_number,
        observations: data.observations || null,
      };

      if (editingId) {
        const { error } = await (supabase.from as any)('accounts_payable')
          .update(row)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)('accounts_payable')
          .insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? 'Conta atualizada!' : 'Conta cadastrada!');
      queryClient.invalidateQueries({ queryKey: ['accounts_payable'] });
      closeForm();
    },
    onError: (err: any) => {
      toast.error('Erro ao salvar: ' + err.message);
    },
  });

  // Mark as paid
  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)('accounts_payable')
        .update({ status: 'pago', paid_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Conta marcada como paga!');
      queryClient.invalidateQueries({ queryKey: ['accounts_payable'] });
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)('accounts_payable')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Conta excluída!');
      queryClient.invalidateQueries({ queryKey: ['accounts_payable'] });
      setDeleteId(null);
    },
  });

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(account: AccountPayable) {
    setEditingId(account.id);
    setForm({
      supplier_name: account.supplier_name,
      description: account.description,
      category: account.category || '',
      amount: String(account.amount).replace('.', ','),
      due_date: account.due_date,
      whatsapp_number: account.whatsapp_number,
      observations: account.observations || '',
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier_name || !form.description || !form.amount || !form.due_date || !form.whatsapp_number) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    saveMutation.mutate(form);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Contas a Pagar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie suas obrigações financeiras com fornecedores
          </p>
        </div>
        <Button onClick={openNew} className="btn-gradient gap-2">
          <Plus className="h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-material">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pendente</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(totals.pendente)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-material">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Vencido</p>
            <p className="text-xl font-bold text-destructive">{formatCurrency(totals.vencido)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-material">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pago</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totals.pago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="shadow-material">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar fornecedor ou descrição..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="vencido">Vencido</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-material">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {accounts.length === 0 ? 'Nenhuma conta cadastrada.' : 'Nenhuma conta encontrada com os filtros selecionados.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="hidden md:table-cell">Categoria</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(account => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.supplier_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{account.description}</TableCell>
                      <TableCell className="hidden md:table-cell">{account.category || '—'}</TableCell>
                      <TableCell>{formatCurrency(Number(account.amount))}</TableCell>
                      <TableCell>
                        {format(new Date(account.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[account.status]?.className || ''}>
                          {STATUS_BADGE[account.status]?.label || account.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {account.status === 'pendente' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Marcar como pago"
                              onClick={() => markPaidMutation.mutate(account.id)}
                              disabled={markPaidMutation.isPending}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {account.status !== 'pago' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Editar"
                              onClick={() => openEdit(account)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir"
                            onClick={() => setDeleteId(account.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) closeForm(); }}>
        <DialogContent className="w-[95vw] sm:w-[80vw] sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Conta' : 'Nova Conta a Pagar'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Fornecedor *</Label>
              <Input
                value={form.supplier_name}
                onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                placeholder="Nome do fornecedor"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Óleo lubrificante"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vencimento *</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp *</Label>
                <Input
                  value={form.whatsapp_number}
                  onChange={e => setForm(f => ({ ...f, whatsapp_number: e.target.value }))}
                  placeholder="+5511999999999"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observations}
                onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Salvando...' : editingId ? 'Salvar' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A conta será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}