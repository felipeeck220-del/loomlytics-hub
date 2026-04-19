# 03 — Eliminação dos `as any` no Cliente Supabase

**Prioridade:** 🟡 Média · **Esforço:** ~3h · **Risco se não fizer:** Bugs de runtime que poderiam ser pegos em compile-time

---

## Diagnóstico

O projeto já tem o arquivo `src/integrations/supabase/types.ts` gerado automaticamente pelo Supabase, com tipagem completa de todas as tabelas, colunas, enums e relacionamentos.

Porém, o `useCompanyData.ts` faz cast genérico:

```ts
// src/hooks/useCompanyData.ts (linha 7)
const sb = (table: string) => (supabase.from as any)(table);
```

Isso anula 100% da segurança de tipos. O TypeScript trata cada chamada como `any`, perdendo:
- Autocomplete de nomes de tabela
- Validação de colunas no `.eq()`, `.select()`, `.update()`
- Verificação de tipos de retorno
- Detecção de colunas renomeadas/removidas

**Onde mais pode estar acontecendo:** rodar grep por `as any` no projeto para mapear (provavelmente em outras edge functions e hooks).

## Risco

Exemplo real de bug que escaparia: se o schema migrar `defect_records.measure_value` de `number` para `string`, o código `Number(r.measure_value)` continuaria compilando — mas falharia em runtime para todos os usuários.

## Solução Proposta

### Passo 1 — Mapear todos os usos de `as any`

```bash
grep -rn "as any" src/
```

Listar e classificar:
- Casts em `supabase.from` → corrigir
- Casts em parsing JSON desconhecido → manter (legítimo)
- Casts para contornar tipos de libs externas → avaliar caso a caso

### Passo 2 — Refatorar `useCompanyData.ts`

**Antes:**
```ts
const sb = (table: string) => (supabase.from as any)(table);
// ...
const { data } = await sb('machines').select('*').eq('company_id', companyId);
```

**Depois:**
```ts
import { supabase } from '@/integrations/supabase/client';
// supabase já está tipado como SupabaseClient<Database>
// Basta remover o helper sb() e usar supabase.from('machines') diretamente

const { data } = await supabase
  .from('machines')
  .select('*')
  .eq('company_id', companyId);
// `data` agora é Tables<'machines'>[] | null
```

### Passo 3 — Simplificar mappers

Os mappers (`mapMachine`, `mapClient`, etc.) hoje recebem `r: any`. Tipar com `Tables<'nome_tabela'>`:

```ts
import type { Tables } from '@/integrations/supabase/types';

const mapMachine = (r: Tables<'machines'>): Machine => ({
  id: r.id,
  company_id: r.company_id,
  // ...
});
```

Isso pega imediatamente discrepâncias entre `r.production_mode` (string no DB) e o tipo `'rolos' | 'voltas' | 'kg'` em `Machine`.

### Passo 4 — Adaptar `fetchAll`

A função genérica precisa aceitar o nome da tabela como tipo:

```ts
type TableName = keyof Database['public']['Tables'];

const fetchAll = async <T extends TableName>(
  table: T,
  query: { column: string; value: string } | null,
  orderCol: string,
  ascending = true
): Promise<Tables<T>[]> => {
  // ...
};
```

### Passo 5 — Auditar Edge Functions

Em `supabase/functions/*/index.ts`, verificar se há `as any` em queries Supabase. Edge functions podem importar tipos do Database igualmente.

### Passo 6 — Validar build

`bun run build` deve passar sem erros. Erros de tipo que aparecerem **são bugs reais** — corrigir cada um (não silenciar com novo `as any`).

## Arquivos Afetados

**Modificados (alta prioridade):**
- `src/hooks/useCompanyData.ts` — remover `sb` helper, tipar mappers
- Qualquer outro hook/componente com `(supabase.from as any)`

**Auditar (pode estar OK):**
- `supabase/functions/*/index.ts` — todas as edge functions
- `src/contexts/AuthContext.tsx`
- `src/contexts/SubscriptionContext.tsx`
- `src/lib/auditLog.ts`
- `src/lib/loginTracker.ts`

## Critérios de Aceite

- [ ] Zero ocorrências de `(supabase.from as any)` no projeto
- [ ] Zero ocorrências de `as any` em queries Supabase em geral
- [ ] `bun run build` compila sem erros
- [ ] Autocomplete funciona em VSCode ao digitar `.eq('` em uma query
- [ ] Nenhuma regressão funcional (testar manualmente Production, Dashboard, Fechamento)

## Rollback

Reverter `useCompanyData.ts` para a versão com `sb = (table: string) => (supabase.from as any)(table)`. Os mappers tipados continuam compatíveis pois o tipo de entrada é compatível com `any`.

## Notas

- **NÃO** ler ou editar `src/integrations/supabase/types.ts` (regenerado automaticamente)
- Se um tipo do Database estiver "errado", a correção é via migration SQL, nunca editando o arquivo de tipos
