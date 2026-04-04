import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import AppLayout from "@/components/AppLayout";

export default function CompanyRouteInner() {
  const { user, logout } = useAuth();
  const { fullyBlocked, loading: subLoading } = useSubscription();

  if (subLoading) return null;

  if (user?.status === 'inactive') {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md bg-background rounded-2xl p-8 shadow-lg border">
          <div className="mx-auto h-20 w-20 rounded-full bg-muted flex items-center justify-center">
            <svg className="h-10 w-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Acesso Bloqueado</h1>
          <p className="text-muted-foreground">
            Sua conta foi desativada pelo administrador principal.
            Entre em contato com o administrador para reativar seu acesso.
          </p>
          <button
            onClick={() => logout()}
            className="mt-4 px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  if (fullyBlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="h-8 w-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Acesso Bloqueado</h1>
          <p className="text-muted-foreground">A assinatura da empresa está inativa. Solicite ao administrador que renove o plano para restaurar o acesso.</p>
        </div>
      </div>
    );
  }

  return <AppLayout />;
}
