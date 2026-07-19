# 🔍 Revisão (Falhas) — Documentação Técnica Completa

> **Status:** ✅ **Em Produção**
> **Rota:** `/:slug/revision`
> **Arquivo principal:** `src/pages/Revision.tsx` (~935 linhas)
> **Query helper:** `src/lib/queries/defectsQueries.ts` (paginação server-side por `defect_records`, usada por outras telas)
> **Documento irmão de dados:** `docs/data/06-revisao.md`

---

## 1. Propósito

Módulo responsável por **registrar, editar e excluir falhas/defeitos de qualidade** encontrados na revisão da malha produzida. Cada registro amarra:

- **Quando** (data + turno)
- **Onde** (máquina)
- **O que** (artigo + nome do defeito)
- **Quem produziu** (tecelão)
- **Quanto** (valor em Kg ou Metros)
- **Autor do apontamento** (Nome #Código)

Os dados alimentam também o módulo **Tecelões → Falhas** (ranking + badges Verde ≤3 / Amarelo 4-7 / Vermelho ≥8) e relatórios executivos.

---

## 2. Permissões

Definidas em `src/hooks/usePermissions.ts` via `ROLE_ALLOWED_KEYS`:

| Role | Acesso à Revisão |
|------|------------------|
| `admin` | ✅ |
| `lider` / `lider_noite` | ❌ |
| `revisador` | ✅ (única rota — vira `defaultRoute`) |
| `mecanico` / `lider_mecanica` | ❌ |
| `expedicao` / `freteiro` / `lider_frete` | ❌ |

O módulo também pode ser desligado por empresa via `companies.enabled_nav_items` (memory *modular-navigation-control*).

RLS de `defect_records` isola todas as linhas por `company_id = get_user_company_id()` (SELECT/INSERT/UPDATE/DELETE, role `authenticated`).

---

## 3. Modelo de Dados

### 3.1 Tabela `defect_records`

| Coluna | Tipo | Regra |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `company_id` | uuid NOT NULL | Multi-tenant (RLS) |
| `date` | text NOT NULL | `yyyy-MM-dd` (string, comparada lexicograficamente) |
| `shift` | text NOT NULL | `manha` / `tarde` / `noite` (normalizado, sem acento) |
| `machine_id` | uuid → `machines.id` | Snapshot em `machine_name` |
| `article_id` | uuid → `articles.id` | Snapshot em `article_name` |
| `weaver_id` | uuid → `weavers.id` | Snapshot em `weaver_name` |
| `measure_type` | text NOT NULL default `'kg'` | `kg` ou `metro` |
| `measure_value` | numeric NOT NULL default 0 | Positivo |
| `observations` | text NULL | **Sempre prefixado por `[Nome do Defeito]`** — ver §5.2 |
| `created_by_name` / `created_by_code` | text NULL | Autoria "Nome #Código" |
| `created_at` | timestamptz NOT NULL default `now()` | Ordem cronológica |

**RLS (4 políticas — authenticated):** todas usam `company_id = get_user_company_id()`.

### 3.2 Tabelas auxiliares consumidas

- `machines` — popular selects e listar por `number`.
- `weavers` — badges "Nome — Turno" e código.
- `articles` — label `NomeArtigo (Cliente)` (padrão *ui/naming-conventions-standard*).
- `companies` (`logo_url`, `name`) — cabeçalho do PDF.
- `company_settings.shift_settings` (via `useSharedCompanyData`) — nomes personalizados de turno.

### 3.3 RPC de estatísticas

`public.get_defect_stats(p_company_id, p_start_date, p_end_date, p_shift, p_machine_id, p_article_id, p_weaver_id, p_search_term)` → `(total_records, total_kg, total_metros)`. Não é usada por `Revision.tsx` (stats vêm do array em memória), mas está disponível para outros consumidores.

---

## 4. Camada de Dados no Cliente

### 4.1 Fonte principal — `useSharedCompanyData()`

Toda a página lê arrays já cacheados no `CompanyDataContext`:

```ts
const {
  getMachines, getWeavers, getArticles,
  getDefectRecords,
  addDefectRecords, updateDefectRecords, deleteDefectRecords,
  shiftSettings, loading,
} = useSharedCompanyData();
```

- **Leitura:** array completo `defectRecords` em memória (sem paginação server-side).
- **Escrita:** delega para o hook central (`useCompanyData`) que insere/atualiza/exclui via Supabase client e revalida o cache.

### 4.2 `src/lib/queries/defectsQueries.ts`

Não é usado por `Revision.tsx` — foi criado para **outras telas** (Tecelões, Reports) fazerem paginação incremental por período. Contrato:

```ts
fetchDefectsPage(companyId, {
  startDate, endDate,       // yyyy-MM-dd
  shift?, machineId?, articleId?, weaverId?,
  searchTerm?,              // ILIKE em machine/article/weaver/observations
  page = 0, pageSize = 50,
}) → { items, total, page, pageSize, hasMore }
```

`normalizeShift()` converte qualquer variação (`Manhã`, `MANHA`, `manhã`) para `manha` sem acento — segue memory *logic/data-normalization*.

`mapDefectRecord()` normaliza tipos numéricos e defaults (`measure_type ?? 'kg'`).

---

## 5. Regras de Negócio

### 5.1 Turnos válidos

```ts
const SHIFTS: ShiftType[] = ['manha', 'tarde', 'noite'];
```

Labels exibidos vêm de `getCompanyShiftLabels(shiftSettings)` — cada empresa pode renomear (ex: `Turno A`).

### 5.2 Codificação do "Nome do Defeito"

O banco não tem coluna `defect_name`. O nome do defeito é **serializado dentro de `observations`** com o formato:

```
[NomeDefeito] observações livres
```

- Ao **salvar** (`handleSave`, linha 430):
  ```ts
  const obsText = form.observations
    ? `[${form.defect_name}] ${form.observations}`
    : form.defect_name;
  ```
- Ao **editar** (`openEdit`, linha 395), o regex `^\[(.+?)\]\s*(.*)` separa:
  - `match[1]` → `defect_name`
  - `match[2]` → `observations`
  - Sem colchete → tudo é `defect_name`.
- No **PDF**, extrai só o nome do defeito (`match[1]`) — trunca em 25 chars.

> Se o usuário digitar `[...]` livre nas observações o parser pode confundir. Não há escaping — é uma convenção de negócio.

### 5.3 Snapshots de nome

Sempre gravamos `machine_name`, `article_name`, `weaver_name` no momento do insert/update, garantindo histórico correto se a entidade for renomeada/apagada depois.

### 5.4 Autoria

`created_by_name` e `created_by_code` vêm de `useAuditLog()` (`userName`, `userCode`) — só populados no `INSERT`. Em `UPDATE` a autoria original é preservada (`...editingRecord`).

### 5.5 Comportamento pós-registro (multi-lançamento)

Após um `INSERT` bem-sucedido o modal **não fecha** e apenas os campos específicos do defeito são zerados:

```ts
setForm(f => ({ ...f, defect_name: '', measure_value: '', observations: '' }));
```

`date`, `shift`, `machine_id`, `weaver_id`, `article_id`, `measure_type` permanecem — permite lançar várias falhas do mesmo turno em sequência. No `UPDATE` o modal fecha normalmente (`setShowModal(false)`).

### 5.6 Exclusão

Confirmação exige digitar exatamente `EXCLUIR` (memory *constraints/deletion-safety*). Sem `alert`/`confirm` nativos.

### 5.7 Auditoria

`logAction(...)` grava em `audit_logs`:

| Ação | Payload |
|------|---------|
| `defect_create` | `{ machine, article, date, shift }` |
| `defect_update` | `{ machine, article, date, shift }` |
| `defect_delete` | `{ machine, date }` |

---

## 6. Estado Local (Revision.tsx)

| Estado | Uso |
|--------|-----|
| `companyLogoUrl`, `companyName` | Cabeçalho do PDF (fetch direto de `companies`) |
| `showModal`, `editingRecord`, `saving` | Modal registrar/editar |
| `searchTerm` | Busca livre em máquina/artigo/tecelão |
| `filterDateFrom` / `filterDateTo` | Intervalo (mutuamente exclusivo com `filterMonth`) |
| `filterMonth` | `'all'` ou `yyyy-MM` (mutuamente exclusivo com intervalo) |
| `filterArticle` | `'all'` ou `article_id` |
| `currentPage`, `pageSize=20` | Paginação client-side |
| `showDelete`, `deleteWord` | Modal de exclusão |
| `form` | Payload do modal (date, shift, machine_id, weaver_id, article_id, defect_name, measure_type, measure_value, observations) |
| `machineSearch`, `articleSearch`, `articleFilterSearch`, `weaverSearch` | Buscas internas dos selects |
| `machineSearchRef`, `articleSearchRef`, `weaverSearchRef` | Auto-focus (*ui/searchable-select-standard*) |

---

## 7. Memoizações (`useMemo`)

| Memo | Depende de | O que faz |
|------|-----------|-----------|
| `sortedMachines` | `machines` | Ordena por `number` ASC |
| `filteredMachinesModal` | `sortedMachines`, `machineSearch` | ILIKE em nome/número |
| `filteredArticlesModal` | `articles`, `articleSearch` | Busca por nome do artigo **ou** cliente |
| `filteredArticlesFilter` | `articles`, `articleFilterSearch` | Idem, para o filtro superior |
| `filteredWeaversModal` | `weavers`, `weaverSearch` | Busca por nome + code |
| `availableMonths` | `defectRecords` | Set de `yyyy-MM` distinctos, ordem DESC |
| `filtered` | 5 filtros + `defectRecords` | Aplica intervalo/mês/artigo/busca |
| `totalPages` / `paginatedData` | `filtered`, `currentPage` | Slice de 20 |
| `stats` | `filtered` | `{ total, totalKg, totalMetros }` |
| `companyShiftLabels` | `shiftSettings` | Labels amigáveis dos turnos |

**Reset automático:** `useEffect([searchTerm, ...filtros])` volta `currentPage = 1` quando qualquer filtro muda.

---

## 8. Interface (UI)

### 8.1 Cabeçalho
`H1 "Revisão"` + descrição + botão **Registrar Falha**.

### 8.2 KPI Cards (3)

| Card | Ícone | Cor | Cálculo |
|------|-------|-----|---------|
| Total de Falhas | `AlertTriangle` | destructive | `stats.total` |
| Total em Kg | `Scale` | warning | `sum(measure_value)` where `measure_type='kg'` |
| Total em Metros | `Ruler` | info | `sum(measure_value)` where `measure_type='metro'` |

Grid `grid-cols-1 sm:grid-cols-3`.

### 8.3 Barra de filtros (flex-wrap)

- **De / Até** (Popover + Calendar, dd/MM/yy). Selecionar limpa `filterMonth`.
- **Mês** (Select com `availableMonths`). Selecionar limpa intervalo.
- **Artigo** (Select com busca inline `position=popper` + `side=bottom` + `avoidCollisions=false`).
- **Busca livre** (máquina/artigo/tecelão).
- **Exportar PDF** (desabilitado se `filtered.length === 0`).
- **Limpar filtros** — aparece quando qualquer filtro está ativo.

### 8.4 Listagem

**Mobile (`md:hidden`)** — cards empilhados:
- Header: data + badge turno + badge tipo + ações (editar/excluir).
- Grid 2 col: Máquina | Valor · Artigo · Tecelão + código.
- Observações (se houver) em linha completa.
- Rodapé: autor em verde + `created_at` formatado `dd/MM/yyyy HH:mm`.

**Desktop (`hidden md:block`)** — Table (10 colunas):

`Data | Turno | Máquina | Artigo | Tecelão | Tipo | Valor | Obs | Registrado por | Ações`

### 8.5 Paginação
Aparece só quando `totalPages > 1`. Janela deslizante de até 5 páginas ao redor da atual. Botões `‹ / ›` no mobile, `Anterior / Próximo` no desktop.

### 8.6 Modal Registrar/Editar

`Dialog` com `w-[95vw] max-w-2xl max-h-[90vh]`, **ESC bloqueado** e clique-fora bloqueado (padrão *ui/registry-modal-standards*).

4 linhas de campos:

1. Data (Popover Calendar) | Turno (Select)
2. Máquina (Select buscável, auto-focus) | Artigo (Select buscável, `Nome (Cliente)`)
3. Tecelão (Select buscável, `Code - Name`) | Nome da Falha (Input)
4. Tipo (kg/metro) | Valor (`number`, `step=0.01`, `min=0`) | Observações (Input)

Botão único **Registrar Falha / Salvar Alterações** (largura total, spinner enquanto `saving`).

### 8.7 Modal Excluir
`sm:max-w-sm`, exige digitar `EXCLUIR`, botão `destructive` só habilita quando string bate.

---

## 9. Export PDF (`exportToPdf`)

Gerado com **jsPDF puro** (sem `autoTable`) — layout manual para controle fino.

### 9.1 Estrutura

1. **Cabeçalho (25mm)**: fundo cinza, borda, logo à esquerda (`companies.logo_url` carregada via canvas + `crossOrigin='anonymous'`, com `fitWithinBox` 24x14mm), fallback para `companyName` em bold. Data/hora atual no canto inferior esquerdo. Título centralizado `RELATÓRIO DE REVISÃO (FALHAS)`. Período à direita:
   - `dd/MM/yyyy até dd/MM/yyyy` (se intervalo)
   - `MMM/yyyy` (se mês) ou `Total`.
2. **Resumo**: `Total de Falhas / Total em Kg / Total em Metros`.
3. **Cabeçalho da tabela** (fundo cinza claro):
   `Data (22) | Máquina (20) | Artigo (60) | Valor (30) | Defeito (48)`.
4. **Linhas**: alterna fundo zebra a cada par. `y > 270 → addPage()` e reset `y=20`.
5. **Linha TOTAL** ao final: soma em `kg + metros`.
6. **Arquivo:** `revisao_yyyy-MM-dd_HHmm.pdf`.

Textos passam por `sanitizePdfText()` (remove chars não-latin1 que quebram jsPDF).

---

## 10. Dependências

| Import | Uso |
|--------|-----|
| `useSharedCompanyData` | Fonte única de dados |
| `useAuth` | `user.company_id` para carregar logo |
| `useAuditLog` | `logAction`, `userName`, `userCode` |
| `supabase` | Fetch pontual de `companies.logo_url/name` |
| `date-fns` (`format`, `subMonths`, `ptBR`) | Formatação dd/MM/yyyy e labels de mês |
| `sonner` | Toasts de sucesso/erro |
| shadcn `Dialog`, `Popover`, `Calendar`, `Select`, `Table`, `Card`, `Badge`, `Button`, `Input`, `Label` | UI |
| `lucide-react` | Ícones (`AlertTriangle`, `Scale`, `Ruler`, `Search`, `Pencil`, `Trash2`, `FileText`, `CalendarIcon`, `Plus`, `Loader2`) |
| `formatNumber` | Formato brasileiro (2 casas) |
| `sanitizePdfText` | Sanitização para jsPDF |

---

## 11. Integração com outros módulos

- **Tecelões → Falhas** (`src/pages/Weavers.tsx`): consome `defect_records` (via `useSharedCompanyData` ou `fetchDefectsPage`) para gerar ranking + badges e detalhes por horista.
- **Relatórios (Reports)**: agrega defeitos por período (usa `fetchDefectsPage` paginado ou métrica agregada).
- **Dashboard**: eventualmente pode consumir `stats.total` (não faz hoje diretamente).
- **Auditoria global**: cada evento `defect_*` alimenta `AuditHistoryModal`.

---

## 12. Riscos & Pontos de Atenção

1. **Array global de `defectRecords`** — carregado inteiro no cliente pelo `CompanyDataContext`. Cresce sem limite. Candidato natural a RPC paginada (`get_revision_bootstrap` + `get_revision_defects_list`) no mesmo padrão dos módulos já migrados (rpcInvoices/rpcstockMalha).
2. **`defect_name` embutido em `observations`** — parser frágil se usuário digitar `[texto]` livre; não há escaping. Migrar para coluna própria em uma refatoração de schema.
3. **`date` como `text`** — compara lexicograficamente. Sempre no formato `yyyy-MM-dd`. Não usar objetos `Date` nas comparações.
4. **Comparação de turno legada** — pode existir base histórica com `Manhã`, `Tarde` acentuados. `normalizeShift` cuida na leitura; escritas novas já vão sem acento.
5. **PDF sem `autoTable`** — layout manual: mudanças em colunas exigem recalcular larguras/offset (`valueColX`).
6. **`fetchDefectData` é no-op** — resquício da migração para contexto compartilhado; pode ser removido.
7. **`totalRecords` / `isSyncing` / `dbCompanyId`** — estados declarados sem uso efetivo (código morto pequeno).
8. **RLS depende de `get_user_company_id()`** — se retornar `NULL` (perfil sem `company_id`), toda a listagem some silenciosamente.

---

## 13. Ganchos Futuros (RPC — quando priorizado)

Padrão sugerido, alinhado a `rpcstockMalha.md` / `rpcclientInvoices.md`:

- `get_revision_bootstrap(p_company_id)` → `{ company_id, available_months, stats_total, stats_kg, stats_metros }`.
- `get_revision_defects_list(p_company_id, p_from, p_to, p_month, p_article_id, p_search, p_page, p_page_size)` → `{ rows, total_count, kpis }` — permite abandonar o array global.
- `save_defect_record(p_id?, p_payload, p_author_name, p_author_code)` atômica com contrato `{ ok, already, id, action }`.
- `delete_defect_record(p_id, p_author_name, p_author_code)` idempotente `{ ok, already }`.
- `get_revision_export_payload(...)` para o PDF (server-side).

Todas SECURITY DEFINER + `search_path=public` + validação `v_caller := get_user_company_id()` + GRANT `anon/authenticated/service_role` (pente-fino de multi-tenant obrigatório, ver `rpcclientInvoices` Fases 1-3).

---

## 14. Checklist de Comportamento Esperado

1. ✅ Criar falha → `defect_records` INSERT + `audit_logs.defect_create` + toast + reset parcial do form.
2. ✅ Editar falha → UPDATE preservando autoria original + fecha modal.
3. ✅ Excluir falha → só após digitar `EXCLUIR` + `audit_logs.defect_delete`.
4. ✅ Filtro intervalo (`De/Até`) limpa `filterMonth`; e vice-versa.
5. ✅ Filtro Artigo aparece com busca interna.
6. ✅ `availableMonths` só mostra meses com registro.
7. ✅ Paginação client-side de 20 em 20, janela deslizante de 5 páginas.
8. ✅ Mobile: cards; Desktop: tabela — sem scroll horizontal no mobile.
9. ✅ PDF respeita filtros correntes (usa `filtered`, não `paginatedData`).
10. ✅ Selects buscáveis com auto-focus e `avoidCollisions=false` (abrem para baixo).
11. ✅ Modal com ESC/clique-fora bloqueados.
12. ✅ Nome do defeito serializado em `observations` como `[Nome] obs`.
13. ✅ Autoria "Nome #Código" no rodapé de cada card/linha e no PDF (via auditoria).
14. ✅ RLS isola por `company_id`.

---

*Última atualização: 19/07/2026 — documentação apenas, nada implementado.*
