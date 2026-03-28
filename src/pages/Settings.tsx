
const ROLE_PERMISSIONS: Record<string, { allowed: string[]; denied: string[] }> = {
  admin: {
    allowed: ['Dashboard e Visão Geral', 'Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Clientes e Artigos', 'Registro de Produção', 'Terceirização', 'Gestão de Tecelões', 'Revisão', 'Mecânica', 'Relatórios e Análises', 'Configurações do Sistema', 'Alterar Senha', 'Financeiro'],
    denied: [],
  },
  lider: {
    allowed: ['Dashboard e Visão Geral', 'Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Clientes e Artigos', 'Registro de Produção', 'Terceirização', 'Gestão de Tecelões', 'Revisão', 'Mecânica', 'Relatórios e Análises', 'Configurações do Sistema', 'Alterar Senha'],
    denied: ['Financeiro'],
  },
  mecanico: {
    allowed: ['Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Mecânica', 'Configurações do Sistema', 'Alterar Senha'],
    denied: ['Dashboard e Visão Geral', 'Clientes e Artigos', 'Registro de Produção', 'Terceirização', 'Gestão de Tecelões', 'Revisão', 'Relatórios e Análises', 'Financeiro'],
  },
  revisador: {
    allowed: ['Registro de Produção', 'Revisão', 'Configurações do Sistema', 'Alterar Senha'],
    denied: ['Dashboard e Visão Geral', 'Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Clientes e Artigos', 'Terceirização', 'Gestão de Tecelões', 'Mecânica', 'Relatórios e Análises', 'Financeiro'],
  },
};

function RolePermissionsDisplay({ role }: { role: string }) {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.admin;
  return (
    <div className="space-y-2">
      {perms.allowed.map(perm => (
        <div key={perm} className="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-sm text-foreground">{perm}</span>
        </div>
      ))}
      {perms.denied.map(perm => (
        <div key={perm} className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 opacity-50">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive shrink-0" />
          <span className="text-sm text-foreground line-through">{perm}</span>
        </div>
      ))}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { supabase } from '@/integrations/supabase/client';
import type { CompanyShiftSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LogOut, Settings, Users, Building2, User, Mail, Calendar, Shield, Clock, Pencil, Trash2, Plus, XCircle, Loader2, Eye, EyeOff, Upload, ImageIcon, X, CreditCard, Crown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import ProductionModeModal from '@/components/ProductionModeModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  code?: string;
  created_at: string;
}

const ROLES = [
  { value: 'admin', label: 'Administrador', description: 'Acesso total ao sistema', color: 'bg-red-100 text-red-700' },
  { value: 'lider', label: 'Líder', description: 'Acesso total exceto dados financeiros', color: 'bg-purple-100 text-purple-700' },
  { value: 'mecanico', label: 'Mecânico', description: 'Acesso apenas às máquinas para manutenção', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'revisador', label: 'Revisador', description: 'Acesso apenas para registrar produção', color: 'bg-yellow-100 text-yellow-700' },
];

const PERMISSIONS = [
  'Dashboard e Visão Geral',
  'Máquinas e Manutenção',
  'Clientes e Artigos',
  'Registro de Produção',
  'Gestão de Tecelões',
  'Relatórios e Análises',
  'Configurações do Sistema',
  'Financeiro',
];

const getRoleColor = (role: string) => ROLES.find(r => r.value === role)?.color || 'bg-muted text-muted-foreground';
const getRoleLabel = (role: string) => ROLES.find(r => r.value === role)?.label || role;

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { shiftSettings, saveShiftSettings, getMachines, saveMachines } = useSharedCompanyData();
  const [tab, setTab] = useState('profile');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [company, setCompany] = useState<any>(null);

  // User management
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [showDeleteUser, setShowDeleteUser] = useState<Profile | null>(null);
  const [deleteWord, setDeleteWord] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [changePasswordUser, setChangePasswordUser] = useState<Profile | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [showAdminNewPw, setShowAdminNewPw] = useState(false);
  const [savingAdminPw, setSavingAdminPw] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [editingShifts, setEditingShifts] = useState(false);
  const [shiftForm, setShiftForm] = useState<CompanyShiftSettings>(shiftSettings);
  const [savingShifts, setSavingShifts] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [showProductionMode, setShowProductionMode] = useState(false);
  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Subscription state
  const [subStatus, setSubStatus] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<Record<string, string>>({});

  // Company name editing
  const [editingCompanyName, setEditingCompanyName] = useState(false);
  const [companyNameForm, setCompanyNameForm] = useState('');
  const [savingCompanyName, setSavingCompanyName] = useState(false);

  useEffect(() => {
    setProfileName(user?.name || '');
    setProfileEmail('');
    setProfilePassword('');
  }, [user?.name, user?.email]);

  const handleSaveProfile = async () => {
    if (!user || !profileName.trim()) { toast.error('Nome não pode ser vazio'); return; }
    setSavingProfile(true);
    try {
      const nameChanged = profileName.trim() !== user.name;
      const emailChanged = profileEmail.trim() !== '' && profileEmail.trim() !== user.email;

      if (nameChanged) {
        const { error } = await (supabase.from as any)('profiles')
          .update({ name: profileName.trim() })
          .eq('user_id', user.id);
        if (error) throw error;
      }

      if (emailChanged) {
        if (!/\S+@\S+\.\S+/.test(profileEmail.trim())) {
          toast.error('Email inválido');
          setSavingProfile(false);
          return;
        }
        if (!profilePassword) {
          toast.error('Digite sua senha atual para alterar o email');
          setSavingProfile(false);
          return;
        }
        // Call edge function to verify password and update email
        const { data, error } = await supabase.functions.invoke('update-user-email', {
          body: { new_email: profileEmail.trim(), password: profilePassword },
        });
        if (error || data?.error) {
          toast.error(data?.error || error?.message || 'Erro ao alterar email');
          setSavingProfile(false);
          return;
        }
        toast.success('Email alterado com sucesso');
      }

      if (nameChanged && !emailChanged) {
        toast.success('Nome atualizado com sucesso');
      }
      await refreshProfiles();
      setEditingProfile(false);
      setProfileEmail('');
      setProfilePassword('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar perfil');
    }
    setSavingProfile(false);
  };

  const handleSaveCompanyName = async () => {
    if (!user || !companyNameForm.trim()) { toast.error('Nome da empresa não pode ser vazio'); return; }
    setSavingCompanyName(true);
    try {
      const { error } = await (supabase.from as any)('companies')
        .update({ name: companyNameForm.trim() })
        .eq('id', user.company_id);
      if (error) throw error;
      setCompany((prev: any) => prev ? { ...prev, name: companyNameForm.trim() } : prev);
      toast.success('Nome da empresa atualizado');
      setEditingCompanyName(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
    setSavingCompanyName(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) { toast.error('Preencha a senha atual e a nova senha'); return; }
    if (newPassword.length < 6) { toast.error('A nova senha deve ter pelo menos 6 caracteres'); return; }
    setSavingPassword(true);
    try {
      // Verify current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user!.email,
        password: currentPassword,
      });
      if (signInError) throw new Error('Senha atual incorreta');

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Senha alterada com sucesso');
      setChangingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar senha');
    }
    setSavingPassword(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 2MB.'); return; }
    setUploadingLogo(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.company_id}/logo.${ext}`;
      await supabase.storage.from('company-logos').remove([path]);
      const { error: upErr } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path);
      const logoUrl = urlData.publicUrl + '?t=' + Date.now();
      await (supabase.from as any)('companies').update({ logo_url: logoUrl }).eq('id', user.company_id);
      setCompany((prev: any) => prev ? { ...prev, logo_url: logoUrl } : prev);
      toast.success('Logo atualizada com sucesso');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar logo');
    }
    setUploadingLogo(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleRemoveLogo = async () => {
    if (!user) return;
    setUploadingLogo(true);
    try {
      const { data: files } = await supabase.storage.from('company-logos').list(user.company_id);
      if (files?.length) {
        await supabase.storage.from('company-logos').remove(files.map(f => `${user.company_id}/${f.name}`));
      }
      await (supabase.from as any)('companies').update({ logo_url: null }).eq('id', user.company_id);
      setCompany((prev: any) => prev ? { ...prev, logo_url: null } : prev);
      toast.success('Logo removida');
    } catch (err: any) {
      toast.error('Erro ao remover logo');
    }
    setUploadingLogo(false);
  };

  // Fetch profiles, company, and subscription
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoadingProfiles(true);
      const [profilesRes, companyRes, platformRes] = await Promise.all([
        (supabase.from as any)('profiles').select('*').order('created_at'),
        (supabase.from as any)('companies').select('*').eq('id', user.company_id).single(),
        (supabase.from as any)('platform_settings').select('key, value'),
      ]);
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (companyRes.data) setCompany(companyRes.data);
      if (platformRes.data) {
        const map: Record<string, string> = {};
        platformRes.data.forEach((r: any) => { map[r.key] = r.value; });
        setPlatformSettings(map);
      }
      setLoadingProfiles(false);
    };
    fetchData();
    checkSubscription();
  }, [user]);

  const checkSubscription = async () => {
    setLoadingSub(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (!error && data) setSubStatus(data);
    } catch {}
    setLoadingSub(false);
  };

  const handleCheckout = async (priceId: string) => {
    setCheckingOut(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { price_id: priceId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data?.url) window.open(data.url, '_blank');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar checkout');
    }
    setCheckingOut(false);
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (data?.url) window.open(data.url, '_blank');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao abrir portal');
    }
  };

  const refreshProfiles = async () => {
    const { data } = await (supabase.from as any)('profiles').select('*').order('created_at');
    if (data) setProfiles(data);
  };

  const openNewUser = () => {
    setEditingUser(null);
    setUserForm({ name: '', email: '', password: '', role: '' });
    setShowPassword(false);
    setShowUserModal(true);
  };

  const openEditUser = (p: Profile) => {
    setEditingUser(p);
    setUserForm({ name: p.name, email: p.email, password: '', role: p.role });
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.name || !userForm.email || !userForm.role) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (!editingUser && (!userForm.password || userForm.password.length < 6)) {
      toast.error('Senha deve ter no mínimo 6 caracteres');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        const { data, error } = await supabase.functions.invoke('manage-users', {
          body: { action: 'update', user_id: editingUser.id, name: userForm.name, role: userForm.role },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        toast.success('Usuário atualizado');
      } else {
        const { data, error } = await supabase.functions.invoke('manage-users', {
          body: { action: 'create', ...userForm },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        toast.success('Usuário criado');
      }
      await refreshProfiles();
      setShowUserModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
    setSaving(false);
  };

  const handleToggleStatus = async (p: Profile) => {
    const newStatus = p.status === 'active' ? 'inactive' : 'active';
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'update', user_id: p.id, status: newStatus },
    });
    if (error || data?.error) { toast.error('Erro ao atualizar status'); return; }
    toast.success(newStatus === 'active' ? 'Usuário ativado' : 'Usuário desativado');
    await refreshProfiles();
  };

  const handleDeleteUser = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'delete', user_id: showDeleteUser?.id },
    });
    if (error || data?.error) { toast.error(data?.error || 'Erro ao excluir'); return; }
    toast.success('Usuário excluído');
    setShowDeleteUser(null);
    setDeleteWord('');
    await refreshProfiles();
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Settings className="h-7 w-7 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Configurações</h1>
            <p className="text-muted-foreground text-sm">Gerencie configurações do sistema e usuários</p>
          </div>
        </div>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={logout}>
          <LogOut className="h-4 w-4 mr-2" /> Sair do Sistema
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={`w-full grid ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Usuários</TabsTrigger>}
          <TabsTrigger value="company">Empresa</TabsTrigger>
          <TabsTrigger value="plans">Planos</TabsTrigger>
        </TabsList>

        {/* ===== MEU PERFIL ===== */}
        <TabsContent value="profile" className="mt-4">
          <div className="card-glass p-6 space-y-6">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-display font-semibold text-foreground">Informações do Usuário</h2>
                <p className="text-sm text-muted-foreground">Suas informações de acesso e permissões</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: User info */}
              <div className="space-y-5">
                {editingProfile ? (
                  <>
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input value={profileName} onChange={e => setProfileName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Novo Email</Label>
                      <Input type="email" placeholder={user?.email || 'Novo email'} value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Deixe em branco para manter o email atual.</p>
                    </div>
                    {profileEmail.trim() !== '' && profileEmail.trim() !== user?.email && (
                      <div className="space-y-2">
                        <Label>Senha Atual (obrigatória para alterar email)</Label>
                        <div className="relative">
                          <Input
                            type={showProfilePassword ? 'text' : 'password'}
                            value={profilePassword}
                            onChange={e => setProfilePassword(e.target.value)}
                            placeholder="Digite sua senha atual"
                          />
                          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowProfilePassword(!showProfilePassword)}>
                            {showProfilePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditingProfile(false); setProfileName(user?.name || ''); setProfileEmail(''); setProfilePassword(''); }}>Cancelar</Button>
                      <Button size="sm" className="btn-gradient" disabled={savingProfile} onClick={handleSaveProfile}>
                        {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Nome</p>
                        <p className="text-lg font-display font-bold text-foreground">{user?.name}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <p className="text-foreground">{user?.email}</p>
                      </div>
                    </div>
                  </>
                )}

                {/* Alterar Senha */}
                <div className="border-t border-border pt-4">
                  {changingPassword ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-foreground">Alterar Senha</p>
                      <div className="space-y-2">
                        <Label>Senha Atual</Label>
                        <div className="relative">
                          <Input
                            type={showCurrentPw ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            placeholder="Digite sua senha atual"
                          />
                          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowCurrentPw(!showCurrentPw)}>
                            {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Nova Senha</Label>
                        <div className="relative">
                          <Input
                            type={showNewPw ? 'text' : 'password'}
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Digite a nova senha (mín. 6 caracteres)"
                          />
                          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowNewPw(!showNewPw)}>
                            {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setChangingPassword(false); setCurrentPassword(''); setNewPassword(''); }}>Cancelar</Button>
                        <Button size="sm" className="btn-gradient" disabled={savingPassword} onClick={handleChangePassword}>
                          {savingPassword && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar Senha
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Senha</p>
                        <p className="text-foreground">••••••••</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setChangingPassword(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Alterar
                      </Button>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Função</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={getRoleColor(user?.role || '')}>{getRoleLabel(user?.role || '')}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {ROLES.find(r => r.value === user?.role)?.description}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Membro desde</p>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="text-foreground">
                      {profiles.find(p => p.user_id === user?.id)?.created_at
                        ? format(new Date(profiles.find(p => p.user_id === user?.id)!.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Permissions */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-muted-foreground">Permissões de Acesso</p>
                <RolePermissionsDisplay role={user?.role || 'admin'} />
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 mt-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-yellow-600" />
                    <p className="font-semibold text-foreground text-sm">Nível de Acesso</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isAdmin
                      ? 'Você tem acesso total ao sistema e pode gerenciar todos os usuários e configurações.'
                      : 'Seu acesso é limitado às funcionalidades da sua função.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ===== USUÁRIOS ===== */}
        <TabsContent value="users" className="mt-4 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-display font-semibold text-foreground text-lg">Gerenciar Usuários</h2>
                <p className="text-sm text-muted-foreground">Controle de acesso e permissões do sistema</p>
              </div>
            </div>
            {isAdmin && (
              <Button onClick={openNewUser} className="btn-gradient">
                <Plus className="h-4 w-4 mr-1" /> Novo Usuário
              </Button>
            )}
          </div>

          {/* Email Patterns */}
          <div className="card-glass p-5 space-y-3">
            <div>
              <h3 className="font-semibold text-foreground">Padrões de Email</h3>
              <p className="text-sm text-muted-foreground">Formatos de email utilizados no sistema</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ROLES.map(r => (
                <div key={r.value} className="flex items-start gap-2">
                  <Badge className={r.color}>{r.label}</Badge>
                  <div>
                    <p className="text-sm text-foreground">{r.value}@[nome].com</p>
                    <p className="text-xs text-muted-foreground">Ex: {r.value}@joao.com</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Users List */}
          {loadingProfiles ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              {profiles.map(p => (
                <div key={p.id} className="card-glass p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-display font-bold text-foreground">{p.name}</p>
                        <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {p.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{p.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={getRoleColor(p.role)}>{getRoleLabel(p.role)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Criado em {format(new Date(p.created_at), 'dd/MM/yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditUser(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleStatus(p)}
                        title={p.status === 'active' ? 'Desativar' : 'Ativar'}
                      >
                        <XCircle className="h-3.5 w-3.5 text-warning" />
                      </Button>
                      {p.user_id !== user?.id && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => { setShowDeleteUser(p); setDeleteWord(''); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== EMPRESA ===== */}
        <TabsContent value="company" className="mt-4">
          <div className="card-glass p-6 space-y-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-display font-semibold text-foreground">Informações da Empresa</h2>
                <p className="text-sm text-muted-foreground">Configurações gerais da malharia</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Company info + Logo */}
              <div className="space-y-5">
                {/* Logo Upload */}
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Logo da Empresa</p>
                  <div className="flex items-start gap-4">
                    <div className="h-24 w-24 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                      {company?.logo_url ? (
                        <img src={company.logo_url} alt="Logo" className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                        {company?.logo_url ? 'Alterar Logo' : 'Enviar Logo'}
                      </Button>
                      {company?.logo_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={handleRemoveLogo}
                          disabled={uploadingLogo}
                        >
                          <X className="h-4 w-4 mr-1" /> Remover
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">PNG, JPG ou SVG. Máx 2MB.<br/>Aparece no menu lateral e nos PDFs.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Nome da Empresa</p>
                  {editingCompanyName ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Input value={companyNameForm} onChange={e => setCompanyNameForm(e.target.value)} className="max-w-xs" />
                      <Button variant="outline" size="sm" onClick={() => setEditingCompanyName(false)}>Cancelar</Button>
                      <Button size="sm" className="btn-gradient" disabled={savingCompanyName} onClick={handleSaveCompanyName}>
                        {savingCompanyName && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-display font-bold text-foreground">{company?.name || '—'}</p>
                      {isAdmin && (
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { setCompanyNameForm(company?.name || ''); setEditingCompanyName(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Setor</p>
                  <p className="text-foreground font-medium">Produção Têxtil</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sistema</p>
                  <p className="text-foreground font-medium">Gestão de Produção v1.0</p>
                </div>
              </div>

              {/* Right: Shifts + Roles */}
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-muted-foreground">Turnos de Trabalho</p>
                    {isAdmin && !editingShifts && (
                      <Button variant="outline" size="sm" onClick={() => { setShiftForm(shiftSettings); setEditingShifts(true); }}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                    )}
                    {editingShifts && (
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setEditingShifts(false)}>Cancelar</Button>
                        <Button size="sm" className="btn-gradient" disabled={savingShifts} onClick={async () => {
                          setSavingShifts(true);
                          try {
                            await saveShiftSettings(shiftForm);
                            toast.success('Turnos atualizados com sucesso');
                            setEditingShifts(false);
                          } catch { toast.error('Erro ao salvar turnos'); }
                          setSavingShifts(false);
                        }}>
                          {savingShifts && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {([
                      { label: 'Manhã', startKey: 'shift_manha_start', endKey: 'shift_manha_end' },
                      { label: 'Tarde', startKey: 'shift_tarde_start', endKey: 'shift_tarde_end' },
                      { label: 'Noite', startKey: 'shift_noite_start', endKey: 'shift_noite_end' },
                    ] as { label: string; startKey: keyof CompanyShiftSettings; endKey: keyof CompanyShiftSettings }[]).map(shift => (
                      <div key={shift.label} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                        <span className="font-medium text-foreground">{shift.label}</span>
                        {editingShifts ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="time"
                              value={shiftForm[shift.startKey]}
                              onChange={e => setShiftForm(p => ({ ...p, [shift.startKey]: e.target.value }))}
                              className="w-[110px] h-8 text-sm"
                            />
                            <span className="text-muted-foreground text-sm">-</span>
                            <Input
                              type="time"
                              value={shiftForm[shift.endKey]}
                              onChange={e => setShiftForm(p => ({ ...p, [shift.endKey]: e.target.value }))}
                              className="w-[110px] h-8 text-sm"
                            />
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {shiftSettings[shift.startKey]} - {shiftSettings[shift.endKey]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-3">Funções do Sistema</p>
                  <div className="space-y-2">
                    {ROLES.map(r => (
                      <div key={r.value} className={`flex items-center justify-between rounded-lg border p-3 ${r.color.replace('text-', 'border-').split(' ')[0]}/30 ${r.color.split(' ')[0]}/10`}>
                        <span className="font-medium text-foreground">{r.label}</span>
                        <Badge className={r.color}>{r.description.split(' ').slice(0, 3).join(' ')}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold text-muted-foreground">Modo de Registro de Produção</p>
                      <Button variant="outline" size="sm" onClick={() => setShowProductionMode(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Configurar
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Configure se cada máquina registra produção por <strong>rolos</strong> ou por <strong>voltas</strong>.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Email patterns */}
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-2">
              <p className="font-semibold text-foreground text-sm">Padrões de Email</p>
              <p className="text-sm text-muted-foreground"><strong>Administrador:</strong> admin@admin.com</p>
              <p className="text-sm text-muted-foreground"><strong>Mecânicos:</strong> mecanico@[nome].com (ex: mecanico@mateus.com)</p>
              <p className="text-sm text-muted-foreground"><strong>Revisadores:</strong> revisador@[nome].com (ex: revisador@joao.com)</p>
            </div>
          </div>
        </TabsContent>

        {/* ===== PLANOS ===== */}
        <TabsContent value="plans" className="mt-4">
          <div className="card-glass p-6 space-y-6">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <h2 className="font-display font-semibold text-foreground">Plano & Assinatura</h2>
                <p className="text-sm text-muted-foreground">Gerencie sua assinatura e veja o status do seu plano</p>
              </div>
            </div>

            {/* Subscription Status */}
            {loadingSub ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Verificando assinatura...
              </div>
            ) : subStatus ? (
              <div className="rounded-lg border p-4 space-y-2">
                {subStatus.status === 'free' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                        <Crown className="h-3 w-3 mr-1" /> Plano Grátis
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Você possui acesso <strong className="text-foreground">gratuito e ilimitado</strong> à plataforma.
                    </p>
                  </>
                )}
                {subStatus.status === 'trial' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-primary/10 text-primary border-primary/20">Período de Teste</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Você tem <strong className="text-foreground">{subStatus.days_left} dias</strong> restantes de teste grátis.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Termina em: {new Date(subStatus.trial_end).toLocaleDateString('pt-BR')}
                    </p>
                  </>
                )}
                {subStatus.status === 'grace' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-300 text-amber-600 bg-amber-50">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Carência
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Seu teste expirou. Você tem <strong className="text-foreground">{subStatus.days_left} dias</strong> de carência para realizar o pagamento.
                    </p>
                    <p className="text-xs text-destructive font-medium">
                      Após a carência, o acesso será bloqueado automaticamente.
                    </p>
                  </>
                )}
                {subStatus.status === 'active' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                        <Crown className="h-3 w-3 mr-1" /> Assinatura Ativa
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Seu plano está ativo até <strong className="text-foreground">{new Date(subStatus.subscription_end).toLocaleDateString('pt-BR')}</strong>.
                    </p>
                    <Button variant="outline" size="sm" onClick={handleManageSubscription}>
                      Gerenciar Assinatura
                    </Button>
                  </>
                )}
                {subStatus.status === 'blocked' && (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" /> Acesso Bloqueado
                      </Badge>
                    </div>
                    <p className="text-sm text-destructive">
                      Seu período de teste e carência expiraram. Assine um plano para continuar usando o sistema.
                    </p>
                  </>
                )}
              </div>
            ) : null}

            {/* Plans - hide when free or still loading */}
            {!loadingSub && subStatus?.status !== 'free' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Escolha seu plano</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Monthly Plan */}
                <div className="rounded-xl border p-5 space-y-4 hover:border-primary/30 transition-colors">
                  <div>
                    <h4 className="font-bold text-lg">Mensal</h4>
                    <p className="text-sm text-muted-foreground">Pague mês a mês, cancele quando quiser</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-foreground">
                      R$ {Number(platformSettings.monthly_price || '47.00').toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-sm">/mês</span>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>✓ Acesso a todos os módulos</li>
                    <li>✓ Suporte por WhatsApp</li>
                    <li>✓ Sem fidelidade</li>
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => handleCheckout('price_1TFw57KBxG6jcqUd6SXKLtWr')}
                    disabled={checkingOut || subStatus?.status === 'active'}
                  >
                    {checkingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {subStatus?.status === 'active' ? 'Plano Atual' : 'Assinar Mensal'}
                  </Button>
                </div>

                {/* Annual Plan */}
                <div className="rounded-xl border-2 border-primary/30 p-5 space-y-4 relative bg-primary/[0.02]">
                  <Badge className="absolute -top-3 right-4 bg-primary text-primary-foreground">40% OFF</Badge>
                  <div>
                    <h4 className="font-bold text-lg">Anual</h4>
                    <p className="text-sm text-muted-foreground">Economize 40% — parcele em até 12x no cartão</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-primary">
                      R$ {(Number(platformSettings.monthly_price || '47.00') * 12 * 0.6).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-sm">/ano</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ou 12x de R$ {(Number(platformSettings.monthly_price || '47.00') * 12 * 0.6 / 12).toFixed(2)}/mês no cartão
                  </p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>✓ Tudo do plano mensal</li>
                    <li>✓ 40% de economia</li>
                    <li>✓ Parcele em até 12x</li>
                  </ul>
                  <Button
                    className="w-full btn-gradient"
                    onClick={() => handleCheckout('price_1TFw5WKBxG6jcqUd5Ti8l7OG')}
                    disabled={checkingOut || subStatus?.status === 'active'}
                  >
                    {checkingOut ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {subStatus?.status === 'active' ? 'Plano Atual' : 'Assinar Anual'}
                  </Button>
                </div>
              </div>
            </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={checkSubscription} disabled={loadingSub}>
                {loadingSub ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Atualizar Status
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit User Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Usuário' : 'Criar Novo Usuário'}</DialogTitle>
            {!editingUser && <p className="text-sm text-muted-foreground">Preencha os dados para criar um novo usuário</p>}
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Completo <span className="text-destructive">*</span></Label>
              <Input value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: João Silva" />
            </div>
            {!editingUser && (
              <>
                <div className="space-y-2">
                  <Label>Email <span className="text-destructive">*</span></Label>
                  <Input type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="usuario@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Senha <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={userForm.password}
                      onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Função <span className="text-destructive">*</span></Label>
              <Select value={userForm.role} onValueChange={v => setUserForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label} - {r.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveUser} className="btn-gradient" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingUser ? 'Salvar' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Modal */}
      <Dialog open={!!showDeleteUser} onOpenChange={() => setShowDeleteUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir {showDeleteUser?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Digite <strong>EXCLUIR</strong> para confirmar.</p>
          <Input value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="EXCLUIR" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteUser(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteUser}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production Mode Modal */}
      <ProductionModeModal
        open={showProductionMode}
        onOpenChange={setShowProductionMode}
        machines={getMachines()}
        onSave={saveMachines}
      />
    </div>
  );
}