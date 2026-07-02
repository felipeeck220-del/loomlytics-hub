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
import { Warehouse, Plus } from 'lucide-react';

interface OwnArticle { id: string; name: string }
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ownArticles: OwnArticle[];
  onSaved: () => void;
}

export function OwnStockManualModal({ open, onOpenChange, ownArticles, onSaved }: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<'in' | 'out'>('in');
  const [articleId, setArticleId] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [pieces, setPieces] = useState('');
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType('in'); setArticleId(''); setCreatingNew(false);
      setNewName(''); setPieces(''); setWeight(''); setReason('');
    }
  }, [open]);

  const options = useMemo(() =>
    [...ownArticles].sort((a, b) => a.name.localeCompare(b.name)).map(a => ({ value: a.id, label: a.name })),
    [ownArticles]
  );

  const handleSave = async () => {
    const piecesNum = parseInt(pieces || '0', 10);
    const weightNum = parseFloat(weight || '0');
    if (!user?.company_id) return;

    let finalArticleId = articleId;
    setSaving(true);
    try {
      if (creatingNew) {
        const nm = newName.trim();
        if (nm.length < 2) { setSaving(false); return toast({ title: 'Informe o nome do artigo', variant: 'destructive' }); }
        const { data, error } = await (supabase.from as any)('own_stock_articles').insert({
          company_id: user.company_id, name: nm, created_by: profile?.id ?? null,
        }).select('id').single();
        if (error) throw error;
        finalArticleId = data.id;
      }
      if (!finalArticleId) { setSaving(false); return toast({ title: 'Selecione ou crie um artigo', variant: 'destructive' }); }
      if (!(weightNum > 0) && !(piecesNum > 0)) { setSaving(false); return toast({ title: 'Informe peças ou peso', variant: 'destructive' }); }

      const { error: mvErr } = await (supabase.from as any)('own_stock_movements').insert({
        company_id: user.company_id,
        own_article_id: finalArticleId,
        type,
        pieces: piecesNum,
        weight_kg: weightNum,
        reason: reason.trim() || null,
        created_by: profile?.id ?? null,
      });
      if (mvErr) throw mvErr;

      toast({ title: type === 'in' ? 'Entrada registrada' : 'Saída registrada' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error('[OwnStockManualModal] error', err);
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
            Lançamento Manual — Estoque Próprio
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Tipo</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="in" id="own-in" /> Entrada
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="out" id="own-out" /> Saída
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Artigo *</Label>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => { setCreatingNew(v => !v); setArticleId(''); setNewName(''); }}>
                {creatingNew ? 'Selecionar existente' : (<><Plus className="h-3 w-3" /> Criar novo</>)}
              </Button>
            </div>
            {creatingNew ? (
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome do artigo (ex.: Malha Piquet 30/1)" />
            ) : (
              <SearchableSelect
                value={articleId}
                onValueChange={setArticleId}
                options={options}
                placeholder={options.length ? 'Selecione o artigo' : 'Nenhum artigo — crie um novo'}
                searchPlaceholder="Buscar artigo..."
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Peças</Label>
              <Input type="number" min={0} value={pieces}
                onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0" className="h-8 text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Peso (kg)</Label>
              <BrazilianWeightInput value={weight} onChange={setWeight} placeholder="0,00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Motivo / Observação</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Opcional" className="text-xs min-h-[60px]" maxLength={500} />
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