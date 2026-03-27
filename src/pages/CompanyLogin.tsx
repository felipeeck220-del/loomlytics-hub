import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Factory, Mail, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function CompanyLogin() {
  const { slug } = useParams<{ slug: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect to the company dashboard
  useEffect(() => {
    if (!authLoading && user) {
      navigate(`/${slug}`, { replace: true });
    }
  }, [authLoading, user, slug]);

  // Fetch company info by slug (public query)
  useEffect(() => {
    if (!slug) return;
    (supabase.from as any)('companies')
      .select('name, logo_url')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }: any) => {
        if (error || !data) {
          setNotFound(true);
        } else {
          setCompanyName(data.name);
          setCompanyLogo(data.logo_url || null);
        }
      });
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate(`/${slug}`, { replace: true });
    } else {
      toast.error(result.error || 'Email ou senha incorretos');
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Factory className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Empresa não encontrada</h1>
          <p className="text-muted-foreground">O link que você acessou não corresponde a nenhuma empresa cadastrada.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          {companyLogo ? (
            <img src={companyLogo} alt={companyName} className="h-16 w-16 rounded-xl object-contain" />
          ) : (
            <div className="icon-box icon-box-primary" style={{ width: 56, height: 56 }}>
              <Factory className="w-6 h-6 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
            {companyName || 'Carregando...'}
          </h1>
          <p className="text-sm text-muted-foreground font-light">
            Faça login para acessar o sistema
          </p>
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
      </div>
    </div>
  );
}