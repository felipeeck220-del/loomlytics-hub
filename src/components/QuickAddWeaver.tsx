import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Weaver, ShiftType } from '@/types';

interface QuickAddWeaverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weavers: Weaver[];
  saveWeavers: (data: Weaver[]) => Promise<void>;
  onCreated: (weaver: Weaver) => void;
}

export function QuickAddWeaver({ open, onOpenChange, weavers, saveWeavers, onCreated }: QuickAddWeaverProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [shiftType, setShiftType] = useState<'fixo' | 'especifico'>('fixo');
  const [fixedShift, setFixedShift] = useState<ShiftType>('manha');
  const [saving, setSaving] = useState(false);

  const generateCode = () => {
    const existing = weavers.map(w => parseInt(w.code.replace('#', '')));
    let code = 100;
    while (existing.includes(code) && code <= 999) code++;
    return `#${code}`;
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Preencha o nome do tecelão'); return; }
    setSaving(true);
    try {
      const newWeaver: Weaver = {
        id: crypto.randomUUID(),
        company_id: '',
        code: generateCode(),
        name: name.trim(),
        phone: phone || undefined,
        shift_type: shiftType,
        fixed_shift: shiftType === 'fixo' ? fixedShift : undefined,
        created_at: new Date().toISOString(),
      };
      await saveWeavers([...weavers, newWeaver]);
      toast.success(`Tecelão ${newWeaver.name} cadastrado`);
      onCreated(newWeaver);
      setName(''); setPhone(''); setShiftType('fixo'); setFixedShift('manha');
      onOpenChange(false);
    } catch {
      toast.error('Erro ao cadastrar tecelão');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Cadastro Rápido de Tecelão</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome *</Label>
            <Input className="h-9" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do tecelão" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Telefone</Label>
            <Input className="h-9" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo de Turno</Label>
            <Select value={shiftType} onValueChange={v => setShiftType(v as 'fixo' | 'especifico')}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Fixo</SelectItem>
                <SelectItem value="especifico">Específico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {shiftType === 'fixo' && (
            <div className="space-y-1">
              <Label className="text-xs">Turno Fixo</Label>
              <Select value={fixedShift} onValueChange={v => setFixedShift(v as ShiftType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manha">Manhã</SelectItem>
                  <SelectItem value="tarde">Tarde</SelectItem>
                  <SelectItem value="noite">Noite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
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
