import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Factory, Mail, Lock, ArrowRight, BarChart3, Settings2, ClipboardList } from 'lucide-react';
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
      {/* Left brand panel - gradient dark */}
      <div className="hidden lg:flex lg:w-[48%] relative items-center justify-center p-16 overflow-hidden" style={{ background: 'linear-gradient(195deg, hsl(220 15% 20%), hsl(220 18% 10%))' }}>
        {/* Soft grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
        
        <div className="relative text-center max-w-md z-10">
          <div className="icon-box icon-box-primary mx-auto mb-8" style={{ width: 64, height: 64 }}>
            <Factory className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-display font-bold text-white mb-3 tracking-tight">
            MalhaGest
          </h1>
          <p className="text-base text-white/50 leading-relaxed font-light">
            Sistema completo de gerenciamento para malharias. Controle produção, máquinas, clientes e muito mais.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-4">
            {[
              { label: 'Produção', desc: 'Controle total', icon: ClipboardList },
              { label: 'Máquinas', desc: 'Monitoramento', icon: Settings2 },
              { label: 'Relatórios', desc: 'Análise completa', icon: BarChart3 },
            ].map(f => (
              <div key={f.label} className="text-left p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <f.icon className="h-5 w-5 text-primary mb-2" />
                <p className="text-xs font-medium text-white/90">{f.label}</p>
                <p className="text-[10px] text-white/40 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="icon-box icon-box-primary" style={{ width: 40, height: 40 }}>
              <Factory className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">MalhaGest</h1>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-display font-bold text-foreground">Bem-vindo de volta</h2>
              <p className="text-sm text-muted-foreground mt-1 font-light">Faça login para acessar sua conta</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <Input id="email" type="email" placeholder="seu@email.com" className="pl-10 h-11 rounded-lg border-border/60 focus:border-primary"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground/60" />
                  <Input id="password" type="password" placeholder="••••••••" className="pl-10 h-11 rounded-lg border-border/60 focus:border-primary"
                    value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </div>

              <Button type="submit" className="w-full btn-gradient h-11 text-sm" disabled={loading}>
                {loading ? 'Entrando...' : (
                  <>Entrar <ArrowRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-primary font-medium hover:underline">
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
