# 📋 AUDITORIA.MD — Sistema de Auditoria e Histórico de Ações do MalhaGest

> **Status:** ✅ **Em Produção** — sistema de auditoria ativo em todos os módulos com CRUD


> **⚠️ REGRA OBRIGATÓRIA PARA A IA (LOVABLE):**
> Toda nova funcionalidade implementada no sistema **DEVE** incluir chamadas de auditoria (`logAction`) para **TODAS** as operações de criação, edição e exclusão. **NÃO é opcional.** Esta regra está documentada também no `mestre.md`.

---

## 📌 Visão Geral

O sistema de auditoria registra **todas as ações** realizadas por qualquer usuário no sistema, permitindo rastreabilidade completa. O histórico é acessível **apenas pelo administrador principal (#1)** via modal na aba Usuários das Configurações.

O modal de histórico possui **duas abas:**
1. **Ações** — Registro de todas as operações CRUD do sistema
2. **Logins** — Histórico de acessos com IP, dispositivo, navegador e localização

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

### Tabela `login_history`

```sql
CREATE TABLE public.login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id),
  user_id UUID NOT NULL,
  user_name TEXT,
  user_code TEXT,
  user_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,         -- Desktop, Mobile, Tablet
  browser TEXT,             -- Chrome, Firefox, Safari, Edge, Opera
  os TEXT,                  -- Windows, macOS, Linux, Android, iOS
  location_country TEXT,    -- País (via ipapi.co)
  location_city TEXT,       -- Cidade (via ipapi.co)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS:** Insert e Select por `company_id = get_user_company_id()`. Sem UPDATE ou DELETE (logs são imutáveis).

### Arquivos do Sistema

| Arquivo | Função |
|---------|--------|
| `src/hooks/useAuditLog.ts` | Hook React — fornece `logAction()`, `userName`, `userCode`, `userTrackingInfo` |
| `src/lib/auditLog.ts` | Função standalone `logAudit()` para uso fora de componentes React |
| `src/lib/loginTracker.ts` | Função `trackLogin()` — captura IP, dispositivo, navegador, OS e localização |
| `src/components/AuditHistoryModal.tsx` | Modal com abas Ações + Logins |

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

### Função `trackLogin()`

```typescript
import { trackLogin } from '@/lib/loginTracker';

trackLogin({
  companyId: user.company_id,
  userId: user.id,
  userName: user.name,
  userCode: user.code,
  userRole: user.role,
});
```

**Chamada automaticamente** no `AuthContext.tsx` após `SIGNED_IN` (apenas uma vez por sessão via `loginTrackedRef`).

**Dados capturados:**
| Dado | Origem |
|------|--------|
| IP público | `api.ipify.org` |
| Geolocalização (país, cidade) | `ipapi.co/{ip}/json/` |
| Dispositivo (Desktop/Mobile/Tablet) | `navigator.userAgent` (regex) |
| Navegador (Chrome/Firefox/Safari/Edge) | `navigator.userAgent` (regex) |
| Sistema operacional (Windows/macOS/Linux/Android/iOS) | `navigator.userAgent` (regex) |

**Nota:** As chamadas de IP e geolocalização são best-effort (timeout 3s). Se falharem, os campos ficam vazios sem impactar o login.

---

## 🖥️ Modal de Histórico (AuditHistoryModal)

### Acesso
- **Localização:** Aba Usuários em Configurações
- **Visibilidade:** Apenas admin #1 (código === '1')
- **Botão:** "Histórico" ao lado de "Novo Usuário"

### Aba Ações

**Melhorias visuais implementadas:**
1. **Ícones por tipo de ação** — Cada ação tem ícone e cor distintos:
   - 🟢 Criação (`_create`, `_add`) → ícone `+` verde
   - 🔵 Edição (`_update`, `_change`, `_confirm`) → ícone lápis azul
   - 🔴 Exclusão (`_delete`, `_cancel`) → ícone lixeira vermelho
   - 🟡 Desativação (`_deactivate`) → ícone `X` amarelo
2. **Badge do módulo** — Cada registro exibe um badge colorido do módulo (Máquinas, Produção, Revisão, etc.)
3. **Agrupamento por dia** — Registros agrupados com separadores visuais ("Hoje", "Ontem", "09 de abril de 2026")
4. **Filtro por módulo** — Select com todos os módulos do sistema
5. **Detalhes expandíveis** — Clique na seta para ver `details` formatados

**Filtros:**
- Por usuário (Select)
- Por módulo (Select: Máquinas, Produção, Revisão, Usuários, Artigos, Tecelões, NF (Entrada/Venda/Saída Malha/Tipos de Fio/Fio Terceiros), Contas, Resíduos, Terceirizados, Configurações)
- Por tipo de ação (Select com ações disponíveis)
- Por período (De/Até com inputs date)
- Busca textual (por nome, ação ou detalhes)

### Aba Logins

**Funcionalidades:**
- Lista de logins agrupados por dia
- Filtro por usuário
- Cada registro exibe:
  - Nome + código + role do usuário
  - Horário do login
  - Ícone de dispositivo (Desktop/Mobile/Tablet)
  - Navegador + sistema operacional
  - Endereço IP
  - Localização (cidade, país) com ícone de pin
- Paginação: blocos de 50 registros

---

## 📊 Cobertura Atual de Auditoria por Módulo

### ✅ Módulos COM auditoria implementada

| Módulo | Arquivo | Ações auditadas |
|--------|---------|-----------------|
| **Máquinas** | `Machines.tsx` | `machine_create`, `machine_update`, `machine_status_change`, `machine_delete` |
| **Produção** | `Production.tsx` | `production_create`, `production_update` |
| **Revisão** | `Revision.tsx` | `defect_create`, `defect_delete`, `defect_update` |
| **Mecânica** | `Mecanica.tsx` | `maintenance_manual_add` |
| **Clientes & Artigos** | `ClientsArticles.tsx` | `client_create`, `client_update`, `client_delete`, `article_create`, `article_update`, `article_delete` |
| **Tecelões** | `Weavers.tsx` | `weaver_create`, `weaver_update`, `weaver_delete` |
| **Contas a Pagar** | `AccountsPayable.tsx` | `account_create`, `account_update`, `account_delete`, `account_pay` |
| **Configurações** | `Settings.tsx` | `user_create`, `user_update`, `user_delete`, `user_deactivate`, `user_reactivate`, `user_password_change`, `user_permissions_update` |
| **Terceirizados** | `Outsource.tsx` | `outsource_company_create`, `outsource_company_update`, `outsource_company_delete`, `outsource_production_create`, `outsource_production_delete` |
| **Resíduos** | `ResidueSales.tsx` | `residue_material_create`, `residue_material_update`, `residue_material_delete`, `residue_sale_create`, `residue_sale_update`, `residue_sale_delete` |
| **Notas Fiscais** | `Invoices.tsx` | `invoice_create` (Entrada de Fio, Venda de Fio, Saída Malha), `invoice_confirm`, `invoice_cancel`, `yarn_type_create`, `yarn_type_update`, `yarn_type_delete`, `outsource_yarn_stock_create`, `outsource_yarn_stock_update`, `outsource_yarn_stock_delete` |

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
defect_update           → Falha editada
defect_delete           → Falha excluída
maintenance_manual_add  → Manutenção adicionada
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

// invoice_create (entrada)
{ "invoice_number": "NF-001", "type": "entrada", "client": "Fornecedor XYZ", "total_weight_kg": 500 }

// invoice_create (venda_fio)
{ "invoice_number": "NF-002", "type": "venda_fio", "client": "Cliente ABC", "total_weight_kg": 200 }

// invoice_create (saida / saída malha)
{ "invoice_number": "NF-003", "type": "saida", "client": "Tinturaria ABC", "total_weight_kg": 300 }

// invoice_cancel
{ "invoice_number": "NF-001", "client": "Fornecedor XYZ" }

// invoice_confirm
{ "invoice_number": "NF-001", "client": "Fornecedor XYZ" }

// yarn_type_create / yarn_type_update
{ "name": "Algodão 30/1" }

// yarn_type_delete
{ "name": "Algodão 30/1" }

// outsource_yarn_stock_create / outsource_yarn_stock_update
{ "company": "Malharia ABC", "yarn": "Algodão 30/1", "month": "2026-04", "qty": 500 }

// outsource_yarn_stock_delete
{ "company": "Malharia ABC", "month": "2026-04" }
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

### ⚠️ REGRA DE EXIBIÇÃO OBRIGATÓRIA

> **TODA listagem/tabela de registros que possua `created_by_name`/`created_by_code` DEVE exibir:**
>
> 1. **Quem registrou:** `NomeUsuário #Código` (ex: "João #1") — coluna "Registrado por" ou inline na célula de data
> 2. **Data e hora do registro:** formato `dd/MM/yyyy HH:mm` ou `dd/MM HH:mm` (compacto)
> 3. **Formato padrão:** `{created_by_name}{created_by_code ? ` #${created_by_code}` : ''}` 
>
> **Verificação obrigatória:** Ao criar ou alterar qualquer módulo, verificar se TODAS as tabelas/listagens exibem corretamente autoria + data/hora. Se não exibem, adicionar.
>
> **Módulos que DEVEM exibir autoria na listagem:**
> | Módulo | Status | Formato |
> |--------|--------|---------|
> | Produção | ✅ | Inline: `por Nome #ID` na descrição |
> | Revisão | ✅ | Coluna dedicada `Nome #ID` |
> | Terceirizados | ✅ | Abaixo da data: `Nome #ID` |
> | Resíduos | ✅ | Abaixo da hora: `Nome #ID` |
> | Notas Fiscais | ✅ | Coluna "Registrado por" com `Nome #ID` + data/hora compacta |

---

*Última atualização: 14/04/2026 22:30 (Brasília)*
