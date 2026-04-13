import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/SearchableSelect';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Article, Client } from '@/types';

interface QuickAddArticleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articles: Article[];
  clients: Client[];
  saveArticles: (data: Article[]) => Promise<void>;
  onCreated: (article: Article) => void;
}

export function QuickAddArticle({ open, onOpenChange, articles, clients, saveArticles, onCreated }: QuickAddArticleProps) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [weightPerRoll, setWeightPerRoll] = useState('');
  const [valuePerKg, setValuePerKg] = useState('');
  const [turnsPerRoll, setTurnsPerRoll] = useState('');
  const [targetEfficiency, setTargetEfficiency] = useState('80');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Preencha o nome do artigo'); return; }
    if (!weightPerRoll || Number(weightPerRoll) <= 0) { toast.error('Preencha o peso por rolo'); return; }
    setSaving(true);
    try {
      const client = clients.find(c => c.id === clientId);
      const newArticle: Article = {
        id: crypto.randomUUID(),
        company_id: '',
        name: name.trim(),
        client_id: clientId || undefined,
        client_name: client?.name || undefined,
        weight_per_roll: Number(weightPerRoll),
        value_per_kg: Number(valuePerKg) || 0,
        turns_per_roll: Number(turnsPerRoll) || 0,
        target_efficiency: Number(targetEfficiency) || 80,
        created_at: new Date().toISOString(),
      };
      await saveArticles([...articles, newArticle]);
      toast.success(`Artigo ${newArticle.name} cadastrado`);
      onCreated(newArticle);
      setName(''); setClientId(''); setWeightPerRoll(''); setValuePerKg(''); setTurnsPerRoll(''); setTargetEfficiency('80');
      onOpenChange(false);
    } catch {
      toast.error('Erro ao cadastrar artigo');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Cadastro Rápido de Artigo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome do Artigo *</Label>
            <Input className="h-9" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do artigo" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cliente</Label>
            <SearchableSelect
              value={clientId}
              onValueChange={setClientId}
              placeholder="Selecione o cliente"
              searchPlaceholder="Buscar cliente..."
              options={[
                { value: '', label: 'Sem cliente' },
                ...clients.map(c => ({ value: c.id, label: c.name }))
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Peso por Rolo (kg) *</Label>
              <Input className="h-9" type="number" value={weightPerRoll} onChange={e => setWeightPerRoll(e.target.value)} placeholder="Ex: 18.5" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor por Kg (R$)</Label>
              <Input className="h-9" type="number" value={valuePerKg} onChange={e => setValuePerKg(e.target.value)} placeholder="Ex: 3.50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Voltas por Rolo</Label>
              <Input className="h-9" type="number" value={turnsPerRoll} onChange={e => setTurnsPerRoll(e.target.value)} placeholder="Ex: 1200" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meta Eficiência (%)</Label>
              <Input className="h-9" type="number" value={targetEfficiency} onChange={e => setTargetEfficiency(e.target.value)} placeholder="80" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} className="btn-gradient" disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Cadastrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
