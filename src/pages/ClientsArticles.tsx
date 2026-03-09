import { useState } from 'react';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Client, Article } from '@/types';

export default function ClientsArticles() {
  const { getClients, saveClients, getArticles, saveArticles } = useCompanyData();
  const [clients, setClients] = useState<Client[]>(getClients());
  const [articles, setArticles] = useState<Article[]>(getArticles());
  const [tab, setTab] = useState('clients');

  // Client modal
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({ name: '', contact: '', observations: '' });

  // Article modal
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [articleForm, setArticleForm] = useState({ name: '', client_id: '', weight_per_roll: '', value_per_kg: '', turns_per_roll: '', observations: '' });

  // Delete
  const [showDelete, setShowDelete] = useState<{ type: 'client' | 'article'; item: any } | null>(null);
  const [deleteWord, setDeleteWord] = useState('');

  const refresh = () => { setClients(getClients()); setArticles(getArticles()); };

  // Client handlers
  const openNewClient = () => { setEditingClient(null); setClientForm({ name: '', contact: '', observations: '' }); setShowClientModal(true); };
  const openEditClient = (c: Client) => { setEditingClient(c); setClientForm({ name: c.name, contact: c.contact || '', observations: c.observations || '' }); setShowClientModal(true); };

  const saveClient = () => {
    if (!clientForm.name) { toast.error('Nome é obrigatório'); return; }
    const all = getClients();
    if (editingClient) {
      const idx = all.findIndex(c => c.id === editingClient.id);
      all[idx] = { ...all[idx], ...clientForm };
      saveClients(all); toast.success('Cliente atualizado');
    } else {
      all.push({ id: crypto.randomUUID(), company_id: '', name: clientForm.name, contact: clientForm.contact || undefined, observations: clientForm.observations || undefined, created_at: new Date().toISOString() });
      saveClients(all); toast.success('Cliente cadastrado');
    }
    setShowClientModal(false); refresh();
  };

  // Article handlers
  const openNewArticle = () => { setEditingArticle(null); setArticleForm({ name: '', client_id: '', weight_per_roll: '', value_per_kg: '', turns_per_roll: '', observations: '' }); setShowArticleModal(true); };
  const openEditArticle = (a: Article) => { setEditingArticle(a); setArticleForm({ name: a.name, client_id: a.client_id, weight_per_roll: String(a.weight_per_roll), value_per_kg: String(a.value_per_kg), turns_per_roll: String(a.turns_per_roll), observations: a.observations || '' }); setShowArticleModal(true); };

  const saveArticle = () => {
    if (!articleForm.name || !articleForm.client_id) { toast.error('Nome e cliente são obrigatórios'); return; }
    const all = getArticles();
    const clientName = clients.find(c => c.id === articleForm.client_id)?.name || '';
    if (editingArticle) {
      const idx = all.findIndex(a => a.id === editingArticle.id);
      all[idx] = { ...all[idx], name: articleForm.name, client_id: articleForm.client_id, client_name: clientName, weight_per_roll: Number(articleForm.weight_per_roll), value_per_kg: Number(articleForm.value_per_kg), turns_per_roll: Number(articleForm.turns_per_roll), observations: articleForm.observations || undefined };
      saveArticles(all); toast.success('Artigo atualizado');
    } else {
      all.push({ id: crypto.randomUUID(), company_id: '', name: articleForm.name, client_id: articleForm.client_id, client_name: clientName, weight_per_roll: Number(articleForm.weight_per_roll), value_per_kg: Number(articleForm.value_per_kg), turns_per_roll: Number(articleForm.turns_per_roll), observations: articleForm.observations || undefined, created_at: new Date().toISOString() });
      saveArticles(all); toast.success('Artigo cadastrado');
    }
    setShowArticleModal(false); refresh();
  };

  const handleDelete = () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    if (showDelete?.type === 'client') {
      saveClients(getClients().filter(c => c.id !== showDelete.item.id));
    } else {
      saveArticles(getArticles().filter(a => a.id !== showDelete?.item.id));
    }
    setShowDelete(null); setDeleteWord(''); toast.success('Excluído com sucesso'); refresh();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Clientes & Artigos</h1>
          <p className="text-muted-foreground text-sm">{clients.length} clientes · {articles.length} artigos</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openNewClient} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Novo Cliente</Button>
          <Button onClick={openNewArticle} variant="outline"><Plus className="h-4 w-4 mr-1" /> Novo Artigo</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clients">Clientes ({clients.length})</TabsTrigger>
          <TabsTrigger value="articles">Artigos ({articles.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="space-y-3 mt-4">
          {clients.map(c => (
            <div key={c.id} className="card-glass p-4 flex items-center justify-between">
              <div>
                <p className="font-display font-semibold text-foreground">{c.name}</p>
                {c.contact && <p className="text-xs text-muted-foreground">{c.contact}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditClient(c)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="outline" size="sm" onClick={() => { setShowDelete({ type: 'client', item: c }); setDeleteWord(''); }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          {clients.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum cliente cadastrado</p>}
        </TabsContent>

        <TabsContent value="articles" className="space-y-3 mt-4">
          {articles.map(a => (
            <div key={a.id} className="card-glass p-4 flex items-center justify-between">
              <div>
                <p className="font-display font-semibold text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  Cliente: {a.client_name} · {a.weight_per_roll}kg/rolo · R${a.value_per_kg}/kg · {a.turns_per_roll} voltas/rolo
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditArticle(a)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="outline" size="sm" onClick={() => { setShowDelete({ type: 'article', item: a }); setDeleteWord(''); }}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          {articles.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhum artigo cadastrado</p>}
        </TabsContent>
      </Tabs>

      {/* Client Modal */}
      <Dialog open={showClientModal} onOpenChange={setShowClientModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Contato</Label><Input value={clientForm.contact} onChange={e => setClientForm(p => ({ ...p, contact: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={clientForm.observations} onChange={e => setClientForm(p => ({ ...p, observations: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClientModal(false)}>Cancelar</Button>
            <Button onClick={saveClient} className="btn-gradient">{editingClient ? 'Salvar' : 'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Article Modal */}
      <Dialog open={showArticleModal} onOpenChange={setShowArticleModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingArticle ? 'Editar Artigo' : 'Novo Artigo'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome do Artigo</Label><Input value={articleForm.name} onChange={e => setArticleForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={articleForm.client_id} onValueChange={v => setArticleForm(p => ({ ...p, client_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label>Peso/Rolo (kg)</Label><Input type="number" value={articleForm.weight_per_roll} onChange={e => setArticleForm(p => ({ ...p, weight_per_roll: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Valor/kg (R$)</Label><Input type="number" step="0.01" value={articleForm.value_per_kg} onChange={e => setArticleForm(p => ({ ...p, value_per_kg: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Voltas/Rolo</Label><Input type="number" value={articleForm.turns_per_roll} onChange={e => setArticleForm(p => ({ ...p, turns_per_roll: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={articleForm.observations} onChange={e => setArticleForm(p => ({ ...p, observations: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArticleModal(false)}>Cancelar</Button>
            <Button onClick={saveArticle} className="btn-gradient">{editingArticle ? 'Salvar' : 'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={!!showDelete} onOpenChange={() => setShowDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir {showDelete?.item?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Digite <strong>EXCLUIR</strong> para confirmar.</p>
          <Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="EXCLUIR" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
