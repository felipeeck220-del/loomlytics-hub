import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PaymentSuccess() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Pagamento Confirmado!</h1>
        <p className="text-muted-foreground">
          Sua assinatura foi ativada com sucesso. Aproveite todos os recursos do MalhaGest.
        </p>
        <Button onClick={() => navigate(-1)} className="btn-gradient">
          Voltar ao Sistema
        </Button>
      </div>
    </div>
  );
}
