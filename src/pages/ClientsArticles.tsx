import { useState } from 'react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, Loader2, Users, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import type { Client, Article, ArticleMachineTurns } from '@/types';

interface MachineTurnRow {
  id: string;
  machine_id: string;
  turns_per_roll: string;
  observations: string;
}

export default function ClientsArticles() {
  const { getClients, saveClients, getArticles, saveArticles, getMachines, getArticleMachineTurns, saveArticleMachineTurns, loading } = useSharedCompanyData();
  const clients = getClients();
  const articles = getArticles();
  const machines = getMachines();
  const allMachineTurns = getArticleMachineTurns();
  const [tab, setTab] = useState('clients');
  const [clientSearch, setClientSearch] = useState('');
  const [articleSearch, setArticleSearch] = useState('');

  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({ name: '', contact: '', observations: '' });

  const [showArticleModal, setShowArticleModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [articleForm, setArticleForm] = useState({ name: '', client_id: '', weight_per_roll: '', value_per_kg: '', turns_per_roll: '', target_efficiency: '80', observations: '' });

  const [showDelete, setShowDelete] = useState<{ type: 'client' | 'article'; item: any } | null>(null);
  const [deleteWord, setDeleteWord] = useState('');

  // Turns config modal
  const [turnsArticle, setTurnsArticle] = useState<Article | null>(null);
  const [turnsDefault, setTurnsDefault] = useState('');
  const [turnsRows, setTurnsRows] = useState<MachineTurnRow[]>([]);

  const openTurnsModal = (article: Article) => {
    setTurnsArticle(article);
    setTurnsDefault(String(article.turns_per_roll));
    const existing = allMachineTurns.filter(t => t.article_id === article.id);
    setTurnsRows(existing.map(t => ({
      id: t.id,
      machine_id: t.machine_id,
      turns_per_roll: String(t.turns_per_roll),
      observations: t.observations || '',
    })));
  };

  const addTurnsRow = () => {
    setTurnsRows(prev => [...prev, { id: crypto.randomUUID(), machine_id: '', turns_per_roll: '', observations: '' }]);
  };

  const removeTurnsRow = (id: string) => {
    setTurnsRows(prev => prev.filter(r => r.id !== id));
  };

  const handleSaveTurns = async () => {
    if (!turnsArticle) return;
    const defaultVal = Number(turnsDefault);
    if (!defaultVal) { toast.error('Voltas padrão é obrigatório'); return; }

    // Save default turns on article
    const allArticles = [...articles];
    const idx = allArticles.findIndex(a => a.id === turnsArticle.id);
    if (idx >= 0) {
      allArticles[idx] = { ...allArticles[idx], turns_per_roll: defaultVal };
      await saveArticles(allArticles);
    }

    // Save machine-specific turns
    const validRows = turnsRows.filter(r => r.machine_id && r.turns_per_roll);
    const turnsData: ArticleMachineTurns[] = validRows.map(r => ({
      id: r.id,
      article_id: turnsArticle.id,
      machine_id: r.machine_id,
      company_id: '',
      turns_per_roll: Number(r.turns_per_roll),
      observations: r.observations || undefined,
      created_at: new Date().toISOString(),
    }));
    await saveArticleMachineTurns(turnsArticle.id, turnsData);
    toast.success('Configurações de voltas salvas');
    setTurnsArticle(null);
  };

  // Get machines already used in turns rows (to prevent duplicates)
  const usedMachineIds = turnsRows.map(r => r.machine_id).filter(Boolean);

  const openNewClient = () => { setEditingClient(null); setClientForm({ name: '', contact: '', observations: '' }); setShowClientModal(true); };
  const openEditClient = (c: Client) => { setEditingClient(c); setClientForm({ name: c.name, contact: c.contact || '', observations: c.observations || '' }); setShowClientModal(true); };

  const handleSaveClient = async () => {
    if (!clientForm.name) { toast.error('Nome é obrigatório'); return; }
    const all = [...clients];
    if (editingClient) {
      const idx = all.findIndex(c => c.id === editingClient.id);
      all[idx] = { ...all[idx], ...clientForm };
      await saveClients(all); toast.success('Cliente atualizado');
    } else {
      all.push({ id: crypto.randomUUID(), company_id: '', name: clientForm.name, contact: clientForm.contact || undefined, observations: clientForm.observations || undefined, created_at: new Date().toISOString() });
      await saveClients(all); toast.success('Cliente cadastrado');
    }
    setShowClientModal(false);
  };

  const openNewArticle = () => { setEditingArticle(null); setArticleForm({ name: '', client_id: '', weight_per_roll: '', value_per_kg: '', turns_per_roll: '', target_efficiency: '80', observations: '' }); setShowArticleModal(true); };
  const openEditArticle = (a: Article) => { setEditingArticle(a); setArticleForm({ name: a.name, client_id: a.client_id, weight_per_roll: String(a.weight_per_roll), value_per_kg: String(a.value_per_kg), turns_per_roll: String(a.turns_per_roll), target_efficiency: String(a.target_efficiency || 80), observations: a.observations || '' }); setShowArticleModal(true); };

  const handleSaveArticle = async () => {
    if (!articleForm.name || !articleForm.client_id) { toast.error('Nome e cliente são obrigatórios'); return; }
    const all = [...articles];
    const clientName = clients.find(c => c.id === articleForm.client_id)?.name || '';
    if (editingArticle) {
      const idx = all.findIndex(a => a.id === editingArticle.id);
      all[idx] = { ...all[idx], name: articleForm.name, client_id: articleForm.client_id, client_name: clientName, weight_per_roll: Number(articleForm.weight_per_roll), value_per_kg: Number(articleForm.value_per_kg), turns_per_roll: Number(articleForm.turns_per_roll), target_efficiency: Number(articleForm.target_efficiency) || 80, observations: articleForm.observations || undefined };
      await saveArticles(all); toast.success('Artigo atualizado');
    } else {
      all.push({ id: crypto.randomUUID(), company_id: '', name: articleForm.name, client_id: articleForm.client_id, client_name: clientName, weight_per_roll: Number(articleForm.weight_per_roll), value_per_kg: Number(articleForm.value_per_kg), turns_per_roll: Number(articleForm.turns_per_roll), target_efficiency: Number(articleForm.target_efficiency) || 80, observations: articleForm.observations || undefined, created_at: new Date().toISOString() });
      await saveArticles(all); toast.success('Artigo cadastrado');
    }
    setShowArticleModal(false);
  };

  const handleDelete = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    if (showDelete?.type === 'client') {
      await saveClients(clients.filter(c => c.id !== showDelete.item.id));
    } else {
      await saveArticles(articles.filter(a => a.id !== showDelete?.item.id));
    }
    setShowDelete(null); setDeleteWord(''); toast.success('Excluído com sucesso');
  };

  const filteredClients = clients.filter(c =>
    !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.contact || '').toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredArticles = articles.filter(a =>
    !articleSearch || a.name.toLowerCase().includes(articleSearch.toLowerCase()) || (a.client_name || '').toLowerCase().includes(articleSearch.toLowerCase()) || (a.observations || '').toLowerCase().includes(articleSearch.toLowerCase())
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-3 text-muted-foreground">Carregando...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Clientes & Artigos</h1>
          <p className="text-muted-foreground text-sm">Gerencie seus clientes e os artigos produzidos</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openNewClient} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Novo Cliente</Button>
          <Button onClick={openNewArticle} className="btn-gradient"><Plus className="h-4 w-4 mr-1" /> Novo Artigo</Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Clientes
          </TabsTrigger>
          <TabsTrigger value="articles" className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Artigos
          </TabsTrigger>
        </TabsList>

        {/* Clients Tab */}
        <TabsContent value="clients" className="mt-4">
          <div className="card-glass p-5 space-y-4">
            <div>
              <h2 className="font-display font-semibold text-foreground">Lista de Clientes</h2>
              <p className="text-sm text-muted-foreground">{filteredClients.length} de {clients.length} clientes</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Pesquisar clientes por nome, contato ou endereço..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.map(c => (
                <div key={c.id} className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
                  <div>
                    <p className="font-display font-semibold text-foreground">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{c.contact || 'Sem contato'}</p>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => openEditClient(c)}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setShowDelete({ type: 'client', item: c }); setDeleteWord(''); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredClients.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-8">Nenhum cliente encontrado</div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Articles Tab */}
        <TabsContent value="articles" className="mt-4">
          <div className="card-glass p-5 space-y-4">
            <div>
              <h2 className="font-display font-semibold text-foreground">Lista de Artigos</h2>
              <p className="text-sm text-muted-foreground">{filteredArticles.length} de {articles.length} artigos</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Pesquisar artigos por nome, cliente ou observações..." value={articleSearch} onChange={e => setArticleSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredArticles.map(a => (
                <div key={a.id} className="rounded-lg border border-border bg-background p-4 flex flex-col gap-3">
                  <div>
                    <p className="font-display font-semibold text-foreground">{a.name}</p>
                    <p className="text-sm text-muted-foreground">Cliente: {a.client_name || '—'}</p>
                  </div>
                  <div className="text-sm space-y-0.5">
                    <p className="text-muted-foreground">Peso Rolo: <span className="font-semibold text-foreground">{a.weight_per_roll} kg</span></p>
                    <p className="text-muted-foreground">Valor/Kg: <span className="font-semibold text-foreground">R$ {a.value_per_kg}</span></p>
                    <p className="text-muted-foreground">Eficiência Exigida: <span className="font-semibold text-foreground">{a.target_efficiency || 80}%</span></p>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => openTurnsModal(a)}>
                      <Settings className="h-3 w-3 mr-1" /> Voltas
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => openEditArticle(a)}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setShowDelete({ type: 'article', item: a }); setDeleteWord(''); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredArticles.length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-8">Nenhum artigo encontrado</div>
              )}
            </div>
          </div>
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
            <Button onClick={handleSaveClient} className="btn-gradient">{editingClient ? 'Salvar' : 'Cadastrar'}</Button>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Peso/Rolo (kg)</Label><Input type="number" value={articleForm.weight_per_roll} onChange={e => setArticleForm(p => ({ ...p, weight_per_roll: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Valor/kg (R$)</Label><Input type="number" step="0.01" value={articleForm.value_per_kg} onChange={e => setArticleForm(p => ({ ...p, value_per_kg: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Voltas/Rolo</Label><Input type="number" value={articleForm.turns_per_roll} onChange={e => setArticleForm(p => ({ ...p, turns_per_roll: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Eficiência Média Exigida (%)</Label><Input type="number" min="0" max="100" value={articleForm.target_efficiency} onChange={e => setArticleForm(p => ({ ...p, target_efficiency: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Observações</Label><Textarea value={articleForm.observations} onChange={e => setArticleForm(p => ({ ...p, observations: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArticleModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveArticle} className="btn-gradient">{editingArticle ? 'Salvar' : 'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Turns Config Modal */}
      <Dialog open={!!turnsArticle} onOpenChange={() => setTurnsArticle(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-display">Configurar Voltas por Máquina</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Gerencie as voltas por rolo para o artigo "{turnsArticle?.name}" em cada máquina.
            </p>
          </DialogHeader>

          <div className="space-y-6">
            {/* Default turns section */}
            <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-3">
              <div>
                <p className="font-semibold text-foreground">Voltas por Rolo (Padrão)</p>
                <p className="text-sm text-muted-foreground">Este valor será usado como padrão para máquinas que não tenham configuração específica.</p>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Voltas por Rolo (Padrão) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  value={turnsDefault}
                  onChange={e => setTurnsDefault(e.target.value)}
                  placeholder="Ex: 800"
                />
              </div>
            </div>

            {/* Machine-specific section */}
            <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">Configurações Específicas por Máquina</p>
                  <p className="text-sm text-muted-foreground">Defina voltas específicas para cada máquina. Se não configurado, o valor padrão será usado.</p>
                </div>
              </div>

              {turnsRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Settings className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <p className="font-semibold text-foreground">Nenhuma configuração específica</p>
                  <p className="text-sm text-muted-foreground mb-4">Todas as máquinas usarão o valor padrão de voltas por rolo.</p>
                  <Button variant="outline" onClick={addTurnsRow}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Configuração para Máquina
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {turnsRows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border bg-background p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Máquina <span className="text-destructive">*</span></Label>
                          <Select
                            value={row.machine_id}
                            onValueChange={v => setTurnsRows(prev => prev.map(r => r.id === row.id ? { ...r, machine_id: v } : r))}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                            <SelectContent>
                              {machines.map(m => (
                                <SelectItem
                                  key={m.id}
                                  value={m.id}
                                  disabled={usedMachineIds.includes(m.id) && row.machine_id !== m.id}
                                >
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Voltas por Rolo <span className="text-destructive">*</span></Label>
                          <Input
                            type="number"
                            value={row.turns_per_roll}
                            onChange={e => setTurnsRows(prev => prev.map(r => r.id === row.id ? { ...r, turns_per_roll: e.target.value } : r))}
                            placeholder="Ex: 850"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Observações</Label>
                          <Input
                            value={row.observations}
                            onChange={e => setTurnsRows(prev => prev.map(r => r.id === row.id ? { ...r, observations: e.target.value } : r))}
                            placeholder="Observações específicas"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive shrink-0"
                          onClick={() => removeTurnsRow(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full" onClick={addTurnsRow}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Outra Máquina
                  </Button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button onClick={handleSaveTurns} className="btn-gradient w-full sm:w-auto sm:flex-1">
              Salvar Configurações
            </Button>
            <Button variant="outline" onClick={() => setTurnsArticle(null)} className="w-full sm:w-auto sm:flex-1">
              Cancelar
            </Button>
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
