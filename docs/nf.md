# 📄 NF.MD — Snapshot do Módulo de Notas Fiscais (Estado Atual v1)

> **⚠️ DOCUMENTO DE REVERSÃO:**
> Este arquivo documenta o estado 100% implementado do módulo de Notas Fiscais em 08/04/2026.
> Se a v2 (nfv2.md) der errado, reverter para este estado exato.
> Modelo de negócio: **Facção** — o cliente envia o fio, a malharia produz a malha e cobra por kg produzido.

---

## 📌 Visão Geral Implementada

### Arquivo principal: `src/pages/Invoices.tsx` (~1891 linhas)

### Abas implementadas (TabsList):
1. **Entrada** — NFs de fio recebido
2. **Saída** — NFs de malha entregue + Venda de Fio
3. **Saldo Fios** — Saldo por cliente/fio
4. **Saldo Global** — Saldo global por tipo de fio (todos os clientes)
5. **Estoque Malha** — Produção vs entregas por cliente/artigo
6. **Fio Terceiros** — Estoque de fio em facções terceirizadas
7. **Tipos de Fio** — CRUD de tipos de fio

### Tipos de NF (`InvoiceType`):
```typescript
type InvoiceType = 'entrada' | 'saida' | 'venda_fio';
```

### Status de NF (`InvoiceStatus`):
```typescript
type InvoiceStatus = 'pendente' | 'conferida' | 'cancelada';
```

### Labels:
```typescript
const TYPE_LABELS = { entrada: 'Entrada (Fio)', saida: 'Saída (Malha)', venda_fio: 'Venda de Fio' };
const STATUS_LABELS = { pendente: 'Pendente', conferida: 'Conferida', cancelada: 'Cancelada' };
const STATUS_COLORS = { pendente: 'bg-warning/10 text-warning', conferida: 'bg-success/10 text-success', cancelada: 'bg-destructive/10 text-destructive' };
```

---

## 📊 Tabelas do Banco de Dados

### `yarn_types`
| Campo | Tipo | Nullable | Default |
|-------|------|----------|---------|
| id | uuid (PK) | No | gen_random_uuid() |
| company_id | uuid | No | — |
| name | text | No | — |
| composition | text | Yes | — |
| color | text | Yes | — |
| observations | text | Yes | — |
| created_at | timestamptz | No | now() |

### `invoices`
| Campo | Tipo | Nullable | Default |
|-------|------|----------|---------|
| id | uuid (PK) | No | gen_random_uuid() |
| company_id | uuid | No | — |
| type | text | No | 'entrada' |
| invoice_number | text | No | — |
| access_key | text | Yes | — |
| client_id | uuid | Yes | — |
| client_name | text | Yes | — |
| buyer_name | text | Yes | — |
| destination_name | text | Yes | — |
| issue_date | text | No | — |
| total_weight_kg | numeric | No | 0 |
| total_value | numeric | Yes | 0 |
| status | text | No | 'pendente' |
| observations | text | Yes | — |
| created_by_name | text | Yes | — |
| created_by_code | text | Yes | — |
| created_at | timestamptz | No | now() |

### `invoice_items`
| Campo | Tipo | Nullable | Default |
|-------|------|----------|---------|
| id | uuid (PK) | No | gen_random_uuid() |
| invoice_id | uuid | No | — |
| company_id | uuid | No | — |
| yarn_type_id | uuid | Yes | — |
| yarn_type_name | text | Yes | — |
| article_id | uuid | Yes | — |
| article_name | text | Yes | — |
| weight_kg | numeric | No | 0 |
| quantity_rolls | numeric | Yes | 0 |
| quantity_boxes | numeric | Yes | 0 |
| value_per_kg | numeric | Yes | 0 |
| subtotal | numeric | Yes | 0 |
| observations | text | Yes | — |
| created_at | timestamptz | No | now() |

### `outsource_yarn_stock`
| Campo | Tipo | Nullable | Default |
|-------|------|----------|---------|
| id | uuid (PK) | No | gen_random_uuid() |
| company_id | uuid | No | — |
| outsource_company_id | uuid | No | — |
| yarn_type_id | uuid | No | — |
| quantity_kg | numeric | No | 0 |
| reference_month | text | No | — |
| observations | text | Yes | — |
| created_at | timestamptz | No | now() |
| updated_at | timestamptz | No | now() |

### RLS em todas as tabelas:
- `company_id = get_user_company_id()` para SELECT, INSERT, UPDATE, DELETE

---

## 🔧 Imports e Dependências

```typescript
import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// + shadcn components: Card, Button, Input, Label, Textarea, Select, Dialog, Table, Tabs, Badge, Collapsible
// + lucide icons: Plus, Trash2, Loader2, Search, FileText, Package, Scale, DollarSign, CalendarIcon, Eye, XCircle, Filter, ChevronDown, ChevronRight, Truck, Warehouse, Layers, Pencil, Building2
// + SearchableSelect, date-fns, DeleteConfirmDialog
```

### Helper de paginação:
```typescript
const sb = (table: string) => (supabase.from as any)(table);

async function fetchAllPaginated<T>(table: string, companyId: string, orderCol = 'created_at', ascending = true): Promise<T[]> {
  const PAGE = 1000;
  let all: T[] = []; let from = 0;
  while (true) {
    const { data, error } = await sb(table).select('*').eq('company_id', companyId)
      .order(orderCol, { ascending }).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
```

---

## 📡 Queries (React Query)

| Query Key | Tabela | Ordem | Notas |
|-----------|--------|-------|-------|
| `['yarn_types', companyId]` | yarn_types | name asc | Não paginado (simples select) |
| `['invoices', companyId]` | invoices | created_at desc | Paginado com fetchAllPaginated |
| `['invoice_items', companyId]` | invoice_items | created_at asc | Paginado |
| `['outsource_companies', companyId]` | outsource_companies | name asc | Não paginado (select id, name) |
| `['outsource_yarn_stock', companyId]` | outsource_yarn_stock | reference_month desc | Paginado |

### Dados do CompanyDataContext:
```typescript
const { getClients, getArticles, getProductions } = useSharedCompanyData();
const clients = getClients();
const articles = getArticles();
const productions = getProductions();
```

---

## 📱 Estado (State) Completo

### Filtros globais (Entrada/Saída):
```typescript
const [activeTab, setActiveTab] = useState('entrada');
const [searchTerm, setSearchTerm] = useState('');
const [filterStatus, setFilterStatus] = useState('all');
const [filterClient, setFilterClient] = useState('all');
const [filterMonth, setFilterMonth] = useState('all');
```

### Formulário NF:
```typescript
const [dialogOpen, setDialogOpen] = useState(false);
const [formType, setFormType] = useState<InvoiceType>('entrada');
const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
const [formAccessKey, setFormAccessKey] = useState('');  // temporariamente oculto
const [formClientId, setFormClientId] = useState('');
const [formIssueDate, setFormIssueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
const [formStatus, setFormStatus] = useState<InvoiceStatus>('pendente');
const [formObservations, setFormObservations] = useState('');
const [formItems, setFormItems] = useState<Array<{
  yarn_type_id?: string; article_id?: string;
  weight_kg: string; quantity_rolls: string; quantity_boxes: string; value_per_kg: string;
}>>([{ weight_kg: '', quantity_rolls: '', quantity_boxes: '', value_per_kg: '' }]);
```

### Formulário Tipo de Fio:
```typescript
const [yarnDialogOpen, setYarnDialogOpen] = useState(false);
const [yarnName, setYarnName] = useState('');
const [yarnComposition, setYarnComposition] = useState('');
const [yarnColor, setYarnColor] = useState('');
const [yarnObs, setYarnObs] = useState('');
const [editingYarn, setEditingYarn] = useState<YarnType | null>(null);
```

### Filtros Saldo Fios:
```typescript
const [saldoClient, setSaldoClient] = useState('all');
const [saldoYarn, setSaldoYarn] = useState('all');
const [saldoMonth, setSaldoMonth] = useState('all');
```

### Filtros Saldo Global:
```typescript
const [saldoGlobalMonth, setSaldoGlobalMonth] = useState('all');
const [saldoGlobalYarn, setSaldoGlobalYarn] = useState('all');
```

### Filtros Estoque Malha:
```typescript
const [estoqueClient, setEstoqueClient] = useState('all');
const [estoqueArticle, setEstoqueArticle] = useState('all');
const [estoqueMonth, setEstoqueMonth] = useState('all');
```

### Filtros/State Fio Terceiros:
```typescript
const [eftMonth, setEftMonth] = useState('all');
const [eftCompany, setEftCompany] = useState('all');
const [eftYarn, setEftYarn] = useState('all');
const [eftDialogOpen, setEftDialogOpen] = useState(false);
const [eftEditing, setEftEditing] = useState<any>(null);
const [eftFormCompany, setEftFormCompany] = useState('');
const [eftFormYarn, setEftFormYarn] = useState('');
const [eftFormMonth, setEftFormMonth] = useState(format(new Date(), 'yyyy-MM'));
const [eftFormQty, setEftFormQty] = useState('');
const [eftFormObs, setEftFormObs] = useState('');
```

### Modais de confirmação:
```typescript
const [cancelConfirmInvoice, setCancelConfirmInvoice] = useState<Invoice | null>(null);
const [deleteYarnConfirm, setDeleteYarnConfirm] = useState<YarnType | null>(null);
const [deleteEftConfirmId, setDeleteEftConfirmId] = useState<string | null>(null);
const [viewDialogOpen, setViewDialogOpen] = useState(false);
const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
```

---

## 📐 Lógica de Cálculos (useMemo)

### 1. availableMonths
- Coleta meses únicos de `invoices[].issue_date` (formato yyyy-MM)
- Sempre inclui o mês atual
- Ordenados desc

### 2. filteredInvoices
- Filtra por aba (`entrada` ou `saida`+`venda_fio`)
- Aplica filtros: status, client_id, mês (startsWith), busca textual (nº NF, cliente, chave)

### 3. KPIs (por aba)
- `count`: NFs ativas (não canceladas)
- `totalKg`: soma total_weight_kg
- `totalValue`: soma total_value
- `pendentes`: count status=pendente

### 4. yarnBalance (Saldo de Fios por cliente)
```
Recebido = Σ(kg invoice_items de NFs entrada, status ≠ cancelada)
Vendido  = Σ(kg invoice_items de NFs venda_fio, status ≠ cancelada)
Consumido = Σ(kg produção dos artigos cujo yarn_type_id = fio do cliente)
Saldo = Recebido - Vendido - Consumido
```
- Agrupado por client_id → yarn_type_id
- Filtros: saldoMonth, saldoClient, saldoYarn

### 5. yarnGlobalBalance (Saldo Global por tipo de fio)
```
Para cada yarn_type:
  purchaseMonth = Σ(kg NFs entrada no mês selecionado)
  consumedMonth = Σ(kg produções no mês via artigos vinculados)
  salesMonth = Σ(kg NFs venda_fio no mês)
  stockAccumulated = Σ(entradas acumuladas) - Σ(consumo acumulado) - Σ(vendas acumuladas) até o fim do mês
```
- Filtros: saldoGlobalMonth, saldoGlobalYarn

### 6. malhaEstoque (Estoque de Malha por cliente)
```
Para cada client_id + article_id:
  producedKg = Σ(weight_kg produções)
  producedRolls = Σ(rolls_produced produções)
  deliveredKg = Σ(weight_kg invoice_items de NFs saida, status ≠ cancelada)
  deliveredRolls = Σ(quantity_rolls invoice_items de NFs saida)
  stockKg = producedKg - deliveredKg
  stockRolls = producedRolls - deliveredRolls
```
- Filtros: estoqueMonth, estoqueClient, estoqueArticle

### 7. eftGroups (Fio Terceiros)
- Agrupa outsource_yarn_stock por outsource_company_id
- Resolve nomes via outsourceCompanies e yarnTypes
- Filtros: eftMonth, eftCompany, eftYarn

---

## 🎨 Layout e Estilos

### Header:
```tsx
<FileText className="h-6 w-6 text-primary" />
<h1 className="text-2xl font-bold text-foreground">Notas Fiscais</h1>
<p className="text-sm text-muted-foreground">Controle de entrada de fios e saída de malhas</p>
```

### Tabs:
```tsx
<TabsList className="w-full flex flex-wrap gap-1 h-auto sm:w-auto sm:inline-flex">
  // 7 triggers com className="text-xs"
</TabsList>
```

### KPIs (cards 2x2 ou 4 colunas):
```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  // Cards com <CardContent className="p-4">
  // Ícones h-3.5 w-3.5 + label text-xs text-muted-foreground
  // Valores text-xl font-bold text-foreground
</div>
```

### Filtros (dentro de Card):
```tsx
<Card><CardContent className="p-4">
  <div className="flex flex-wrap items-center gap-2">
    // Botões, Selects (h-8 text-xs, w-[140px] ou w-[120px])
    // Input de busca com ícone Search (w-[160px])
  </div>
</CardContent></Card>
```

### Tabela de NFs:
- Todas as cells com `text-xs`
- Header: Nº NF, Cliente, [Tipo se aba saida], Data, Peso (kg), [Valor se canSeeFinancial], Status, Ações
- Ações: Eye (ver), FileText/verde (conferir se pendente), XCircle/destructive (cancelar)
- Badges de status com STATUS_COLORS

### Saldo de Fios / Estoque de Malha:
- Collapsible cards agrupados por cliente, defaultOpen
- Header: ChevronDown + nome do cliente + resumo (Recebido/Saldo)
- Tabela interna com totais em `bg-muted/30 font-semibold`
- Valores negativos em `text-destructive` + Badge "Alerta"
- Valores positivos em `text-success`
- Zero em `text-muted-foreground`

### Saldo Global:
- Tabela simples (sem Collapsible)
- Colunas: Tipo de Fio, Compra (mês), Consumo (mês), Vendas (mês), Estoque Acumulado
- KPIs: Compra Mês, Estoque Total, Vendas Mês, Consumo Mês

### Fio Terceiros:
- Collapsible por facção (outsource_company)
- Colunas: Tipo de Fio, Quantidade, Mês Ref., Observações, [Ações se canSeeFinancial]
- Ações: Pencil (editar), Trash2 (excluir)

---

## 📝 Formulário Nova NF (Dialog)

```tsx
<Dialog>
  <DialogContent className="w-[95vw] sm:w-[80vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
```

### Campos:
1. **Cliente*** — Select com todos os clientes
2. **Nº da NF*** — Input text
3. **Data Emissão*** — Input type="date" com min/maxDate
4. **Chave de Acesso SEFAZ** — Input font-mono, 44 dígitos numéricos, opcional. Exibe contador (`N/44 dígitos`) e indicador `✓ Chave válida`. **Scanner automático:** listener global `keydown` (capture) detecta digitação rápida (<80ms) e preenche o campo automaticamente sem necessidade de foco — compatível com leitores USB HID (Zebra, Honeywell).
5. **Status** — Select (pendente/conferida)
6. **Observações** — Textarea

### Itens (dinâmicos):
- Botão "Adicionar Item" / "Remover" por linha
- **Se entrada ou venda_fio:**
  - Tipo de Fio (SearchableSelect com yarnTypes)
  - Quantidade (kg) — Input
  - Caixas — Input
  - Valor/kg — Input (se canSeeFinancial)
- **Se saída (malha):**
  - Artigo (SearchableSelect filtrado por cliente)
  - Quantidade (kg) — Input
  - Rolos — Input
  - Valor/kg — Input (auto do artigo, se canSeeFinancial)

### Subtotal:
- Exibido por item: `weight_kg × value_per_kg`
- Total da NF no rodapé

### Validações:
- Cliente obrigatório
- Nº NF obrigatório
- Data dentro dos limites (±5 anos)
- Ao menos 1 item válido (com fio/artigo + peso > 0)
- Chave de acesso: 44 dígitos numéricos (opcional, validado se preenchido)

---

## 🔄 Operações CRUD

### NF:
- **Criar**: insert em `invoices` + insert em `invoice_items`
- **Conferir**: update status → 'conferida'
- **Cancelar**: update status → 'cancelada' (com confirmação)
- **Visualizar**: Dialog read-only com itens

### Tipo de Fio:
- **Criar/Editar**: insert/update em `yarn_types`
- **Excluir**: delete com confirmação (DeleteConfirmDialog)

### Fio Terceiros:
- **Criar**: upsert em `outsource_yarn_stock` (onConflict: company_id, outsource_company_id, yarn_type_id, reference_month)
- **Editar**: update quantity_kg + observations
- **Excluir**: delete com confirmação

### Audit Log:
- `invoice_create`, `invoice_cancel`, `invoice_confirm`
- `yarn_type_create`, `yarn_type_update`, `yarn_type_delete`
- `outsource_yarn_stock_create`, `outsource_yarn_stock_update`, `outsource_yarn_stock_delete`

---

## 🔒 Permissões

- `canSeeFinancial` — controla visibilidade de:
  - Coluna Valor na tabela de NFs
  - Campos valor/kg e subtotal nos itens
  - KPI "Valor Total"
  - Botões de ação no Fio Terceiros

---

## ⚠️ Notas Importantes

1. **Chave de Acesso SEFAZ** está **ativa** no formulário com campo visível, validação de 44 dígitos e detecção automática de leitura por scanner USB (HID). Listener global `keydown` detecta digitação rápida (<80ms entre teclas) e preenche o campo automaticamente.
2. **Venda de Fio NÃO tem campo "Cliente comprador"** — registra apenas o cliente dono do fio que está sendo vendido.
3. **Saída de Malha** (tipo `saida`) registra malha entregue ao cliente, sem distinção de destino (tinturaria, etc.).
4. **Estoque de Malha** calcula: Produção - NFs Saída = Estoque, sem campo de destino.
5. O formulário de NF mantém o modal aberto no Fio Terceiros após salvar (resetando apenas fio/qty/obs).

---

*Documento de reversão criado em: 08/04/2026*
*Corresponde ao estado v1 do módulo de Notas Fiscais*
*Status: ✅ ATIVO — Estado atual do sistema para TODOS os usuários*
*Nota: Colunas `buyer_name` e `destination_name` existem no banco (adicionadas durante NFv2) mas não são usadas na UI v1.*
