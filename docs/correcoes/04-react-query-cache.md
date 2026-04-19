# 04 — Migração para React Query (Cache Inteligente)

**Prioridade:** 🟢 Baixa · **Esforço:** ~16h · **Risco se não fizer:** Performance degradada com volume crescente

---

## Diagnóstico

`@tanstack/react-query` está **instalado** no `package.json` mas usado apenas marginalmente (provavelmente só para a integração shadcn).

A camada de dados atual:
- `useCompanyData.ts` faz `loadAllData()` que busca **9 tabelas em paralelo** no carregamento
- Cada mudança chama `refreshData()` → recarrega tudo de novo
- `CompanyDataProvider` compartilha estado global, mas sem invalidação granular
- Não há `staleTime`, `cacheTime`, background refetch, ou retry automático
- Paginação manual de 1000 em 1000 implementada na mão

## Risco

- Empresa com 2 anos de produção: ~30k registros em `productions` carregados de uma vez
- Cada `refreshData` (após salvar uma produção) baixa **todos** os 30k novamente
- Sem cache: ao navegar Dashboard → Reports → Dashboard, refetch desnecessário
- Sem retry: queda momentânea de rede = página em branco

## Solução Proposta

### Estratégia: migração **gradual**, uma entidade por vez

**NÃO** reescrever `useCompanyData` inteiro. Ao invés disso, criar hooks paralelos React Query e migrar componentes um a um.

### Passo 1 — Setup base

Criar `src/lib/queryClient.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 min — dados ficam "frescos"
      gcTime: 30 * 60 * 1000,          // 30 min — mantém em memória
      refetchOnWindowFocus: false,     // não refetch ao trocar de aba
      retry: 2,                        // 2 tentativas em caso de erro
    },
  },
});
```

Verificar se `App.tsx` já tem `<QueryClientProvider>` — se sim, reaproveitar.

### Passo 2 — Padrão de hook por entidade

Criar `src/hooks/queries/` com um arquivo por tabela:

```
src/hooks/queries/
├── useMachinesQuery.ts
├── useClientsQuery.ts
├── useArticlesQuery.ts
├── useWeaversQuery.ts
├── useProductionsQuery.ts       ← mais crítico
├── useDefectRecordsQuery.ts
├── useArticleMachineTurnsQuery.ts
└── useShiftSettingsQuery.ts
```

**Exemplo `useMachinesQuery.ts`:**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const KEY = (companyId: string) => ['machines', companyId];

export function useMachinesQuery() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? '';

  return useQuery({
    queryKey: KEY(companyId),
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .eq('company_id', companyId)
        .order('number');
      if (error) throw error;
      return data.map(mapMachine);
    },
  });
}

export function useUpdateMachineMutation() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const companyId = user?.company_id ?? '';

  return useMutation({
    mutationFn: async (machine: Machine) => {
      const { error } = await supabase
        .from('machines')
        .upsert([toRow(machine)]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(companyId) });
    },
  });
}
```

### Passo 3 — Ordem de migração

1. **Entidades pequenas e estáveis** (baixo risco): `clients`, `weavers`, `articles`, `machines`
2. **Entidades médias**: `defect_records`, `article_machine_turns`, `shift_settings`
3. **Entidade grande** (crítico): `productions` — precisa paginação/filtros server-side antes de migrar (ver doc #08)

### Passo 4 — Coexistência durante transição

Manter `useSharedCompanyData()` funcionando. Componentes migrados consomem `useMachinesQuery()`, componentes legados continuam com `getMachines()` do contexto.

Eventualmente, `useCompanyData.ts` pode ser deletado quando todos os componentes migrarem.

### Passo 5 — Realtime opcional

React Query + Supabase Realtime se integram bem:

```ts
useEffect(() => {
  const channel = supabase
    .channel('machines-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' },
      () => qc.invalidateQueries({ queryKey: KEY(companyId) }))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [companyId]);
```

Útil principalmente para o Modo TV (ver `mem://features/tv-mode`).

## Arquivos Afetados

**Novos:** ~10 arquivos em `src/hooks/queries/`
**Modificados:** todos os componentes consumidores, gradualmente
**Eventualmente removidos:** `src/hooks/useCompanyData.ts`, `src/contexts/CompanyDataContext.tsx`

## Critérios de Aceite

- [ ] Tempo de carregamento inicial percebido melhora (medido via DevTools)
- [ ] Ao salvar uma máquina, apenas a query de `machines` é invalidada (não todas)
- [ ] Navegar entre páginas não dispara refetch desnecessário
- [ ] Funciona offline brevemente (cache de 30 min)
- [ ] DevTools React Query mostra queries com staleTime correto

## Rollback

Como a migração é gradual, basta reverter o componente específico para usar `useSharedCompanyData()` novamente. O hook antigo continua funcionando em paralelo.

## Quando atacar

**Não fazer agora.** Esperar até que:
- Algum cliente reclame de lentidão real, OU
- Volume de produções de qualquer empresa passe de 50.000 registros, OU
- Refatorações futuras (#02) tornarem natural extrair os hooks
