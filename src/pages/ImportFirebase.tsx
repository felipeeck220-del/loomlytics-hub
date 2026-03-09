import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyData } from '@/hooks/useCompanyData';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Download, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import type { Machine, Client, Article, Weaver, Production, MachineStatus, ShiftType } from '@/types';

const FIREBASE_URL = 'https://gestao-malharia-default-rtdb.firebaseio.com';

type ImportStep = 'idle' | 'clients' | 'articles' | 'machines' | 'weavers' | 'production' | 'done';

export default function ImportFirebase() {
  const { user } = useAuth();
  const { saveClients, saveArticles, saveMachines, saveWeavers, saveProductions } = useCompanyData();
  const [step, setStep] = useState<ImportStep>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const mapStatus = (s: string): MachineStatus => {
    const map: Record<string, MachineStatus> = {
      'ativa': 'ativa',
      'inativa': 'inativa',
      'manutencao_preventiva': 'manutencao_preventiva',
      'manutencao_corretiva': 'manutencao_corretiva',
      'troca_artigo': 'troca_artigo',
    };
    return map[s] || 'ativa';
  };

  const mapShift = (s: string): ShiftType => {
    const map: Record<string, ShiftType> = {
      'manha': 'manha',
      'tarde': 'tarde',
      'noite': 'noite',
    };
    return map[s] || 'manha';
  };

  const handleImport = async () => {
    if (!user) return;
    setError(null);
    setLogs([]);
    const companyId = user.company_id;

    try {
      // 1. Clients
      setStep('clients');
      addLog('Buscando clientes...');
      const clientsRes = await fetch(`${FIREBASE_URL}/clientes.json`);
      const clientsData = await clientsRes.json();
      const clientIdMap: Record<string, string> = {};
      const clients: Client[] = clientsData ? Object.values(clientsData).map((c: any) => {
        const newId = c.id || crypto.randomUUID();
        clientIdMap[c.id] = newId;
        return {
          id: newId,
          company_id: companyId,
          name: c.nome || '',
          contact: c.contato || '',
          observations: c.observacoes || '',
          created_at: c.criadoEm || new Date().toISOString(),
        };
      }) : [];
      saveClients(clients);
      addLog(`✅ ${clients.length} clientes importados`);

      // 2. Articles
      setStep('articles');
      addLog('Buscando artigos...');
      const articlesRes = await fetch(`${FIREBASE_URL}/artigos.json`);
      const articlesData = await articlesRes.json();
      const articleIdMap: Record<string, string> = {};
      const articles: Article[] = articlesData ? Object.values(articlesData).map((a: any) => {
        const newId = a.id || crypto.randomUUID();
        articleIdMap[a.id] = newId;
        return {
          id: newId,
          company_id: companyId,
          name: a.nome || '',
          client_id: clientIdMap[a.clienteId] || a.clienteId || '',
          client_name: a.clienteNome || '',
          weight_per_roll: a.pesoRoloKg || 0,
          value_per_kg: a.valorKgGanho || 0,
          turns_per_roll: a.voltasPorRolo || 0,
          observations: a.observacoes || '',
          created_at: a.criadoEm || new Date().toISOString(),
        };
      }) : [];
      saveArticles(articles);
      addLog(`✅ ${articles.length} artigos importados`);

      // 3. Machines
      setStep('machines');
      addLog('Buscando máquinas...');
      const machinesRes = await fetch(`${FIREBASE_URL}/maquinas.json`);
      const machinesData = await machinesRes.json();
      const machineIdMap: Record<string, string> = {};
      const machines: Machine[] = machinesData ? Object.values(machinesData).map((m: any) => {
        const newId = m.id || crypto.randomUUID();
        machineIdMap[m.id] = newId;
        const nameMatch = (m.nome || '').match(/\d+/);
        const number = nameMatch ? parseInt(nameMatch[0]) : 0;
        return {
          id: newId,
          company_id: companyId,
          number,
          name: m.nome?.trim() || '',
          rpm: m.rpm || 0,
          status: mapStatus(m.status),
          article_id: articleIdMap[m.artigoAtual] || m.artigoAtual || undefined,
          observations: m.observacoes || '',
          created_at: m.criadoEm || new Date().toISOString(),
        };
      }) : [];
      saveMachines(machines);
      addLog(`✅ ${machines.length} máquinas importadas`);

      // 4. Weavers
      setStep('weavers');
      addLog('Buscando tecelões...');
      const weaversRes = await fetch(`${FIREBASE_URL}/teceloes.json`);
      const weaversData = await weaversRes.json();
      const weaverIdMap: Record<string, string> = {};
      const weavers: Weaver[] = weaversData ? Object.values(weaversData).map((t: any) => {
        const newId = t.id || crypto.randomUUID();
        weaverIdMap[t.id] = newId;
        return {
          id: newId,
          company_id: companyId,
          code: `#${t.codigo || 0}`,
          name: t.nome?.trim() || '',
          phone: t.telefone || '',
          shift_type: t.tipoTurno === 'fixo' ? 'fixo' as const : 'especifico' as const,
          fixed_shift: t.turno ? mapShift(t.turno) : undefined,
          created_at: t.criadoEm || new Date().toISOString(),
        };
      }) : [];
      saveWeavers(weavers);
      addLog(`✅ ${weavers.length} tecelões importados`);

      // 5. Productions
      setStep('production');
      addLog('Buscando produções (pode demorar)...');
      const prodRes = await fetch(`${FIREBASE_URL}/producao.json`);
      const prodData = await prodRes.json();
      const productions: Production[] = [];

      if (prodData) {
        for (const [date, shifts] of Object.entries(prodData)) {
          if (!shifts || typeof shifts !== 'object') continue;
          for (const [shift, records] of Object.entries(shifts as Record<string, any>)) {
            if (!records || typeof records !== 'object') continue;
            for (const record of Object.values(records as Record<string, any>)) {
              productions.push({
                id: record.id || crypto.randomUUID(),
                company_id: companyId,
                date: record.data || date,
                shift: mapShift(record.turno || shift),
                machine_id: machineIdMap[record.maquinaId] || record.maquinaId || '',
                machine_name: record.maquinaNome || '',
                weaver_id: weaverIdMap[record.tecelaoId] || record.tecelaoId || '',
                weaver_name: record.tecelaoNome || '',
                article_id: articleIdMap[record.artigoId] || record.artigoId || '',
                article_name: record.artigoNome || '',
                rpm: record.rpmUsado || record.rpmPadrao || 0,
                rolls_produced: record.rolosProduzidos || 0,
                weight_kg: record.kgProduzidos || 0,
                revenue: record.valorLucrado || 0,
                efficiency: record.porcentagemProducao || 0,
                created_at: record.criadoEm || new Date().toISOString(),
              });
            }
          }
        }
      }
      saveProductions(productions);
      addLog(`✅ ${productions.length} produções importadas`);

      setStep('done');
      toast.success('Importação concluída com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
      addLog(`❌ Erro: ${err.message}`);
      toast.error('Erro na importação');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Importar Dados do Firebase</h1>
        <p className="text-muted-foreground mt-1">
          Importa clientes, artigos, máquinas, tecelões e produções do seu projeto Firebase anterior.
        </p>
      </div>

      <div className="card-glass p-6 space-y-4">
        <div className="flex items-center gap-3">
          {step === 'done' ? (
            <CheckCircle className="w-8 h-8 text-success" />
          ) : step !== 'idle' ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Download className="w-8 h-8 text-primary" />
          )}
          <div>
            <h2 className="font-semibold text-lg">
              {step === 'idle' && 'Pronto para importar'}
              {step === 'clients' && 'Importando clientes...'}
              {step === 'articles' && 'Importando artigos...'}
              {step === 'machines' && 'Importando máquinas...'}
              {step === 'weavers' && 'Importando tecelões...'}
              {step === 'production' && 'Importando produções...'}
              {step === 'done' && 'Importação concluída!'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Usuário: {user?.email} | Empresa: {user?.company_name}
            </p>
          </div>
        </div>

        <Button
          onClick={handleImport}
          disabled={step !== 'idle' && step !== 'done'}
          className="btn-gradient"
          size="lg"
        >
          {step === 'done' ? 'Importar Novamente' : 'Iniciar Importação'}
        </Button>

        {error && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        )}

        {logs.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm space-y-1">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
