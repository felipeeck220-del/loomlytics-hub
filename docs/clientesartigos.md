# Clientes & Artigos — Snapshot Técnico Completo (08/04/2026)

> **Status:** ✅ **Em Produção** — CRUD de clientes e artigos com vínculo a fios


> Arquivo de referência para restauração. Contém layout, lógica, cálculos, estilos, modais e tipos da página **Clientes & Artigos** (`src/pages/ClientsArticles.tsx`).

---

## 1. Arquivos Envolvidos

| Arquivo | Função |
|---|---|
| `src/pages/ClientsArticles.tsx` (493 linhas) | Página principal — Tabs, CRUD clientes/artigos, modal de voltas |
| `src/types/client.ts` | Tipos `Client`, `Article`, `ArticleMachineTurns` |
| `src/types/index.ts` | Re-exports |

---

## 2. Tipos

### 2.1 `Client`
```ts
interface Client {
  id: string;
  company_id: string;
  name: string;
  contact?: string;
  observations?: string;
  created_at: string;
}
```

### 2.2 `Article`
```ts
interface Article {
  id: string;
  company_id: string;
  name: string;
  client_id: string;
  client_name?: string;
  yarn_type_id?: string;
  weight_per_roll: number;
  value_per_kg: number;
  turns_per_roll: number;
  target_efficiency: number;
  observations?: string;
  created_at: string;
}
```

### 2.3 `ArticleMachineTurns`
```ts
interface ArticleMachineTurns {
  id: string;
  article_id: string;
  machine_id: string;
  company_id: string;
  turns_per_roll: number;
  observations?: string;
  created_at: string;
}
```

### 2.4 `MachineTurnRow` (local)
```ts
interface MachineTurnRow {
  id: string;
  machine_id: string;
  turns_per_roll: string;
  observations: string;
}
```

---

## 3. Estado da Página

| State | Tipo | Descrição |
|---|---|---|
| `tab` | `string` | Aba ativa: `'clients'` ou `'articles'` |
| `clientSearch` | `string` | Busca de clientes |
| `articleSearch` | `string` | Busca de artigos |
| `showClientModal` | `boolean` | Modal criar/editar cliente |
| `editingClient` | `Client \| null` | Cliente em edição |
| `clientForm` | `{ name, contact, observations }` | Formulário de cliente |
| `showArticleModal` | `boolean` | Modal criar/editar artigo |
| `editingArticle` | `Article \| null` | Artigo em edição |
| `articleForm` | `{ name, client_id, yarn_type_id, weight_per_roll, value_per_kg, turns_per_roll, target_efficiency, observations }` | Formulário de artigo |
| `showDelete` | `{ type: 'client'\|'article'; item: any } \| null` | Item para exclusão |
| `deleteWord` | `string` | (não usado na confirmação — exclusão direta com botão "Sim, Excluir") |
| `turnsArticle` | `Article \| null` | Artigo cujo modal de voltas está aberto |
| `turnsDefault` | `string` | Voltas padrão no modal |
| `turnsRows` | `MachineTurnRow[]` | Configurações específicas por máquina |
| `turnsSaving` | `boolean` | Estado de salvamento do modal de voltas |

### 3.1 Dados do `useSharedCompanyData()`
- `getClients()` → `Client[]`
- `saveClients(all)` → persiste clientes
- `getArticles()` → `Article[]`
- `saveArticles(all)` → persiste artigos
- `getMachines()` → `Machine[]`
- `getArticleMachineTurns()` → `ArticleMachineTurns[]`
- `saveArticleMachineTurns(articleId, data)` → persiste voltas por máquina
- `loading`

### 3.2 Outros Hooks
- `usePermissions()` → `canSeeFinancial` (controla visibilidade de Valor/Kg)
- `useAuth()` → `user?.company_id`
- `useAuditLog()` → `logAction`

### 3.3 Query Adicional
```ts
useQuery(['yarn_types', companyId]) → yarnTypes: Array<{ id: string; name: string }>
```
Busca tipos de fio via `sb('yarn_types').select('*').eq('company_id', ...).order('name')`.

---

## 4. Lógica de Negócio

### 4.1 Salvar Cliente
- Obrigatório: `name`
- Edição: atualiza no array, `logAction('client_update')`
- Criação: gera UUID, `company_id = ''`, `logAction('client_create')`

### 4.2 Salvar Artigo
- Obrigatório: `name`, `client_id`
- `client_name` preenchido automaticamente a partir do `clients` array
- `yarn_type_id`: valor `'__none__'` mapeado para `''` (string vazia)
- `target_efficiency` default: `80`
- Edição: `logAction('article_update')`
- Criação: `logAction('article_create')`

### 4.3 Exclusão
- **Sem** confirmação por digitação (diferente de Máquinas)
- Apenas confirmação com botão "Sim, Excluir" (variant destructive)
- `logAction('client_delete')` ou `logAction('article_delete')`

### 4.4 Filtros de Busca

**Clientes:**
```ts
filteredClients = clients.filter(c =>
  !clientSearch || c.name.toLowerCase().includes(...) || (c.contact || '').toLowerCase().includes(...)
);
```

**Artigos:**
```ts
filteredArticles = articles.filter(a =>
  !articleSearch || a.name.toLowerCase().includes(...) || (a.client_name || '').toLowerCase().includes(...) || (a.observations || '').toLowerCase().includes(...)
);
```

### 4.5 Configuração de Voltas por Máquina

**Abrir modal:**
1. Carrega `turnsDefault` do artigo (`article.turns_per_roll`)
2. Carrega rows existentes de `allMachineTurns` filtradas pelo `article.id`

**Validação:**
- Voltas padrão obrigatório (número > 0)
- Duplicatas de máquina não permitidas

**Salvamento (`handleSaveTurns`):**
1. Atualiza `turns_per_roll` padrão no artigo (via `saveArticles`)
2. Salva configurações específicas (via `saveArticleMachineTurns(articleId, data)`)

**Prevenção de duplicatas no select:**
- Máquinas já usadas em outras rows ficam `disabled` no select

---

## 5. Layout e UI

### 5.1 Estrutura Geral
```
div.space-y-6.animate-fade-in
├── Header (título + botões Novo Cliente / Novo Artigo)
├── Tabs (Clientes | Artigos)
│   ├── TabsContent "clients" → card-glass com busca + grid de cards
│   └── TabsContent "articles" → card-glass com busca + grid de cards
├── Modal: Criar/Editar Cliente
├── Modal: Criar/Editar Artigo
├── Modal: Configurar Voltas por Máquina
└── Modal: Confirmar Exclusão
```

### 5.2 Header
- Layout: `flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`
- Título: `text-2xl font-display font-bold text-foreground` → "Clientes & Artigos"
- Subtítulo: `text-muted-foreground text-sm` → "Gerencie seus clientes e os artigos produzidos"
- 2 botões `btn-gradient`: "Novo Cliente" e "Novo Artigo" (ambos com `<Plus>`)

### 5.3 Tabs
- `TabsList`: `w-full grid grid-cols-2`
- Tab "Clientes": ícone `<Users>` + "Clientes"
- Tab "Artigos": ícone `<Settings>` + "Artigos"

### 5.4 Aba Clientes

Container: `card-glass p-5 space-y-4`

**Cabeçalho:**
- Título: `font-display font-semibold text-foreground` → "Lista de Clientes"
- Contagem: `text-sm text-muted-foreground` → "{filtrados} de {total} clientes"

**Busca:**
- Input com `<Search>` à esquerda, `pl-9`
- Placeholder: "Pesquisar clientes por nome, contato ou endereço..."

**Grid:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

**Card Cliente:**
```
div.rounded-lg.border.border-border.bg-background.p-4.flex.flex-col.gap-3
├── Info:
│   ├── Nome: font-display font-semibold text-foreground
│   └── Contato: text-sm text-muted-foreground (ou "Sem contato")
└── Actions (pt-1 border-t border-border):
    ├── Editar (flex-1, text-xs)
    └── Excluir (size="icon" h-8 w-8, text-destructive)
```

**Empty:** `col-span-full text-center text-muted-foreground py-8`

### 5.5 Aba Artigos

Container: `card-glass p-5 space-y-4`

**Cabeçalho:**
- Título: "Lista de Artigos"
- Contagem: "{filtrados} de {total} artigos"

**Busca:**
- Placeholder: "Pesquisar artigos por nome, cliente ou observações..."

**Grid:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

**Card Artigo:**
```
div.rounded-lg.border.border-border.bg-background.p-4.flex.flex-col.gap-3
├── Info:
│   ├── Nome: font-display font-semibold text-foreground
│   ├── Cliente: text-sm text-muted-foreground → "Cliente: {nome}"
│   └── Fio (se yarn_type_id): text-sm → "Fio: {nome}" (font-medium text-foreground)
├── Dados:
│   ├── Peso Rolo: "{valor} kg" (font-semibold text-foreground)
│   ├── Valor/Kg: "R$ {valor}" (APENAS se canSeeFinancial)
│   └── Eficiência Exigida: "{valor}%" (default 80)
└── Actions (pt-1 border-t border-border):
    ├── Voltas (text-xs, ícone Settings)
    ├── Editar (flex-1, text-xs)
    └── Excluir (size="icon" h-8 w-8, text-destructive)
```

---

## 6. Modais

### 6.1 Modal Criar/Editar Cliente

Tamanho: padrão (sem max-w customizado)

| Campo | Tipo | Obrigatório |
|---|---|---|
| Nome | `Input` | Sim (validação via toast) |
| Contato | `Input` | Não |
| Observações | `Textarea` | Não |

Footer: Cancelar (outline) + Salvar/Cadastrar (btn-gradient)

### 6.2 Modal Criar/Editar Artigo

Tamanho: padrão

| Campo | Tipo | Obrigatório | Detalhes |
|---|---|---|---|
| Nome do Artigo | `Input` | Sim | — |
| Cliente | `Select` | Sim | Lista de `clients` |
| Tipo de Fio | `Select` | Não | Opção "Nenhum" (`__none__`) + `yarnTypes` |
| Peso/Rolo (kg) | `Input number` | Não | Grid 2 cols (ou 1 se !canSeeFinancial) |
| Valor/kg (R$) | `Input number step=0.01` | Não | **Apenas se canSeeFinancial** |
| Voltas/Rolo | `Input number` | Não | Grid 2 cols |
| Eficiência Média Exigida (%) | `Input number min=0 max=100` | Não | Default: 80 |
| Observações | `Textarea` | Não | — |

**Grid condicional do Peso/Valor:**
```ts
className={`grid ${canSeeFinancial ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}
```

Footer: Cancelar (outline) + Salvar/Cadastrar (btn-gradient)

### 6.3 Modal Configurar Voltas por Máquina

Tamanho: `sm:max-w-3xl`

**Título:** "Configurar Voltas por Máquina"
**Subtítulo:** "Gerencie as voltas por rolo para o artigo "{nome}" em cada máquina."

**Seção 1 — Voltas Padrão:**
- Container: `rounded-lg border border-border bg-muted/30 p-5 space-y-3`
- Título: "Voltas por Rolo (Padrão)" (font-semibold text-foreground)
- Descrição: "Este valor será usado como padrão para máquinas que não tenham configuração específica."
- Input obrigatório (*)

**Seção 2 — Configurações Específicas por Máquina:**
- Container: `rounded-lg border border-border bg-muted/30 p-5 space-y-4`
- Header: ícone `<Settings>` + título + descrição
- **Estado vazio:**
  - Ícone grande `<Settings>` (h-12 w-12 text-muted-foreground/40)
  - "Nenhuma configuração específica"
  - "Todas as máquinas usarão o valor padrão de voltas por rolo."
  - Botão "Adicionar Configuração para Máquina" (outline)
- **Com rows:**
  - Cada row: `rounded-lg border border-border bg-background p-4`
  - Grid: `grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end`
    - Máquina (Select, obrigatório*) — máquinas já usadas ficam disabled
    - Voltas por Rolo (Input number, obrigatório*)
    - Observações (Input)
    - Botão remover (Trash2, destructive, size="icon" h-9 w-9)
  - Botão "Adicionar Outra Máquina" (`variant="outline" w-full`)

**Footer:**
- Salvar: `btn-gradient w-full sm:w-auto sm:flex-1` com Loader2 durante save
- Cancelar: `variant="outline" w-full sm:w-auto sm:flex-1`

### 6.4 Modal Confirmar Exclusão

- Título: "Excluir {nome}?"
- Texto: "Tem certeza que deseja excluir este {cliente/artigo}? Esta ação não pode ser desfeita."
- **Sem** campo de digitação — confirmação direta
- Botões: Cancelar (outline) + "Sim, Excluir" (destructive)

---

## 7. Permissões

| Permissão | Efeito |
|---|---|
| `canSeeFinancial = true` | Exibe "Valor/Kg" no card do artigo e no formulário; grid do formulário 2 cols |
| `canSeeFinancial = false` | Oculta "Valor/Kg"; grid do formulário 1 col |

---

## 8. Hooks e Dependências

| Hook/Context | Uso |
|---|---|
| `useSharedCompanyData()` | Dados, save, loading |
| `usePermissions()` | canSeeFinancial |
| `useAuth()` | company_id |
| `useAuditLog()` | logAction |
| `useQuery` (react-query) | Busca yarn_types |

### Bibliotecas
- `sonner` → `toast`
- `lucide-react` → Plus, Pencil, Trash2, Loader2, Users, Search, Settings
- `@tanstack/react-query` → `useQuery`

### Utilitário Local
```ts
const sb = (table: string) => (supabase.from as any)(table);
```
Atalho para acessar tabelas via Supabase (cast `any` para tabelas não tipadas).

---

## 9. Tokens de Design Utilizados

| Token/Classe | Uso |
|---|---|
| `card-glass` | Container principal de cada aba |
| `btn-gradient` | Botões "Novo Cliente", "Novo Artigo", Salvar nos modais |
| `rounded-lg border border-border bg-background` | Cards individuais de cliente/artigo |
| `rounded-lg border border-border bg-muted/30` | Seções do modal de voltas, detalhes do artigo |
| `text-foreground` | Nomes, valores |
| `text-muted-foreground` | Labels, contagens, subtítulos |
| `font-display` | Títulos, nomes nos cards |
| `text-destructive` | Botão excluir, campos obrigatórios (*) |
| `animate-fade-in` | Animação de entrada da página |

---

## 10. Responsividade

| Breakpoint | Comportamento |
|---|---|
| Mobile (< sm) | Header empilhado, cards 1 col, formulários 1 col, modal de voltas 1 col |
| sm (640px+) | Header lado a lado, cards 2 cols, formulários 2 cols, modal de voltas grid [1fr_1fr_1fr_auto] |
| lg (1024px+) | Cards 3 cols |

---

## 11. Auditoria

| Ação | Dados Registrados |
|---|---|
| `client_create` | name |
| `client_update` | name |
| `client_delete` | name |
| `article_create` | name |
| `article_update` | name |
| `article_delete` | name |

---

## 12. Fluxo de Dados — Voltas por Máquina

1. Cada artigo tem um `turns_per_roll` padrão (na tabela `articles`)
2. Configurações específicas ficam na tabela `article_machine_turns` (relação artigo × máquina)
3. Ao registrar produção, o sistema usa a voltas específica da máquina se existir, senão usa o padrão do artigo
4. O modal de voltas permite CRUD completo dessas configurações
5. Máquinas duplicadas são impedidas tanto por validação no save quanto por `disabled` no select
