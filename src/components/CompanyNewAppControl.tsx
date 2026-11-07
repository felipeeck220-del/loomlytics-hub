import { useRef, useState } from 'react';
import { ExternalLink, Loader2, Rocket } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useCompanyMaintenance } from '@/contexts/CompanyMaintenanceContext';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

export const NEW_APP_URL = 'https://apptramacerta.web.app/';

export default function CompanyNewAppControl() {
  const { state, setNewAppUrl } = useCompanyMaintenance();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  if (!state?.can_manage) return null;

  const enabled = state.new_app_url !== null;

  const save = async (url: string | null) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await setNewAppUrl(url);
      setConfirmOpen(false);
      toast.success(url ? 'Aviso de nova versão ativado' : 'Aviso de nova versão desativado');
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
          <Label htmlFor="company-new-app" className="flex items-center gap-2 text-sm font-semibold">
            <Rocket className="h-4 w-4 shrink-0 text-primary" />Nova versão do app
          </Label>
          {saving ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> :
            <Switch id="company-new-app" checked={enabled} onCheckedChange={on => on ? setConfirmOpen(true) : void save(null)} disabled={saving} />}
        </div>
        <p className={enabled ? 'text-sm text-primary' : 'text-sm text-muted-foreground'}>
          {enabled ? 'Migração ativa · acesso ao app antigo bloqueado para os demais usuários.' : 'Migração desativada.'}
        </p>
        {enabled && state.new_app_url && (
          <a href={state.new_app_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4 break-all">
            {state.new_app_url}<ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        )}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={open => { if (!saving) setConfirmOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar nova versão do app?</AlertDialogTitle>
            <AlertDialogDescription>O acesso dos demais usuários a este app será bloqueado, mostrando a mensagem de migração para {NEW_APP_URL} A manutenção será desativada automaticamente. Você continuará com acesso para alterar esta configuração.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button disabled={saving} onClick={() => void save(NEW_APP_URL)}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ativar aviso</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
