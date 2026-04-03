
const ROLE_PERMISSIONS: Record<string, { allowed: string[]; denied: string[] }> = {
  admin: {
    allowed: ['Dashboard e Visão Geral', 'Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Clientes e Artigos', 'Registro de Produção', 'Terceirização', 'Gestão de Tecelões', 'Revisão', 'Mecânica', 'Relatórios e Análises', 'Configurações do Sistema', 'Alterar Senha', 'Financeiro'],
    denied: [],
  },
  lider: {
    allowed: ['Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Clientes e Artigos', 'Gestão de Tecelões', 'Revisão', 'Mecânica', 'Alterar Senha'],
    denied: ['Dashboard e Visão Geral', 'Registro de Produção', 'Terceirização', 'Relatórios e Análises', 'Financeiro'],
  },
  mecanico: {
    allowed: ['Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Mecânica', 'Alterar Senha'],
    denied: ['Dashboard e Visão Geral', 'Clientes e Artigos', 'Registro de Produção', 'Terceirização', 'Gestão de Tecelões', 'Revisão', 'Relatórios e Análises', 'Financeiro'],
  },
  revisador: {
    allowed: ['Revisão', 'Alterar Senha'],
    denied: ['Dashboard e Visão Geral', 'Máquinas e Manutenção', 'Acompanhamento de Manutenção', 'Clientes e Artigos', 'Registro de Produção', 'Terceirização', 'Gestão de Tecelões', 'Mecânica', 'Relatórios e Análises', 'Financeiro'],
  },
};

function RolePermissionsDisplay({ role }: { role: string }) {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.admin;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {perms.allowed.map(perm => (
        <div key={perm} className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
          <span className="text-sm text-foreground">{perm}</span>
        </div>
      ))}
      {perms.denied.map(perm => (
        <div key={perm} className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 opacity-40">
          <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
          <span className="text-sm text-muted-foreground line-through">{perm}</span>
        </div>
      ))}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { supabase } from '@/integrations/supabase/client';
import { fbTrack } from '@/lib/fbPixel';
import type { CompanyShiftSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { LogOut, Settings, Users, Building2, User, Mail, Calendar, Shield, Clock, Pencil, Trash2, Plus, XCircle, Loader2, Eye, EyeOff, Upload, ImageIcon, X, CreditCard, Crown, AlertTriangle, Key, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions, OVERRIDE_PERMISSIONS } from '@/hooks/usePermissions';
import ProductionModeModal from '@/components/ProductionModeModal';
import IotDevicesManager from '@/components/IotDevicesManager';
import SettingsTelasTab from '@/components/SettingsTelasTab';
import { QRCodeSVG } from 'qrcode.react';
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
  permission_overrides?: string[];
}

const ROLES = [
  { value: 'admin', label: 'Administrador', description: 'Acesso total ao sistema', color: 'bg-red-100 text-red-700' },
  { value: 'lider', label: 'Líder', description: 'Máquinas, artigos, revisão e mecânica', color: 'bg-purple-100 text-purple-700' },
  { value: 'mecanico', label: 'Mecânico', description: 'Acesso apenas às máquinas e mecânica', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'revisador', label: 'Revisador', description: 'Acesso apenas para revisão', color: 'bg-yellow-100 text-yellow-700' },
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
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
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
  const [checkingOut, setCheckingOut] = useState<'monthly' | 'annual' | null>(null);
  const [platformSettings, setPlatformSettings] = useState<Record<string, string>>({});
  const [companyPlanValue, setCompanyPlanValue] = useState<number | null>(null);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Pix payment state
  const [pixModal, setPixModal] = useState(false);
  const [pixCode, setPixCode] = useState('');
  const [pixIdentifier, setPixIdentifier] = useState('');
  const [pixAmount, setPixAmount] = useState(0);
  const [pixPlanName, setPixPlanName] = useState('');
  const [pixStatus, setPixStatus] = useState<string>('pending');
  const [checkingPixStatus, setCheckingPixStatus] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const pixPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showAllPayments, setShowAllPayments] = useState(false);

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
      const [profilesRes, companyRes, platformRes, companySettingsRes] = await Promise.all([
        (supabase.from as any)('profiles').select('*').order('created_at'),
        (supabase.from as any)('companies').select('*').eq('id', user.company_id).single(),
        (supabase.from as any)('platform_settings').select('key, value'),
        (supabase.from as any)('company_settings').select('monthly_plan_value').eq('company_id', user.company_id).single(),
      ]);
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (companyRes.data) setCompany(companyRes.data);
      if (platformRes.data) {
        const map: Record<string, string> = {};
        platformRes.data.forEach((r: any) => { map[r.key] = r.value; });
        setPlatformSettings(map);
      }
      if (companySettingsRes.data && companySettingsRes.data.monthly_plan_value != null) {
        setCompanyPlanValue(Number(companySettingsRes.data.monthly_plan_value));
      }
      setLoadingProfiles(false);
    };
    fetchData();
    checkSubscription();
    fetchPaymentHistory();
  }, [user]);

  const checkSubscription = async () => {
    setLoadingSub(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setLoadingSub(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!error && data) setSubStatus(data);
    } catch {}
    setLoadingSub(false);
  };

  const handleCheckout = async (plan: 'monthly' | 'annual') => {
    setCheckingOut(plan);
    try {
      const { data, error } = await supabase.functions.invoke('create-pix-checkout', {
        body: { plan },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setPixCode(data.pix_code);
      setPixIdentifier(data.identifier);
      setPixAmount(data.amount);
      setPixPlanName(data.plan_name);
      setPixStatus('pending');
      setPixModal(true);
      fbTrack('InitiateCheckout', { value: data.amount, currency: 'BRL', content_name: data.plan_name });
      // Start polling for payment status
      startPixPolling(data.identifier);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar Pix');
    }
    setCheckingOut(null);
  };

  const startPixPolling = (identifier: string) => {
    if (pixPollRef.current) clearInterval(pixPollRef.current);
    pixPollRef.current = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-pix-payment', {
          body: { identifier },
        });
        if (!error && data) {
          if (data.status === 'paid') {
            setPixStatus('paid');
            if (pixPollRef.current) clearInterval(pixPollRef.current);
            fbTrack('Purchase', { value: data.amount || 0, currency: 'BRL' });
            toast.success('Pagamento confirmado!');
            checkSubscription();
            fetchPaymentHistory();
            // Notify header to update trial badge
            window.dispatchEvent(new Event('subscription-updated'));
          } else if (data.status === 'failed') {
            setPixStatus('failed');
            if (pixPollRef.current) clearInterval(pixPollRef.current);
          }
        }
      } catch {}
    }, 5000);
  };

  const fetchPaymentHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    const { data } = await (supabase.from as any)('payment_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setPaymentHistory(data);
    setLoadingHistory(false);
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    setCancellingSubscription(true);
    try {
      // Determine grace_period_end from the last paid payment's next_billing_date
      // or fallback to 30 days from now
      let gracePeriodEnd: string;
      const lastPaid = paymentHistory.find((p: any) => p.status === 'paid' && p.next_billing_date);
      if (lastPaid?.next_billing_date) {
        gracePeriodEnd = lastPaid.next_billing_date;
      } else {
        // Fallback: 30 days from now
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 30);
        gracePeriodEnd = fallback.toISOString();
      }

      await (supabase.from as any)('company_settings')
        .update({ 
          subscription_status: 'cancelling',
          grace_period_end: gracePeriodEnd,
        })
        .eq('company_id', user.company_id);
      toast.success('Assinatura cancelada. Você terá acesso até o fim do período pago.');
      setShowCancelDialog(false);
      checkSubscription();
      window.dispatchEvent(new Event('subscription-updated'));
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar assinatura');
    }
    setCancellingSubscription(false);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pixPollRef.current) clearInterval(pixPollRef.current);
    };
  }, []);

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
          body: { action: 'update', user_id: editingUser.user_id, name: userForm.name, role: userForm.role },
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
      body: { action: 'update', user_id: p.user_id, status: newStatus },
    });
    if (error || data?.error) { toast.error('Erro ao atualizar status'); return; }
    toast.success(newStatus === 'active' ? 'Usuário ativado' : 'Usuário desativado');
    await refreshProfiles();
  };

  const handleAdminChangePassword = async () => {
    if (!changePasswordUser || !adminNewPassword || adminNewPassword.length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres');
      return;
    }
    setSavingAdminPw(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'change_password', user_id: changePasswordUser.user_id, new_password: adminNewPassword },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success('Senha alterada com sucesso');
      setChangePasswordUser(null);
      setAdminNewPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar senha');
    }
    setSavingAdminPw(false);
  };

  const [deletingUser, setDeletingUser] = useState(false);
  
  // Permission overrides modal
  const [permissionsUser, setPermissionsUser] = useState<Profile | null>(null);
  const [permOverrides, setPermOverrides] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const openPermissionsModal = (p: Profile) => {
    setPermissionsUser(p);
    setPermOverrides(Array.isArray(p.permission_overrides) ? [...p.permission_overrides] : []);
  };

  const togglePermOverride = (key: string) => {
    setPermOverrides(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setSavingPerms(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'update_permissions', user_id: permissionsUser.user_id, permission_overrides: permOverrides },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success('Permissões atualizadas');
      await refreshProfiles();
      setPermissionsUser(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar permissões');
    }
    setSavingPerms(false);
  };

  const handleDeleteUser = async () => {
    if (deleteWord !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    setDeletingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'delete', user_id: showDeleteUser?.user_id },
      });
      if (error || data?.error) { toast.error(data?.error || 'Erro ao excluir'); return; }
      toast.success('Usuário excluído');
      setShowDeleteUser(null);
      setDeleteWord('');
      await refreshProfiles();
    } finally {
      setDeletingUser(false);
    }
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
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setShowLogoutDialog(true)}>
          <LogOut className="h-4 w-4 mr-2" /> Sair do Sistema
        </Button>
        <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deseja sair do sistema?</AlertDialogTitle>
              <AlertDialogDescription>
                Você será desconectado e precisará fazer login novamente para acessar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={logout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Sair
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={`w-full grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-3'}`}>
          <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Usuários</TabsTrigger>}
          <TabsTrigger value="company">Empresa</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="telas" disabled className="relative opacity-50 cursor-not-allowed">
              Telas
              <span className="ml-1.5 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium leading-none">
                Em breve
              </span>
            </TabsTrigger>
          )}
          <TabsTrigger value="plans">Planos</TabsTrigger>
        </TabsList>

        {/* ===== MEU PERFIL ===== */}
        <TabsContent value="profile" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: User Card */}
            <div className="lg:col-span-1 space-y-5">
              {/* Avatar & Name Card */}
              <div className="card-glass p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/30 flex items-center justify-center">
                    <span className="text-2xl font-bold text-primary">
                      {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-foreground">{user?.name}</h3>
                    <Badge className={`mt-1.5 ${getRoleColor(user?.role || '')}`}>{getRoleLabel(user?.role || '')}</Badge>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-foreground truncate">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Membro desde</p>
                      <p className="text-foreground">
                        {profiles.find(p => p.user_id === user?.id)?.created_at
                          ? format(new Date(profiles.find(p => p.user_id === user?.id)!.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Função</p>
                      <p className="text-foreground">{ROLES.find(r => r.value === user?.role)?.description}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-border space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setEditingProfile(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar Perfil
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setChangingPassword(true)}>
                    <Key className="h-3.5 w-3.5 mr-2" /> Alterar Senha
                  </Button>
                </div>
              </div>
            </div>

            {/* Right: Edit Forms + Permissions */}
            <div className="lg:col-span-2 space-y-5">
              {/* Edit Profile Form */}
              {editingProfile && (
                <div className="card-glass p-6 space-y-4 border-primary/30">
                  <div className="flex items-center gap-2">
                    <Pencil className="h-4 w-4 text-primary" />
                    <h3 className="font-display font-semibold text-foreground">Editar Perfil</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input value={profileName} onChange={e => setProfileName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Novo Email</Label>
                      <Input type="email" placeholder={user?.email || 'Novo email'} value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Deixe em branco para manter o atual.</p>
                    </div>
                  </div>
                  {profileEmail.trim() !== '' && profileEmail.trim() !== user?.email && (
                    <div className="space-y-2 max-w-sm">
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
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditingProfile(false); setProfileName(user?.name || ''); setProfileEmail(''); setProfilePassword(''); }}>Cancelar</Button>
                    <Button size="sm" className="btn-gradient" disabled={savingProfile} onClick={handleSaveProfile}>
                      {savingProfile && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
                    </Button>
                  </div>
                </div>
              )}

              {/* Change Password Form */}
              {changingPassword && (
                <div className="card-glass p-6 space-y-4 border-primary/30">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-primary" />
                    <h3 className="font-display font-semibold text-foreground">Alterar Senha</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Senha Atual</Label>
                      <div className="relative">
                        <Input type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Senha atual" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowCurrentPw(!showCurrentPw)}>
                          {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Nova Senha</Label>
                      <div className="relative">
                        <Input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mín. 6 caracteres" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowNewPw(!showNewPw)}>
                          {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => { setChangingPassword(false); setCurrentPassword(''); setNewPassword(''); }}>Cancelar</Button>
                    <Button size="sm" className="btn-gradient" disabled={savingPassword} onClick={handleChangePassword}>
                      {savingPassword && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar Senha
                    </Button>
                  </div>
                </div>
              )}

              {/* Permissions */}
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h3 className="font-display font-semibold text-foreground">Permissões de Acesso</h3>
                </div>
                <RolePermissionsDisplay role={user?.role || 'admin'} />
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-sm text-foreground">
                    {isAdmin
                      ? '✓ Você tem acesso total ao sistema e pode gerenciar todos os usuários e configurações.'
                      : '⚠ Seu acesso é limitado às funcionalidades da sua função. Contate o administrador para alterações.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ===== USUÁRIOS ===== */}
        <TabsContent value="users" className="mt-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
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

          {/* Email Patterns - Compact */}
          <div className="card-glass p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Padrões de Email por Função</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ROLES.map(r => (
                <div key={r.value} className="rounded-lg border border-border bg-muted/20 p-3 text-center space-y-1.5">
                  <Badge className={`${r.color} text-xs`}>{r.label}</Badge>
                  <p className="text-xs text-foreground font-mono">{r.value}@[nome].com</p>
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
                <div key={p.id} className="card-glass p-4 flex items-center justify-between hover:border-primary/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{p.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-bold text-foreground">{p.name}</p>
                        {p.code && (
                          <Badge variant="outline" className="text-xs font-mono">#{p.code}</Badge>
                        )}
                        <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {p.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{p.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={getRoleColor(p.role)}>{getRoleLabel(p.role)}</Badge>
                        <span className="text-xs text-muted-foreground">
                          Desde {format(new Date(p.created_at), 'dd/MM/yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      {p.role !== 'admin' && (
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openPermissionsModal(p)} title="Permissões Extras">
                          <Eye className="h-3.5 w-3.5 text-primary" />
                        </Button>
                      )}
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditUser(p)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setChangePasswordUser(p); setAdminNewPassword(''); setShowAdminNewPw(false); }} title="Alterar Senha">
                        <Key className="h-3.5 w-3.5" />
                      </Button>
                      {p.user_id !== user?.id && (
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleToggleStatus(p)} title={p.status === 'active' ? 'Desativar' : 'Ativar'}>
                          <XCircle className="h-3.5 w-3.5 text-warning" />
                        </Button>
                      )}
                      {p.user_id !== user?.id && (
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setShowDeleteUser(p); setDeleteWord(''); }}>
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
        <TabsContent value="company" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-5">
              {/* Logo & Identity Card */}
              <div className="card-glass p-6 space-y-5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h3 className="font-display font-semibold text-foreground">Identidade da Empresa</h3>
                </div>

                {/* Logo */}
                <div className="flex items-center gap-5">
                  <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                    {company?.logo_url ? (
                      <img src={company.logo_url} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                        {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                        {company?.logo_url ? 'Alterar' : 'Enviar Logo'}
                      </Button>
                      {company?.logo_url && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleRemoveLogo} disabled={uploadingLogo}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">PNG, JPG ou SVG · Máx 2MB</p>
                  </div>
                </div>

                {/* Company Name */}
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Nome da Empresa</p>
                  {editingCompanyName ? (
                    <div className="flex items-center gap-2">
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setCompanyNameForm(company?.name || ''); setEditingCompanyName(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Setor</p>
                    <p className="text-sm text-foreground font-medium">Produção Têxtil</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sistema</p>
                    <p className="text-sm text-foreground font-medium">Gestão v1.0</p>
                  </div>
                </div>

              </div>

              {/* Roles Card */}
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h3 className="font-display font-semibold text-foreground">Funções do Sistema</h3>
                </div>
                <div className="space-y-2">
                  {ROLES.map(r => (
                    <div key={r.value} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                      <span className="font-medium text-foreground text-sm">{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-5">
              {/* Shifts Card */}
              <div className="card-glass p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="font-display font-semibold text-foreground">Turnos de Trabalho</h3>
                  </div>
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
                    { label: '☀️ Manhã', startKey: 'shift_manha_start', endKey: 'shift_manha_end' },
                    { label: '🌤️ Tarde', startKey: 'shift_tarde_start', endKey: 'shift_tarde_end' },
                    { label: '🌙 Noite', startKey: 'shift_noite_start', endKey: 'shift_noite_end' },
                  ] as { label: string; startKey: keyof CompanyShiftSettings; endKey: keyof CompanyShiftSettings }[]).map(shift => (
                    <div key={shift.label} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                      <span className="font-medium text-foreground text-sm">{shift.label}</span>
                      {editingShifts ? (
                        <div className="flex items-center gap-1">
                          <Input type="time" value={shiftForm[shift.startKey]} onChange={e => setShiftForm(p => ({ ...p, [shift.startKey]: e.target.value }))} className="w-[100px] h-8 text-sm" />
                          <span className="text-muted-foreground text-sm">—</span>
                          <Input type="time" value={shiftForm[shift.endKey]} onChange={e => setShiftForm(p => ({ ...p, [shift.endKey]: e.target.value }))} className="w-[100px] h-8 text-sm" />
                        </div>
                      ) : (
                        <span className="text-sm font-mono text-muted-foreground">
                          {shiftSettings[shift.startKey]} — {shiftSettings[shift.endKey]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Production Mode Card */}
              {isAdmin && (
                <div className="card-glass p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" />
                      <h3 className="font-display font-semibold text-foreground">Modo de Registro de Produção</h3>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowProductionMode(true)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Configurar
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">Configure se cada máquina registra produção por <strong>rolos</strong> ou por <strong>voltas</strong>.</p>
                </div>
              )}


              {/* IoT Devices */}
              {isAdmin && <IotDevicesManager />}

              {/* Email Patterns */}
              <div className="card-glass p-5 border-primary/10">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Padrões de Email</p>
                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <p><strong className="text-foreground">Administrador:</strong> admin@admin.com</p>
                  <p><strong className="text-foreground">Mecânicos:</strong> mecanico@[nome].com</p>
                  <p><strong className="text-foreground">Revisadores:</strong> revisador@[nome].com</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ===== TELAS ===== */}
        {isAdmin && (
          <TabsContent value="telas" className="mt-6">
            <SettingsTelasTab />
          </TabsContent>
        )}

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
                {(subStatus.status === 'active' || subStatus.status === 'cancelling') && (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                        <Crown className="h-3 w-3 mr-1" /> {subStatus.status === 'cancelling' ? 'Assinatura Cancelada' : 'Assinatura Ativa'}
                      </Badge>
                    </div>
                    {paymentHistory.length > 0 && paymentHistory[0].next_billing_date && (
                      <p className="text-sm text-muted-foreground">
                        {subStatus.status === 'cancelling'
                          ? <>Acesso até: <strong className="text-foreground">{new Date(paymentHistory[0].next_billing_date).toLocaleDateString('pt-BR')}</strong> · Não haverá cobranças futuras.</>
                          : <>Próxima cobrança: <strong className="text-foreground">{new Date(paymentHistory[0].next_billing_date).toLocaleDateString('pt-BR')}</strong>
                            {' · '}Plano: <strong className="text-foreground">{paymentHistory[0].plan === 'annual' ? 'Anual' : 'Mensal'}</strong></>
                        }
                      </p>
                    )}
                    {subStatus.status === 'active' && (
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 mt-2 w-fit" onClick={() => setShowCancelDialog(true)}>
                        Cancelar assinatura
                      </Button>
                    )}
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
            {!loadingSub && subStatus?.status !== 'free' && subStatus?.status !== 'active' && subStatus?.status !== 'cancelling' && (
            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Escolha seu plano (Pagamento via Pix)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Monthly Plan */}
                <div className="rounded-xl border p-5 space-y-4 hover:border-primary/30 transition-colors">
                  <div>
                    <h4 className="font-bold text-lg">Mensal</h4>
                    <p className="text-sm text-muted-foreground">Pague mês a mês via Pix</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-foreground">
                      R$ {(companyPlanValue !== null ? companyPlanValue : Number(platformSettings.monthly_price || '147.00')).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-sm">/mês</span>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>✓ Acesso a todos os módulos</li>
                    <li>✓ Suporte por WhatsApp</li>
                    <li>✓ Sem fidelidade</li>
                    <li>✓ Pagamento via Pix</li>
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => handleCheckout('monthly')}
                    disabled={!!checkingOut || subStatus?.status === 'active'}
                  >
                    {checkingOut === 'monthly' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {subStatus?.status === 'active' ? 'Plano Atual' : 'Pagar via Pix'}
                  </Button>
                </div>

                {/* Annual Plan */}
                <div className="rounded-xl border-2 border-primary/30 p-5 space-y-4 relative bg-primary/[0.02]">
                  <Badge className="absolute -top-3 right-4 bg-primary text-primary-foreground">40% OFF</Badge>
                  <div>
                    <h4 className="font-bold text-lg">Anual</h4>
                    <p className="text-sm text-muted-foreground">Economize 40% — pagamento único via Pix</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-primary">
                      R$ {((companyPlanValue !== null ? companyPlanValue : Number(platformSettings.monthly_price || '147.00')) * 12 * 0.6).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground text-sm">/ano</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    equivale a R$ {((companyPlanValue !== null ? companyPlanValue : Number(platformSettings.monthly_price || '147.00')) * 0.6).toFixed(2)}/mês
                  </p>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>✓ Tudo do plano mensal</li>
                    <li>✓ 40% de economia</li>
                    <li>✓ Pagamento único via Pix</li>
                  </ul>
                  <Button
                    className="w-full btn-gradient"
                    onClick={() => handleCheckout('annual')}
                    disabled={!!checkingOut || subStatus?.status === 'active'}
                  >
                    {checkingOut === 'annual' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {subStatus?.status === 'active' ? 'Plano Atual' : 'Pagar via Pix'}
                  </Button>
                </div>
              </div>
            </div>
            )}

            {/* Payment History */}
            {paymentHistory.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Último Pagamento</h3>
                  {paymentHistory.length > 1 && (
                    <Button variant="outline" size="sm" onClick={() => setShowAllPayments(true)}>
                      Ver todos ({paymentHistory.length})
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {paymentHistory[0].plan === 'annual' ? 'Plano Anual' : 'Plano Mensal'} — R$ {Number(paymentHistory[0].amount).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(paymentHistory[0].created_at), "dd/MM/yyyy 'às' HH:mm")}
                      {paymentHistory[0].next_billing_date && ` · Próx. cobrança: ${format(new Date(paymentHistory[0].next_billing_date), 'dd/MM/yyyy')}`}
                    </p>
                  </div>
                  <Badge variant={paymentHistory[0].status === 'paid' ? 'default' : paymentHistory[0].status === 'pending' ? 'secondary' : 'destructive'}>
                    {paymentHistory[0].status === 'paid' ? 'Pago' : paymentHistory[0].status === 'pending' ? 'Pendente' : paymentHistory[0].status === 'failed' ? 'Falhou' : paymentHistory[0].status === 'expired' ? 'Expirado' : paymentHistory[0].status}
                  </Badge>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { checkSubscription(); fetchPaymentHistory(); }} disabled={loadingSub}>
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
            <Button variant="outline" onClick={() => setShowDeleteUser(null)} disabled={deletingUser}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deletingUser}>
              {deletingUser && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {deletingUser ? 'Excluindo...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Modal (Admin) */}
      <Dialog open={!!changePasswordUser} onOpenChange={() => setChangePasswordUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Senha - {changePasswordUser?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {changePasswordUser?.code && <span className="font-mono">#{changePasswordUser.code} · </span>}
              {changePasswordUser?.email}
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nova Senha</Label>
              <div className="relative">
                <Input
                  type={showAdminNewPw ? 'text' : 'password'}
                  value={adminNewPassword}
                  onChange={e => setAdminNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setShowAdminNewPw(!showAdminNewPw)}>
                  {showAdminNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePasswordUser(null)}>Cancelar</Button>
            <Button onClick={handleAdminChangePassword} className="btn-gradient" disabled={savingAdminPw}>
              {savingAdminPw && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductionModeModal
        open={showProductionMode}
        onOpenChange={setShowProductionMode}
        machines={getMachines()}
        onSave={saveMachines}
      />

      {/* Pix QR Code Modal */}
      <Dialog open={pixModal} onOpenChange={(open) => {
        setPixModal(open);
        if (!open && pixPollRef.current) {
          clearInterval(pixPollRef.current);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Pagamento via Pix
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-center">
            {pixStatus === 'pending' && (
              <>
                <p className="text-sm text-muted-foreground">
                  {pixPlanName} — <strong className="text-foreground">R$ {pixAmount.toFixed(2)}</strong>
                </p>
                <div className="bg-muted/30 rounded-lg p-4 space-y-4">
                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="bg-white p-3 rounded-lg">
                      <QRCodeSVG value={pixCode} size={180} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Escaneie o QR Code ou copie o código abaixo:</p>
                  <div className="bg-background border border-border rounded-lg p-3 break-all text-xs font-mono text-foreground select-all max-h-24 overflow-y-auto">
                    {pixCode}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(pixCode);
                      toast.success('Código Pix copiado!');
                    }}
                  >
                    Copiar Código Pix
                  </Button>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aguardando pagamento...
                </div>
                <p className="text-xs text-muted-foreground">
                  O pagamento será confirmado automaticamente assim que identificado.
                </p>
              </>
            )}
            {pixStatus === 'paid' && (
              <div className="space-y-3 py-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Crown className="h-8 w-8 text-emerald-500" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Pagamento Confirmado!</h3>
                <p className="text-sm text-muted-foreground">Sua assinatura foi ativada com sucesso.</p>
              </div>
            )}
            {pixStatus === 'failed' && (
              <div className="space-y-3 py-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Pagamento Falhou</h3>
                <p className="text-sm text-muted-foreground">Tente novamente ou entre em contato com o suporte.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setPixModal(false);
              if (pixPollRef.current) clearInterval(pixPollRef.current);
            }}>
              {pixStatus === 'paid' ? 'Fechar' : 'Cancelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment History Modal */}
      <Dialog open={showAllPayments} onOpenChange={setShowAllPayments}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico de Pagamentos</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto space-y-2 flex-1 pr-1">
            {paymentHistory.map((ph: any) => (
              <div key={ph.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {ph.plan === 'annual' ? 'Plano Anual' : 'Plano Mensal'} — R$ {Number(ph.amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(ph.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    {ph.next_billing_date && ` · Próx. cobrança: ${format(new Date(ph.next_billing_date), 'dd/MM/yyyy')}`}
                  </p>
                </div>
                <Badge variant={ph.status === 'paid' ? 'default' : ph.status === 'pending' ? 'secondary' : 'destructive'}>
                  {ph.status === 'paid' ? 'Pago' : ph.status === 'pending' ? 'Pendente' : ph.status === 'failed' ? 'Falhou' : ph.status === 'expired' ? 'Expirado' : ph.status}
                </Badge>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAllPayments(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Cancel Subscription Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao cancelar, você continuará tendo acesso até o fim do período já pago. Após essa data, o acesso será bloqueado e não haverá cobranças futuras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancelSubscription}
              disabled={cancellingSubscription}
            >
              {cancellingSubscription && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permission Overrides Modal */}
      <Dialog open={!!permissionsUser} onOpenChange={(open) => { if (!open) setPermissionsUser(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Permissões Extras
            </DialogTitle>
          </DialogHeader>
          {permissionsUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{permissionsUser.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{permissionsUser.name}</p>
                  <Badge className={`${getRoleColor(permissionsUser.role)} text-xs`}>{getRoleLabel(permissionsUser.role)}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Conceda permissões extras além do padrão da função. Estas permissões são bloqueadas por padrão para este role.
              </p>
              <div className="space-y-2">
                {OVERRIDE_PERMISSIONS.map(perm => (
                  <button
                    key={perm.key}
                    type="button"
                    onClick={() => togglePermOverride(perm.key)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                      permOverrides.includes(perm.key)
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border bg-background hover:bg-muted/30'
                    }`}
                  >
                    <div className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                      permOverrides.includes(perm.key)
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/40'
                    }`}>
                      {permOverrides.includes(perm.key) && (
                        <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{perm.label}</p>
                      <p className="text-xs text-muted-foreground">{perm.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsUser(null)}>Cancelar</Button>
            <Button className="btn-gradient" disabled={savingPerms} onClick={handleSavePermissions}>
              {savingPerms && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}