# 08 — Paginação Server-Side em Listagens Grandes

**Prioridade:** 🟢 Baixa · **Esforço:** ~10h · **Risco se não fizer:** Lentidão progressiva conforme volume cresce

---

## Diagnóstico

Hoje, `useCompanyData.fetchAll` busca **todos** os registros de cada tabela em páginas de 1.000, mas concatena tudo em memória:

```ts
// useCompanyData.ts linha 25-47
const fetchAll = async (table, query, orderCol, ascending = true) => {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase.from(table).select('*')
      .eq(query.column, query.value)
      .order(orderCol, { ascending })
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data) break;
    allData = allData.concat(data);
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  return allData;
};
```

Tabelas que mais sofrem:
- `productions` — cresce ~50-200 registros/dia por empresa
- `defect_records` — variável
- `machine_logs` — pode crescer rápido (cada start/stop)
- `outsource_productions` — moderado
- `audit_logs` — cresce com toda ação no sistema

Filtros de data (mês/dia) hoje são aplicados **no cliente**, depois de baixar tudo.

## Risco / Projeção

| Volume | Comportamento | Tempo de carga estimado |
|--------|---------------|-------------------------|
| 5k registros | OK | < 2s |
| 30k registros | Aceitável | 5-8s |
| 100k registros | Ruim | 20-40s + travamento |
| 500k registros | Inviável | timeout/crash |

Empresa madura com 5 anos de operação chega tranquilamente em 200k+ registros de produção.

## Solução Proposta

### Estratégia: paginação por filtro de data, não por offset

Usuário **nunca** precisa ver "todos os registros de uma vez". Sempre filtra por mês/intervalo. Mover esse filtro para o servidor.

### Passo 1 — Identificar consultas que podem usar filtro de data no servidor

| Consulta | Filtro natural | Ação |
|----------|---------------|------|
| Production list | Mês/dia/intervalo | Server-side (já tem coluna `date`) |
| Dashboard stats | Mês atual + comparação | Server-side, agregado SQL |
| Reports | Intervalo customizado | Server-side |
| Fechamento | Mês fechado | Server-side |
| Falhas (Weavers) | Mês atual | Server-side |
| Audit logs | Últimos 100 | Server-side LIMIT |
| Machine logs | Últimos 50 por máquina | Server-side LIMIT |

### Passo 2 — Criar funções de busca paginadas

```ts
// src/lib/queries/productionsQueries.ts

export interface ProductionFilter {
  startDate: string;  // ISO YYYY-MM-DD
  endDate: string;
  machineId?: string;
  weaverId?: string;
  shift?: ShiftType;
  page?: number;
  pageSize?: number;
}

export async function fetchProductionsPage(
  companyId: string,
  filter: ProductionFilter
) {
  const page = filter.page ?? 0;
  const pageSize = filter.pageSize ?? 100;

  let q = supabase
    .from('productions')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .gte('date', filter.startDate)
    .lte('date', filter.endDate)
    .order('date', { ascending: false })
    .order('id', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (filter.machineId) q = q.eq('machine_id', filter.machineId);
  if (filter.weaverId) q = q.eq('weaver_id', filter.weaverId);
  if (filter.shift) q = q.eq('shift', filter.shift);

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    items: data.map(mapProduction),
    total: count ?? 0,
    page,
    pageSize,
    hasMore: ((page + 1) * pageSize) < (count ?? 0),
  };
}
```

### Passo 3 — Agregações via RPC (Postgres function)

Para Dashboard/Faturamento Total, **não baixar registros**, só pedir totais:

```sql
-- Migration: criar função SQL para stats do mês
CREATE OR REPLACE FUNCTION public.get_production_stats(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  total_weight numeric,
  total_revenue numeric,
  total_rolls bigint,
  avg_efficiency numeric,
  record_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(weight_kg), 0) AS total_weight,
    COALESCE(SUM(revenue), 0) AS total_revenue,
    COALESCE(SUM(rolls_produced), 0) AS total_rolls,
    COALESCE(AVG(efficiency), 0) AS avg_efficiency,
    COUNT(*) AS record_count
  FROM public.productions
  WHERE company_id = p_company_id
    AND date >= p_start_date
    AND date <= p_end_date;
$$;
```

E no cliente:

```ts
const { data } = await supabase.rpc('get_production_stats', {
  p_company_id: companyId,
  p_start_date: '2026-04-01',
  p_end_date: '2026-04-30',
});
// data = { total_weight, total_revenue, ... } — 1 linha apenas
```

Vantagem: empresa com 1 milhão de registros tem stats em < 100ms.

### Passo 4 — Componente de paginação reutilizável

Já existe `src/components/ui/pagination.tsx` (shadcn). Criar wrapper `PaginatedTable`:

```tsx
<PaginatedTable
  query={fetchProductionsPage}
  filter={currentFilter}
  renderRow={(p) => <ProductionRow data={p} />}
  pageSize={50}
/>
```

### Passo 5 — Migrar gradualmente

Ordem sugerida:
1. **Audit logs** (já mostra "últimos N", trivial)
2. **Machine logs** (idem)
3. **Production list** (mais usada, mais ganho)
4. **Reports** (filtros já existem)
5. **Dashboard stats** (RPC) — maior ganho de performance

### Passo 6 — Indices SQL

Verificar/criar índices para suportar filtros por data:

```sql
CREATE INDEX IF NOT EXISTS idx_productions_company_date
  ON public.productions(company_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_defect_records_company_date
  ON public.defect_records(company_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_machine_logs_machine_started
  ON public.machine_logs(machine_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON public.audit_logs(company_id, created_at DESC);
```

### Passo 7 — Manter cache para dados pequenos

Tabelas pequenas e estáveis (machines, clients, articles, weavers) **não precisam** paginar — continuam carregando tudo no `useCompanyData`. Critério: < 500 registros típicos.

## Arquivos Afetados

**Novos:**
- `src/lib/queries/productionsQueries.ts`
- `src/lib/queries/defectsQueries.ts`
- `src/lib/queries/auditQueries.ts`
- `src/components/PaginatedTable.tsx`
- Migration SQL com RPCs e índices

**Modificados:**
- `src/hooks/useCompanyData.ts` — REMOVER carga inicial de `productions`, `defect_records`, `machine_logs`, `audit_logs`
- `src/pages/Production.tsx` — usar `fetchProductionsPage` com paginação
- `src/pages/Dashboard.tsx` — usar `get_production_stats` RPC
- `src/pages/Reports.tsx` — paginação server-side
- `src/pages/FaturamentoTotal.tsx` — RPC para totais
- `src/pages/Fechamento.tsx` — buscar só dados do mês selecionado

## Critérios de Aceite

- [ ] Página Production carrega em < 2s mesmo com 500k registros no banco
- [ ] Dashboard stats carrega em < 500ms
- [ ] Trocar de mês não dispara recarga global
- [ ] Componente de paginação (1, 2, 3, …, próxima) funcional em todas as listagens grandes
- [ ] Índices SQL criados via migration
- [ ] RPCs criadas com `SECURITY DEFINER` e `SET search_path = public`
- [ ] RLS continua funcionando (RPCs respeitam políticas via `SECURITY DEFINER` controlado)

## Rollback

Reverter componentes para usar `getProductions()` do contexto. Manter RPCs e índices criados (não causam dano, melhoram queries existentes também).

## Quando atacar

**Indicadores para começar:**
- Algum cliente reportar lentidão real
- Maior empresa cadastrada passar de 50k registros em qualquer tabela
- Lighthouse Performance score abaixo de 70 em produção

Antes disso, o esforço não compensa o benefício.

## Notas

- Atenção à regra de `mem://logic/comparison-period-rules`: comparativos do Dashboard precisam períodos diferentes — RPCs precisam suportar
- Atenção à regra de `mem://logic/production-metrics-logic`: filtros de mês incluem mês vigente mesmo incompleto
- Atenção à regra de `mem://constraints/date-entry-validation`: datas limitadas a ±5 anos — filtros server-side podem usar isso como guard-rail
