import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Download, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

const FIREBASE_URL = 'https://gestao-malharia-default-rtdb.firebaseio.com';

type ImportStep = 'idle' | 'company' | 'clients' | 'articles' | 'machines' | 'weavers' | 'production' | 'done';

// Insert in batches to avoid payload limits
async function batchInsert(table: string, rows: any[], batchSize = 200) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await (supabase.from as any)(table).insert(batch);
    if (error) throw new Error(`Erro inserindo ${table} (batch ${Math.floor(i/batchSize)+1}): ${error.message}`);
  }
}

export default function ImportFirebase() {
  const { user } = useAuth();
  const [step, setStep] = useState<ImportStep>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleImport = async () => {
    if (!user) return;
    setError(null);
    setLogs([]);

    try {
      // 0. Create or find company
      setStep('company');
      addLog('Configurando empresa...');

      let companyId: string;
      const { data: existingCompany } = await supabase
        .from('companies')
        .select('id')
        .eq('admin_email', user.email)
        .maybeSingle();

      if (existingCompany) {
        companyId = existingCompany.id;
        addLog(`Empresa existente encontrada: ${companyId}`);
      } else {
        const { data: newCompany, error: companyErr } = await supabase
          .from('companies')
          .insert({ name: user.company_name, admin_name: user.name, admin_email: user.email })
          .select('id')
          .single();
        if (companyErr || !newCompany) throw new Error(`Erro criando empresa: ${companyErr?.message}`);
        companyId = newCompany.id;
        addLog(`Empresa criada: ${companyId}`);
      }

      // ID mapping: Firebase ID -> new UUID
      const clientIdMap: Record<string, string> = {};
      const articleIdMap: Record<string, string> = {};
      const machineIdMap: Record<string, string> = {};
      const weaverIdMap: Record<string, string> = {};

      // 1. Clients
      setStep('clients');
      addLog('Buscando clientes...');
      const clientsRes = await fetch(`${FIREBASE_URL}/clientes.json`);
      const clientsData = await clientsRes.json();
      if (clientsData) {
        const clientRows = Object.values(clientsData).map((c: any) => {
          const id = crypto.randomUUID();
          clientIdMap[c.id] = id;
          return {
            id,
            company_id: companyId,
            name: c.nome || '',
            contact: c.contato || '',
            observations: c.observacoes || '',
            created_at: c.criadoEm || new Date().toISOString(),
          };
        });
        await batchInsert('clients', clientRows);
        addLog(`✅ ${clientRows.length} clientes importados`);
      }

      // 2. Articles
      setStep('articles');
      addLog('Buscando artigos...');
      const articlesRes = await fetch(`${FIREBASE_URL}/artigos.json`);
      const articlesData = await articlesRes.json();
      if (articlesData) {
        const articleRows = Object.values(articlesData).map((a: any) => {
          const id = crypto.randomUUID();
          articleIdMap[a.id] = id;
          return {
            id,
            company_id: companyId,
            name: a.nome || '',
            client_id: clientIdMap[a.clienteId] || null,
            client_name: a.clienteNome || '',
            weight_per_roll: a.pesoRoloKg || 0,
            value_per_kg: a.valorKgGanho || 0,
            turns_per_roll: a.voltasPorRolo || 0,
            observations: a.observacoes || '',
            created_at: a.criadoEm || new Date().toISOString(),
          };
        });
        await batchInsert('articles', articleRows);
        addLog(`✅ ${articleRows.length} artigos importados`);
      }

      // 3. Machines
      setStep('machines');
      addLog('Buscando máquinas...');
      const machinesRes = await fetch(`${FIREBASE_URL}/maquinas.json`);
      const machinesData = await machinesRes.json();
      if (machinesData) {
        const machineRows = Object.values(machinesData).map((m: any) => {
          const id = crypto.randomUUID();
          machineIdMap[m.id] = id;
          const nameMatch = (m.nome || '').match(/\d+/);
          const number = nameMatch ? parseInt(nameMatch[0]) : 0;
          const validStatuses = ['ativa', 'manutencao_preventiva', 'manutencao_corretiva', 'troca_artigo', 'inativa'];
          const status = validStatuses.includes(m.status) ? m.status : 'ativa';
          return {
            id,
            company_id: companyId,
            number,
            name: (m.nome || '').trim(),
            rpm: m.rpm || 0,
            status,
            article_id: articleIdMap[m.artigoAtual] || null,
            observations: m.observacoes || '',
            created_at: m.criadoEm || new Date().toISOString(),
          };
        });
        await batchInsert('machines', machineRows);
        addLog(`✅ ${machineRows.length} máquinas importadas`);
      }

      // 4. Weavers
      setStep('weavers');
      addLog('Buscando tecelões...');
      const weaversRes = await fetch(`${FIREBASE_URL}/teceloes.json`);
      const weaversData = await weaversRes.json();
      if (weaversData) {
        const weaverRows = Object.values(weaversData).map((t: any) => {
          const id = crypto.randomUUID();
          weaverIdMap[t.id] = id;
          return {
            id,
            company_id: companyId,
            code: `#${t.codigo || 0}`,
            name: (t.nome || '').trim(),
            phone: t.telefone || '',
            shift_type: t.tipoTurno === 'fixo' ? 'fixo' : 'especifico',
            fixed_shift: t.turno || null,
            created_at: t.criadoEm || new Date().toISOString(),
          };
        });
        await batchInsert('weavers', weaverRows);
        addLog(`✅ ${weaverRows.length} tecelões importados`);
      }

      // 5. Productions (large dataset - process in chunks)
      setStep('production');
      addLog('Buscando produções (pode demorar)...');
      const prodRes = await fetch(`${FIREBASE_URL}/producao.json`);
      const prodData = await prodRes.json();

      if (prodData) {
        const productions: any[] = [];
        for (const [date, shifts] of Object.entries(prodData)) {
          if (!shifts || typeof shifts !== 'object') continue;
          for (const [shift, records] of Object.entries(shifts as Record<string, any>)) {
            if (!records || typeof records !== 'object') continue;
            for (const record of Object.values(records as Record<string, any>)) {
              const validShifts = ['manha', 'tarde', 'noite'];
              const shiftVal = validShifts.includes(record.turno || shift) ? (record.turno || shift) : 'manha';
              productions.push({
                id: crypto.randomUUID(),
                company_id: companyId,
                date: record.data || date,
                shift: shiftVal,
                machine_id: machineIdMap[record.maquinaId] || null,
                machine_name: record.maquinaNome || '',
                weaver_id: weaverIdMap[record.tecelaoId] || null,
                weaver_name: record.tecelaoNome || '',
                article_id: articleIdMap[record.artigoId] || null,
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
        addLog(`Inserindo ${productions.length} produções em lotes...`);
        await batchInsert('productions', productions, 500);
        addLog(`✅ ${productions.length} produções importadas`);
      }

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
          Importa clientes, artigos, máquinas, tecelões e produções do seu projeto Firebase anterior para o banco de dados.
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
              {step === 'company' && 'Configurando empresa...'}
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
            <span className="text-sm break-all">{error}</span>
          </div>
        )}

        {logs.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-4 max-h-80 overflow-y-auto font-mono text-sm space-y-1">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
