# 06 — Tratamento de Erros Centralizado

**Prioridade:** 🔴 Alta · **Esforço:** ~3h · **Risco se não fizer:** Erros silenciosos corrompem dados visíveis

---

## Diagnóstico

### Problema 1: Erros engolidos em silêncio

Em `useCompanyData.ts`:

```ts
// linha 41
if (error || !data) break;  // ← se a página 2 falhar, mostra só a página 1, sem aviso
```

```ts
// linha 156
} catch (err) {
  console.error('Failed to load company data:', err);  // ← só log, usuário não vê
}
```

### Problema 2: Sem ErrorBoundary global

Se um componente lançar uma exceção (ex: `Cannot read property 'name' of undefined`), o React desmonta toda a árvore e mostra tela branca. O usuário não tem como reportar nem reagir.

### Problema 3: Toasts inconsistentes

Alguns componentes mostram `toast.error('Erro ao salvar')` genérico, outros mostram a mensagem do Supabase crua (`new row violates row-level security policy`), outros não mostram nada.

A memória `mem://architecture/error-handling` documenta a intenção de erros amigáveis, mas a implementação está fragmentada.

## Risco

- **Faturamento incorreto exibido**: paginação parcial em `productions` mostra valores menores que a realidade
- **Tela branca = perda de cliente**: usuário não-técnico fecha o app pensando que quebrou
- **Suporte cego**: sem logs estruturados, impossível reproduzir bugs reportados por telefone

## Solução Proposta

### Parte A — ErrorBoundary global

Criar `src/components/ErrorBoundary.tsx`:

```tsx
import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    // Futuro: enviar para serviço de logging (Sentry, LogRocket, etc.)
    logErrorToServer(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">
              Algo deu errado
            </h1>
            <p className="text-muted-foreground">
              Encontramos um erro inesperado. Tente recarregar a página.
              Se o problema persistir, entre em contato com o suporte.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="text-xs text-left bg-muted p-3 rounded overflow-auto">
                {this.state.error.message}
              </pre>
            )}
            <Button onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Envolver no `App.tsx`:

```tsx
<ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      {/* ... */}
    </AuthProvider>
  </QueryClientProvider>
</ErrorBoundary>
```

### Parte B — Helper de mensagens amigáveis

Criar `src/lib/errorMessages.ts`:

```ts
export function friendlyErrorMessage(error: unknown): string {
  if (!error) return 'Erro desconhecido.';

  const msg = error instanceof Error ? error.message : String(error);

  // Mapeamento de erros conhecidos do Supabase / Postgres
  const map: Array<[RegExp, string]> = [
    [/row-level security/i, 'Você não tem permissão para esta ação.'],
    [/duplicate key/i, 'Este registro já existe.'],
    [/foreign key/i, 'Não é possível remover: registro está em uso.'],
    [/network|fetch failed|timeout/i, 'Sem conexão com o servidor. Verifique sua internet.'],
    [/JWT expired/i, 'Sua sessão expirou. Faça login novamente.'],
    [/permission denied/i, 'Permissão negada.'],
    [/violates check constraint/i, 'Dados inválidos para esta operação.'],
    [/not found/i, 'Registro não encontrado.'],
  ];

  for (const [pattern, friendly] of map) {
    if (pattern.test(msg)) return friendly;
  }

  // Fallback: mostrar mensagem genérica em produção, técnica em dev
  return import.meta.env.DEV
    ? `Erro: ${msg}`
    : 'Erro ao processar. Tente novamente.';
}
```

### Parte C — Logger estruturado

Criar `src/lib/logger.ts`:

```ts
export type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  userAgent: string;
  url: string;
}

export function logError(message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = {
    level: 'error',
    message,
    context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  console.error('[ERROR]', entry);

  // Futuro: persistir em tabela `error_logs` ou enviar para Sentry
  // Por enquanto, apenas console + toast
}

export function logErrorToServer(error: Error, info?: React.ErrorInfo) {
  logError(error.message, {
    stack: error.stack,
    componentStack: info?.componentStack,
  });
}
```

### Parte D — Corrigir `useCompanyData.fetchAll`

```ts
const fetchAll = async (table: string, query, orderCol: string, ascending = true) => {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(query.column, query.value)
      .order(orderCol, { ascending })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // ANTES: break silencioso
      // DEPOIS: lançar erro para o catch externo decidir o que fazer
      logError(`Failed to fetch ${table} page ${from / PAGE_SIZE}`, { error });
      throw new Error(`Erro ao carregar ${table}: ${error.message}`);
    }

    if (!data) break;
    allData = allData.concat(data);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return allData;
};
```

E no `loadAllData`:

```ts
} catch (err) {
  logError('Failed to load company data', { err });
  toast({
    title: 'Erro ao carregar dados',
    description: friendlyErrorMessage(err),
    variant: 'destructive',
  });
}
```

### Parte E — Padronizar toasts em mutations

Criar wrapper helper `src/lib/safeAction.ts`:

```ts
import { toast } from '@/hooks/use-toast';
import { friendlyErrorMessage } from './errorMessages';

interface SafeActionOptions {
  successMessage?: string;
  errorPrefix?: string;
}

export async function safeAction<T>(
  action: () => Promise<T>,
  options: SafeActionOptions = {}
): Promise<T | null> {
  try {
    const result = await action();
    if (options.successMessage) {
      toast({ title: options.successMessage });
    }
    return result;
  } catch (err) {
    toast({
      title: options.errorPrefix ?? 'Erro',
      description: friendlyErrorMessage(err),
      variant: 'destructive',
    });
    return null;
  }
}
```

Uso em componentes:

```ts
await safeAction(
  () => saveProductions(newRecords),
  { successMessage: 'Produção salva!', errorPrefix: 'Erro ao salvar produção' }
);
```

## Arquivos Afetados

**Novos:**
- `src/components/ErrorBoundary.tsx`
- `src/lib/errorMessages.ts`
- `src/lib/logger.ts`
- `src/lib/safeAction.ts`

**Modificados:**
- `src/App.tsx` — envolver com `<ErrorBoundary>`
- `src/hooks/useCompanyData.ts` — `fetchAll` lança erros, `loadAllData` mostra toast
- Idealmente: revisar todos os `catch` no projeto e aplicar `friendlyErrorMessage` + `logError`

## Critérios de Aceite

- [ ] Lançar `throw new Error('teste')` em qualquer componente mostra a tela de erro amigável (não tela branca)
- [ ] Forçar erro de rede no DevTools → toast amigável aparece, sem erro técnico
- [ ] `if (error || !data) break;` removido de `fetchAll`
- [ ] Console mostra `[ERROR]` estruturado em todos os erros
- [ ] Mensagem de RLS violation aparece como "Você não tem permissão" ao invés do texto cru
- [ ] Memória `mem://architecture/error-handling` continua válida e agora reflete a implementação

## Rollback

Remover `<ErrorBoundary>` do App.tsx volta ao comportamento de tela branca. Os helpers (`friendlyErrorMessage`, `logError`) são opt-in — se um componente parar de chamá-los, volta ao comportamento anterior.

## Roadmap futuro

- Integração com Sentry ou similar para alertas em produção
- Tabela `error_logs` para suporte rastrear sem precisar acessar console do usuário
- Captura de erros não tratados via `window.onerror` e `window.onunhandledrejection`
