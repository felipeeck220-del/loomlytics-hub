# RPC Plan — Vendas de Resíduos (`ResidueSales.tsx`)

> Plano de migração para RPC do módulo Vendas de Resíduos.
> Base: `docs/residuesales.md` (funcionamento atual) + padrão consolidado em `docs/rpcInvoices.md`, `docs/rpcclientInvoices.md`, `docs/rpcstockMalha.md`, `docs/rpcBillingOrders.md`, `docs/rpcFreightOrders.md`, `docs/rpcproduction.md`, `docs/rpcrevision.md` e RPC de referência `get_faturamento_total_metrics`.
> **Escopo:** apenas planejamento — nada implementado. Comportamento visível é preservado 100%.

---

## 0. Regras Imutáveis

1. **Comportamento visível idêntico**: mesmas 3 abas (`sales`/`clients`/`materials`), mesmos filtros (mês + De/Até + busca serial), mesma paginação (20/pg + janela deslizante de 5), mesmos KPIs (`totalValue`, `totalQtyKg`, `totalQtyUn`, `count`), mesmo multi-lançamento (dialog permanece aberto no INSERT preservando cliente+data), mesmo PDF landscape A4.
2. **Schema intocado**. Não alterar tipos nem constraints nesta migração:
   - `residue_sales.date` continua `text` (`yyyy-MM-dd`, ordenação lexicográfica).
   - `residue_sales.material_id` continua `ON DELETE CASCADE` (mudança para `SET NULL` fica como gancho futuro, fora do escopo).
   - `residue_materials.default_price` continua legado, gravado como `0` no INSERT.
   - `residue_client_prices` mantém `UNIQUE (client_id, material_id)`.
3. **Isolamento multi-tenant server-side rigoroso** — toda RPC começa com:
   ```sql
   v_caller uuid := get_user_company_id();
   IF v_caller IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;
   ```
   Nunca aceitar `company_id` do cliente — sempre derivar do JWT.
4. **Snapshots server-side** — `material_name`, `client_name`, `unit`, `total` são recalculados no servidor a partir de `residue_materials`/`residue_clients`/`residue_client_prices`, jamais aceitos do cliente.
5. **Autoria** — `created_by_name` e `created_by_code` gravados apenas no INSERT, preservados no UPDATE. Parâmetros `p_author_name`/`p_author_code` recebem o Nome/Código do `useAuditLog` do cliente, mas o servidor os ignora silenciosamente no UPDATE.
6. **Contrato uniforme** — todas as escritas devolvem JSON `{ok, already, id?, action?, conflict?}` idêntico às demais RPCs do projeto (`save_client_invoice`, `save_defect_record`, etc.).
7. **Idempotência** — INSERT com mesma chave lógica (romaneio + client + material + date, quando informado) devolve `{ok:true, already:true}` em vez de duplicar. DELETE em id inexistente devolve `{ok:true, already:true}`.
8. **Auditoria dentro da própria RPC** — cada escrita insere em `audit_logs` (`residue_sale_create/update/delete`, `residue_material_*`, `residue_client_*`, `residue_client_price_*`) usando o par `p_author_name`/`p_author_code`. `logAction` do cliente será removido após deploy (mantido como wrapper transitório).
9. **Total** continua calculado como `quantity * unit_price` — agora no servidor com `round(qty * price * 100) / 100` para eliminar drift do frontend.
10. **RLS mantida ativa** em todas as tabelas (SECURITY DEFINER apenas para agregações; INSERT/UPDATE/DELETE seguem RLS + guarda `v_caller`).
11. **GRANTs padrão** em toda RPC: `GRANT EXECUTE ... TO anon, authenticated, service_role;`.
12. **Search path** fixo: `SET search_path = public`.

---

## 1. Fase 1 — Bootstrap (`get_residue_sales_bootstrap`)

**Objetivo:** carregar em um único round-trip todos os metadados que hoje disparam 4 `useQuery` + `useEffect` de logo (`companies.select('name,logo_url')`). Elimina 5 requisições iniciais.

### Payload de saída
```json
{
  "company": { "id": "uuid", "name": "text", "logo_url": "text|null" },
  "materials":     [{ "id","name","unit","created_at" }],
  "clients":       [{ "id","name","created_at" }],
  "client_prices": [{ "id","client_id","material_id","unit_price","created_at" }],
  "available_months": ["2026-07","2026-06", ...],   // yyyy-MM DESC + mês corrente
  "global_stats": {
    "total_records": 1234,
    "total_value":   987654.32,
    "total_kg":      45678.9,
    "total_un":      120
  }
}
```

### Regras
- `available_months`: `SELECT DISTINCT substring(date,1,7) FROM residue_sales WHERE company_id=v_caller AND date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND substring(date,1,4)::int BETWEEN 2020 AND 2099`, união com `to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM')`, ordem DESC.
- `global_stats` sempre calculado sobre a base inteira (não é filtrado — KPIs filtrados voltam em `get_residue_sales_list`).
- `client_prices` retorna a tabela inteira da empresa (é pequena, mesmo padrão do frontend atual).
- Payload vazio quando `v_caller IS NULL` (retorno inócuo, sem exception — leitura).

### Refatoração no cliente
- Substituir os 4 `useQuery` (`residue_materials`/`residue_clients`/`residue_client_prices`/companies-effect) por `useQuery(['residue_sales_bootstrap', companyId], () => rpc('get_residue_sales_bootstrap'))`.
- Manter `useQuery(['residue_sales_list', ...])` separado (Fase 2), com `keepPreviousData: true`.
- Invalidar `['residue_sales_bootstrap']` sempre que:
  - Material/Cliente/Preço muda (afeta `client_prices` e listas de referência).
  - Venda é criada/editada/excluída (afeta `available_months` e `global_stats`).
- Remover `useEffect` que faz `sb('companies').select(...)` — logo/nome agora vêm do bootstrap.

---

## 2. Fase 2 — Listagem paginada (`get_residue_sales_list`)

**Objetivo:** eliminar o carregamento integral de `residue_sales` no cliente. Toda a filtragem, ordenação, paginação e KPIs filtrados executam no banco.

### Assinatura
```sql
get_residue_sales_list(
  p_from        date default null,
  p_to          date default null,
  p_month       text default null,   -- 'yyyy-MM' ou null
  p_client_id   uuid default null,
  p_material_id uuid default null,
  p_search      text default null,
  p_page        int  default 1,
  p_page_size   int  default 20      -- cap 200 no servidor
) RETURNS json
```

### Payload
```json
{
  "rows": [{ /* residue_sales completo, sem joins */ }],
  "total_count": 1234,
  "page": 1,
  "page_size": 20,
  "kpis": {
    "total_value":   1234.56,
    "total_qty_kg":  789.0,
    "total_qty_un":  12,
    "count":         42
  }
}
```

### Regras SQL
- `p_page_size := LEAST(GREATEST(COALESCE(p_page_size,20), 1), 200)`.
- Filtros aplicados **em série** (idêntico ao frontend, incluindo o cenário de `p_month` + `p_from`/`p_to` juntos):
  - `p_month IS NOT NULL` → `WHERE date LIKE p_month || '-%'`.
  - `p_from IS NOT NULL` → `WHERE date >= to_char(p_from,'YYYY-MM-DD')`.
  - `p_to   IS NOT NULL` → `WHERE date <= to_char(p_to,'YYYY-MM-DD')`.
  - `p_client_id/p_material_id` → equality direto.
  - `p_search` → `ILIKE '%unaccent(p_search)%'` em `material_name`, `client_name`, `romaneio` (usar `unaccent()` em ambos lados).
- Ordenação estável: `ORDER BY created_at DESC, id ASC` (idêntico ao `order('created_at', {ascending:false})` atual + tiebreaker por id).
- KPIs calculados sobre o **mesmo predicado** (subquery ou CTE compartilhado), não sobre a página.
- `total_count` via `COUNT(*) OVER ()` na CTE final.
- Sempre `WHERE company_id = v_caller` na CTE base — nunca confiar em RLS para segurança de agregação.

### Refatoração no cliente
- Estados de filtro (`filterMonth`, `dateFrom`, `dateTo`, `searchText`, `currentPage`) viram queryKey.
- `useQuery(['residue_sales_list', {companyId, filterMonth, from, to, search, page}], ...)` com `keepPreviousData: true` para transições suaves.
- Remover memos `filteredSales`/`paginatedSales`/`kpis` — todos vêm do payload.
- `availableMonths` continua vindo do bootstrap.
- `useDeferredValue(searchText)` opcional para debounce leve.
- Invalidar `['residue_sales_list']` em toda mutation de venda.

---

## 3. Fase 3 — Escritas atômicas

Todas seguem contrato `{ok, already, id?, action?, conflict?}` e inserem em `audit_logs` internamente.

### 3.1 `save_residue_material(p_id, p_payload, p_author_name, p_author_code)`
- **Payload:** `{ name text, unit text }` — `unit IN ('kg','unidade')`.
- Validações: `trim(name)` não-vazio; `unit` no enum.
- INSERT: `default_price := 0` forçado no servidor (mantém legado).
- UPDATE: `WHERE id = p_id AND company_id = v_caller`; se não encontrado → `RAISE 'Material não encontrado'`.
- Autoria não se aplica (tabela não tem colunas de autoria — usa apenas `audit_logs`).
- Ação em audit: `residue_material_create` / `residue_material_update`.
- Retorno: `{ok:true, id, action:'create'|'update'}`.

### 3.2 `delete_residue_material(p_id, p_author_name, p_author_code)`
- `SELECT ... FROM residue_materials WHERE id=p_id AND company_id=v_caller FOR UPDATE`.
- Se não existe → `{ok:true, already:true}`.
- **Efeitos colaterais explícitos** (documentar): `ON DELETE CASCADE` remove `residue_client_prices` e `residue_sales` vinculados. Auditoria registra `residue_material_delete` com contagem de vendas removidas (`SELECT COUNT(*) FROM residue_sales WHERE material_id=p_id`) para rastreabilidade.
- Retorno: `{ok:true, id, cascade_sales_deleted:N}`.

### 3.3 `save_residue_client(p_id, p_payload, p_author_name, p_author_code)`
- **Payload:** `{ name text }`.
- Trim + não-vazio.
- Ações audit: `residue_client_create` / `residue_client_update`.

### 3.4 `delete_residue_client(p_id, ...)`
- Cascade de `residue_client_prices` (mas **não** de `residue_sales` — que usa `SET NULL`).
- Devolve `{ok, id, cascade_prices_deleted, sales_disassociated}`.
- Audit: `residue_client_delete`.

### 3.5 `save_residue_client_price(p_id, p_payload, p_author_name, p_author_code)`
- **Payload:** `{ client_id uuid, material_id uuid, unit_price numeric }`.
- Validações:
  - `client_id`/`material_id` existem e pertencem a `v_caller`.
  - `unit_price > 0`.
- INSERT respeita UNIQUE `(client_id, material_id)`; em vez de deixar estourar 23505, checa antes e devolve `{ok:false, conflict:'duplicate_client_material', existing_id:uuid}` (amigável, como `duplicate_of_number` em `create_billing_order`).
- UPDATE só altera `unit_price` (nunca troca `client_id`/`material_id` — regra atual do formulário).
- Audit: `residue_client_price_create` / `_update`.

### 3.6 `delete_residue_client_price(p_id, ...)`
- Idempotente. Audit: `residue_client_price_delete`.

### 3.7 `save_residue_sale(p_id, p_payload, p_author_name, p_author_code)`
**Coração do módulo.** Substitui o `saveSale.mutationFn` inteiro.

**Payload:**
```json
{
  "client_id":    "uuid",
  "material_id":  "uuid",
  "date":         "yyyy-MM-dd",
  "quantity":     123.45,
  "unit_price":   6.78,
  "romaneio":     "text|null",
  "observations": "text|null"
}
```

**Validações server-side (espelho do handleSave):**
1. `client_id` e `material_id` obrigatórios; verificar que ambos pertencem a `v_caller` (JOIN em `residue_clients` / `residue_materials`).
2. `date` bate regex `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` e cai na janela ±5 anos de `current_date AT TIME ZONE 'America/Sao_Paulo'` (mesma regra de `isDateValid`).
3. `quantity > 0` e `unit_price > 0`.
4. **Auto-preenchimento server-side (opcional, defensivo):** se `unit_price` vier `null` ou `0` e existir linha em `residue_client_prices(client_id, material_id)`, usar aquele preço. Frontend continua enviando o valor exibido — servidor só é fallback.
5. **Snapshots server-side** re-lidos:
   - `material_name := (SELECT name FROM residue_materials WHERE id=p.material_id)`.
   - `client_name  := (SELECT name FROM residue_clients   WHERE id=p.client_id)`.
   - `unit         := (SELECT unit FROM residue_materials WHERE id=p.material_id)`.
   - Cliente **não** pode sobrescrever esses campos (payload deles é ignorado se enviado).
6. **Total:** `total := round(quantity * unit_price * 100) / 100`.
7. **Idempotência (opcional):** se `romaneio IS NOT NULL AND trim(romaneio)<>''`, checar `EXISTS venda mesma company + mesma data + mesmo client + mesmo material + mesmo romaneio` em INSERT. Se sim → `{ok:true, already:true, id:existing_id, action:'insert'}` (evita duplo-clique).
8. INSERT preenche `created_by_name = p_author_name`, `created_by_code = p_author_code`.
9. UPDATE **preserva** `created_by_name`/`created_by_code` originais (não sobrescreve). UPDATE só permitido se `company_id = v_caller`.
10. `audit_logs`: `residue_sale_create` ou `residue_sale_update` com `{material, client, date, quantity, total}`.
11. Retorno: `{ok:true, id, action:'create'|'update'}`.

### 3.8 `delete_residue_sale(p_id, p_author_name, p_author_code)`
- `SELECT ... FOR UPDATE` → se não existe `{ok:true, already:true}`.
- Audit `residue_sale_delete` com snapshot completo (material, client, total) antes do DELETE.
- Retorno: `{ok:true, id}`.

---

## 4. Fase 4 — Payload de exportação PDF (`get_residue_sales_export_payload`)

**Objetivo:** permitir que o PDF cubra toda a base filtrada sem depender do array carregado no cliente (que hoje está capado em `filteredSales` porque `useQuery` traz tudo — após Fase 2 traria só a página atual).

### Assinatura
Mesma dos filtros da Fase 2 (`p_from`, `p_to`, `p_month`, `p_client_id`, `p_material_id`, `p_search`) — sem paginação.

### Payload
```json
{
  "company":  { "name":"text", "logo_url":"text|null" },
  "period_label": "Todo período|MMMM yyyy|dd/MM/yyyy — dd/MM/yyyy",
  "rows": [
    {
      "date_br":"dd/MM/yyyy",
      "material_name":"...",
      "client_name":"...",
      "quantity":123.45,
      "unit":"kg|unidade",
      "unit_price":6.78,
      "total":836.99,
      "romaneio":"..."
    }
  ],
  "totals": { "total_value":..., "count":..., "total_kg":..., "total_un":... }
}
```

### Regras
- `date_br` calculado server-side (`to_char(to_date(date,'YYYY-MM-DD'),'DD/MM/YYYY')`) — evita parsing frágil no cliente.
- `period_label` construído server-side com `to_char(..., 'TMMonth YYYY')` em `pt_BR` (ou fallback textual estático já que Postgres pode não ter locale — nesse caso monta via CASE com nomes fixos, como `get_faturamento_total_metrics` faz).
- Sem paginação; sem cap — cliente decide se pede.
- **Não gera o PDF** — apenas os dados. `exportPDF` no frontend continua desenhando com jsPDF+autoTable exatamente como hoje.

### Refatoração no cliente
- `exportPDF` passa a chamar `rpc('get_residue_sales_export_payload', currentFilters)` antes de desenhar; o restante do fluxo (logo canvas, cabeçalho, autoTable, sanitizePdfText, `vendas-residuos-yyyy-MM-dd.pdf`) permanece intacto.

---

## 5. Ordem sugerida de implementação

1. **Fase 1** (`get_residue_sales_bootstrap`) — quick win, elimina 5 requisições iniciais sem tocar em escrita.
2. **Fase 2** (`get_residue_sales_list`) — reescreve a listagem principal; grande impacto em performance para bases grandes.
3. **Fase 4** (`get_residue_sales_export_payload`) — libera o PDF para funcionar sobre a base completa depois da Fase 2.
4. **Fase 3.7 / 3.8** (`save_residue_sale` / `delete_residue_sale`) — migra a escrita mais crítica e a autoria server-side.
5. **Fase 3.1–3.6** (materials/clients/prices) — CRUDs menores, migram por último por serem de baixo risco.
6. **Cleanup** — remover `logAction` do cliente para todas as ações já auditadas server-side (mantendo wrappers curtos por 1 ciclo caso Weavers/Dashboard leiam eventos).

---

## 6. Refactor no cliente (resumo por fase)

| Bloco atual em `ResidueSales.tsx` | Depois |
|---|---|
| 4 `useQuery` (materials/clients/prices/sales) + `useEffect` de logo | 1 `useQuery(['residue_sales_bootstrap'])` + 1 `useQuery(['residue_sales_list', filters])` |
| `availableMonths` memo | vem do bootstrap |
| `filteredSales`/`paginatedSales`/`kpis` memos | vêm do payload da list |
| `saveSale.mutationFn` com INSERT/UPDATE + snapshot no cliente | `rpc('save_residue_sale', {p_id, p_payload, p_author_name, p_author_code})` |
| `logAction` em cada mutation | Remover após deploy — auditoria server-side |
| `saleTotal` (client) | ainda útil para pré-visualização; total definitivo vem do servidor |
| `skipPriceAutoUpdate` ref + duplo `setTimeout` | permanece — é UX puro do formulário |
| `exportPDF` faz `.map` sobre `filteredSales` (que agora é só a página) | Passa a chamar `get_residue_sales_export_payload(filters)` primeiro |

### Invalidação de cache (mutations)
| Mutation | Invalidar |
|---|---|
| `save_residue_material` / `delete_residue_material` | `residue_sales_bootstrap` + `residue_sales_list` (nomes-snapshot em vendas continuam íntegros; refresh só reflete catálogo) |
| `save_residue_client` / `delete_residue_client` | `residue_sales_bootstrap` + `residue_sales_list` |
| `save_residue_client_price` / `delete_residue_client_price` | `residue_sales_bootstrap` (afeta `client_prices` que dirige auto-preenchimento) |
| `save_residue_sale` / `delete_residue_sale` | `residue_sales_bootstrap` (KPIs globais + available_months) + `residue_sales_list` + `faturamento_total_metrics` (integração) |

---

## 7. Riscos e mitigações

1. **`residue_sales.date` continua `text`** — filtros usam comparação lexicográfica. RPC mantém o mesmo comportamento (`date >= to_char(...)`). Se algum registro estiver fora do padrão, será silenciosamente excluído do filtro. **Mitigação futura:** migração `text → date` (fora do escopo).
2. **`material_id` continua `ON DELETE CASCADE`** — deletar material apaga vendas históricas. `delete_residue_material` retorna `cascade_sales_deleted` para tornar o efeito explícito na UI (banner de aviso opcional).
3. **UNIQUE `(client_id, material_id)`** — `save_residue_client_price` intercepta e devolve `{conflict:'duplicate_client_material'}` para evitar erro 23505 opaco.
4. **`default_price` legado** — servidor força `0`; nunca aceitar valor do cliente.
5. **Snapshots vs catálogo** — vendas antigas manterão nomes antigos mesmo se material/cliente for renomeado. RPC **não** faz backfill (regra atual preservada).
6. **Auditoria dupla transitória** — enquanto `logAction` estiver ativo no cliente e a RPC também logar, haverá dois eventos. Aceitável durante a janela de deploy; remover o cliente depois.
7. **`skipPriceAutoUpdate` frágil** — permanece; RPC não interfere. Cliente continua responsável pela UX do formulário.
8. **`total` divergente** — cliente exibe `parseBR(qty)*parseBR(price)`; servidor grava `round(qty*price*100)/100`. Diferenças de arredondamento passam a ser resolvidas server-side. Frontend deve reler o registro (ou usar retorno da RPC) para exibir o valor definitivo.
9. **Integração FaturamentoTotal** — `get_faturamento_total_metrics` já lê `residue_sales.total`; invalidar `faturamento_total_metrics` em toda mutation de venda.
10. **`p_page_size` cap 200** — protege contra abuso; PDF usa `get_residue_sales_export_payload` (sem cap).
11. **`get_user_company_id()` como fonte única de verdade** — jamais aceitar `company_id` do cliente em nenhuma RPC deste módulo.
12. **RLS ativa** — SECURITY DEFINER exige `SET search_path = public` + `v_caller` guarda; RLS continua ativa para leituras diretas via PostgREST de código legado durante transição.

---

## 8. Checklist de validação (pré-deploy)

1. [ ] Bootstrap devolve mesmo `companyName`/`logoUrl` que o `useEffect` antigo.
2. [ ] `available_months` inclui o mês corrente mesmo sem vendas.
3. [ ] `global_stats` do bootstrap bate com `SELECT count/sum` direto na tabela.
4. [ ] `get_residue_sales_list` com filtros vazios devolve mesma ordem que `.order('created_at', {ascending:false})`.
5. [ ] `p_month + p_from/p_to` juntos aplicam em série (comportamento atual).
6. [ ] `p_search` cobre `material_name`, `client_name`, `romaneio` case-insensitive e insensível a acentos.
7. [ ] Página > total_pages devolve `rows: []` sem erro.
8. [ ] KPIs filtrados batem com KPIs calculados no cliente antes da migração (bateria de comparação).
9. [ ] `save_residue_sale` INSERT retorna `{ok:true, action:'create'}` e grava snapshots corretos.
10. [ ] `save_residue_sale` UPDATE preserva `created_by_name`/`created_by_code`.
11. [ ] `save_residue_sale` com romaneio duplicado devolve `{already:true}` (se regra 3.7.7 for adotada).
12. [ ] `save_residue_client_price` em UNIQUE duplicado devolve `{conflict:'duplicate_client_material'}` sem 23505.
13. [ ] `delete_residue_material` retorna `cascade_sales_deleted` corretamente contado.
14. [ ] `delete_residue_client` marca `residue_sales.client_id = NULL` (SET NULL) — vendas continuam listadas com `client_name` snapshot.
15. [ ] `delete_*` em id inexistente devolve `{ok:true, already:true}` — não estoura.
16. [ ] Toda RPC tem `SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO anon, authenticated, service_role`.
17. [ ] Toda RPC bloqueia com `RAISE 'Acesso negado'` quando `get_user_company_id() IS NULL`.
18. [ ] `audit_logs` recebe eventos `residue_*` corretos em cada mutation.
19. [ ] `get_residue_sales_export_payload` devolve todas as linhas da base filtrada (sem paginação).
20. [ ] PDF gerado com a nova RPC é visualmente idêntico ao PDF anterior (cabeçalho, colunas, totais, arquivo).
21. [ ] `FaturamentoTotal` continua batendo com `residue_sales.total` (nenhuma regressão em `get_faturamento_total_metrics`).
22. [ ] `logAction` do cliente pode ser removido para todas as ações do módulo sem perda de rastro.

---

## 9. Fora do escopo (ganchos futuros)

- Migrar `residue_sales.date` de `text` → `date` (requer normalização de dados existentes).
- Migrar `residue_sales.material_id` de `ON DELETE CASCADE` → `SET NULL` (preserva histórico financeiro).
- Remover coluna legada `residue_materials.default_price`.
- Índice `(company_id, date DESC)` em `residue_sales` para acelerar Fase 2 quando a base crescer.
- Realtime opcional (`residue_sales_rt_${companyId}`) — hoje não há esse requisito para o módulo.
- RPC `get_residue_sales_by_client` para análises comparativas por comprador.

---

*Última atualização: 19/07/2026 (Brasília) — planejamento apenas, sem alterações de código.*