# ⚙️ Configurações — Documentação Completa

> **Status:** ✅ **Em Produção** — configurações de perfil, usuários, empresa e planos


> Módulo de configurações da empresa (`src/pages/Settings.tsx` — ~1772 linhas)

---

## 📌 Visão Geral

O módulo **Configurações** é o maior arquivo do sistema, gerenciando empresa, usuários, turnos, assinatura, dispositivos IoT e painéis TV.

- **Rota:** `/:slug/settings`
- **Acesso:** Todos os roles (com restrições por aba)
- **Arquivo:** `src/pages/Settings.tsx`
- **Componentes auxiliares:** `ProductionModeModal.tsx`, `IotDevicesManager.tsx`, `SettingsTelasTab.tsx`, `AuditHistoryModal.tsx`

---

## 🏗️ Estrutura de Abas

| Aba | Ícone | Acesso | Descrição |
|-----|-------|--------|-----------|
| Empresa | Building2 | admin | Logo, dados, QR Code |
| Usuários | Users | admin | CRUD de usuários, permissões, histórico |
| Turnos | Clock | admin | Horários dos 3 turnos |
| Assinatura | CreditCard | admin | Status, pagamento Pix/Cartão |
| Dispositivos | Monitor | admin | IoT (ESP32) + Painéis TV |
| Meu Perfil | User | todos | Nome, email, senha |

---

## 👤 Aba Empresa

### Funcionalidades
- **Logo:** Upload de imagem (storage bucket `company-logos`)
- **QR Code:** Gerado com URL de acesso da empresa (`malhagest.site/{slug}`)
- **Modo de Produção:** Modal para configurar rolos/voltas/IoT por máquina

---

## 👥 Aba Usuários

### Roles Disponíveis
| Role | Label | Cor | Acesso |
|------|-------|-----|--------|
| admin | Administrador | red | Total |
| lider | Líder | blue | Máquinas, Clientes, Revisão, Mecânica, Tecelões |
| mecanico | Mecânico | orange | Máquinas, Mecânica |
| revisador | Revisador | green | Revisão |

### Regras de IDs
- **#1:** Administrador principal (criador da empresa) — autoridade absoluta
- **#2 a #50:** Reservados para administradores secundários
- **#100+:** Tecelões e outros usuários

### Restrições por Role
- **Admin #1:** Único que pode ver/usar botão "Editar" na listagem, acessar "Histórico de Ações", editar nome/email/senha de outros
- **Admins secundários (#2-#50):** Não podem editar nome ou email em "Meu Perfil" (apenas senha), não podem agir contra #1 ou outros admins
- **Outros roles:** Apenas "Meu Perfil" com alteração de senha

### CRUD de Usuários (Edge Function `manage-users`)
- **Criar:** Nome + Role obrigatório. Se admin → email global único + senha
- **Editar:** Nome, role (role admin é imutável após criação)
- **Excluir:** Via Edge Function (remove perfil + auth user)
- **Desativar/Reativar:** Altera `status` do perfil. Bloqueio em tempo real via Realtime

### Permissões Granulares (Override)
- `permission_overrides` — array de strings adicionais
- `OVERRIDE_PERMISSIONS` — lista de permissões extras concedíveis
- Gerenciadas no modal de edição pelo admin #1

### Histórico de Ações (AuditHistoryModal)
- **Acesso:** Exclusivo admin #1 (code === '1')
- Botão "Histórico" ao lado de "Novo Usuário"
- Modal com filtros: usuário, período, tipo de ação
- Listagem paginada de `audit_logs`

---

## ⏰ Aba Turnos

### Campos (6 inputs de hora)
| Campo | Default |
|-------|---------|
| Manhã início | 05:00 |
| Manhã fim | 13:30 |
| Tarde início | 13:30 |
| Tarde fim | 22:00 |
| Noite início | 22:00 |
| Noite fim | 05:00 |

- Salvos em `company_settings` via `saveShiftSettings()`
- Impactam cálculo de eficiência em toda a plataforma

---

## 💳 Aba Assinatura

### Status Possíveis
| Status | Badge | Comportamento |
|--------|-------|---------------|
| free | "Acesso Gratuito" | Sem restrições |
| trial | "Teste X dias" | Countdown |
| active | "Assinatura Ativa" | Normal |
| cancelling | "Assinatura Cancelada" | Até fim do período |
| grace | "Em Atraso" | 5 dias de carência |
| overdue/blocked/cancelled | "Bloqueado" | Sidebar com cadeados |

### Pagamento
- **Pix:** QR Code via SyncPayments, polling a cada 5s
- **Cartão:** Checkout Stripe, até 12x no anual
- **Plano anual:** 40% desconto

---

## 🔗 Dependências

### Edge Functions
| Função | Uso |
|--------|-----|
| `manage-users` | Criar/editar/excluir usuários |
| `update-user-email` | Alterar email com histórico |
| `create-checkout` | Checkout Stripe |
| `create-pix-checkout` | Checkout Pix |
| `check-pix-payment` | Verificar pagamento Pix |
| `customer-portal` | Portal Stripe |

### Hooks
- `useAuth()` — user, logout
- `useSharedCompanyData()` — machines, shiftSettings, saveShiftSettings
- `usePermissions()` — canSeeFinancial, OVERRIDE_PERMISSIONS
- `useAuditLog()` — logAction

---

## 📝 Auditoria

| Ação | Dados |
|------|-------|
| `user_create` | name, email, role, code |
| `user_update` | name, role, changes |
| `user_delete` | name, code |
| `user_deactivate` | name, code |
| `user_reactivate` | name, code |
| `user_password_change` | name (target) |
| `user_permissions_update` | name, permissions |
| `shift_settings_update` | turnos |
| `company_logo_update` | — |
| `production_mode_change` | machines affected |

---

*Última atualização: 09/04/2026*
