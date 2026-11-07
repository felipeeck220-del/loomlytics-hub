import type { ReactNode } from 'react';
import { Loader2, LogOut, RefreshCw, Wrench } from 'lucide-react';
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
          <Wrench className="mx-auto h-14 w-14 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium text-muted-foreground break-words">{user?.company_name}</p>
          <h1 className="text-2xl font-bold text-foreground">Site em manutenção</h1>
          <p className="text-muted-foreground">O acesso foi temporariamente suspenso pelo administrador da empresa. Aguarde a conclusão da manutenção.</p>
          <Button variant="outline" onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}