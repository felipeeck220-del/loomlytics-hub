import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Lock, Building2, Users, Calendar, Mail, Phone, Shield, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'machines', label: 'Máquinas' },
  { key: 'clients-articles', label: 'Clientes & Artigos' },
  { key: 'production', label: 'Produção' },
  { key: 'outsource', label: 'Terceirizado' },
  { key: 'weavers', label: 'Tecelões' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'settings', label: 'Configurações' },
];

interface CompanyWithSettings {
  id: string;
  name: string;
  admin_name: string;
  admin_email: string;
  whatsapp: string | null;
  logo_url: string | null;
  created_at: string;
  user_count: number;
  settings: {
    monthly_plan_value: number;
    platform_active: boolean;
    enabled_nav_items: string[];
  } | null;
}

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState<CompanyWithSettings[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyWithSettings | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Modal form state
  const [planValue, setPlanValue] = useState(0);
  const [platformActive, setPlatformActive] = useState(true);
  const [enabledNavItems, setEnabledNavItems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Check if user is platform admin
        const { data: adminCheck } = await supabase
          .from('platform_admins')
          .select('id')
          .eq('user_id', session.user.id)
          .single();
        
        if (adminCheck) {
          setAuthenticated(true);
          loadCompanies();
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

      // Check if user is platform admin
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
      loadCompanies();
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
    setEmail('');
    setPassword('');
  };

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const data = await callAdmin('list_companies');
      setCompanies(data);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCompanyModal = (company: CompanyWithSettings) => {
    setSelectedCompany(company);
    const s = company.settings;
    setPlanValue(s?.monthly_plan_value || 0);
    setPlatformActive(s?.platform_active ?? true);
    setEnabledNavItems(s?.enabled_nav_items || NAV_ITEMS.map(n => n.key));
    setModalOpen(true);
  };

  const toggleNavItem = (key: string) => {
    setEnabledNavItems(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSave = async () => {
    if (!selectedCompany) return;
    setSaving(true);
    try {
      await callAdmin('update_settings', {
        company_id: selectedCompany.id,
        monthly_plan_value: planValue,
        platform_active: platformActive,
        enabled_nav_items: enabledNavItems,
      });
      toast({ title: 'Salvo', description: 'Configurações atualizadas com sucesso.' });
      setModalOpen(false);
      loadCompanies();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma empresa cadastrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
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
                <Label>Acesso à Plataforma</Label>
                <Switch checked={platformActive} onCheckedChange={setPlatformActive} />
              </div>

              <div className="space-y-3">
                <Label>Itens de Navegação</Label>
                <div className="grid grid-cols-2 gap-2">
                  {NAV_ITEMS.map(item => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-2 rounded-lg border bg-card"
                    >
                      <span className="text-sm">{item.label}</span>
                      <Switch
                        checked={enabledNavItems.includes(item.key)}
                        onCheckedChange={() => toggleNavItem(item.key)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
