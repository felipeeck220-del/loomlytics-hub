import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Factory, User, Mail, Building2, Phone, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function Register() {
  const [form, setForm] = useState({
    admin_name: '', admin_email: '', company_name: '', whatsapp: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (form.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    setLoading(true);
    const success = await register({
      admin_name: form.admin_name,
      admin_email: form.admin_email,
      company_name: form.company_name,
      whatsapp: form.whatsapp,
      password: form.password,
    });
    setLoading(false);
    if (success) {
      toast.success('Conta criada com sucesso!');
      navigate('/');
    } else {
      toast.error('Este email já está cadastrado');
    }
  };

  const fields = [
    { key: 'admin_name', label: 'Nome do Administrador', icon: User, type: 'text', placeholder: 'Seu nome completo' },
    { key: 'admin_email', label: 'Email', icon: Mail, type: 'email', placeholder: 'seu@email.com' },
    { key: 'company_name', label: 'Nome da Empresa', icon: Building2, type: 'text', placeholder: 'Malharia XYZ' },
    { key: 'whatsapp', label: 'WhatsApp', icon: Phone, type: 'tel', placeholder: '(11) 99999-9999' },
    { key: 'password', label: 'Senha', icon: Lock, type: 'password', placeholder: '••••••••' },
    { key: 'confirmPassword', label: 'Confirmar Senha', icon: Lock, type: 'password', placeholder: '••••••••' },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 sidebar-gradient items-center justify-center p-12">
        <div className="text-center">
          <Factory className="w-20 h-20 text-sidebar-primary mx-auto mb-6" />
          <h1 className="text-4xl font-display font-bold text-sidebar-foreground mb-4">MalhaGest</h1>
          <p className="text-lg text-sidebar-foreground/70 max-w-md">
            Cadastre sua malharia e comece a gerenciar sua produção de forma inteligente.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <Factory className="w-10 h-10 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground">MalhaGest</h1>
          </div>

          <div className="card-glass p-8">
            <h2 className="text-2xl font-display font-bold text-foreground mb-1">Criar Conta</h2>
            <p className="text-muted-foreground mb-6">Preencha os dados para cadastrar sua malharia</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.map(f => (
                <div key={f.key} className="space-y-2">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <div className="relative">
                    <f.icon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id={f.key} type={f.type} placeholder={f.placeholder} className="pl-10"
                      value={(form as any)[f.key]} onChange={handleChange(f.key)} required />
                  </div>
                </div>
              ))}

              <Button type="submit" className="w-full btn-gradient" disabled={loading}>
                {loading ? 'Criando conta...' : 'Cadastrar'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">Entrar</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
