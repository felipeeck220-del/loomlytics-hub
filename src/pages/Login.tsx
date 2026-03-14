import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Factory, Mail, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate('/');
    } else {
      toast.error(result.error || 'Email ou senha incorretos');
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-[45%] sidebar-gradient items-center justify-center p-16 relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(hsl(210 40% 98%) 1px, transparent 1px), linear-gradient(90deg, hsl(210 40% 98%) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />

        <div className="relative text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-sidebar-primary/20 flex items-center justify-center mx-auto mb-8 border border-sidebar-primary/30">
            <Factory className="w-8 h-8 text-sidebar-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold text-sidebar-foreground mb-4 tracking-tight">
            MalhaGest
          </h1>
          <p className="text-base text-sidebar-foreground/60 leading-relaxed">
            Sistema completo de gerenciamento para malharias. Controle produção, máquinas, clientes e muito mais.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { label: 'Produção', desc: 'Controle total' },
              { label: 'Máquinas', desc: 'Monitoramento' },
              { label: 'Relatórios', desc: 'Análise completa' },
            ].map(f => (
              <div key={f.label} className="text-left p-3 rounded-lg bg-sidebar-accent/50 border border-sidebar-border">
                <p className="text-xs font-semibold text-sidebar-foreground/90">{f.label}</p>
                <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Factory className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">MalhaGest</h1>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-display font-bold text-foreground tracking-tight">Bem-vindo de volta</h2>
              <p className="text-sm text-muted-foreground mt-1">Faça login para acessar sua conta</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="seu@email.com" className="pl-10 h-10"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" placeholder="••••••••" className="pl-10 h-10"
                    value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </div>

              <Button type="submit" className="w-full btn-gradient h-10" disabled={loading}>
                {loading ? 'Entrando...' : (
                  <>Entrar <ArrowRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-primary font-semibold hover:underline">
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
