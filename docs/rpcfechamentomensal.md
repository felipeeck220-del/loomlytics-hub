# 🚀 Plano de Migração RPC — Fechamento Mensal

> **Status:** 📝 Planejamento (nada implementado) · **Alvo:** `src/pages/Fechamento.tsx` (~1.005 linhas) · **Base doc:** `docs/fechamentomensal.md` · **Última revisão:** 19/07/2026 (Brasília)

Plano em 4 fases seguindo o padrão consolidado das RPCs já em produção (`get_faturamento_total_metrics`, `rpcInvoices`, `rpcclientInvoices`, `rpcstockMalha`, `rpcBillingOrders`, `rpcFreightOrders`, `rpcproduction`, `rpcrevision`, `rpcresiduesales`). Meta: eliminar 9 selects paginados no cliente e ~500 linhas de agregação JS mantendo **100% do comportamento visível preservado** (10 seções, fórmulas, ordenação, PDF, cores, mensagens de fallback).

---

## 0. Regras imutáveis (não violar)

1. **Comportamento visível preservado 100%.** Mesmas 10 seções, mesma ordem, mesmas fórmulas, mesmo cabeçalho de PDF, mesmo nome de arquivo (`Fechamento_{yyyy-MM}_{Nome_Empresa}.pdf`), mesmos empty states, mesmos "TOTAL" em bold, mesmas cores (`text-destructive`, `text-success`, `font-mono`).
2. **Schema intocado.** Não altera `invoices`, `invoice_items`, `productions`, `articles`, `yarn_types`, `outsource_productions`, `outsource_companies`, `outsource_yarn_stock`, `residue_sales`. Nenhuma nova tabela. `date` continua `text yyyy-MM-dd`.
3. **Regra Sul Brasil (Seção 3)** continua hard-coded server-side (não parametrizar agora — fora do escopo). Comparação com `regexp_replace(lower(unaccent(name)),'\s+','','g') = 'sulbrasil'`.
4. **Bifurcação lucro/prejuízo (Seções 5/6)** continua olhando o `total_profit` **do próprio lançamento**, não do grupo agregado. Uma tupla cliente+artigo+malharia pode aparecer nas duas seções.
5. **Assimetria da Seção 10** preservada: Receitas Próprias somam `revenue`, Terceiros somam `profit` (não receita bruta), Prejuízos somam `profit` (negativo, entra somando).
6. **Faturas canceladas** (`status = 'cancelada'`) descartadas em **todas** as seções que consomem `invoices`/`invoice_items`.
7. **Cálculos permanecem determinísticos.** Nada de `now()` dentro das agregações — timezone só entra no `addHeader` do PDF.
8. **Isolamento multi-tenant rígido:** toda RPC começa com `v_caller uuid := get_user_company_id(); IF v_caller IS NULL THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;`.
9. **Sem `SET search_path` fora do padrão:** todas SECURITY DEFINER + `SET search_path = public`.
10. **GRANT obrigatório** em toda função: `GRANT EXECUTE ON FUNCTION ... TO anon, authenticated, service_role;`.
11. **Contrato de retorno:** payloads sempre `jsonb` com campos estáveis (`kpi`, `saldos`, `estoque_malha`, `receitas_proprias`, `terceiros_receitas`, `terceiros_prejuizos`, `residuos`, `venda_fio`, `estoque_terceiros`, `faturamento_total`, `meta`).
12. **Retro-compat:** manter a rota `/:slug/fechamento` e todos os componentes visuais. O refactor troca apenas a origem dos dados; nenhum outro módulo depende de `Fechamento.tsx` como fonte.

---

## 1. Diagnóstico atual

| Item | Estado |
|---|---|
| `fetchAll` (9 tabelas, blocos de 1000) | ❌ trafega histórico inteiro para o cliente |
| Filtro por mês | ❌ aplicado só no cliente (`isInMonth`/`isUpToMonth`) |
| Cancelamento de NF | ❌ removido no cliente após fetch |
| Agregações (10 seções) | ❌ `useMemo` no cliente com ~400 linhas |
| Logo do PDF | ❌ fetch extra dentro do `handleExportPDF` |
| Auditoria | ❌ inexistente (não registra download) |

Custo aproximado por load (empresas maduras, >3 anos): 50-150 MB de JSON transferido, TTFI 4-10 s. Migração server-side reduz para <500 KB e <500 ms.

---

## 2. Fase 1 — `get_fechamento_bootstrap(p_month text)`

**Objetivo:** substituir os 9 fetches + `useEffect` de metadados por 1 chamada única quando o usuário clica em **Carregar Dados**.

**Assinatura:**

```sql
CREATE OR REPLACE FUNCTION public.get_fechamento_bootstrap(p_month text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
```

**Payload retornado (contrato estável):**

```jsonc
{
  "company": { "id": "...", "name": "...", "logo_url": "..." },
  "meta": {
    "month": "2026-07",
    "month_label": "Julho/2026",
    "prev_month": "2026-06",
    "generated_at": "2026-07-19T14:00:00-03:00"
  },
  "section1_kg": { "estoque_inicial": 0, "compra_mes": 0, "estoque_atual": 0,
                    "producao_mes": 0, "rolos_mes": 0, "vendas_fio_mes": 0 },
  "section2_saldos": [ { "yarn_type_id":"...","yarn_name":"...",
                          "compra_mes":0,"compra_total":0,"vendas_mes":0,
                          "vendas_total":0,"consumo_total":0,"estoque":0 } ],
  "section3_estoque_malha": [ { "client_id":"...","client_name":"Sul Brasil",
                                  "articles":[{ "article_id":"...","article_name":"...",
                                                 "produced_kg":0,"produced_rolls":0,
                                                 "delivered_kg":0,"delivered_rolls":0,
                                                 "stock_kg":0,"stock_rolls":0 }] } ],
  "section4_receitas_proprias": [ { "client_id":"...","client_name":"...",
                                     "article_id":"...","article_name":"...",
                                     "kg":0,"value_per_kg":0,"revenue":0 } ],
  "section5_terceiros_receitas": [ { "client_name":"...","article_name":"...",
                                       "outsource_name":"...","kg":0,
                                       "value_per_kg":0,"revenue":0,"profit":0 } ],
  "section6_terceiros_prejuizos": [ /* mesmo shape da 5, profit < 0 */ ],
  "section7_residuos": [ { "client_name":"...","material_name":"...",
                           "qty":0,"unit":"kg","unit_price":0,"total":0 } ],
  "section8_venda_fio": [ { "client_name":"...","yarn_name":"...",
                            "kg":0,"value_per_kg":0,"subtotal":0 } ],
  "section9_estoque_terceiros": [ { "outsource_company_id":"...","outsource_name":"...",
                                     "items":[{ "yarn_type_id":"...","yarn_name":"...","kg":0 }] } ],
  "section10_faturamento_total": {
    "receita_propria": 0,
    "receita_terceiros": 0,
    "prejuizo_terceiros": 0,
    "receita_residuos": 0,
    "venda_fio": 0,
    "total": 0
  }
}
```

**CTEs internas (uma por bloco lógico):**

- `mo` — `p_month` normalizado; `prev` — mês anterior via `to_date(p_month||'-01','YYYY-MM-DD') - interval '1 month'`.
- `inv_ok` — `invoices WHERE company_id = v_caller AND status <> 'cancelada'`.
- `items_ok` — join `invoice_items` com `inv_ok` (elimina itens de NFs canceladas server-side — resolve o risco documentado no doc funcional).
- `prod_ok` — `productions WHERE company_id = v_caller`.
- `out_prod_ok` — `outsource_productions WHERE company_id = v_caller`.
- `sul_articles` — `articles WHERE regexp_replace(lower(unaccent(coalesce(client_name,''))),'\s+','','g') = 'sulbrasil'`.
- `sul_invoices` — `inv_ok WHERE ... 'sulbrasil'`.

**Seção 1 (KG):**

```sql
-- estoque_inicial: compras até prev - consumo até prev - vendas_fio até prev
SELECT
  (SELECT COALESCE(SUM(weight_kg),0) FROM items_ok WHERE invoice_type='entrada' AND issue_date <= (prev||'-31'))
- (SELECT COALESCE(SUM(p.weight_kg),0) FROM prod_ok p JOIN articles a ON a.id=p.article_id WHERE a.yarn_type_id IS NOT NULL AND p.date <= (prev||'-31'))
- (SELECT COALESCE(SUM(weight_kg),0) FROM items_ok WHERE invoice_type='venda_fio' AND issue_date <= (prev||'-31'))
```

Aplicar mesma lógica para `estoque_atual` (trocar `prev` por `p_month`), `compra_mes`/`vendas_fio_mes` (`issue_date LIKE p_month||'-%'`), `producao_mes`/`rolos_mes` (`p.date LIKE p_month||'-%'`).

> Truque `issue_date <= (p_month||'-31')` continua válido — replica exatamente `isUpToMonth` do cliente.

**Seção 2:** `LEFT JOIN LATERAL` cada `yarn_types` com 5 subqueries (compra_mes, compra_total, vendas_mes, vendas_total, consumo_total) e filtrar linhas onde `compra_mes = 0 AND vendas_mes = 0 AND estoque = 0`. Consumo via `articles.yarn_type_id`.

**Seção 3 (Sul Brasil):**

```sql
prod AS (SELECT article_id, SUM(weight_kg) kg, SUM(rolls_produced) rolls
         FROM prod_ok WHERE article_id IN (SELECT id FROM sul_articles)
         GROUP BY article_id),
deliv AS (SELECT ii.article_id,
                 SUM(ii.weight_kg) kg,
                 SUM(COALESCE(ii.quantity_rolls,0)) rolls
          FROM items_ok ii
          JOIN inv_ok i ON i.id = ii.invoice_id
          WHERE i.invoice_type = 'saida'
            AND (ii.article_id IN (SELECT id FROM sul_articles)
                 OR regexp_replace(lower(unaccent(coalesce(i.client_name,''))),'\s+','','g') = 'sulbrasil')
          GROUP BY ii.article_id)
```

Depois `jsonb_agg` agrupado por cliente com `stock_kg = prod.kg - deliv.kg`, retornando **somente grupos onde algum artigo tem `stock_kg <> 0`** (idêntico ao JS).

**Seção 4:** `SELECT ... FROM prod_ok p JOIN articles a ... WHERE p.date LIKE p_month||'-%' GROUP BY coalesce(a.client_id::text, a.client_name), coalesce(a.id::text, p.article_name)`. Recalcular `value_per_kg = revenue/NULLIF(kg,0)` com fallback `a.value_per_kg`.

**Seções 5/6:** uma única CTE `op_month` = `out_prod_ok WHERE date LIKE p_month||'-%'`, então `GROUP BY client_name, article_name, outsource_name`. Bifurcar via `WHERE profit_group_positive` / `profit_group_negative` calculados **por lançamento** (não por grupo):

```sql
per_line AS (
  SELECT
    coalesce(client_name,'—')  AS client_name,
    coalesce(article_name,'—') AS article_name,
    coalesce(outsource_company_name, oc.name, 'Desconhecido') AS outsource_name,
    weight_kg, total_revenue, total_profit,
    CASE WHEN total_profit < 0 THEN 'loss' ELSE 'profit' END AS bucket
  FROM op_month
  LEFT JOIN outsource_companies oc ON oc.id = op_month.outsource_company_id
)
```

Agrupar `WHERE bucket='profit'` (Seção 5) e `WHERE bucket='loss'` (Seção 6) somando `kg`, `revenue`, `profit`. `value_per_kg = revenue/NULLIF(kg,0)`.

**Seção 7:** `residue_sales WHERE date LIKE p_month||'-%' GROUP BY client_name, material_name` somando `quantity`, `total`; `unit_price = total/NULLIF(qty,0)`; `unit` via `FIRST_VALUE(unit) OVER (PARTITION BY ...)`.

**Seção 8:** 1 linha por `invoice_items` de `invoice_type='venda_fio' AND issue_date LIKE p_month||'-%'` — nome do cliente da NF, `yarn_type_name` do item, `weight_kg`, `value_per_kg`, `subtotal`; `ORDER BY i.issue_date, ii.id`.

**Seção 9:** `outsource_yarn_stock WHERE reference_month = p_month` (único bloco pré-filtrado). Agrupa por `outsource_company_id` retornando `items[]`.

**Seção 10:** simples `SELECT` sobre os JSONs já calculados nas CTEs anteriores para materializar o total. Assimetria mantida (própria=revenue, terceiros=profit, resíduos=total, venda_fio=total, prejuízos=profit já negativo).

**Company + logo:** um `SELECT id, name, logo_url FROM companies WHERE id = v_caller` no fim (elimina o fetch extra do PDF).

---

## 3. Fase 2 — `get_fechamento_export_payload(p_month text)`

**Objetivo:** payload dedicado ao PDF, independente do bootstrap (permite regerar PDF sem reabrir a página).

**Assinatura:** idêntica ao bootstrap; adiciona strings pré-formatadas para o PDF:

```jsonc
{
  "company": { "name": "...", "logo_url": "..." },
  "meta": {
    "month": "2026-07",
    "month_label": "Julho/2026",
    "generated_at_br": "19/07/2026 14:00",   // já em America/Sao_Paulo
    "file_name": "Fechamento_2026-07_Malha_XYZ"
  },
  "sections": { /* mesma estrutura de get_fechamento_bootstrap */ }
}
```

- Timezone tratado dentro da RPC: `to_char(timezone('America/Sao_Paulo', now()), 'DD/MM/YYYY HH24:MI')`.
- `file_name`: `'Fechamento_' || p_month || '_' || regexp_replace(coalesce(name,'Empresa'), '\s+', '_', 'g')`.
- Restante do payload reaproveita 100% das CTEs da Fase 1 (extrair em função interna `_fechamento_sections(v_caller, p_month) RETURNS jsonb` para não duplicar SQL).

**Vantagem:** o `handleExportPDF` atual chama esta RPC e escreve linhas prontas na tabela, sem depender do estado do React.

---

## 4. Fase 3 — Refactor cliente

**Regra:** o JSX das 10 seções e a função `handleExportPDF` **não mudam** — só a origem dos dados.

**4.1. Substituir 11 estados por 2 `useQuery`:**

```ts
const bootstrapQ = useQuery({
  queryKey: ['fechamento-bootstrap', companyId, selectedMonth],
  queryFn: () => supabase.rpc('get_fechamento_bootstrap', { p_month: selectedMonth })
                    .then(unwrap),
  enabled: false,                       // dispara só no clique
  staleTime: 5 * 60 * 1000,
});

const handleLoad = () => bootstrapQ.refetch();
```

**4.2. Adaptar `SectionCard` sem trocar props:** derivar cada seção do `bootstrapQ.data`:

```ts
const section1 = bootstrapQ.data?.section1_kg;
const section2 = bootstrapQ.data?.section2_saldos ?? [];
// ...
```

**4.3. Remover os 3 `useCallback` (`sumItemsWeight`, `sumItemsWeightMonth`, `sumConsumption`) e os 10 `useMemo` (`section1..section10`)** — vira leitura direta do payload.

**4.4. PDF:**

```ts
const handleExportPDF = async () => {
  setExporting(true);
  const payload = await supabase.rpc('get_fechamento_export_payload', { p_month: selectedMonth })
                       .then(unwrap);
  // reaproveita todo o addHeader/tableOpts atual, trocando fontes de dados por payload.sections.*
  doc.save(payload.meta.file_name + '.pdf');
  setExporting(false);
};
```

- `companies` fetch removido (já vem no payload).
- Data/hora do cabeçalho lida de `payload.meta.generated_at_br` (garante consistência entre servidores).

**4.5. Invalidação:** `bootstrap` só precisa invalidar em:

- Mutations de `productions` (invalidar `['fechamento-bootstrap', companyId, currentOrPrevMonth]`).
- Mutations de `invoices`/`invoice_items`.
- Mutations de `outsource_productions`, `outsource_yarn_stock`.
- Mutations de `residue_sales`.

Em vez de fio-a-fio, publicar um **helper** `invalidateFechamento(queryClient, companyId)` que faz `queryClient.invalidateQueries({ queryKey: ['fechamento-bootstrap', companyId] })` (chave prefixada) — chamado nos hooks de escrita de todos os módulos citados.

**4.6. Loading/empty states:** mantém `bootstrapQ.isFetching` em `loading`, `bootstrapQ.data` em `loaded`, e reset por troca de mês:

```ts
useEffect(() => { queryClient.removeQueries({ queryKey: ['fechamento-bootstrap', companyId, selectedMonth] }); }, [selectedMonth]);
```

---

## 5. Fase 4 — Auditoria e observabilidade (opcional, atrás de flag)

**5.1. `log_fechamento_export(p_month text)`:** RPC leve que insere em `audit_logs`:

```jsonc
{
  "action": "fechamento_export",
  "details": { "month": "2026-07", "file_name": "..." }
}
```

Chamada logo antes de `doc.save(...)`. Contrato `{ ok: true }`.

**5.2. Contadores em `platform_settings` (fora do escopo agora)** — apenas registrar como gancho.

---

## 6. Ordem sugerida de rollout

1. **Fase 1** — criar `get_fechamento_bootstrap` + `_fechamento_sections`.
2. **Fase 3.1–3.3** — trocar 11 estados por `useQuery` mantendo mesmos componentes de UI. Comparar visualmente lado a lado (staging).
3. **Fase 2** — `get_fechamento_export_payload`.
4. **Fase 3.4** — migrar `handleExportPDF`.
5. **Fase 3.5** — plugar `invalidateFechamento` nos hooks de escrita.
6. **Fase 4** — (opcional) auditoria de exportação.
7. **Cleanup** — remover `fetchAll`, `isInMonth`, `isUpToMonth`, `isSulBrasil` do `Fechamento.tsx` (podem migrar para `lib/utils.ts` se outro módulo usar).

---

## 7. Riscos e mitigações

| # | Risco | Mitigação |
|---|---|---|
| 1 | Divergência numérica vs cliente após migração | Rodar `EXECUTE get_fechamento_bootstrap('YYYY-MM')` em staging e diff campo-a-campo contra o payload derivado do array global antes de trocar. |
| 2 | `issue_date <= (p_month\|\|'-31')` falhar quando `date` virar `DATE` no futuro | Manter enquanto for `text`; ao migrar tipo, trocar por `<= (make_date(y,m,1) + interval '1 month - 1 day')`. |
| 3 | Seções 5/6 divergirem se agrupar antes de bifurcar | CTE `per_line` bifurca **por lançamento**; documentar em comentário SQL para evitar refactor errado. |
| 4 | Sul Brasil hard-coded quebrar para clientes com acento diferente | Normalização com `regexp_replace(lower(unaccent(...)),'\s+','','g')` — mesmo comportamento do JS `isSulBrasil`. |
| 5 | NFs canceladas contaminarem totais | `inv_ok`/`items_ok` filtram no primeiro CTE. Nenhum outro select pode usar `invoices` cru. |
| 6 | Timezone divergente no PDF | `generated_at_br` calculado dentro da RPC em `America/Sao_Paulo`. Cliente não formata. |
| 7 | `outsource_yarn_stock` sem registros no mês | Retornar `[]` em `section9_estoque_terceiros`. UI já lida com "Nenhum fio em estoque". |
| 8 | `articles` órfãos em `productions` | `LEFT JOIN` + `COALESCE(a.client_id::text, a.client_name)` reproduz fallback do JS. |
| 9 | Payload grande (empresas com >200 artigos) | Aceitável — ainda <1 MB. Se necessário, dividir em `get_fechamento_section{n}` (opcional futuro). |
| 10 | Cache do React Query desatualizado após mutation de outro módulo | Helper `invalidateFechamento` publicado em `lib/queries/fechamentoQueries.ts` para todos os módulos citados. |
| 11 | Auditoria dupla se o PDF for regerado | `log_fechamento_export` não deduplica — comportamento é intencional (cada download conta). |
| 12 | RPC quebrar se `enabled_nav_items.fechamento` for desabilitado | RPC não checa flag (RLS já garante `company_id`). UI continua bloqueando pelo sidebar. |
| 13 | Regressão do `valuePerKg = revenue/kg` quando `kg = 0` | `NULLIF(kg,0)` mantém `null`; cliente formata como 0,00 igual hoje. |
| 14 | `outsource_company_name` snapshot ausente | Fallback `LEFT JOIN outsource_companies oc ON oc.id = op.outsource_company_id` com `COALESCE`. |

---

## 8. Contratos das novas funções (resumo)

| Função | Tipo | Retorno | Descrição |
|---|---|---|---|
| `public.get_fechamento_bootstrap(p_month text)` | STABLE SECURITY DEFINER | `jsonb` | Payload completo das 10 seções + company. Chamada única no clique "Carregar Dados". |
| `public.get_fechamento_export_payload(p_month text)` | STABLE SECURITY DEFINER | `jsonb` | Idem + `meta.generated_at_br` e `meta.file_name` para o PDF. |
| `public._fechamento_sections(p_caller uuid, p_month text)` | STABLE (interna) | `jsonb` | Reaproveitada pelas duas RPCs públicas; não recebe GRANT para `anon`/`authenticated`. |
| `public.log_fechamento_export(p_month text)` | VOLATILE SECURITY DEFINER | `jsonb` | Registra download em `audit_logs`. Opcional (Fase 4). |

**GRANTs mandatórios:**

```sql
GRANT EXECUTE ON FUNCTION public.get_fechamento_bootstrap(text)       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_fechamento_export_payload(text)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_fechamento_export(text)          TO authenticated, service_role;
-- _fechamento_sections permanece sem GRANT para anon/authenticated.
```

---

## 9. Checklist de aceitação (18 pontos)

- [ ] `get_fechamento_bootstrap('YYYY-MM')` retorna payload em <500 ms para empresas com >3 anos de histórico.
- [ ] Nenhum `select *` de `invoices/invoice_items/productions/outsource_productions/residue_sales` sobrevive em `Fechamento.tsx`.
- [ ] Cada uma das 10 seções renderiza valores **idênticos** aos do cliente antigo (diff manual com XLSX de referência).
- [ ] Seção 3 lista apenas Sul Brasil.
- [ ] Seções 5 e 6 podem conter a mesma tupla (cliente+artigo+malharia) simultaneamente.
- [ ] Seção 10 fecha: `receita_propria + receita_terceiros + prejuizo_terceiros + receita_residuos + venda_fio == total`.
- [ ] NFs `cancelada` ignoradas em todas as seções que consomem faturas.
- [ ] Trocar o mês reseta o estado `loaded` (chave do `useQuery` muda).
- [ ] PDF gerado por `get_fechamento_export_payload` bate byte-a-byte com o antigo (visual e nome de arquivo).
- [ ] Timezone do cabeçalho do PDF sempre `America/Sao_Paulo`, independente do navegador.
- [ ] `invalidateFechamento(qc, companyId)` chamado em todos os hooks de escrita relacionados (productions, invoices, outsource, residue).
- [ ] `audit_logs` recebe `fechamento_export` a cada download (se Fase 4 estiver ativa).
- [ ] Nenhuma nova tabela criada.
- [ ] Nenhum schema alterado (`invoices.date`/`productions.date` continuam `text`).
- [ ] RLS não afrouxada.
- [ ] Rota `/:slug/fechamento` continua exclusiva de `admin`.
- [ ] Sidebar continua ocultando o item quando `enabled_nav_items.fechamento` estiver `false`.
- [ ] `bundle size` do `Fechamento.tsx` cai (menos memos e helpers) — verificar via `vite build --report`.

---

## 10. Fora do escopo (ganchos futuros)

- Parametrizar a regra Sul Brasil (Seção 3) por configuração da empresa.
- Snapshots mensais persistidos (`fechamento_snapshots`) para congelar resultado.
- RPC de comparação MoM/YoY (`get_fechamento_comparison`).
- Migrar `date`/`issue_date` de `text` para `DATE` real (afeta o truque lexicográfico — refactor grande).
- Retirar assimetria da Seção 10 (decisão de negócio, não técnica).
- PDF com paginação inteligente (pular páginas vazias).
- Deduplicação de `log_fechamento_export` em janela de 5 s.

> Este plano cobre **apenas Fechamento**. Nenhuma implementação — aprovar antes de escrever migrations. Ao implementar, seguir a ordem da Seção 6 e validar cada fase em staging com diff numérico contra o cliente antigo antes de remover o código legado.
