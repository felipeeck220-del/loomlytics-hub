import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Lock, Building2, Users, Calendar, Mail, Phone, Shield, LogOut, User, Settings2, Database, RotateCcw, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'machines', label: 'Máquinas' },
  { key: 'clients-articles', label: 'Clientes & Artigos' },
  { key: 'production', label: 'Produção' },
  { key: 'revision', label: 'Revisão' },
  { key: 'outsource', label: 'Terceirizado' },
  { key: 'weavers', label: 'Tecelões' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'settings', label: 'Configurações' },
];

interface EmailHistoryEntry {
  id: string;
  old_email: string;
  new_email: string;
  created_at: string;
}

interface CompanyWithSettings {
  id: string;
  name: string;
  admin_name: string;
  admin_email: string;
  whatsapp: string | null;
  logo_url: string | null;
  created_at: string;
  user_count: number;
  email_history: EmailHistoryEntry[];
  settings: {
    monthly_plan_value: number;
    platform_active: boolean;
    enabled_nav_items: string[];
    subscription_status?: string;
  } | null;
}

interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  created_at: string;
  settings: {
    enabled_nav_items: string[];
    platform_active: boolean;
  } | null;
}

interface BackupEntry {
  id: string;
  company_id: string;
  company_name: string;
  backup_date: string;
  created_at: string;
}

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState<CompanyWithSettings[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('companies');
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [backupFilter, setBackupFilter] = useState('');

  // Company modal
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithSettings | null>(null);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [planValue, setPlanValue] = useState(0);
  const [platformActive, setPlatformActive] = useState(true);
  const [companyNavItems, setCompanyNavItems] = useState<string[]>([]);
  const [freeUser, setFreeUser] = useState(false);
  const [saving, setSaving] = useState(false);

  // User modal
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userNavItems, setUserNavItems] = useState<string[]>([]);
  const [savingUser, setSavingUser] = useState(false);

  // Platform settings
  const [trialDays, setTrialDays] = useState('90');
  const [monthlyPrice, setMonthlyPrice] = useState('47.00');
  const [savingPlatform, setSavingPlatform] = useState(false);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: adminCheck } = await supabase
          .from('platform_admins')
          .select('id')
          .eq('user_id', session.user.id)
          .single();
        if (adminCheck) {
          setAuthenticated(true);
          loadData();
        }
      }
    } catch {
      // Not authenticated
    } finally {
      setCheckingAuth(false);
    }
  };

  const callAdmin = async (action: string, params: any = {}) => {
    const { data, error } = await supabase.functions.invoke('admin-api', {
      body: { action, ...params },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        toast({ title: 'Erro', description: 'Email ou senha inválidos', variant: 'destructive' });
        return;
      }
      const { data: adminCheck } = await supabase
        .from('platform_admins')
        .select('id')
        .eq('user_id', authData.user.id)
        .single();
      if (!adminCheck) {
        await supabase.auth.signOut();
        toast({ title: 'Erro', description: 'Você não tem permissão de administrador da plataforma.', variant: 'destructive' });
        return;
      }
      setAuthenticated(true);
      loadData();
    } catch {
      toast({ title: 'Erro', description: 'Erro ao fazer login', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthenticated(false);
    setCompanies([]);
    setUsers([]);
    setEmail('');
    setPassword('');
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [companiesData, usersData, platformData, backupsData] = await Promise.all([
        callAdmin('list_companies'),
        callAdmin('list_users'),
        callAdmin('get_platform_settings'),
        callAdmin('list_backups'),
      ]);
      setCompanies(companiesData);
      setUsers(usersData);
      setBackups(backupsData || []);
      if (platformData?.trial_days) setTrialDays(platformData.trial_days);
      if (platformData?.monthly_price) setMonthlyPrice(platformData.monthly_price);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Company modal
  const openCompanyModal = (company: CompanyWithSettings) => {
    setSelectedCompany(company);
    const s = company.settings;
    setPlanValue(s?.monthly_plan_value || 0);
    setPlatformActive(s?.platform_active ?? true);
    setCompanyNavItems(s?.enabled_nav_items || NAV_ITEMS.map(n => n.key));
    setFreeUser(s?.subscription_status === 'free');
    setCompanyModalOpen(true);
  };

  const toggleCompanyNavItem = (key: string) => {
    setCompanyNavItems(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSaveCompany = async () => {
    if (!selectedCompany) return;
    setSaving(true);
    try {
      await callAdmin('update_settings', {
        company_id: selectedCompany.id,
        monthly_plan_value: planValue,
        platform_active: freeUser ? true : platformActive,
        enabled_nav_items: companyNavItems,
        subscription_status: freeUser ? 'free' : 'trial',
      });
      toast({ title: 'Salvo', description: 'Configurações atualizadas com sucesso.' });
      setCompanyModalOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // User modal
  const openUserModal = (user: UserProfile) => {
    setSelectedUser(user);
    setUserNavItems(user.settings?.enabled_nav_items || NAV_ITEMS.map(n => n.key));
    setUserModalOpen(true);
  };

  const toggleUserNavItem = (key: string) => {
    setUserNavItems(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    setSavingUser(true);
    try {
      await callAdmin('update_user_nav_items', {
        company_id: selectedUser.company_id,
        enabled_nav_items: userNavItems,
      });
      toast({ title: 'Salvo', description: 'Funções do usuário atualizadas com sucesso.' });
      setUserModalOpen(false);
      loadData();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingUser(false);
    }
  };

  const handleSavePlatformSettings = async () => {
    setSavingPlatform(true);
    try {
      await callAdmin('update_platform_settings', {
        settings: { trial_days: trialDays, monthly_price: monthlyPrice },
      });
      toast({ title: 'Salvo', description: 'Configurações da plataforma atualizadas.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingPlatform(false);
    }
  };

  const handleRestoreBackup = async (backupId: string, companyName: string) => {
    if (!confirm(`Tem certeza que deseja restaurar o backup de "${companyName}"? Todos os dados atuais desta empresa serão substituídos pelos dados do backup.`)) return;
    setRestoringId(backupId);
    try {
      const { data, error } = await supabase.functions.invoke('restore-backup', {
        body: { backup_id: backupId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Restaurado', description: `Backup de "${companyName}" restaurado com sucesso.` });
      loadData();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setRestoringId(null);
    }
  };

  const handleTriggerBackup = async () => {
    setTriggeringBackup(true);
    try {
      const result = await callAdmin('trigger_backup');
      toast({ title: 'Backup concluído', description: `${result.backed_up} de ${result.total_companies} empresas salvas.` });
      loadData();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setTriggeringBackup(false);
    }
  };

  const annualPrice = Number(monthlyPrice) * 12 * 0.6;

  const filteredBackups = backups.filter(b =>
    backupFilter ? b.company_name.toLowerCase().includes(backupFilter.toLowerCase()) : true
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verificando autenticação...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Painel Administrativo</CardTitle>
            <p className="text-sm text-muted-foreground">Faça login com sua conta de administrador</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            <Button className="w-full" onClick={handleLogin} disabled={loading || !email || !password}>
              <Lock className="h-4 w-4 mr-2" />
              {loading ? 'Verificando...' : 'Entrar'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Painel Administrativo</h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">{companies.length} empresas</Badge>
            <Badge variant="outline">{users.length} usuários</Badge>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="companies" className="gap-2">
              <Building2 className="h-4 w-4" />
              Empresas
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="platform-settings" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="backups" className="gap-2">
              <Database className="h-4 w-4" />
              Backups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Empresas Cadastradas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Usuários</TableHead>
                      <TableHead>Plano (R$)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map(c => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => openCompanyModal(c)}
                      >
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{c.admin_name}</TableCell>
                        <TableCell>{c.admin_email}</TableCell>
                        <TableCell>
                          {c.whatsapp ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-emerald-600 hover:text-emerald-700 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                const num = c.whatsapp!.replace(/\D/g, '');
                                const fullNum = num.startsWith('55') ? num : `55${num}`;
                                window.open(`https://wa.me/${fullNum}`, '_blank');
                              }}
                            >
                              <Phone className="h-3.5 w-3.5" />
                              {c.whatsapp}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{c.user_count}</Badge>
                        </TableCell>
                        <TableCell>
                          {c.settings?.monthly_plan_value
                            ? `R$ ${Number(c.settings.monthly_plan_value).toFixed(2)}`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {(c.settings?.platform_active ?? true) ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Ativo</Badge>
                          ) : (
                            <Badge variant="destructive">Bloqueado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(c.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {companies.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Nenhuma empresa cadastrada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Usuários Cadastrados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow
                        key={u.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => openUserModal(u)}
                      >
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.company_name}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {u.status === 'active' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Ativo</Badge>
                          ) : (
                            <Badge variant="destructive">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(u.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum usuário cadastrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="platform-settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  Configurações da Plataforma
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 max-w-lg">
                <div className="space-y-2">
                  <Label>Dias de Teste Grátis (novos cadastros)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={trialDays}
                    onChange={e => setTrialDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Exibido na página de vendas e aplicado a novos registros. Atualmente: {trialDays} dias ({Math.round(Number(trialDays) / 30)} meses)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Preço Mensal (R$) — Novos Usuários</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={monthlyPrice}
                    onChange={e => setMonthlyPrice(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Aplicado somente a novos cadastros. Empresas já existentes mantêm o valor atual.
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                  <p className="text-sm font-medium">Cálculo Plano Anual (40% de desconto)</p>
                  <p className="text-sm text-muted-foreground">
                    Mensal: R$ {Number(monthlyPrice).toFixed(2)} × 12 = R$ {(Number(monthlyPrice) * 12).toFixed(2)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Com 40% desconto: <span className="font-semibold text-primary">R$ {annualPrice.toFixed(2)}/ano</span>{' '}
                    (R$ {(annualPrice / 12).toFixed(2)}/mês)
                  </p>
                </div>

                <Button onClick={handleSavePlatformSettings} disabled={savingPlatform}>
                  {savingPlatform ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backups">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Backups Diários
                  </CardTitle>
                  <Button onClick={handleTriggerBackup} disabled={triggeringBackup} size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    {triggeringBackup ? 'Executando...' : 'Executar Backup Agora'}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Backups automáticos diários às 00:00. Últimos 30 dias por empresa.
                </p>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Input
                    placeholder="Filtrar por nome da empresa..."
                    value={backupFilter}
                    onChange={e => setBackupFilter(e.target.value)}
                    className="max-w-sm"
                  />
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Data do Backup</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBackups.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.company_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {new Date(b.backup_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(b.created_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={restoringId === b.id}
                            onClick={() => handleRestoreBackup(b.id, b.company_name)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            {restoringId === b.id ? 'Restaurando...' : 'Reverter'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredBackups.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhum backup encontrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Company Modal */}
      <Dialog open={companyModalOpen} onOpenChange={setCompanyModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedCompany?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <div className="space-y-6">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>Admin: {selectedCompany.admin_name}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{selectedCompany.admin_email}</span>
                </div>
                {selectedCompany.whatsapp && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{selectedCompany.whatsapp}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Criado em: {new Date(selectedCompany.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{selectedCompany.user_count} usuário(s)</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor do Plano Mensal (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={planValue}
                  onChange={e => setPlanValue(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Usuário Grátis</Label>
                  <p className="text-xs text-muted-foreground">Acesso ilimitado sem cobrança</p>
                </div>
                <Switch checked={freeUser} onCheckedChange={(v) => {
                  setFreeUser(v);
                  if (v) setPlatformActive(true);
                }} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Acesso à Plataforma</Label>
                <Switch checked={platformActive} onCheckedChange={setPlatformActive} disabled={freeUser} />
              </div>
              <div className="space-y-3">
                <Label>Itens de Navegação</Label>
                <div className="grid grid-cols-2 gap-2">
                  {NAV_ITEMS.map(item => (
                    <div key={item.key} className="flex items-center justify-between p-2 rounded-lg border bg-card">
                      <span className="text-sm">{item.label}</span>
                      <Switch
                        checked={companyNavItems.includes(item.key)}
                        onCheckedChange={() => toggleCompanyNavItem(item.key)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              {selectedCompany.email_history && selectedCompany.email_history.length > 0 && (
                <div className="space-y-3">
                  <Label>Histórico de Emails</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedCompany.email_history.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg border bg-card text-sm">
                        <div className="flex flex-col">
                          <span className="text-muted-foreground line-through">{entry.old_email}</span>
                          <span className="text-foreground">→ {entry.new_email}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompanyModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCompany} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Modal */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-6">
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{selectedUser.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>Empresa: {selectedUser.company_name}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span className="capitalize">Cargo: {selectedUser.role}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Criado em: {new Date(selectedUser.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedUser.status === 'active' ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Ativo</Badge>
                  ) : (
                    <Badge variant="destructive">Inativo</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Funções do Sidebar (empresa: {selectedUser.company_name})</Label>
                <p className="text-xs text-muted-foreground">
                  Ativar/desativar módulos visíveis no menu lateral para esta empresa
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {NAV_ITEMS.map(item => (
                    <div key={item.key} className="flex items-center justify-between p-2 rounded-lg border bg-card">
                      <span className="text-sm">{item.label}</span>
                      <Switch
                        checked={userNavItems.includes(item.key)}
                        onCheckedChange={() => toggleUserNavItem(item.key)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveUser} disabled={savingUser}>
              {savingUser ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
