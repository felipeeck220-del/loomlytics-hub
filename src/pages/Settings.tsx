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
import { LogOut, Settings, Users, Building2, User, Mail, Calendar, Shield, Clock, Pencil, Trash2, Plus, XCircle, Loader2, Eye, EyeOff, Upload, ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
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
  const { shiftSettings, saveShiftSettings } = useSharedCompanyData();
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
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [editingShifts, setEditingShifts] = useState(false);
  const [shiftForm, setShiftForm] = useState<CompanyShiftSettings>(shiftSettings);
  const [savingShifts, setSavingShifts] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Company name editing
  const [editingCompanyName, setEditingCompanyName] = useState(false);
  const [companyNameForm, setCompanyNameForm] = useState('');
  const [savingCompanyName, setSavingCompanyName] = useState(false);

  useEffect(() => {
    setProfileName(user?.name || '');
    setProfileEmail(user?.email || '');
  }, [user?.name, user?.email]);

  const handleSaveProfile = async () => {
    if (!user || !profileName.trim()) { toast.error('Nome não pode ser vazio'); return; }
    setSavingProfile(true);
    try {
      const nameChanged = profileName.trim() !== user.name;
      const emailChanged = profileEmail.trim() !== user.email;

      if (nameChanged) {
        const { error } = await (supabase.from as any)('profiles')
          .update({ name: profileName.trim() })
          .eq('id', user.id);
        if (error) throw error;
      }

      if (emailChanged) {
        if (!profileEmail.trim() || !/\S+@\S+\.\S+/.test(profileEmail.trim())) {
          toast.error('Email inválido');
          setSavingProfile(false);
          return;
        }
        const { error } = await supabase.auth.updateUser({ email: profileEmail.trim() });
        if (error) throw error;
        toast.info('Um email de confirmação foi enviado para o novo endereço. Confirme para concluir a alteração.');
      }

      if (nameChanged) {
        toast.success('Nome atualizado com sucesso');
        await refreshProfiles();
      }
      setEditingProfile(false);
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

  // Fetch profiles and company
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoadingProfiles(true);
      const [profilesRes, companyRes] = await Promise.all([
        (supabase.from as any)('profiles').select('*').order('created_at'),
        (supabase.from as any)('companies').select('*').eq('id', user.company_id).single(),
      ]);
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (companyRes.data) setCompany(companyRes.data);
      setLoadingProfiles(false);
    };
    fetchData();
  }, [user]);

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
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="company">Empresa</TabsTrigger>
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
                      <Label>Email</Label>
                      <Input type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Ao alterar o email, um código de confirmação será enviado ao novo endereço.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditingProfile(false); setProfileName(user?.name || ''); setProfileEmail(user?.email || ''); }}>Cancelar</Button>
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
                      {profiles.find(p => p.id === user?.id)?.created_at
                        ? format(new Date(profiles.find(p => p.id === user?.id)!.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: Permissions */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-muted-foreground">Permissões de Acesso</p>
                <div className="space-y-2">
                  {PERMISSIONS.map(perm => (
                    <div key={perm} className="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-sm text-foreground">{perm}</span>
                    </div>
                  ))}
                </div>
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
                      {p.id !== user?.id && (
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
                  <p className="text-lg font-display font-bold text-foreground">{company?.name || '—'}</p>
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
    </div>
  );
}
