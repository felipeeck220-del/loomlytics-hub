import { useState, useMemo, useEffect } from 'react';
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
import { logAudit } from '@/lib/auditLog';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { Warehouse } from 'lucide-react';

interface Client { id: string; name: string }
interface Article { id: string; name: string; client_id: string | null }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: Client[];
  articles: Article[];
  onSaved: () => void;
  isSecondQuality?: boolean;
}

export function ManualStockEntryModal({ open, onOpenChange, clients, articles, onSaved, isSecondQuality = false }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<'adjust_in' | 'adjust_out'>('adjust_in');
  const [clientId, setClientId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [pieces, setPieces] = useState('');
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType('adjust_in');
      setClientId(''); setArticleId(''); setPieces(''); setWeight(''); setReason('');
    }
  }, [open]);

  const filteredArticles = useMemo(
    () => articles.filter(a => a.client_id === clientId).sort((a, b) => a.name.localeCompare(b.name)),
    [articles, clientId]
  );

  const handleSave = async () => {
    const piecesNum = parseInt(pieces || '0', 10);
    const weightNum = parseFloat(weight || '0');
    if (!clientId) return toast({ title: 'Cliente obrigatório', variant: 'destructive' });
    if (!articleId) return toast({ title: 'Artigo obrigatório', variant: 'destructive' });
    if (!(weightNum > 0) && !(piecesNum > 0)) {
      return toast({ title: 'Informe peças ou peso', description: 'Pelo menos um dos campos deve ser maior que zero.', variant: 'destructive' });
    }
    if (reason.trim().length < 5) {
      return toast({ title: 'Motivo obrigatório', description: 'Descreva com pelo menos 5 caracteres.', variant: 'destructive' });
    }
    if (!user?.company_id) return;

    setSaving(true);
    try {
      const { error } = await (supabase.from as any)('stock_movements').insert({
        company_id: user.company_id,
        article_id: articleId,
        client_id: clientId,
        type,
        pieces: piecesNum,
        weight_kg: weightNum,
        reason: reason.trim(),
        created_by: user.id,
        is_second_quality: isSecondQuality,
      });
      if (error) throw error;

      await logAudit({
        action: isSecondQuality ? 'STOCK_2Q_ADJUST' : 'STOCK_ADJUST',
        companyId: user.company_id,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        userCode: (user as any).code,
        details: {
          type, client_id: clientId, article_id: articleId,
          pieces: piecesNum, weight_kg: weightNum, reason: reason.trim(),
        },
      });

      toast({ title: 'Lançamento registrado', description: type === 'adjust_in' ? 'Entrada manual adicionada ao estoque.' : 'Saída manual descontada do estoque.' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: getFriendlyErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-primary" />
            Lançamento Manual de Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Tipo</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="adjust_in" id="t-in" />
                Entrada (saldo inicial / sobra)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="adjust_out" id="t-out" />
                Saída (quebra / ajuste)
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Cliente *</Label>
            <SearchableSelect
              value={clientId}
              onValueChange={(v) => { setClientId(v); setArticleId(''); }}
              options={clients.map(c => ({ value: c.id, label: c.name }))}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Artigo *</Label>
            <SearchableSelect
              value={articleId}
              onValueChange={setArticleId}
              options={filteredArticles.map(a => ({ value: a.id, label: a.name }))}
              placeholder={clientId ? 'Selecione o artigo' : 'Escolha um cliente primeiro'}
              searchPlaceholder="Buscar artigo..."
              disabled={!clientId}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Peças</Label>
              <Input
                type="number"
                min={0}
                value={pieces}
                onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Peso (kg)</Label>
              <BrazilianWeightInput value={weight} onChange={setWeight} placeholder="0,00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Motivo *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='Ex.: "Saldo inicial pré-sistema" ou "Quebra contagem 16/06"'
              className="text-xs min-h-[70px]"
              maxLength={500}
            />
            <p className="text-[10px] text-muted-foreground">Mínimo 5 caracteres. Será registrado em auditoria.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}