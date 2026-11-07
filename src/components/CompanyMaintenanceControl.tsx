import { useRef, useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useCompanyMaintenance } from '@/contexts/CompanyMaintenanceContext';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

export default function CompanyMaintenanceControl() {
  const { state, setEnabled } = useCompanyMaintenance();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  if (!state?.can_manage) return null;

  const save = async (enabled: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await setEnabled(enabled);
      setConfirmOpen(false);
      toast.success(enabled ? 'Site em manutenção ativado' : 'Acesso dos usuários restaurado');
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="company-maintenance" className="flex items-center gap-2 text-sm font-semibold">
            <Wrench className="h-4 w-4 shrink-0 text-primary" />Site em manutenção
          </Label>
          {saving ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> :
            <Switch id="company-maintenance" checked={state.enabled} onCheckedChange={enabled => enabled ? setConfirmOpen(true) : void save(false)} disabled={saving} />}
        </div>
        <p className={state.enabled ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {state.enabled ? 'Manutenção ativa · acesso dos usuários suspenso.' : 'Manutenção desativada.'}
        </p>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={open => { if (!saving) setConfirmOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar site em manutenção?</AlertDialogTitle>
            <AlertDialogDescription>Todos os outros usuários desta empresa, inclusive administradores secundários, terão o acesso suspenso. A migração para a nova versão será desativada automaticamente. Você continuará com acesso para desativar a manutenção.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void save(true)}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ativar manutenção</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}