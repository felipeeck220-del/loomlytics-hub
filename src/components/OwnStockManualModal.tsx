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
import { Warehouse } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

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
  const [articleName, setArticleName] = useState('');
  const [pieces, setPieces] = useState('');
  const [weight, setWeight] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<'internal' | 'outsource'>('internal');
  const [outsourceCompanyId, setOutsourceCompanyId] = useState('');
  const [yarnType, setYarnType] = useState('');
  const [ofNumber, setOfNumber] = useState('');

  const { data: outsourceCompanies = [] } = useQuery({
    queryKey: ['outsource_companies_min', user?.company_id],
    enabled: !!user?.company_id && open,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('outsource_companies')
        .select('id, name')
        .eq('company_id', user!.company_id)
        .order('name');
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string }>;
    },
  });

  // Artigos vêm de Clientes & Artigos (tabela articles), formatados como "Artigo (Cliente)".
  const { data: clientArticles = [] } = useQuery({
    queryKey: ['own_stock_modal_client_articles', user?.company_id],
    enabled: !!user?.company_id && open,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)('articles')
        .select('id, name, client_name, clients(name)')
        .eq('company_id', user!.company_id)
        .order('name');
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; client_name: string | null; clients: { name: string } | null }>;
    },
  });

  useEffect(() => {
    if (open) {
      setType('in'); setArticleName('');
      setPieces(''); setWeight(''); setReason('');
      setSource('internal'); setOutsourceCompanyId(''); setYarnType(''); setOfNumber('');
    }
  }, [open]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ value: string; label: string }> = [];
    for (const a of clientArticles) {
      const cli = a.clients?.name || a.client_name || '';
      const label = cli ? `${a.name} (${cli})` : a.name;
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      out.push({ value: label, label });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [clientArticles]);

  const handleSave = async () => {
    const piecesNum = parseInt(pieces || '0', 10);
    const weightNum = parseFloat(weight || '0');
    if (!user?.company_id) return;

    setSaving(true);
    try {
      if (!articleName) { setSaving(false); return toast({ title: 'Selecione um artigo', variant: 'destructive' }); }
      if (!(weightNum > 0) && !(piecesNum > 0)) { setSaving(false); return toast({ title: 'Informe peças ou peso', variant: 'destructive' }); }
      if (type === 'in' && source === 'outsource' && !outsourceCompanyId) {
        setSaving(false);
        return toast({ title: 'Selecione a malharia terceirizada', variant: 'destructive' });
      }

      const { error: mvErr } = await (supabase.rpc as any)('save_own_stock_movement', {
        p_payload: {
          company_id: user.company_id,
          article_name: articleName,
          type,
          pieces: piecesNum,
          weight_kg: weightNum,
          reason: reason.trim() || null,
          created_by: profile?.id ?? null,
          source: type === 'in' ? source : null,
          outsource_company_id: type === 'in' && source === 'outsource' ? outsourceCompanyId : null,
          yarn_type: type === 'in' ? (yarnType.trim() || null) : null,
          of_number: type === 'in' ? (ofNumber.trim() || null) : null,
        },
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

  const outsourceOptions = useMemo(
    () => outsourceCompanies.map(o => ({ value: o.id, label: o.name })),
    [outsourceCompanies]
  );

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

          {type === 'in' && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <Label className="text-xs">Origem da malha</Label>
              <RadioGroup value={source} onValueChange={(v) => setSource(v as any)} className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="internal" id="src-internal" className="mt-0.5" />
                  <span><strong>Produção interna</strong> — malha produzida dentro da empresa</span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="outsource" id="src-outsource" className="mt-0.5" />
                  <span><strong>Terceirizado</strong> — malha veio de uma malharia terceirizada</span>
                </label>
              </RadioGroup>
              {source === 'outsource' && (
                <div className="space-y-1 pt-1">
                  <Label className="text-[11px]">Malharia terceirizada *</Label>
                  <SearchableSelect
                    value={outsourceCompanyId}
                    onValueChange={setOutsourceCompanyId}
                    options={outsourceOptions}
                    placeholder={outsourceOptions.length ? 'Selecione a malharia' : 'Cadastre em Terceirizado → Malharias'}
                    searchPlaceholder="Buscar malharia..."
                    autoFocusSearch={false}
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px]">Tipo de fio</Label>
                  <Input value={yarnType} onChange={(e) => setYarnType(e.target.value)}
                    placeholder="Ex.: 30/1 Penteado" className="h-8 text-xs" maxLength={80} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Nº OF / ROM de entrada</Label>
                  <Input value={ofNumber} onChange={(e) => setOfNumber(e.target.value)}
                    placeholder="Ex.: 12345" className="h-8 text-xs" maxLength={40} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Artigo *</Label>
            <SearchableSelect
              value={articleName}
              onValueChange={setArticleName}
              options={options}
              placeholder={options.length ? 'Selecione o artigo' : 'Nenhum artigo cadastrado em Clientes & Artigos'}
              searchPlaceholder="Buscar artigo..."
            />
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