# 🚀 Plano de Migração RPC — Produção (Production.tsx)

> **Escopo:** `src/pages/Production.tsx` + fetchers em `src/lib/queries/productionsQueries.ts` + operações de escrita de produção em `src/hooks/useCompanyData.ts` (`addProductions` / `updateProductions` / `deleteProductions`).
>
> **Objetivo:** Substituir o consumo do array global `getProductions()` (carregado por `fetchAll('productions', …)` sem filtro, paginado de 1.000 em 1.000) e as três escritas soltas em `productions` por um contrato RPC coeso, seguindo o padrão consolidado em `docs/rpcInvoices.md`, `docs/rpcclientInvoices.md`, `docs/rpcstockMalha.md`, `docs/rpcBillingOrders.md` e `docs/rpcFreightOrders.md`, e o modelo de referência `get_faturamento_total_metrics`.
>
> **⚠️ Regra inegociável (ver `rpcproduction.md` legado e `reversion_point_production_logic.md`):** O cálculo de eficiência exibido no *modal de registro de produção* (preview em tempo real com voltas/rolos/RPM/downtime/artigos extras) **permanece 100% no frontend**. A RPC recebe os valores já calculados (`efficiency`, `weight_kg`, `revenue`, `rolls_produced`) prontos e os grava sem recalcular. Nenhuma fase deste plano pode tocar em `preview` (`Production.tsx` linhas 156–208) nem em `calculateShiftDowntime` (`src/lib/downtimeUtils.ts`).

---

## 📌 Diagnóstico do estado atual

### Leituras
| Origem | O que carrega | Custo |
|---|---|---|
| `useCompanyData.loadAllData` → `fetchAll('productions', { company_id }, 'date', false)` | **Toda** a tabela `productions` da empresa em páginas de 1.000 linhas | Muito alto para malharias com histórico anual (5–50k linhas) |
| `Production.tsx` `productions = getProductions()` | Consome o array global inteiro | Reprocessa em memória a cada render |
| `Production.tsx` `filteredProductions` (linhas 415–421) | Filtra por data/máquina/artigo no JS | Recalcula a cada mudança de estado |
| `shiftProductionGroups` (linhas 440–488) | Agrupa `machine_id|date|created_at`, aplica busca textual | Sobre o array global |
| `shiftKPIs` (linhas 519–528) | Totais + média de eficiência ponderada por grupo | Sobre o array global |
| `openEditGroup` (linhas 242–251) | Detalhe do grupo para edição | Já vem do memo, sem query |
| `fetchProductionsPage` (queries) | RPC `fetch_productions_page` já existe, mas **não é usada** pela tela (apenas por telas legadas / possíveis relatórios) | Contrato incompleto para o caso de uso desta página |

### Escritas
| Operação | Fluxo atual | Problema |
|---|---|---|
| `addProductions` (hook) | `INSERT` bruto em `productions` | Sem validação de duplicidade server-side; sem transação com auditoria |
| `updateProductions` (hook) | `DELETE` + `INSERT` sequenciais, sem transação | Janela para inconsistência se `INSERT` falhar |
| `deleteProductions` (hook) | `DELETE` em massa | Sem log de auditoria server-side |
| `handleSave` (`Production.tsx`) | Constrói array de `Production[]` (principal + extras), verifica duplicidade em `productions` local, chama `addProductions`/`updateProductions` | Duplicidade validada no cliente; se dois usuários registrarem o mesmo turno simultaneamente ambos passam |

### Efeitos colaterais que **não** podem regredir
- Múltiplos artigos por turno compartilham o **mesmo `created_at`** (chave de agrupamento em `shiftProductionGroups`).
- Todos os registros de um grupo carregam a **mesma `efficiency`** combinada.
- Autoria `created_by_name` / `created_by_code` vem sempre do `useAuditLog`.
- Filtro de data padrão = última data com produção da empresa (linhas 68–76).
- Cache Realtime da produção via `getMachineLogs()` alimenta o cálculo de downtime — permanece 100% client-side no modal.

---

## 🗺️ Roadmap em 4 fases

### Fase 1 — Bootstrap único

**Objetivo:** Substituir o consumo do array global e o `useEffect` que descobre `last production date` por uma única RPC.

**RPC:** `get_production_bootstrap(p_company_id uuid)` → `jsonb`

Payload:
```json
{
  "company": { "id": "...", "name": "..." },
  "shift_settings": { /* company_shift_settings do tenant */ },
  "last_production_date": "2026-05-10",
  "stats": {
    "total_records": 12345,
    "days_recorded": 421,
    "first_date": "2024-01-05",
    "last_date": "2026-05-10"
  },
  "available_months": ["2026-05","2026-04","2026-03", …]
}
```

Regras SQL:
- `SECURITY DEFINER SET search_path = public`.
- `v_caller := public.get_user_company_id(); IF v_caller IS NULL OR v_caller <> p_company_id THEN RAISE EXCEPTION 'Acesso negado'; END IF;`.
- `available_months` via `to_char(date::date, 'YYYY-MM')` **assumindo** `productions.date` como `text` (formato ISO `yyyy-mm-dd`, ver `docs/data/05-producao.md`).
- Sem paginação — payload é constante.

**Refactor cliente:**
- `Production.tsx` deixa de depender de `productions = getProductions()`.
- Novo `useQuery(['production_bootstrap', companyId])` alimenta `last_production_date` + `available_months`.
- O `useEffect` das linhas 68–76 vira `useEffect(() => { if (bootstrap && !filterDateInitialized) setFilterDate(bootstrap.last_production_date) }, …)`.
- `shiftSettings` e `companyShiftMinutes/Labels` passam a vir do bootstrap (mantém `getCompanyShiftMinutes/getCompanyShiftLabels` puros).

---

### Fase 2 — Listagem paginada + KPIs por turno

**Objetivo:** Substituir `getProductions()` + `filteredProductions` + `shiftProductionGroups` + `shiftKPIs` por RPC única server-side, com **agrupamento por `machine_id|date|created_at` feito no banco** (elimina o `Map` no cliente).

**RPC:** `get_productions_by_shift(p_company_id, p_date, p_shift, p_machine_id, p_article_id, p_search, p_page, p_page_size)` → `jsonb`

Payload:
```json
{
  "kpis": {
    "total_rolls": 128.5,
    "total_weight": 4712.30,
    "total_revenue": 62810.15,
    "avg_efficiency": 82.4,
    "count": 24
  },
  "groups": [
    {
      "key": "<machine>|<date>|<created_at>",
      "machine_id": "…",
      "machine_name": "TEAR 03",
      "machine_number": 3,
      "weaver_id": "…",
      "weaver_name": "João - Manhã",
      "date": "2026-05-10",
      "shift": "manha",
      "created_at": "2026-05-10T12:34:56Z",
      "created_by_name": "Felipe",
      "created_by_code": "1",
      "rpm": 22,
      "total_rolls": 6.4,
      "total_weight_kg": 214.0,
      "total_revenue": 3210.5,
      "efficiency": 84.1,
      "items": [
        {
          "id": "…","article_id": "…","article_name": "…",
          "rolls_produced": 4.2,"weight_kg": 140.7,"revenue": 2110.5,
          "efficiency": 84.1
        },
        { "…extras…" }
      ]
    }
  ],
  "total_groups": 41,
  "page": 1,
  "page_size": 10
}
```

Algoritmo SQL (esqueleto — sem `CREATE TEMP TABLE` para permitir `STABLE`):
```sql
WITH filt AS (
  SELECT p.*
  FROM public.productions p
  WHERE p.company_id = p_company_id
    AND (p_date IS NULL OR p.date = p_date)
    AND (p_shift IS NULL OR p_shift = 'all' OR p.shift = p_shift)
    AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
    AND (p_article_id IS NULL OR p.article_id = p_article_id)
    AND (
      p_search IS NULL OR p_search = '' OR
      p.machine_name ILIKE '%'||p_search||'%' OR
      p.article_name ILIKE '%'||p_search||'%' OR
      p.weaver_name ILIKE '%'||p_search||'%'
    )
),
groups AS (
  SELECT
    f.machine_id, f.date, f.created_at,
    (f.machine_id::text || '|' || f.date || '|' || f.created_at::text) AS key,
    MIN(f.machine_name) AS machine_name,
    MIN(f.weaver_name)  AS weaver_name,
    MIN(f.shift)        AS shift,
    MIN(f.rpm)          AS rpm,
    SUM(f.rolls_produced) AS total_rolls,
    SUM(f.weight_kg)      AS total_weight_kg,
    SUM(f.revenue)        AS total_revenue,
    MIN(f.efficiency)     AS efficiency,  -- todos do grupo compartilham
    MIN(f.created_by_name) AS created_by_name,
    MIN(f.created_by_code) AS created_by_code,
    jsonb_agg(jsonb_build_object(
      'id', f.id,
      'article_id', f.article_id,
      'article_name', f.article_name,
      'rolls_produced', f.rolls_produced,
      'weight_kg', f.weight_kg,
      'revenue', f.revenue,
      'efficiency', f.efficiency
    ) ORDER BY f.article_name) AS items
  FROM filt f
  GROUP BY f.machine_id, f.date, f.created_at
),
ordered AS (
  SELECT g.*,
    (SELECT number FROM public.machines m WHERE m.id = g.machine_id) AS machine_number
  FROM groups g
),
kpis AS (
  SELECT
    COALESCE(SUM(total_rolls),0)    AS total_rolls,
    COALESCE(SUM(total_weight_kg),0) AS total_weight,
    COALESCE(SUM(total_revenue),0)   AS total_revenue,
    CASE WHEN COUNT(*) FILTER (WHERE total_rolls > 0) = 0
         THEN 0
         ELSE ROUND((SUM(efficiency) FILTER (WHERE total_rolls > 0))::numeric
                    / COUNT(*) FILTER (WHERE total_rolls > 0), 2)
    END AS avg_efficiency,
    COUNT(*) AS count
  FROM ordered
),
paged AS (
  SELECT * FROM ordered
  ORDER BY machine_number NULLS LAST, created_at ASC
  OFFSET GREATEST(0, (p_page - 1) * p_page_size)
  LIMIT p_page_size
)
SELECT jsonb_build_object(
  'kpis', (SELECT to_jsonb(k) FROM kpis k),
  'groups', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM paged p), '[]'::jsonb),
  'total_groups', (SELECT count FROM kpis),
  'page', p_page,
  'page_size', p_page_size
);
```

Regras críticas:
- `avg_efficiency` **exclui grupos com `total_rolls = 0`** (memory `logic/production-metrics-logic`).
- Ordenação: `machine_number ASC` reproduzindo `sortedMachines` (linhas 442–447 do JS atual).
- `items.efficiency` fica igual à do grupo (todos compartilham a mesma combinada — memory).
- Chave `key` idêntica ao formato usado hoje para não quebrar `expandedId`, `openEditGroup` e `showDelete`.

**Refactor cliente:**
- Substituir os memos `filteredProductions`/`shiftProductionGroups`/`shiftKPIs`/`paginatedProductionGroups` por `useQuery(['productions_by_shift', companyId, filterDate, activeShift, filterMachine, filterArticle, searchQuery, currentPage])`.
- `getProductions()` deixa de ser consumido nesta página. **Manter** o array no `useCompanyData` porque Dashboard/Reports/Weavers ainda leem (a limpeza é fora do escopo desta migração).
- `searchQuery` com `useDeferredValue` (300 ms) para não disparar RPC a cada tecla.
- Skeleton enquanto `isLoading`; a paginação fica igual (janela deslizante).

---

### Fase 3 — Auxiliares (validação e exportação leve)

**Objetivo:** Endpoints de baixo custo que hoje forçam consumo do array global.

1. **`get_production_duplicate_check(p_company_id, p_date, p_shift, p_machine_id, p_exclude_created_at?)`** → `jsonb`
   - Retorna `{ exists: bool, machine_name, shift_label }`.
   - Substitui a checagem `existingForMachineShift` (linhas 280–290 de `handleSave`) por consulta **transacional** (roda também dentro da RPC de escrita da Fase 4 para evitar corrida entre dois clientes).

2. **`get_production_group_detail(p_company_id, p_key)`** → `jsonb`
   - Alimenta `openEditGroup` diretamente da RPC, dispensando o memo global.
   - `p_key` é o `machine_id|date|created_at`.

3. **(opcional)** `get_production_day_export(p_company_id, p_date)` → `jsonb` com payload pronto para PDF/CSV se algum dia a tela exportar por dia. **Não** implementar agora — deixar hook livre.

---

### Fase 4 — Escritas atômicas (`save_production_group` + `delete_production_group`)

**Objetivo:** Substituir `addProductions` / `updateProductions` / `deleteProductions` do `useCompanyData` — **para esta tela** — por 2 RPCs transacionais que já validam duplicidade, aplicam autoria e devolvem contrato idempotente.

#### `save_production_group(p_id?, p_payload, p_items, p_author_name, p_author_code) → jsonb`

`p_payload` (cabeçalho comum a todos os itens):
```json
{
  "company_id": "…",
  "date": "2026-05-10",
  "shift": "manha",
  "machine_id": "…",
  "machine_name": "TEAR 03",
  "weaver_id": "…",           // "" quando "Sem Tecelão"
  "weaver_name": "João - Manhã",
  "rpm": 22,
  "efficiency": 84.1,          // ✅ calculada NO CLIENTE, gravada como está
  "created_at": "2026-05-10T12:34:56Z" // preserva chave do grupo em edição; NULL no INSERT
}
```

`p_items` (um por artigo — principal + extras):
```json
[
  { "article_id": "…", "article_name": "…", "rolls_produced": 4.2, "weight_kg": 140.7, "revenue": 2110.5 },
  { "article_id": "…", "article_name": "…", "rolls_produced": 2.2, "weight_kg":  73.3, "revenue": 1100.0 }
]
```

Regras SQL (executadas em transação SQL única):
1. `SECURITY DEFINER SET search_path = public` + guarda `v_caller := public.get_user_company_id(); IF v_caller IS NULL OR v_caller <> (p_payload->>'company_id')::uuid THEN RAISE EXCEPTION 'Acesso negado'; END IF;`.
2. Validações de payload:
   - `date` no formato `YYYY-MM-DD` e dentro do intervalo ±5 anos (memory `constraints/date-entry-validation`).
   - `shift IN ('manha','tarde','noite')`.
   - `rpm > 0`, `efficiency BETWEEN 0 AND 100`.
   - `jsonb_array_length(p_items) >= 1`.
   - Cada item: `article_id NOT NULL`, `rolls_produced >= 0`, `weight_kg >= 0`, `revenue >= 0`.
3. **Duplicidade atômica (`SELECT … FOR UPDATE` seria overkill sem row-lock alvo — usar índice único e `EXCEPTION WHEN unique_violation`):**
   - Ideal: `CREATE UNIQUE INDEX IF NOT EXISTS ux_productions_shift ON public.productions (company_id, machine_id, date, shift, created_at);`
   - Ao gravar, se `p_id IS NULL` (INSERT novo grupo) e existir linha do mesmo `(company_id, machine_id, date, shift)` com `created_at <> v_new_created_at`, devolver `{ ok:false, conflict:'duplicate_shift', machine_name, shift }` **sem gravar** (não lança exceção — retorna erro amigável).
4. Fluxo INSERT (grupo novo):
   - `v_created_at := COALESCE((p_payload->>'created_at')::timestamptz, now());`
   - `INSERT INTO productions (…) SELECT …` a partir do `jsonb_array_elements(p_items)`. Todos os itens compartilham `created_at`, `efficiency`, `rpm`, `machine_id`, `weaver_id`, `shift`, `date`, `created_by_*`.
5. Fluxo UPDATE (grupo existente):
   - `p_id` = `created_at` original (chave de grupo estável).
   - `DELETE FROM productions WHERE company_id = … AND machine_id = … AND date = … AND created_at = p_id;`
   - `INSERT` com o **mesmo `created_at`** (preserva chave do grupo).
   - Guarda de tenant no `DELETE` via `WHERE company_id = v_caller`.
6. Devolve `{ ok:true, action:'insert'|'update', created_at:'…', item_count:N, already:false }`.
7. **Idempotência anti-double-click:** se `p_id` for informado e nenhum registro afetado no `DELETE`, retorna `{ ok:true, already:true }` (o cliente ignora, mantém UX).

#### `delete_production_group(p_company_id, p_machine_id, p_date, p_created_at, p_author_name, p_author_code) → jsonb`

- Guarda tenant idêntica.
- `DELETE FROM productions WHERE company_id = p_company_id AND machine_id = p_machine_id AND date = p_date AND created_at = p_created_at` retornando `deleted_count`.
- Devolve `{ ok:true, deleted_count:N, already:(N=0) }`.
- Log de auditoria pode continuar no cliente (`useAuditLog`) — a RPC apenas garante atomicidade.

#### Refactor cliente
- `handleSave` (`Production.tsx`, linhas 253–363) chama `supabase.rpc('save_production_group', { p_id, p_payload, p_items, p_author_name, p_author_code })`. O `preview.efficiency`, `weightKg` e `revenue` continuam calculados **exatamente** como hoje e são serializados no payload — **não mover nada dessas fórmulas** para o servidor.
- Remover a checagem local `existingForMachineShift`; tratar `conflict:'duplicate_shift'` no `onError`/`onSuccess` com o mesmo `toast.error` atual.
- `handleDelete` chama `delete_production_group` com o `created_at` do grupo.
- **Manter** `saveQueue` (fila background para avanço imediato) e o comportamento de `advanceToNext`. A RPC só substitui o corpo do `addProductions/updateProductions/deleteProductions` para *esta página* — o hook mantém as funções para retro-compat de outras telas.
- Invalidação de cache: `queryClient.invalidateQueries({ queryKey: ['productions_by_shift'] })` + `['production_bootstrap']` + o canal Realtime existente permanece ativo.

---

## ⚠️ Regras críticas de negócio a preservar

1. **Eficiência calculada no cliente.** Nenhuma RPC recalcula `efficiency`, `weight_kg` ou `revenue` — a lei do `reversion_point_production_logic.md` continua valendo. Se algum dia a fórmula mudar, muda no JS **e** o valor gravado reflete a mudança.
2. **`created_at` é chave do grupo.** Todos os itens de um grupo (principal + extras) compartilham o mesmo `created_at`. A RPC de escrita não pode chamar `now()` por item.
3. **Todos os itens carregam a mesma `efficiency`** — não recalcular por artigo. Regra usada pelos memos do frontend, Dashboard e Reports.
4. **Duplicidade por `(company_id, machine_id, date, shift)`** deve ser detectada no servidor (índice único + retorno amigável), fechando a corrida entre múltiplos operadores.
5. **Autoria server-side.** `created_by_name` e `created_by_code` vêm do `p_author_name/p_author_code` recebido do `useAuditLog`, gravados em todos os itens do grupo (nunca `NULL` quando o usuário está autenticado).
6. **Ordenação estável.** Grupos ordenam por `machines.number ASC`, depois `created_at ASC` — idêntico ao JS atual (linhas 442–447).
7. **Média de eficiência exclui grupos com `total_rolls = 0`** (memory `logic/production-metrics-logic`).
8. **`avg_efficiency` sobre grupos**, não sobre linhas (evita bias quando um grupo tem 5 artigos extras).
9. **Filtro de data padrão = `last_production_date` do bootstrap.** Não é `today()` — a tela deve abrir mostrando o último dia com dados.
10. **Downtime continua client-side.** `calculateShiftDowntime` roda no cliente com `getMachineLogs()` do `CompanyDataContext`. O bootstrap não devolve downtime.
11. **Multi-tenant.** Todas as RPCs (leitura e escrita) validam `p_company_id = public.get_user_company_id()` — herança obrigatória do pente fino documentado em `rpcclientInvoices.md`.
12. **Realtime.** O canal atual (`realtime` de `productions` já roteado via `useCompanyData`) permanece; após cada `save/delete` invalidar `['productions_by_shift', …]` e `['production_bootstrap', …]`. Não trocar por invalidação em massa (mantém performance).

---

## 🧪 Checklist de validação (por fase)

### Fase 1
- [ ] `get_production_bootstrap` devolve payload em < 150 ms para tenants com 50k linhas.
- [ ] `filterDate` inicial = `last_production_date` mesmo com o array global vazio.
- [ ] Nenhum `fetchAll('productions', …)` mais executado pelo `useCompanyData` **apenas para esta página** (a limpeza global é fora de escopo).

### Fase 2
- [ ] `get_productions_by_shift` reproduz 1:1 as chaves de grupo (`machine_id|date|created_at`).
- [ ] KPIs do turno idênticos ao JS antigo (comparar em dia de produção real com 3 turnos, 20 máquinas, 40 registros).
- [ ] Paginação server-side devolve `total_groups` correto para os controles de página.
- [ ] Busca textual normaliza case e cobre `machine_name`, `weaver_name` e `article_name` (via `ILIKE` sobre `filt`).
- [ ] Média de eficiência ignora grupos com `total_rolls = 0`.

### Fase 3
- [ ] `get_production_duplicate_check` responde antes de 50 ms.
- [ ] `get_production_group_detail` devolve extras ordenados alfabeticamente para exibição no modal de edição.

### Fase 4
- [ ] Índice único `ux_productions_shift` criado no mesmo migration da RPC.
- [ ] Dois usuários gravando o mesmo `(máquina, data, turno)` — um vence, o outro recebe `conflict:'duplicate_shift'` sem exception no console.
- [ ] Edição preserva `created_at` original (grupo continua agrupado).
- [ ] Exclusão remove **todos** os itens do grupo em uma única transação.
- [ ] `save_production_group` idempotente: cliques duplos no botão Salvar não geram registros duplicados.
- [ ] Efficiency, weight_kg e revenue no banco = exatamente os que o JS calculou (comparação numérica, casas decimais preservadas).
- [ ] `useAuditLog` continua gerando `audit_logs` no cliente (`production_create` / `production_update` / `production_delete`).

---

## 🧭 Ordem sugerida de entrega

1. **Fase 1** (bootstrap) — ganho imediato de tempo de tela + libera o `useEffect` de descobrir última data.
2. **Fase 2** (lista + KPIs) — maior ganho de performance; libera `Production.tsx` do array global.
3. **Fase 4** (escritas atômicas + índice único) — fecha a janela de corrida e prepara o terreno para retirar `addProductions`/`updateProductions`/`deleteProductions` do hook global no futuro.
4. **Fase 3** (auxiliares) — pode entrar junto com a Fase 4 (o duplicate-check compartilha o índice único).

---

## 🚫 O que este plano **NÃO** faz

- Não altera `preview` (cálculo de eficiência do modal).
- Não altera `calculateShiftDowntime` nem consumo de `machine_logs`.
- Não remove `getProductions()` do `useCompanyData` (Dashboard/Reports/Weavers ainda dependem — futura migração).
- Não altera `fetch_productions_page`, `get_production_stats`, `get_production_trend_stats`, `get_production_shift_stats`, `get_production_machine_stats` (usadas por Dashboard/Relatórios — já são RPC).
- Não cria RPC para o Dashboard/Reports desta rota (fora de escopo).
- Nada é implementado neste ciclo — este documento é somente planejamento.

---

*Planejamento: 18/07/2026 (Brasília) — base padrão consolidada em `rpcInvoices.md`, `rpcclientInvoices.md`, `rpcstockMalha.md`, `rpcBillingOrders.md`, `rpcFreightOrders.md` e função de referência `get_faturamento_total_metrics`. Regra imutável herdada de `reversion_point_production_logic.md`.*