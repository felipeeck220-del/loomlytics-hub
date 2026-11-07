import type { ReactNode } from 'react';
import { Loader2, LogOut, RefreshCw, Rocket, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyMaintenance } from '@/contexts/CompanyMaintenanceContext';
import { isCompanyMaintenanceBlocked } from '@/lib/companyMaintenance';

export default function CompanyMaintenanceGate({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const { state, error, refresh } = useCompanyMaintenance();

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-foreground">Não foi possível verificar o acesso</h1>
          <p className="text-muted-foreground">Verifique sua conexão e tente novamente.</p>
          <Button onClick={() => void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
          <Button variant="outline" onClick={() => void logout()}>Sair</Button>
        </div>
      </div>
    );
  }
  if (!state) {
    return <div className="min-h-screen bg-background flex items-center justify-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-primary motion-reduce:animate-none" /><span className="sr-only">Verificando acesso à empresa</span></div>;
  }
  if (isCompanyMaintenanceBlocked(state)) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-5">
          {state.new_app_url ? <Rocket className="mx-auto h-14 w-14 text-primary" aria-hidden="true" /> : <Wrench className="mx-auto h-14 w-14 text-primary" aria-hidden="true" />}
          <p className="text-sm font-medium text-muted-foreground break-words">{user?.company_name}</p>
          <h1 className="text-2xl font-bold text-foreground">{state.new_app_url ? 'Nova versão do app' : 'Site em manutenção'}</h1>
          <p className="text-muted-foreground">{state.new_app_url ? 'O acesso a este app foi encerrado. Migre para o novo endereço para continuar utilizando o aplicativo.' : 'O acesso foi temporariamente suspenso pelo administrador da empresa. Aguarde a conclusão da manutenção.'}</p>
          {state.new_app_url && (
            <div className="space-y-3">
              <p className="text-sm text-primary break-all">{state.new_app_url}</p>
              <Button asChild><a href={state.new_app_url} target="_blank" rel="noopener noreferrer"><Rocket className="mr-2 h-4 w-4" />Acessar novo app</a></Button>
            </div>
          )}
          <Button variant="outline" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
        </div>
      </div>
    );
  }
  return (
    <>
      {state.new_app_url && (
        <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2.5 shadow-md">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center text-sm">
            <span className="inline-flex items-center gap-2 font-medium">
              <Rocket className="h-4 w-4 shrink-0" aria-hidden="true" />
              Nova versão do app disponível! Migre para o novo endereço.
            </span>
            <a href={state.new_app_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground px-3 py-1 text-xs font-semibold text-primary transition-opacity hover:opacity-90">
              Acessar novo app
            </a>
          </div>
        </div>
      )}
      {children}
    </>
  );
}