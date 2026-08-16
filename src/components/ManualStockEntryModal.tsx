import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableSelect } from '@/components/SearchableSelect';
import { BrazilianWeightInput } from '@/components/BrazilianWeightInput';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { Warehouse, Info } from 'lucide-react';
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}

export function ManualStockEntryModal({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { getClients, getArticles, getMachines } = useSharedCompanyData();
  
  const [type, setType] = useState<'in' | 'out'>('in');
  const [destination, setDestination] = useState<'expedition' | 'machine'>('expedition');
  const [clientId, setClientId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [pieces, setPieces] = useState('');
  const [weight, setWeight] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const clients = getClients() || [];
  const articles = getArticles() || [];
  const machines = getMachines() || [];

  const clientOptions = useMemo(() => 
    clients.map(c => ({ value: c.id, label: c.name })), 
  [clients]);

  const articleOptions = useMemo(() => 
    articles
      .filter(a => !clientId || a.client_id === clientId)
      .map(a => ({ value: a.id, label: a.name })), 
  [articles, clientId]);

  const machineOptions = useMemo(() => 
    machines.map(m => ({ value: m.id, label: m.name })), 
  [machines]);

  useEffect(() => {
    if (open) {
      setType('in');
      setDestination('expedition');
      setClientId('');
      setArticleId('');
      setMachineId('');
      setPieces('');
      setWeight('');
      setDescription('');
    }
  }, [open]);

  const handleSave = async () => {
    const piecesNum = parseInt(pieces || '0', 10);
    const weightNum = parseFloat(weight.replace(',', '.') || '0');

    if (!clientId) return toast({ title: 'Selecione um cliente', variant: 'destructive' });
    if (!articleId) return toast({ title: 'Selecione um artigo', variant: 'destructive' });
    if (destination === 'machine' && !machineId) return toast({ title: 'Selecione uma máquina para palete em máquina', variant: 'destructive' });
    if (piecesNum <= 0 && weightNum <= 0) return toast({ title: 'Informe peças ou peso', variant: 'destructive' });

    setSaving(true);
    try {
      const { error } = await supabase.from('manual_stock_movements').insert({
        company_id: user?.company_id,
        client_id: clientId,
        article_id: articleId,
        machine_id: machineId || null,
        type,
        pieces: piecesNum,
        weight_kg: weightNum,
        on_machine: destination === 'machine',
        description: description.trim() || null,
        created_by: user?.id
      });

      if (error) throw error;

      toast({ title: 'Movimentação registrada com sucesso!' });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[ManualStockEntryModal] error', err);
      toast({ title: 'Erro ao salvar', description: getFriendlyErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-primary" />
            Lançamento Manual — Estoque de Malha
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Tipo</Label>
              <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="in" /> Entrada
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="out" /> Saída
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Destino</Label>
              <RadioGroup value={destination} onValueChange={(v) => setDestination(v as any)} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="expedition" /> Expedição
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="machine" /> Em máquina
                </label>
              </RadioGroup>
            </div>
          </div>

          {destination === 'machine' && (
            <Alert className="bg-primary/5 border-primary/20 py-2">
              <Info className="h-3 w-3 text-primary" />
              <AlertDescription className="text-[10px] text-primary/80">
                "Palete na máquina" contabiliza em <strong>Em maq.</strong> e já soma em <strong>Disponível</strong> — ao puxar o palete para a expedição use "Ajustar palete" na máquina.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Cliente *</Label>
            <SearchableSelect
              value={clientId}
              onValueChange={(v) => { setClientId(v); setArticleId(''); }}
              options={clientOptions}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Artigo *</Label>
            <SearchableSelect
              value={articleId}
              onValueChange={setArticleId}
              options={articleOptions}
              placeholder={clientId ? "Selecione o artigo" : "Selecione um cliente primeiro"}
              searchPlaceholder="Buscar artigo..."
              disabled={!clientId}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Máquina {destination === 'machine' ? '*' : '(Opcional)'}</Label>
            <SearchableSelect
              value={machineId}
              onValueChange={setMachineId}
              options={machineOptions}
              placeholder="Selecione a máquina"
              searchPlaceholder="Buscar máquina..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Peças</Label>
              <Input type="number" inputMode="numeric" min={0} value={pieces}
                onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0" className="h-9 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Peso (kg)</Label>
              <BrazilianWeightInput value={weight} onChange={setWeight} placeholder="0,00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Motivo / Observação</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional" className="text-sm min-h-[60px]" maxLength={500} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
