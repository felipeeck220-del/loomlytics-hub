import { useState, useEffect } from 'react';
import { fbTrack } from '@/lib/fbPixel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard, Settings2, Users, ClipboardList, Factory, FileText,
  HardHat, Search, CheckCircle2, X, ArrowRight, Zap, Shield, BarChart3,
  Clock, TrendingUp, Wrench
} from 'lucide-react';
import spreadsheetImg from '@/assets/spreadsheet-old.jpg';
import notebookImg from '@/assets/notebook-old.jpg';

const features = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard Inteligente',
    description: 'Visão completa da sua produção em tempo real. Eficiência, faturamento e indicadores em um só lugar.',
  },
  {
    icon: Settings2,
    title: 'Gestão de Máquinas',
    description: 'Controle o status de cada máquina — ativa, manutenção preventiva, corretiva ou troca de artigo.',
  },
  {
    icon: ClipboardList,
    title: 'Registro de Produção',
    description: 'Registre produção por turno, tecelão e máquina. Cálculo automático de eficiência e faturamento.',
  },
  {
    icon: Users,
    title: 'Clientes & Artigos',
    description: 'Gerencie seus clientes e artigos com valores por kg, voltas por rolo e meta de eficiência.',
  },
  {
    icon: HardHat,
    title: 'Gestão de Tecelões',
    description: 'Cadastre tecelões com turnos fixos ou personalizados. Acompanhe a performance individual.',
  },
  {
    icon: Factory,
    title: 'Terceirizado',
    description: 'Controle produções terceirizadas com cálculo automático de custo, receita e lucro por kg.',
  },
  {
    icon: Search,
    title: 'Revisão de Qualidade',
    description: 'Registre defeitos por máquina, artigo e tecelão. Mantenha o controle de qualidade rigoroso.',
  },
  {
    icon: Wrench,
    title: 'Mecânica',
    description: 'Calendário de manutenções, histórico completo por máquina, acompanhamento em tempo real com observações.',
  },
  {
    icon: FileText,
    title: 'Relatórios Completos',
    description: 'Relatórios detalhados de produção, eficiência e faturamento com filtros por período e turno.',
  },
];

const painPoints = [
  'Perder horas atualizando planilhas manualmente',
  'Não saber a eficiência real de cada máquina',
  'Calcular faturamento no papel e errar',
  'Não ter controle de qualidade organizado',
  'Depender de anotações que se perdem',
];

const benefits = [
  'Dados centralizados e acessíveis de qualquer lugar',
  'Cálculos automáticos de eficiência e faturamento',
  'Multi-usuário com permissões por cargo',
  'Relatórios prontos em segundos',
  'Controle total da produção em tempo real',
];

export default function Vendas() {
  const navigate = useNavigate();
  const [trialDays, setTrialDays] = useState(90);
  const [monthlyPrice, setMonthlyPrice] = useState(47);

  useEffect(() => {
    fbTrack('PageView');
    supabase.from('platform_settings').select('key, value').then(({ data }) => {
      (data || []).forEach((row: any) => {
        if (row.key === 'trial_days') setTrialDays(Number(row.value));
        if (row.key === 'monthly_price') setMonthlyPrice(Number(row.value));
      });
    });
  }, []);

  const trialMonths = Math.round(trialDays / 30);
  const annualPrice = monthlyPrice * 12 * 0.6;
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Factory className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">MalhaGest</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              Entrar
            </Button>
            <Button size="sm" onClick={() => navigate('/register')}>
              Criar Conta
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-4 pt-16 pb-12 relative">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <Badge variant="outline" className="mb-4 text-sm px-4 py-1.5">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Gestão Têxtil Moderna
            </Badge>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight mb-6">
              Você ainda usa <span className="text-destructive">planilhas</span> ou anota seu faturamento em um{' '}
              <span className="text-destructive">caderno</span>?
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Chega disso.</strong> Sua indústria têxtil merece uma ferramenta profissional
              que calcula eficiência, faturamento e controla toda a produção automaticamente.
            </p>
          </div>

          {/* Old methods with X */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
            <div className="relative group">
              <div className="rounded-xl overflow-hidden border-2 border-destructive/30 shadow-lg">
                <img
                  src={spreadsheetImg}
                  alt="Planilha desorganizada"
                  width={800}
                  height={512}
                  className="w-full h-auto opacity-70"
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-28 w-28 rounded-full bg-destructive/90 flex items-center justify-center shadow-2xl">
                  <X className="h-16 w-16 text-white stroke-[3]" />
                </div>
              </div>
              <p className="text-center mt-3 text-sm font-medium text-destructive">
                Planilhas confusas e propensas a erros
              </p>
            </div>

            <div className="relative group">
              <div className="rounded-xl overflow-hidden border-2 border-destructive/30 shadow-lg">
                <img
                  src={notebookImg}
                  alt="Caderno de anotações"
                  width={800}
                  height={512}
                  loading="lazy"
                  className="w-full h-auto opacity-70"
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-28 w-28 rounded-full bg-destructive/90 flex items-center justify-center shadow-2xl">
                  <X className="h-16 w-16 text-white stroke-[3]" />
                </div>
              </div>
              <p className="text-center mt-3 text-sm font-medium text-destructive">
                Anotações em caderno que se perdem
              </p>
            </div>
          </div>

          {/* Arrow transition */}
          <div className="flex flex-col items-center gap-3 mb-16">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center animate-bounce">
              <ArrowRight className="h-6 w-6 text-primary rotate-90" />
            </div>
            <p className="text-lg font-semibold text-primary">
              Troque tudo isso por um sistema completo
            </p>
          </div>
        </div>
      </section>

      {/* Pain vs Solution */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="border-destructive/20">
              <CardContent className="pt-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-destructive">
                  <X className="h-5 w-5" />
                  Sem o MalhaGest
                </h3>
                <ul className="space-y-3">
                  {painPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <X className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      {point}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-primary/20">
              <CardContent className="pt-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  Com o MalhaGest
                </h3>
                <ul className="space-y-3">
                  {benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {benefit}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Módulos completos para gerenciar cada aspecto da sua produção têxtil
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((feature, i) => (
              <Card key={i} className="group hover:shadow-lg hover:border-primary/20 transition-all duration-300">
                <CardContent className="pt-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-primary/5">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { icon: Clock, value: '80%', label: 'Menos tempo em planilhas' },
              { icon: TrendingUp, value: '100%', label: 'Controle de eficiência' },
              { icon: Shield, value: '24/7', label: 'Acesso de qualquer lugar' },
              { icon: BarChart3, value: 'Real-time', label: 'Dados em tempo real' },
            ].map((stat, i) => (
              <div key={i} className="space-y-2">
                <stat.icon className="h-6 w-6 text-primary mx-auto" />
                <div className="text-2xl md:text-3xl font-extrabold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-10 md:p-14">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
              Teste grátis por {trialMonths} {trialMonths === 1 ? 'mês' : 'meses'}
            </h2>
            <p className="text-muted-foreground text-lg mb-4 max-w-xl mx-auto">
              Sem compromisso, sem cartão de crédito. Experimente todos os módulos e veja
              sua gestão têxtil se transformar.
            </p>
            <div className="mb-8 space-y-1">
              <p className="text-sm text-muted-foreground">
                Após o período grátis: <span className="font-semibold text-foreground">R$ {monthlyPrice.toFixed(2)}/mês</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Plano anual: <span className="font-semibold text-primary">R$ {annualPrice.toFixed(2)}/ano</span>{' '}
                <span className="text-xs text-muted-foreground">(em até 12x de R$ {(annualPrice / 12).toFixed(2)} no cartão)</span>{' '}
                <Badge variant="secondary" className="text-xs">40% OFF</Badge>
              </p>
            </div>
            <Button
              size="lg"
              className="text-lg px-10 py-6 h-auto font-bold shadow-lg hover:shadow-xl transition-all max-w-full whitespace-normal"
              onClick={() => navigate('/register')}
            >
              Começar Agora — É Grátis
              <ArrowRight className="ml-2 h-5 w-5 shrink-0" />
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              {trialMonths} {trialMonths === 1 ? 'mês' : 'meses'} grátis • Sem cartão de crédito • Cancele quando quiser
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <Factory className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold">MalhaGest</span>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MalhaGest — Gestão Têxtil Inteligente
          </p>
        </div>
      </footer>
    </div>
  );
}
