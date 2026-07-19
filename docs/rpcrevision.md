# 🔄 RPC — Plano de Migração do Módulo Revisão (Falhas)

> **Alvo:** `src/pages/Revision.tsx` (~935 linhas) + `src/lib/queries/defectsQueries.ts` + escritas de defeitos em `src/hooks/useCompanyData.ts`.
> **Documento base (funcionamento atual):** `docs/revision.md`.
> **Padrão consolidado seguido:** `docs/rpcstockMalha.md`, `docs/rpcclientInvoices.md`, `docs/rpcInvoices.md`, `docs/rpcBillingOrders.md`, `docs/rpcFreightOrders.md`, `docs/rpcproduction.md`, `get_faturamento_total_metrics`.
> **Status:** 🟡 **Planejamento** — nada implementado, apenas contrato + refactor cliente descritos.

---

## 0. Motivação

O `Revision.tsx` hoje depende do array global `defectRecords` carregado pelo `CompanyDataContext` (sem paginação, sem cutoff). Toda filtragem, agregação, paginação e ordenação acontece **no cliente**. Consequências:

1. **Memória / rede** — Empresas com milhares de defeitos baixam o array inteiro em cada login.
2. **Contexto compartilhado** — Se `useSharedCompanyData` for aliviado (planejado nos outros RPCs), Revisão quebra.
3. **KPIs** — `stats.total/totalKg/totalMetros` recomputados no cliente a cada re-render.
4. **`availableMonths`** — Set derivado do array inteiro; precisa vir do banco.
5. **PDF** — Usa `filtered` (array global) — precisa passar a receber payload server-side.
6. **Escritas** — INSERT/UPDATE/DELETE direto em `defect_records` via Supabase client. Falta autoria server-side, idempotência, validação de tenant e transação atômica.

**Regra imutável:** o comportamento visível (filtros, ordenação, colunas, PDF, modal, multi-lançamento) permanece **100% idêntico**. O modelo de dados (`defect_records` — inclusive `defect_name` embutido em `observations` como `[Nome] obs`) **não muda** neste plano — refatoração de schema fica para outra iniciativa.

---

## 1. Visão Geral das RPCs

| Fase | RPC | Uso |
|------|-----|-----|
| **1 — Bootstrap** | `get_revision_bootstrap(p_company_id)` | Company + `available_months` + KPIs globais + role_scope |
| **2 — Leituras** | `get_revision_defects_list(p_company_id, p_from, p_to, p_month, p_article_id, p_search, p_page, p_page_size)` | Listagem paginada + KPIs filtrados |
| **2b** | `get_revision_defect_detail(p_company_id, p_id)` | Fetch pontual (edição via link/deep-link) |
| **3 — Escritas** | `save_defect_record(p_id?, p_payload, p_author_name, p_author_code)` | Insert/Update atômico com `{ok, already, id, action}` |
| **3b** | `delete_defect_record(p_id, p_author_name, p_author_code)` | Delete idempotente `{ok, already}` |
| **4 — PDF** | `get_revision_export_payload(p_company_id, p_from, p_to, p_month, p_article_id, p_search)` | Payload pronto para jsPDF (linhas + totais + labels de período) |

Todas: `SECURITY DEFINER`, `SET search_path = public`, `GRANT` em `anon/authenticated/service_role`, guarda `v_caller := public.get_user_company_id()` com **early-return de payload vazio** (nunca RAISE em leituras) e `RAISE EXCEPTION 'Acesso negado'` em escritas — mesmo padrão auditado em `rpcclientInvoices` Fases 1-3 e `rpcstockMalha`.

---

## 2. Fase 1 — Bootstrap

### 2.1 Assinatura

```sql
CREATE OR REPLACE FUNCTION public.get_revision_bootstrap(
  p_company_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_result jsonb;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object(
      'company_id', p_company_id,
      'available_months', '[]'::jsonb,
      'stats', jsonb_build_object('total', 0, 'total_kg', 0, 'total_metros', 0),
      'company', jsonb_build_object('logo_url', null, 'name', null)
    );
  END IF;

  WITH months AS (
    SELECT DISTINCT substring(date, 1, 7) AS ym
    FROM public.defect_records
    WHERE company_id = p_company_id
    ORDER BY ym DESC
  ),
  stats AS (
    SELECT
      COUNT(*)::bigint AS total,
      COALESCE(SUM(CASE WHEN measure_type = 'kg'    THEN measure_value END), 0) AS total_kg,
      COALESCE(SUM(CASE WHEN measure_type = 'metro' THEN measure_value END), 0) AS total_metros
    FROM public.defect_records
    WHERE company_id = p_company_id
  ),
  co AS (
    SELECT logo_url, name FROM public.companies WHERE id = p_company_id
  )
  SELECT jsonb_build_object(
    'company_id', p_company_id,
    'available_months', COALESCE((SELECT jsonb_agg(ym) FROM months), '[]'::jsonb),
    'stats', jsonb_build_object(
      'total', (SELECT total FROM stats),
      'total_kg', (SELECT total_kg FROM stats),
      'total_metros', (SELECT total_metros FROM stats)
    ),
    'company', jsonb_build_object(
      'logo_url', (SELECT logo_url FROM co),
      'name', (SELECT name FROM co)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_revision_bootstrap(uuid) TO anon, authenticated, service_role;
```

### 2.2 O que substitui no cliente

| Antes (`Revision.tsx`) | Depois |
|---|---|
| `useEffect` que faz `supabase.from('companies').select('logo_url,name')` | `bootstrap.company.logo_url` / `.name` |
| `availableMonths = useMemo(...)` sobre `defectRecords` | `bootstrap.available_months` |
| `stats` global (para KPIs quando **sem** filtro) | fallback já no bootstrap |
| Verificação de "existe alguma falha?" para o PDF | `bootstrap.stats.total > 0` |

`useSharedCompanyData().getDefectRecords()` continua existindo por retro-compat de **Weavers/Reports**, mas Revision para de depender dele.

---

## 3. Fase 2 — Leitura paginada

### 3.1 Assinatura

```sql
CREATE OR REPLACE FUNCTION public.get_revision_defects_list(
  p_company_id  uuid,
  p_from        text DEFAULT NULL,   -- 'yyyy-MM-dd' inclusive
  p_to          text DEFAULT NULL,   -- 'yyyy-MM-dd' inclusive
  p_month       text DEFAULT NULL,   -- 'yyyy-MM' (ignorado se p_from/p_to setados)
  p_article_id  uuid DEFAULT NULL,
  p_search      text DEFAULT NULL,   -- ILIKE em machine/article/weaver
  p_page        int  DEFAULT 1,
  p_page_size   int  DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_offset int  := GREATEST(0, (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 20));
  v_limit  int  := LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 200);
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object(
      'rows', '[]'::jsonb,
      'total_count', 0,
      'page', COALESCE(p_page, 1),
      'page_size', v_limit,
      'kpis', jsonb_build_object('total', 0, 'total_kg', 0, 'total_metros', 0)
    );
  END IF;

  RETURN (
    WITH base AS (
      SELECT d.*
      FROM public.defect_records d
      WHERE d.company_id = p_company_id
        AND (p_from  IS NULL OR d.date >= p_from)
        AND (p_to    IS NULL OR d.date <= p_to)
        AND (p_month IS NULL OR substring(d.date, 1, 7) = p_month)
        AND (p_article_id IS NULL OR d.article_id = p_article_id)
        AND (
          v_search IS NULL
          OR d.machine_name ILIKE '%' || v_search || '%'
          OR d.article_name ILIKE '%' || v_search || '%'
          OR d.weaver_name  ILIKE '%' || v_search || '%'
        )
    ),
    kpis AS (
      SELECT
        COUNT(*)::bigint AS total,
        COALESCE(SUM(CASE WHEN measure_type = 'kg'    THEN measure_value END), 0) AS total_kg,
        COALESCE(SUM(CASE WHEN measure_type = 'metro' THEN measure_value END), 0) AS total_metros
      FROM base
    ),
    ordered AS (
      SELECT *
      FROM base
      ORDER BY date DESC, created_at DESC, id ASC
      OFFSET v_offset LIMIT v_limit
    ),
    rows_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(o.*)), '[]'::jsonb) AS j FROM ordered o
    )
    SELECT jsonb_build_object(
      'rows',        (SELECT j FROM rows_json),
      'total_count', (SELECT total FROM kpis),
      'page',        COALESCE(p_page, 1),
      'page_size',   v_limit,
      'kpis', jsonb_build_object(
        'total',        (SELECT total FROM kpis),
        'total_kg',     (SELECT total_kg FROM kpis),
        'total_metros', (SELECT total_metros FROM kpis)
      )
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_revision_defects_list(uuid,text,text,text,uuid,int,int) TO anon, authenticated, service_role;
```

### 3.2 Contratos importantes

- **Ordenação** replica exatamente o comportamento atual (padrão do array vindo do context é `date DESC` + `created_at DESC`; empate por `id` estabiliza paginação).
- **Filtros mutuamente exclusivos** (`p_from/p_to` vs `p_month`): a exclusividade é imposta no **cliente** (já é hoje). A RPC aplica ambos se enviados, então o cliente deve enviar `p_month=null` sempre que houver intervalo, e vice-versa — igual à lógica atual dos setters.
- **KPIs = filtrados** — igual ao `stats` derivado de `filtered`.
- **`v_search`** normaliza vazio → NULL para evitar `ILIKE '%%'` desnecessário.
- **`p_page_size`** limitado a 200 para prevenir abuso.

### 3.3 Refactor cliente

```ts
const { data, isLoading } = useQuery({
  queryKey: ['revision_defects_list', companyId, filterDateFrom, filterDateTo, filterMonth, filterArticle, searchTerm, currentPage],
  queryFn: () => supabase.rpc('get_revision_defects_list', {
    p_company_id: companyId,
    p_from: filterDateFrom || null,
    p_to:   filterDateTo   || null,
    p_month: filterMonth !== 'all' ? filterMonth : null,
    p_article_id: filterArticle !== 'all' ? filterArticle : null,
    p_search: searchTerm || null,
    p_page: currentPage,
    p_page_size: 20,
  }).then(r => { if (r.error) throw r.error; return r.data as any; }),
  keepPreviousData: true,
});

const rows        = (data?.rows ?? []).map(mapDefectRecord);
const totalCount  = data?.total_count ?? 0;
const totalPages  = Math.ceil(totalCount / 20);
const stats       = data?.kpis ?? { total: 0, total_kg: 0, total_metros: 0 };
```

Efeitos:

- Remove os memos `filtered`, `paginatedData`, `stats` e o slice manual.
- Mantém `useEffect([searchTerm, ...filtros])` para resetar `currentPage=1`.
- `availableMonths` continua vindo do bootstrap (invalidar após create/update/delete).
- `useDeferredValue(searchTerm)` opcional para reduzir chamadas durante a digitação.

---

## 4. Fase 2b — Detalhe (fetch pontual)

```sql
CREATE OR REPLACE FUNCTION public.get_revision_defect_detail(
  p_company_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_row jsonb;
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(d.*) INTO v_row
  FROM public.defect_records d
  WHERE d.id = p_id AND d.company_id = p_company_id;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_revision_defect_detail(uuid,uuid) TO anon, authenticated, service_role;
```

Uso opcional — hoje o `openEdit` recebe o registro completo da própria listagem. Fica útil para deep-links `/:slug/revision?edit=<id>`.

---

## 5. Fase 3 — Escritas atômicas

### 5.1 `save_defect_record`

```sql
CREATE OR REPLACE FUNCTION public.save_defect_record(
  p_id            uuid,        -- NULL = INSERT
  p_payload       jsonb,       -- ver contrato abaixo
  p_author_name   text,
  p_author_code   text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller       uuid := public.get_user_company_id();
  v_company_id   uuid;
  v_id           uuid;
  v_action       text;
  v_date         text;
  v_shift        text;
  v_machine_id   uuid;
  v_article_id   uuid;
  v_weaver_id    uuid;
  v_measure_type text;
  v_measure_val  numeric;
  v_defect_name  text;
  v_obs_input    text;
  v_obs_final    text;
  v_machine_name text;
  v_article_name text;
  v_weaver_name  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_company_id   := v_caller;                                            -- multi-tenant sempre do caller
  v_date         := p_payload->>'date';
  v_shift        := lower(unaccent(COALESCE(p_payload->>'shift', '')));  -- normaliza
  v_machine_id   := NULLIF(p_payload->>'machine_id', '')::uuid;
  v_article_id   := NULLIF(p_payload->>'article_id', '')::uuid;
  v_weaver_id    := NULLIF(p_payload->>'weaver_id',  '')::uuid;
  v_measure_type := COALESCE(p_payload->>'measure_type', 'kg');
  v_measure_val  := COALESCE((p_payload->>'measure_value')::numeric, 0);
  v_defect_name  := BTRIM(COALESCE(p_payload->>'defect_name', ''));
  v_obs_input    := BTRIM(COALESCE(p_payload->>'observations', ''));

  -- Validações server-side (espelho das validações do handleSave)
  IF v_date IS NULL OR v_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Data inválida (esperado yyyy-MM-dd)';
  END IF;
  IF v_date::date < (CURRENT_DATE - INTERVAL '5 years')::date
     OR v_date::date > (CURRENT_DATE + INTERVAL '5 years')::date THEN
    RAISE EXCEPTION 'Data fora do intervalo permitido (±5 anos)';
  END IF;
  IF v_shift NOT IN ('manha','tarde','noite') THEN
    RAISE EXCEPTION 'Turno inválido';
  END IF;
  IF v_machine_id IS NULL OR v_article_id IS NULL OR v_weaver_id IS NULL THEN
    RAISE EXCEPTION 'Máquina, artigo e tecelão são obrigatórios';
  END IF;
  IF v_measure_type NOT IN ('kg','metro') THEN
    RAISE EXCEPTION 'Tipo de medida inválido';
  END IF;
  IF v_measure_val <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero';
  END IF;
  IF v_defect_name = '' THEN
    RAISE EXCEPTION 'Nome do defeito é obrigatório';
  END IF;

  -- Snapshots server-side (autoritativos, mesmo padrão de billing_orders / freight_orders)
  SELECT name INTO v_machine_name FROM public.machines
    WHERE id = v_machine_id AND company_id = v_company_id;
  IF v_machine_name IS NULL THEN RAISE EXCEPTION 'Máquina não pertence à empresa'; END IF;

  SELECT name INTO v_article_name FROM public.articles
    WHERE id = v_article_id AND company_id = v_company_id;
  IF v_article_name IS NULL THEN RAISE EXCEPTION 'Artigo não pertence à empresa'; END IF;

  SELECT name INTO v_weaver_name FROM public.weavers
    WHERE id = v_weaver_id AND company_id = v_company_id;
  IF v_weaver_name IS NULL THEN RAISE EXCEPTION 'Tecelão não pertence à empresa'; END IF;

  -- Serialização defect_name → observations (mantém convenção legada)
  v_obs_final := CASE
    WHEN v_obs_input = '' THEN '[' || v_defect_name || ']'
    ELSE '[' || v_defect_name || '] ' || v_obs_input
  END;

  IF p_id IS NULL THEN
    -- INSERT
    v_id := gen_random_uuid();
    INSERT INTO public.defect_records(
      id, company_id, date, shift,
      machine_id, article_id, weaver_id,
      machine_name, article_name, weaver_name,
      measure_type, measure_value, observations,
      created_by_name, created_by_code, created_at
    ) VALUES (
      v_id, v_company_id, v_date, v_shift,
      v_machine_id, v_article_id, v_weaver_id,
      v_machine_name, v_article_name, v_weaver_name,
      v_measure_type, v_measure_val, v_obs_final,
      NULLIF(p_author_name, ''), NULLIF(p_author_code, ''), now()
    );
    v_action := 'create';
  ELSE
    -- UPDATE (autoria original preservada por design)
    UPDATE public.defect_records
       SET date          = v_date,
           shift         = v_shift,
           machine_id    = v_machine_id,
           article_id    = v_article_id,
           weaver_id     = v_weaver_id,
           machine_name  = v_machine_name,
           article_name  = v_article_name,
           weaver_name   = v_weaver_name,
           measure_type  = v_measure_type,
           measure_value = v_measure_val,
           observations  = v_obs_final
     WHERE id = p_id AND company_id = v_company_id
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      -- Linha não existe ou foi apagada por outro usuário (anti double-click)
      RETURN jsonb_build_object('ok', true, 'already', true, 'id', p_id, 'action', 'update');
    END IF;
    v_action := 'update';
  END IF;

  -- Auditoria server-side (mesmo padrão de save_client_invoice)
  INSERT INTO public.audit_logs(company_id, user_name, user_code, action, payload)
  VALUES (
    v_company_id,
    NULLIF(p_author_name, ''),
    NULLIF(p_author_code, ''),
    'defect_' || v_action,
    jsonb_build_object(
      'machine', v_machine_name,
      'article', v_article_name,
      'date',    v_date,
      'shift',   v_shift,
      'id',      v_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'already', false, 'id', v_id, 'action', v_action);
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_defect_record(uuid,jsonb,text,text) TO anon, authenticated, service_role;
```

**Contrato de payload:**

```json
{
  "date": "2026-07-19",
  "shift": "manha",
  "machine_id": "…",
  "article_id": "…",
  "weaver_id": "…",
  "measure_type": "kg",
  "measure_value": 2.5,
  "defect_name": "Furo",
  "observations": "próximo à borda"
}
```

- `company_id` **jamais** é aceito do cliente — deriva de `get_user_company_id()`.
- `machine_name/article_name/weaver_name` também não — sempre re-lidos do banco (fonte de verdade contra tampering).
- `defect_name` é serializado em `observations` na própria RPC — cliente para de fazer o `[Nome] obs` no JS.
- Contrato de retorno `{ ok, already, id, action }` idêntico ao usado em `save_client_invoice`.

### 5.2 `delete_defect_record`

```sql
CREATE OR REPLACE FUNCTION public.delete_defect_record(
  p_id           uuid,
  p_author_name  text,
  p_author_code  text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_machine_name text;
  v_date text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT machine_name, date INTO v_machine_name, v_date
  FROM public.defect_records
  WHERE id = p_id AND company_id = v_caller
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  DELETE FROM public.defect_records WHERE id = p_id AND company_id = v_caller;

  INSERT INTO public.audit_logs(company_id, user_name, user_code, action, payload)
  VALUES (
    v_caller,
    NULLIF(p_author_name, ''),
    NULLIF(p_author_code, ''),
    'defect_delete',
    jsonb_build_object('machine', v_machine_name, 'date', v_date, 'id', p_id)
  );

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_defect_record(uuid,text,text) TO anon, authenticated, service_role;
```

Idempotência: dois cliques seguidos → segundo retorna `{ ok:true, already:true }` sem exception.

### 5.3 Refactor cliente (`handleSave` / `handleDelete`)

Antes (`Revision.tsx`, ~470 → ~500):

```ts
await addDefectRecords([record]);        // ou updateDefectRecords(updated)
logAction('defect_create', {...});
```

Depois:

```ts
const { data, error } = await supabase.rpc('save_defect_record', {
  p_id: editingRecord?.id ?? null,
  p_payload: {
    date: format(form.date, 'yyyy-MM-dd'),
    shift: form.shift,
    machine_id: form.machine_id,
    article_id: form.article_id,
    weaver_id:  form.weaver_id,
    measure_type: form.measure_type,
    measure_value: parseFloat(form.measure_value),
    defect_name: form.defect_name,
    observations: form.observations,
  },
  p_author_name: userName || null,
  p_author_code: userCode || null,
});
if (error) throw error;

if (!data.already) toast.success(editingRecord ? 'Falha atualizada' : 'Falha registrada');
queryClient.invalidateQueries({ queryKey: ['revision_defects_list'] });
queryClient.invalidateQueries({ queryKey: ['revision_bootstrap'] });
```

`handleDelete` idem — chama `delete_defect_record` e usa `data.already` para não duplicar toast. `logAction` do cliente pode ser removido (auditoria já é server-side) **ou** mantido temporariamente para compatibilidade com dashboards existentes.

`addDefectRecords/updateDefectRecords/deleteDefectRecords` no `useCompanyData` **permanecem** por retro-compat de outras telas que ainda escrevem defeitos (Weavers rápido, imports). Podem virar wrappers finos que chamam a RPC internamente numa segunda passada.

---

## 6. Fase 4 — Payload PDF server-side

### 6.1 Assinatura

```sql
CREATE OR REPLACE FUNCTION public.get_revision_export_payload(
  p_company_id  uuid,
  p_from        text DEFAULT NULL,
  p_to          text DEFAULT NULL,
  p_month       text DEFAULT NULL,
  p_article_id  uuid DEFAULT NULL,
  p_search      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := public.get_user_company_id();
  v_search text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF v_caller IS NULL OR v_caller <> p_company_id THEN
    RETURN jsonb_build_object(
      'rows', '[]'::jsonb, 'total', 0, 'total_kg', 0, 'total_metros', 0,
      'period_label', 'Total',
      'company', jsonb_build_object('logo_url', null, 'name', null)
    );
  END IF;

  RETURN (
    WITH base AS (
      SELECT d.date, d.machine_name, d.article_name,
             d.measure_type, d.measure_value, d.observations
      FROM public.defect_records d
      WHERE d.company_id = p_company_id
        AND (p_from  IS NULL OR d.date >= p_from)
        AND (p_to    IS NULL OR d.date <= p_to)
        AND (p_month IS NULL OR substring(d.date, 1, 7) = p_month)
        AND (p_article_id IS NULL OR d.article_id = p_article_id)
        AND (
          v_search IS NULL
          OR d.machine_name ILIKE '%' || v_search || '%'
          OR d.article_name ILIKE '%' || v_search || '%'
          OR d.weaver_name  ILIKE '%' || v_search || '%'
        )
    ),
    ordered AS (
      SELECT
        date,
        machine_name,
        article_name,
        measure_type,
        measure_value,
        -- Extrai defect_name de "[Nome] obs" ou usa obs inteiro
        CASE
          WHEN observations ~ '^\[.+?\]' THEN substring(observations from '^\[(.+?)\]')
          ELSE COALESCE(observations, '')
        END AS defect_name
      FROM base
      ORDER BY date DESC
    ),
    totals AS (
      SELECT
        COUNT(*)::bigint AS total,
        COALESCE(SUM(CASE WHEN measure_type = 'kg'    THEN measure_value END), 0) AS total_kg,
        COALESCE(SUM(CASE WHEN measure_type = 'metro' THEN measure_value END), 0) AS total_metros
      FROM base
    ),
    co AS (SELECT logo_url, name FROM public.companies WHERE id = p_company_id)
    SELECT jsonb_build_object(
      'rows',         COALESCE((SELECT jsonb_agg(to_jsonb(o.*)) FROM ordered o), '[]'::jsonb),
      'total',        (SELECT total FROM totals),
      'total_kg',     (SELECT total_kg FROM totals),
      'total_metros', (SELECT total_metros FROM totals),
      'period_label', CASE
        WHEN p_from IS NOT NULL OR p_to IS NOT NULL
          THEN COALESCE(p_from, '') || ' até ' || COALESCE(p_to, '')
        WHEN p_month IS NOT NULL THEN p_month
        ELSE 'Total'
      END,
      'company', jsonb_build_object(
        'logo_url', (SELECT logo_url FROM co),
        'name',     (SELECT name FROM co)
      )
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_revision_export_payload(uuid,text,text,text,uuid,text) TO anon, authenticated, service_role;
```

### 6.2 Refactor `exportToPdf`

- Substitui o loop `filtered.forEach(...)` pela iteração sobre `payload.rows`.
- `stats` do cabeçalho vem de `payload.total/total_kg/total_metros`.
- `companyLogoUrl/companyName` deixam de ser buscados no `useEffect` — vêm do payload (o carregamento do logo via canvas continua no cliente).
- `period_label` cru é formatado no cliente (aplica `dd/MM/yyyy` e `MMM/yyyy` em cima do texto ISO), mantendo a lógica de `date-fns` que já existe.

Vantagem: PDF **não depende mais do array global** — inclusive registros que não estão na página atual entram corretamente.

---

## 7. Refactor completo cliente — Resumo por fase

| Bloco atual | Depois da fase | Ação |
|---|---|---|
| `useSharedCompanyData().getDefectRecords()` | Fase 2 | Não usar mais em Revision; manter para outras páginas |
| `useEffect` que fetch `companies.logo_url` | Fase 1 | Remover; usar `bootstrap.company` |
| `availableMonths` memo | Fase 1 | `bootstrap.available_months` |
| `filtered`, `paginatedData`, `totalPages`, `stats` memos | Fase 2 | Excluídos — vindo da RPC |
| `openEdit` recebe `record` da listagem | Fase 2 | Mantém (payload já vem cheio); ganchos para Fase 2b se surgirem deep-links |
| `handleSave` — INSERT/UPDATE + `[Nome] obs` client-side + `logAction` | Fase 3 | `supabase.rpc('save_defect_record',...)` + invalidação |
| `handleDelete` | Fase 3 | `supabase.rpc('delete_defect_record',...)` |
| `exportToPdf` — usa `filtered` | Fase 4 | Usa `payload.rows` do server |

**Multi-lançamento (§5.5 do docs/revision.md) permanece intocado** — o reset parcial do form segue no `onSuccess` do `save_defect_record` quando `action='create'`.

---

## 8. Realtime (opcional — não obrigatório nesta migração)

Se quiser paridade com Freight/BillingOrders, criar canal `revision_rt_${companyId}` escutando `defect_records` e invalidando `['revision_defects_list', ...]` + `['revision_bootstrap', ...]`. Não é indispensável — o módulo hoje já é single-writer por revisor.

---

## 9. Riscos & Regras Críticas

1. **Multi-tenant** — Toda RPC começa por `v_caller := get_user_company_id()` e valida contra `p_company_id` (leituras) ou usa `v_caller` como fonte (escritas). Pente-fino já auditado em `rpcclientInvoices` Fases 1-3.
2. **`defect_name` continua embutido em `observations`** — a serialização passa para o servidor mas o formato `[Nome] obs` **não muda** para preservar compatibilidade com Weavers/Reports que também fazem o parse. Refatorar a coluna é escopo separado.
3. **Snapshots server-side** — `machine_name/article_name/weaver_name` são re-lidos do banco. Cliente não pode injetar valores diferentes.
4. **Shift normalizado** — `lower(unaccent(...))` na RPC garante que histórico continue coerente com `normalizeShift` do cliente.
5. **Idempotência** — INSERT retorna `{ok, id, action:'create'}`. UPDATE em linha ausente retorna `{ok:true, already:true}` sem exception. DELETE já ausente retorna `{ok:true, already:true}`.
6. **`p_page_size ≤ 200`** — cap defensivo.
7. **Ordenação estável** — `date DESC, created_at DESC, id ASC` (o `id ASC` desempata paginação; sem ele o offset pode saltar registros).
8. **Auditoria dupla** — Enquanto Fase 3 não estiver em produção, `logAction` do cliente continua. Após deploy, remover no cliente para não duplicar.
9. **Retro-compat de `addDefectRecords`** — Outras telas escrevem via `useCompanyData`. Manter o wrapper apontando para a RPC nova numa segunda passada.
10. **`available_months` invalida-se após qualquer save/delete** — sempre invalidar `['revision_bootstrap', companyId]` no `onSuccess`.
11. **RLS permanece ativo** — Mesmo com `SECURITY DEFINER`, as políticas continuam válidas para acessos diretos que outras telas ainda fazem.
12. **`get_defect_stats` existente (SQL RPC)** — Fica mantida para consumidores atuais; não conflita com as novas RPCs.

---

## 10. Checklist de Validação

1. [ ] Bootstrap devolve `available_months` idêntico ao memo atual (mesma ordem DESC).
2. [ ] Bootstrap com caller de outra empresa retorna payload vazio (não RAISE).
3. [ ] Listagem sem filtros = Total geral + KPIs do banco.
4. [ ] Listagem com intervalo `De/Até` idêntico ao filtro atual (inclusive dias-limite).
5. [ ] Listagem com `p_month` idêntica ao filtro Mês (ignora De/Até se cliente enviar `null`).
6. [ ] `p_article_id` filtra corretamente inclusive quando artigo tem cliente (o `getArticleLabel` do cliente não vaza para a query).
7. [ ] `p_search` ILIKE cobre machine/article/weaver (mesmo escopo do JS atual).
8. [ ] `total_count` reflete filtros; `page_size` e `page` respeitados; última página parcial.
9. [ ] Ordenação `date DESC, created_at DESC, id ASC` estável entre páginas.
10. [ ] `save_defect_record` cria com autoria server-side e `[Nome] obs` serializado.
11. [ ] `save_defect_record` update preserva `created_by_name/code/created_at` originais.
12. [ ] `save_defect_record` sem `defect_name` → RAISE amigável.
13. [ ] `save_defect_record` com `shift='Manhã'` (acentuado) → grava `manha`.
14. [ ] `save_defect_record` com `machine_id` de outra empresa → RAISE "não pertence à empresa".
15. [ ] `save_defect_record` double-click em UPDATE → segundo retorno `{already:true}` sem exception.
16. [ ] `delete_defect_record` grava `defect_delete` em `audit_logs` e remove a linha.
17. [ ] `delete_defect_record` idempotente em segunda chamada.
18. [ ] `get_revision_export_payload` produz `rows` na mesma ordem que a UI e `defect_name` extraído do prefixo.
19. [ ] PDF gerado com `payload.rows` bate byte-a-byte (a menos de timestamp) com o PDF gerado pelo array atual.
20. [ ] Invalidações no `onSuccess` cobrem `revision_defects_list` **e** `revision_bootstrap`.
21. [ ] `useSharedCompanyData().getDefectRecords()` **não é mais consumido** por Revision.tsx (grep limpo).
22. [ ] Modal continua com ESC/clique-fora bloqueados; multi-lançamento reseta apenas os 3 campos.

---

## 11. Ordem sugerida de implementação

1. **Fase 1 (Bootstrap)** — Baixo risco, remove `useEffect` de logo e `availableMonths`.
2. **Fase 2 (Listagem)** — Substitui `filtered/paginatedData/stats`. Mantém escrita client-side por enquanto (`addDefectRecords`).
3. **Fase 4 (PDF)** — Independente da Fase 3; pode entrar junto com a Fase 2.
4. **Fase 3 (Escritas)** — Após validação das leituras. Remove `logAction` do cliente e a serialização `[Nome] obs` do JS.
5. **Fase 2b** — Só se surgir necessidade de deep-link.
6. **Realtime** — Opcional, se houver ganho real de UX.

---

## 12. O que **não** entra neste plano

- Refatorar `defect_name` para coluna própria em `defect_records`.
- Migrar `date text` → `date date`.
- Realtime obrigatório (fica opcional).
- Alterar contrato de auditoria (`audit_logs.action = defect_*`).
- Tocar em `Weavers.tsx` / `Reports.tsx` / `defectsQueries.ts` (podem migrar depois em passagens dedicadas — a paginação já existente em `fetchDefectsPage` continua servindo).

---

*Última atualização: 19/07/2026 — apenas planejamento; nenhum SQL executado, nenhum arquivo `src/` alterado.*
