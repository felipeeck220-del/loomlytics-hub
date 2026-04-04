# 📋 AUDITORIA.MD — Sistema de Auditoria e Histórico de Ações do MalhaGest

> **⚠️ REGRA OBRIGATÓRIA PARA A IA (LOVABLE):**
> Toda nova funcionalidade implementada no sistema **DEVE** incluir chamadas de auditoria (`logAction`) para **TODAS** as operações de criação, edição e exclusão. **NÃO é opcional.** Esta regra está documentada também no `mestre.md`.

---

## 📌 Visão Geral

O sistema de auditoria registra **todas as ações** realizadas por qualquer usuário no sistema, permitindo rastreabilidade completa. O histórico é acessível **apenas pelo administrador principal (#1)** via modal na aba Usuários das Configurações.

---

## 🏗️ Arquitetura

### Tabela `audit_logs`

```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID,
  user_name TEXT,
  user_role TEXT,
  user_code TEXT,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS:** Insert e Select por `company_id = get_user_company_id()`. Sem UPDATE ou DELETE (logs são imutáveis).

### Arquivos do Sistema

| Arquivo | Função |
|---------|--------|
| `src/hooks/useAuditLog.ts` | Hook React — fornece `logAction()`, `userName`, `userCode`, `userTrackingInfo` |
| `src/lib/auditLog.ts` | Função standalone `logAudit()` para uso fora de componentes React |

### Hook `useAuditLog()`

```typescript
const { logAction, userName, userCode, userTrackingInfo } = useAuditLog();

// Registrar ação
logAction('production_create', { machine: 'TEAR 01', date: '2026-04-04', shift: 'manha' });

// Campos de autoria para insert
const record = {
  ...data,
  created_by_name: userTrackingInfo.created_by_name,
  created_by_code: userTrackingInfo.created_by_code,
};
```

**Retorno:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `logAction(action, details?)` | function | Insere registro em `audit_logs` |
| `userName` | string \| null | Nome do usuário logado |
| `userCode` | string \| null | Código (#1, #2, #165, etc.) |
| `userTrackingInfo` | object | `{ created_by_name, created_by_code }` para insert em tabelas |

---

## 📊 Cobertura Atual de Auditoria por Módulo

### ✅ Módulos COM auditoria implementada

| Módulo | Arquivo | Ações auditadas |
|--------|---------|-----------------|
| **Máquinas** | `Machines.tsx` | `machine_create`, `machine_update`, `machine_status_change`, `machine_delete` |
| **Produção** | `Production.tsx` | `production_create`, `production_update` |
| **Revisão** | `Revision.tsx` | `defect_create`, `defect_delete` |
| **Mecânica** | `Mecanica.tsx` | `maintenance_manual_add` |
| **Clientes & Artigos** | `ClientsArticles.tsx` | `client_create`, `client_update`, `client_delete`, `article_create`, `article_update`, `article_delete` |
| **Tecelões** | `Weavers.tsx` | `weaver_create`, `weaver_update`, `weaver_delete` |
| **Contas a Pagar** | `AccountsPayable.tsx` | `account_create`, `account_update`, `account_delete`, `account_pay` |
| **Configurações** | `Settings.tsx` | `user_create`, `user_update`, `user_delete`, `user_deactivate`, `user_reactivate`, `user_password_change`, `user_permissions_update` |
| **Terceirizados** | `Outsource.tsx` | `outsource_company_create`, `outsource_company_update`, `outsource_company_delete`, `outsource_production_create`, `outsource_production_delete` |
| **Resíduos** | `ResidueSales.tsx` | `residue_material_create`, `residue_material_update`, `residue_material_delete`, `residue_sale_create`, `residue_sale_delete` |
| **Notas Fiscais** | `Invoices.tsx` | `invoice_create`, `invoice_confirm`, `invoice_cancel`, `yarn_type_create`, `yarn_type_update`, `yarn_type_delete`, `outsource_yarn_stock_create`, `outsource_yarn_stock_update`, `outsource_yarn_stock_delete` |

### ❌ Módulos SEM auditoria (pendente)

| Módulo | Arquivo | Ações que DEVEM ser auditadas |
|--------|---------|-------------------------------|
| **Configurações** | `Settings.tsx` | `shift_settings_update`, `company_logo_update`, `production_mode_change` (falta `logAction` explícito) |

---

## 📝 Convenção de Nomes de Ações

### Formato: `{modulo}_{operacao}`

**Operações padrão:**
- `_create` — Criação de registro
- `_update` — Edição de registro
- `_delete` — Exclusão de registro
- `_status_change` — Mudança de status

**Exemplos:**
```
machine_create          → Máquina criada
machine_update          → Máquina editada
machine_status_change   → Status da máquina alterado
machine_delete          → Máquina excluída
production_create       → Produção registrada
production_update       → Produção editada
production_delete       → Produção excluída
defect_create           → Falha registrada
defect_delete           → Falha excluída
user_create             → Usuário criado
user_update             → Usuário editado (nome, role)
user_delete             → Usuário excluído
user_deactivate         → Usuário desativado
user_reactivate         → Usuário reativado
user_password_change    → Senha alterada
user_permissions_update → Permissões alteradas
client_create           → Cliente criado
client_update           → Cliente editado
client_delete           → Cliente excluído
article_create          → Artigo criado
article_update          → Artigo editado
article_delete          → Artigo excluído
weaver_create           → Tecelão criado
weaver_update           → Tecelão editado
weaver_delete           → Tecelão excluído
invoice_create          → NF criada
invoice_confirm         → NF conferida
invoice_cancel          → NF cancelada
account_create          → Conta criada
account_pay             → Conta paga
account_delete          → Conta excluída
residue_sale_create     → Venda de resíduo registrada
residue_sale_delete     → Venda de resíduo excluída
outsource_production_create  → Produção terceirizada registrada
outsource_production_delete  → Produção terceirizada excluída
shift_settings_update   → Turnos alterados
company_logo_update     → Logo da empresa atualizada
production_mode_change  → Modo de produção alterado
```

---

## 📋 Estrutura do Campo `details` (JSONB)

O campo `details` deve conter informações relevantes para entender O QUE foi feito. Exemplos:

```json
// machine_status_change
{ "machine": "TEAR 05", "old_status": "ativa", "new_status": "manutencao_preventiva" }

// production_create
{ "machine": "TEAR 01", "date": "2026-04-04", "shift": "manha", "rolls": 5, "weight_kg": 120 }

// user_create
{ "name": "João Silva", "email": "joao@email.com", "role": "lider", "code": "165" }

// user_deactivate
{ "name": "João Silva", "code": "165" }

// article_update
{ "article": "PIQUET 30/1", "changes": { "weight_per_roll": { "old": 18, "new": 20 } } }

// invoice_create
{ "invoice_number": "NF-001", "type": "entrada", "client": "Cliente XYZ", "weight_kg": 500 }
```

---

## 🔐 Modal de Histórico (a implementar)

### Acesso
- **Localização:** Aba Usuários em Configurações
- **Visibilidade:** Apenas admin #1 (código === '1')
- **Botão:** "Histórico" ao lado de "Novo Usuário"

### Funcionalidades do Modal
1. **Listagem** de `audit_logs` ordenada por `created_at DESC`
2. **Filtros:**
   - Por usuário (Select com todos os usuários da empresa)
   - Por período (De/Até com calendário)
   - Por tipo de ação (Select com ações disponíveis)
   - Busca textual (por detalhes)
3. **Cada linha exibe:**
   - Data/hora (formato `dd/MM/yyyy HH:mm`)
   - Quem fez: `Nome #código` (ex: "Felipe #1")
   - Role do usuário (badge colorido)
   - Ação (traduzida para português)
   - Detalhes (expandível)
4. **Paginação:** Carregar em blocos de 50 registros

### Tradução de Ações para Exibição

```typescript
const ACTION_LABELS: Record<string, string> = {
  machine_create: 'Máquina criada',
  machine_update: 'Máquina editada',
  machine_status_change: 'Status da máquina alterado',
  machine_delete: 'Máquina excluída',
  production_create: 'Produção registrada',
  production_update: 'Produção editada',
  production_delete: 'Produção excluída',
  defect_create: 'Falha registrada',
  defect_delete: 'Falha excluída',
  maintenance_manual_add: 'Manutenção adicionada',
  user_create: 'Usuário criado',
  user_update: 'Usuário editado',
  user_delete: 'Usuário excluído',
  user_deactivate: 'Usuário desativado',
  user_reactivate: 'Usuário reativado',
  user_password_change: 'Senha alterada',
  user_permissions_update: 'Permissões alteradas',
  client_create: 'Cliente criado',
  client_update: 'Cliente editado',
  client_delete: 'Cliente excluído',
  article_create: 'Artigo criado',
  article_update: 'Artigo editado',
  article_delete: 'Artigo excluído',
  weaver_create: 'Tecelão criado',
  weaver_update: 'Tecelão editado',
  weaver_delete: 'Tecelão excluído',
  invoice_create: 'NF criada',
  invoice_confirm: 'NF conferida',
  invoice_cancel: 'NF cancelada',
  account_create: 'Conta criada',
  account_pay: 'Conta paga',
  account_delete: 'Conta excluída',
  residue_material_create: 'Material criado',
  residue_material_delete: 'Material excluído',
  residue_sale_create: 'Venda de resíduo registrada',
  residue_sale_delete: 'Venda de resíduo excluída',
  outsource_company_create: 'Malharia terceirizada criada',
  outsource_company_delete: 'Malharia terceirizada excluída',
  outsource_production_create: 'Produção terceirizada registrada',
  outsource_production_delete: 'Produção terceirizada excluída',
  yarn_type_create: 'Tipo de fio criado',
  yarn_type_update: 'Tipo de fio editado',
  yarn_type_delete: 'Tipo de fio excluído',
  shift_settings_update: 'Turnos alterados',
  company_logo_update: 'Logo atualizada',
  production_mode_change: 'Modo de produção alterado',
};
```

---

## ⚠️ REGRA OBRIGATÓRIA PARA NOVAS FUNCIONALIDADES

> **TODA nova funcionalidade implementada no MalhaGest DEVE incluir:**
>
> 1. **Importar `useAuditLog`** no componente:
>    ```typescript
>    import { useAuditLog } from '@/hooks/useAuditLog';
>    const { logAction, userName, userCode, userTrackingInfo } = useAuditLog();
>    ```
>
> 2. **Chamar `logAction()`** em TODA operação de:
>    - **Criação** (`_create`)
>    - **Edição** (`_update`)
>    - **Exclusão** (`_delete`)
>    - **Mudança de status** (`_status_change`)
>
> 3. **Incluir `details`** com informações relevantes (nome do item, valores alterados, etc.)
>
> 4. **Seguir a convenção de nomes:** `{modulo}_{operacao}`
>
> 5. **Se a tabela tiver colunas `created_by_name`/`created_by_code`**, usar `userTrackingInfo`:
>    ```typescript
>    const record = { ...data, ...userTrackingInfo };
>    ```
>
> 6. **Adicionar as novas ações** à lista `ACTION_LABELS` neste documento
>
> 7. **Atualizar a seção de cobertura** neste documento movendo o módulo de "❌ Pendente" para "✅ Implementado"

---

## 🔄 Campos de Autoria (`created_by`)

Além do `audit_logs`, algumas tabelas possuem colunas de autoria direta:

| Tabela | Colunas |
|--------|---------|
| `productions` | `created_by_name`, `created_by_code` |
| `defect_records` | `created_by_name`, `created_by_code` |
| `outsource_productions` | `created_by_name`, `created_by_code` |
| `residue_sales` | `created_by_name`, `created_by_code` |
| `invoices` | `created_by_name`, `created_by_code` |

**Regra:** Novas tabelas que registram transações (produção, vendas, NFs) DEVEM incluir `created_by_name TEXT` e `created_by_code TEXT` com valores preenchidos via `userTrackingInfo`.

---

*Última atualização: 04/04/2026 04:30 (Brasília)*
