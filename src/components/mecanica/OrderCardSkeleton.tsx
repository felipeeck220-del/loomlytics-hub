import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface OrderCardSkeletonProps {
  /** Quantidade de cards de carregamento a exibir */
  count?: number;
  /** Rótulo curto da ordem (OM, OC, OE, OT) */
  label?: string;
}

/**
 * Placeholder exibido enquanto TODOS os dados da ordem (ordem + máquinas/artigos)
 * ainda não chegaram — evita mostrar card parcial (descrição sem máquina) em
 * conexões lentas.
 */
export default function OrderCardSkeleton({ count = 3, label = 'ordem' }: OrderCardSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="relative overflow-hidden border bg-card">
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-muted-foreground/30 animate-pulse" />
          <CardContent className="p-4 pl-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-muted-foreground">
                Carregando dados da {label}…
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-5 w-40 rounded bg-muted animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
