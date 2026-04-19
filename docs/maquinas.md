# Máquinas — Snapshot Técnico Completo (08/04/2026)

> **Status:** ✅ **Em Produção** — CRUD de teares com status, modos e logs


> Arquivo de referência para restauração. Contém layout, lógica, cálculos, estilos, modais e componentes auxiliares da página **Máquinas** (`src/pages/Machines.tsx`).

---

## 1. Arquivos Envolvidos

| Arquivo | Função |
|---|---|
| `src/pages/Machines.tsx` (444 linhas) | Página principal — CRUD, filtros, cards, modais |
| `src/components/ProductionModeModal.tsx` (88 linhas) | Modal de configuração do modo de produção por máquina |
| `src/components/MaintenanceViewModal.tsx` (197 linhas) | Modal fullscreen (100vw/vh) para mecânicos — timer + observações |
| `src/types/machine.ts` | Tipos `Machine`, `MachineLog`, `MachineStatus`, `ProductionMode` |
| `src/types/index.ts` | Re-exports dos tipos |

---

## 2. Tipos e Constantes

### 2.1 `ProductionMode`
```ts
type ProductionMode = 'rolos' | 'voltas' | 'iot';
```

### 2.2 `MachineStatus`
```ts
type MachineStatus = 'ativa' | 'manutencao_preventiva' | 'manutencao_corretiva' | 'troca_artigo' | 'troca_agulhas' | 'inativa';
```

### 2.3 Labels e Cores

| Status | Label | Cor CSS (badge) |
|---|---|---|
| `ativa` | Ativa | `bg-success/10 text-success` |
| `manutencao_preventiva` | Manutenção Preventiva | `bg-warning/10 text-warning` |
| `manutencao_corretiva` | Manutenção Corretiva | `bg-destructive/10 text-destructive` |
| `troca_artigo` | Troca de Artigo | `bg-info/10 text-info` |
| `troca_agulhas` | Troca de Agulheiro | `bg-purple-500/10 text-purple-600` |
| `inativa` | Inativa | `bg-muted text-muted-foreground` |

### 2.4 Ícones por Status (na página)

| Status | Ícone | Cor direta |
|---|---|---|
| `total` | `<Monitor>` | `text-muted-foreground` |
| `ativa` | `<CheckCircle2>` | `text-emerald-500` |
| `inativa` | `<AlertCircle>` | `text-destructive` |
| `manutencao_preventiva` | `<Wrench>` | `text-orange-400` |
| `manutencao_corretiva` | `<Wrench>` | `text-rose-400` |
| `troca_artigo` | `<Settings>` | `text-blue-400` |
| `troca_agulhas` | `<Wrench>` | `text-purple-500` |

### 2.5 Interface `Machine`
```ts
interface Machine {
  id: string;
  company_id: string;
  number: number;
  name: string;           // "TEAR XX" — gerado automaticamente
  rpm: number;
  status: MachineStatus;
  article_id?: string;
  observations?: string;
  production_mode: ProductionMode;
  created_at: string;
}
```

### 2.6 Interface `MachineLog`
```ts
interface MachineLog {
  id: string;
  machine_id: string;
  status: MachineStatus;
  started_at: string;
  ended_at?: string;
  started_by_name?: string;
  started_by_code?: string;
  ended_by_name?: string;
  ended_by_code?: string;
}
```

---

## 3. Estado da Página (`Machines.tsx`)

| State | Tipo | Descrição |
|---|---|---|
| `showModal` | `boolean` | Controla modal de criação/edição |
| `editing` | `Machine \| null` | Máquina sendo editada (null = nova) |
| `showDelete` | `Machine \| null` | Máquina selecionada para exclusão |
| `deleteWord` | `string` | Palavra de confirmação ("EXCLUIR") |
| `showReport` | `Machine \| null` | Máquina cujo relatório está aberto |
| `statusFilter` | `string` | Filtro de status ativo (`'all'` ou `MachineStatus`) |
| `searchTerm` | `string` | Texto de busca por nome/número |
| `maintenanceViewMachine` | `Machine \| null` | Máquina em visualização de manutenção (fullscreen) |
| `form` | `{ number, rpm, status, article_id, observations }` | Dados do formulário de criação/edição |

### 3.1 Dados vindos do `useSharedCompanyData()`
- `getMachines()` → `Machine[]`
- `getMachineLogs()` → `MachineLog[]`
- `getArticles()` → `Article[]`
- `saveMachines(all)` → persiste máquinas
- `saveMachineLogs(allLogs)` → persiste logs
- `loading` → estado de carregamento

### 3.2 Dados do `useAuditLog()`
- `logAction(action, details)` — registra ações na auditoria
- `userName`, `userCode` — identificação do usuário

---

## 4. Lógica de Negócio

### 4.1 Nomenclatura Automática
Ao criar/editar, `name` é gerado:
```ts
name: `TEAR ${form.number.padStart(2, '0')}`
```
Sempre 2 dígitos com zero à esquerda.

### 4.2 Salvamento (handleSave)

**Edição:**
1. Atualiza dados da máquina no array
2. Se `status` mudou:
   - Fecha log aberto existente (`ended_at = now`, `ended_by_name/code`)
   - Cria novo log com status atual (`started_at = now`, `started_by_name/code`)
   - Salva logs via `saveMachineLogs()`
3. Salva máquinas via `saveMachines()`
4. Registra auditoria: `machine_status_change` (se status mudou) ou `machine_update`

**Criação:**
1. Gera `id` via `crypto.randomUUID()`
2. `company_id` = `''` (preenchido pelo backend)
3. `production_mode` default = `'rolos'`
4. Salva máquinas
5. Cria log inicial com status definido
6. Registra auditoria: `machine_create`

### 4.3 Exclusão (handleDelete)
- Exige digitação exata de `"EXCLUIR"`
- Filtra máquina do array e salva
- Registra auditoria: `machine_delete`

### 4.4 Filtros
```ts
const filtered = machines
  .filter(m => statusFilter === 'all' || m.status === statusFilter)
  .filter(m => !searchTerm || m.name.toLowerCase().includes(searchTerm.toLowerCase()) || String(m.number).includes(searchTerm));
```

### 4.5 Contagem de Status
```ts
const statusCounts = ALL_STATUSES.reduce((acc, s) => ({
  ...acc,
  [s]: machines.filter(m => m.status === s).length
}), {});
```

---

## 5. Layout e UI

### 5.1 Estrutura Geral
```
div.space-y-6.animate-fade-in
├── Header (título + busca + filtros + botão Nova Máquina)
├── Status Summary Cards (grid 2/3/6 cols)
├── Machine Cards Grid (grid 1/2/3 cols)
├── Modal: Criar/Editar
├── Modal: Confirmar Exclusão
├── Modal: Relatório de Logs
└── MaintenanceViewModal (fullscreen)
```

### 5.2 Header
- Título: `text-2xl font-display font-bold text-foreground` → "Máquinas"
- Subtítulo: `text-muted-foreground text-sm` → "Gerencie as máquinas da sua malharia"
- Layout: `flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`

**Busca:**
- Input com ícone `<Search>` à esquerda (posição absoluta)
- Classes: `pl-9 w-52`

**Filtros:**
- Array `FILTER_OPTIONS` com 7 opções (Todos + 6 status)
- Botões `size="sm"` com `text-xs`
- Ativo: `variant="default"`, Inativo: `variant="outline"`

**Botão Nova Máquina:**
- `className="btn-gradient"` com ícone `<Plus>`

### 5.3 Status Summary Cards

Grid: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3`

**Card Total:**
- Classes: `card-glass p-4 flex flex-col justify-between min-h-[100px]`
- Topo: label `text-sm text-muted-foreground font-medium` + ícone
- Valor: `text-3xl font-display font-bold text-foreground`

**Cards por Status:**
- Mesmas classes + `cursor-pointer transition-all hover:shadow-md`
- Se filtro ativo nesse status: `ring-2 ring-primary`
- Click: toggle filtro (ativa/desativa)
- Cor do número:
  - `ativa` → `text-emerald-500`
  - `inativa` → `text-destructive`
  - Demais → `text-orange-500`

### 5.4 Machine Cards Grid

Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

**Cada card:**
```
div.card-glass.p-5.flex.flex-col.gap-4
├── Header: ícone status + nome (text-lg font-display font-bold) + Badge status
├── Info:
│   ├── RPM: label/value
│   └── Cadastrada: dd/MM/yyyy
└── Actions (border-t border-border):
    ├── Editar (flex-1)
    ├── Relatórios (flex-1)
    ├── Olho (se em manutenção/troca agulhas) — size="icon" h-8 w-8
    └── Lixeira (destructive) — size="icon" h-8 w-8
```

**Botão Olho (MaintenanceView):** Aparece apenas quando `status ∈ [manutencao_preventiva, manutencao_corretiva, troca_agulhas]`

**Empty state:** `col-span-full text-center text-muted-foreground py-12`

---

## 6. Modais

### 6.1 Modal Criar/Editar Máquina

Tamanho: `sm:max-w-2xl`

**Campos:**
| Campo | Tipo | Obrigatório | Detalhes |
|---|---|---|---|
| Número | `number` | Sim* | Prefixo fixo "TEAR" (span bg-muted), preview do nome completo |
| RPM Padrão | `number` | Sim* | Placeholder "27" |
| Status | `Select` | Não | Bolinha colorida antes do valor selecionado |
| Artigo Atual | `Select` | Não | Exibe `nome (cliente)` |
| Observações | `Textarea` | Não | 3 rows |

**Detalhes do Artigo Selecionado:**
Quando um artigo é selecionado, exibe box informativo:
- Classes: `rounded-lg border border-border bg-muted/30 p-4`
- Grid 3 colunas: Cliente, Peso por rolo (kg), Valor por kg (R$)

**Bolinha de Status no Select:**
```ts
form.status === 'ativa' ? 'bg-emerald-500' :
form.status === 'inativa' ? 'bg-destructive' : 'bg-orange-400'
```

**Footer:**
- Botão primário: `btn-gradient w-full sm:w-auto` → "Cadastrar Máquina" ou "Atualizar Máquina"
- Botão cancelar: `variant="outline" w-full sm:w-auto`

### 6.2 Modal Confirmar Exclusão

- Título: "Excluir {nome}?"
- Instrução: "Digite **EXCLUIR** para confirmar"
- Input de confirmação
- Botões: Cancelar (outline) + Confirmar (destructive)

### 6.3 Modal Relatório de Logs

Tamanho: `max-w-lg`

- Título: "Relatório - {nome}"
- Lista: `max-h-80 overflow-auto space-y-2`
- Logs ordenados por `started_at` DESC
- Cada log:
  - Container: `p-3 rounded bg-muted/50`
  - Badge com status (cores padrão)
  - Início: `dd/MM/yyyy HH:mm` — nome#código em `text-primary font-medium`
  - Fim (se existir): mesmo formato
- Empty: "Nenhum registro encontrado"

---

## 7. MaintenanceViewModal (Fullscreen)

Arquivo: `src/components/MaintenanceViewModal.tsx`

### 7.1 Layout
- Container: `fixed inset-0 z-[100] bg-background` — 100vw × 100vh
- `touchAction: 'none'` para mobile
- Bloqueia scroll do body quando aberto

### 7.2 Props
```ts
interface MaintenanceViewModalProps {
  machine: Machine;
  currentLog: MachineLog | null;  // log sem ended_at
  open: boolean;
  onClose: () => void;
}
```

### 7.3 Estrutura
```
div.fixed.inset-0.z-[100]
├── Header: ícone Wrench + nome + botão fechar (X)
└── Content (overflow-y-auto p-4 space-y-6):
    ├── Card Status:
    │   ├── Motivo da Parada (Badge)
    │   ├── Início (dd/MM/yyyy HH:mm)
    │   └── Iniciado por (nome #código, text-primary)
    ├── Card Timer:
    │   ├── Ícone Clock h-8 w-8 text-primary
    │   ├── Label "Tempo Parada"
    │   └── Timer (text-4xl font-display font-bold tabular-nums) → HH:MM:SS
    └── Observações:
        ├── Título + botão Adicionar
        ├── Input (Textarea 3 rows + Salvar/Cancelar)
        └── Lista de observações (card-glass p-3, dd/MM/yyyy HH:mm)
```

### 7.4 Timer em Tempo Real
```ts
useEffect(() => {
  const update = () => {
    const diff = Date.now() - new Date(currentLog.started_at).getTime();
    // formata HH:MM:SS
  };
  update();
  const interval = setInterval(update, 1000);
  return () => clearInterval(interval);
}, [open, currentLog]);
```

### 7.5 Observações (DB)
- Tabela: `machine_maintenance_observations`
- Campos: `machine_log_id`, `machine_id`, `company_id`, `observation`, `created_at`
- Carregadas via Supabase `.from('machine_maintenance_observations').select('*').eq('machine_log_id', ...)`
- Ordenação: `created_at ASC`
- Persistem no banco mesmo sem finalizar o registro

---

## 8. ProductionModeModal

Arquivo: `src/components/ProductionModeModal.tsx`

### 8.1 Props
```ts
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machines: Machine[];
  onSave: (machines: Machine[]) => Promise<void>;
}
```

### 8.2 Layout
- Tamanho: `max-w-lg max-h-[80vh] flex flex-col`
- Título: "Modo de Registro de Produção"
- Subtítulo: "Configure como cada máquina registra a produção: por rolos ou por voltas."

### 8.3 Funcionalidades
- **Botões em massa:** "Todas por Rolos" / "Todas por Voltas" / "Todas por IoT" (`variant="outline" size="sm"`)
- **Lista scrollável:** Cada máquina com nome + Select (w-[130px] h-8)
- Opções do select: `PRODUCTION_MODE_LABELS` (Rolos, Voltas, IoT Automático)
- Máquinas ordenadas por `number` ASC
- Estado local `modes: Record<string, ProductionMode>` — só máquinas alteradas
- Salvar: aplica mudanças ao array completo e chama `onSave()`

### 8.4 Footer
- Cancelar: limpa `modes` e fecha
- Salvar: `btn-gradient`, mostra Loader2 durante save

---

## 9. Hooks e Dependências

| Hook/Context | Uso |
|---|---|
| `useAuth()` | `user` (company_id) |
| `useSharedCompanyData()` | Dados, save, loading |
| `useAuditLog()` | logAction, userName, userCode |
| `useIsMobile()` | Detecção mobile (importado mas não usado ativamente na renderização) |

### Bibliotecas
- `date-fns` → `format()`
- `sonner` → `toast`
- `lucide-react` → ícones
- `@/lib/utils` → `cn()`

---

## 10. Tokens de Design Utilizados

| Token/Classe | Uso |
|---|---|
| `card-glass` | Todos os cards (summary + machine cards + observações) |
| `btn-gradient` | Botão Nova Máquina, Salvar no modal |
| `text-foreground` | Textos principais |
| `text-muted-foreground` | Labels, subtítulos |
| `font-display` | Títulos, números grandes, nome máquina |
| `border-border` | Separadores, bordas de cards |
| `bg-muted/50` | Background dos logs no relatório |
| `bg-muted/30` | Box de detalhes do artigo selecionado |
| `text-primary` | Nome de quem iniciou/finalizou logs, ícone wrench no modal |
| `text-destructive` | Botão excluir, contagem inativas |
| `text-emerald-500` | Contagem ativas, ícone ativa |
| `text-orange-500` | Contagem manutenções |
| `animate-fade-in` | Animação de entrada da página |

---

## 11. Responsividade

| Breakpoint | Comportamento |
|---|---|
| Mobile (< sm) | Header empilhado, cards 1 col, summary 2 cols, filtros wrap |
| sm (640px+) | Header lado a lado, cards 2 cols, summary 3 cols |
| lg (1024px+) | Cards 3 cols, summary 6 cols |

---

## 12. Auditoria

| Ação | Dados Registrados |
|---|---|
| `machine_create` | machine (nome), status |
| `machine_update` | machine, old_status, new_status |
| `machine_status_change` | machine, old_status, new_status |
| `machine_delete` | machine (nome) |

---

## 13. Fluxo de Status e Logs

1. Toda mudança de status gera um novo `MachineLog`
2. O log anterior (sem `ended_at`) é fechado automaticamente
3. Os logs registram quem iniciou e quem finalizou (nome + código)
4. O modal de manutenção (fullscreen) mostra o log ativo e permite adicionar observações
5. O relatório mostra todos os logs em ordem cronológica inversa
