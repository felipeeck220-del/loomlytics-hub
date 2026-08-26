import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Layers, Play, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';

interface MachineProductionInfo {
  machine_number: string;
  current_article: string;
  current_client: string;
  next_article: string;
  next_client: string;
  ot_number: string;
  ot_status: string;
}

export default function ClientsArticles() {
  const { slug } = useParams<{ slug: string }>();
  const [searchTerm, setSearchTerm] = useState('');

  // Buscar máquinas e OTs (Ordem de Troca - mecânica) para determinar artigos atuais e próximos
  const { data: productionArticles = [], isLoading } = useQuery({
    queryKey: ['clients-articles-production', slug],
    queryFn: async () => {
      if (!slug) return [];

      // Buscar máquinas cadastradas
      const { data: machinesData, error: machErr } = await supabase
        .from('machines')
        .select('id, machine_number, current_article, client')
        .eq('company_slug', slug);

      if (machErr) throw machErr;

      // Buscar ordens de troca (OT) em mecanica
      const { data: otData, error: otErr } = await supabase
        .from('mecanica_ot')
        .select('*')
        .eq('company_slug', slug)
        .order('created_at', { ascending: false });

      if (otErr) {
        console.warn('Erro ao carregar mecanica_ot:', otErr);
      }

      // Mapear por número de máquina
      const result: MachineProductionInfo[] = (machinesData || []).map((m) => {
        const machineOts = (otData || []).filter(
          (ot) => 
            String(ot.machine_number || ot.machine_id) === String(m.machine_number) ||
            String(ot.machine_number) === String(m.id)
        );

        // Encontrar OT aberta (atual) e OT finalizada ou posterior (próxima)
        const openOt = machineOts.find((ot) => ot.status === 'aberto' || ot.status === 'em_andamento' || ot.status === 'pendente');
        const finishedOts = machineOts.filter((ot) => ot.status === 'finalizado' || ot.status === 'concluido');

        // Artigo atual baseado na OT aberta ou na máquina
        let currentArticle = m.current_article || 'Nenhum artigo';
        let currentClient = m.client || 'Cliente Padrão';
        let otNumber = openOt?.ot_number || openOt?.id || '#-';
        let otStatus = openOt?.status || 'finalizado';

        if (openOt) {
          currentArticle = openOt.new_article || openOt.article || currentArticle;
          currentClient = openOt.client || currentClient;
        }

        // Próximo artigo: pegar o próximo da lista de OTs ou histórico
        // Se a OT atual for finalizada, o artigo atual vira o próximo, etc.
        let nextArticle = 'Nenhum próximo';
        let nextClient = '-';

        const upcomingOt = machineOts.find((ot) => 
          ot.id !== openOt?.id && (ot.status === 'pendente' || ot.status === 'aberto' || ot.status === 'agendado')
        );

        if (upcomingOt) {
          nextArticle = upcomingOt.new_article || upcomingOt.article || 'Artigo Futuro';
          nextClient = upcomingOt.client || 'Cliente Futuro';
        } else if (finishedOts.length > 0) {
          // Se houver histórico, o mais recente finalizado pode servir de referência ou próxima programação
          const latestFinished = finishedOts[0];
          if (!openOt) {
            // Se não há aberto, o último finalizado era o atual, e procuramos outro
            currentArticle = latestFinished.new_article || latestFinished.article || currentArticle;
            currentClient = latestFinished.client || currentClient;
            otNumber = latestFinished.ot_number || latestFinished.id || otNumber;
          } else {
            nextArticle = latestFinished.new_article || latestFinished.article || 'Próximo programado';
            nextClient = latestFinished.client || 'Cliente programado';
          }
        }

        return {
          machine_number: m.machine_number,
          current_article: currentArticle,
          current_client: currentClient,
          next_article: nextArticle,
          next_client: nextClient,
          ot_number: String(otNumber),
          ot_status: otStatus
        };
      });

      return result;
    },
    enabled: !!slug,
  });

  const filteredMachines = productionArticles.filter((item) => 
    item.machine_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.current_article.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.current_client.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.next_article.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Layers className="h-7 w-7 text-primary" />
            Artigos em Produção
          </h1>
          <p className="page-subtitle">
            Acompanhe o artigo atual rodando em cada máquina com base nas trocas de OT (Mecânica OT) e o próximo artigo programado.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar máquina, artigo ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Card key={n} className="animate-pulse card-glass h-48">
              <CardContent className="p-6" />
            </Card>
          ))}
        </div>
      ) : filteredMachines.length === 0 ? (
        <Card className="card-glass p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
          <h3 className="text-lg font-semibold">Nenhuma máquina encontrada</h3>
          <p className="text-sm text-muted-foreground">
            Não há registros de máquinas ou OTs correspondentes à busca.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredMachines.map((item) => (
            <Card key={item.machine_number} className="card-glass overflow-hidden border-border/60 hover:border-primary/40 transition-all">
              <div className="bg-primary/10 px-5 py-3 border-b border-border/50 flex items-center justify-between">
                <span className="font-bold text-primary flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
                  Máquina {item.machine_number}
                </span>
                <Badge variant={item.ot_status === 'aberto' ? 'default' : 'secondary'} className="text-xs font-mono">
                  OT #{item.ot_number}
                </Badge>
              </div>

              <CardContent className="p-5 space-y-4">
                {/* Artigo Atual */}
                <div className="space-y-1.5 p-3 rounded-lg bg-muted/40 border border-border/40">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Play className="h-3.5 w-3.5 text-primary fill-primary" /> Artigo Atual
                    </span>
                    <span className="italic">({item.current_client})</span>
                  </div>
                  <p className="text-sm font-bold text-foreground uppercase tracking-wide">
                    {item.current_article}
                  </p>
                </div>

                {/* Seta indicativa */}
                <div className="flex justify-center -my-2">
                  <div className="bg-background border border-border rounded-full p-1 text-muted-foreground">
                    <ArrowRight className="h-3.5 w-3.5 rotate-90" />
                  </div>
                </div>

                {/* Próximo Artigo */}
                <div className="space-y-1.5 p-3 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> Próximo Artigo
                    </span>
                    <span className="italic">({item.next_client})</span>
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {item.next_article}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
