# ⚙️ Settings.tsx — Documentação Técnica 100% Completa

> **Status:** ✅ **Em Produção**
> **Arquivo:** `src/pages/Settings.tsx` (~1.895 linhas — maior página do sistema)
> **Rota:** `/:slug/settings`
> **Última revisão do documento:** 19/07/2026 (aderente ao código atual)

---

## 1. Propósito

Centralizar toda a autogestão da empresa multi-tenant:

1. **Meu Perfil** — edição de nome/email/senha do próprio usuário logado.
2. **Usuários** (admin) — CRUD completo de perfis, controle de status, permissões extras, histórico de auditoria.
3. **Empresa** (admin) — identidade (nome, logo), turnos de trabalho, modo de registro de produção por máquina, dispositivos IoT (ESP32) e painéis TV.
4. **Telas** (admin) — pareamento de TVs (🔒 marcada "Em breve" na `TabsList`; conteúdo continua renderizado por `SettingsTelasTab` quando o gate for removido).
5. **Planos** — status da assinatura, geração de Pix, cancelamento, histórico de pagamentos.

---

## 2. Permissões e visibilidade

| Aba | Condição | Observações |
|-----|----------|-------------|
| `profile` | Todos | Somente admin `#1` pode alterar nome/email; demais admins/usuários só alteram senha. |
| `users` | `isAdmin` (`user.role === 'admin'`) | Botões de edição/senha/desativar/excluir só aparecem para admin `#1` (`profile.code === '1'`). |
| `company` | `isAdmin` para editar; leitura permitida | Nome, logo, turnos, Modo de Produção e IoT restritos a admin. |
| `telas` | `isAdmin` + `disabled` (badge "Breve") | Renderiza `SettingsTelasTab` quando destravado. |
| `plans` | Todos | Única aba habilitada quando `sidebarLocked === true` (assinatura suspensa/bloqueada). |

`sidebarLocked` (vindo de `useSubscription()`) força `tab='plans'` via `useEffect` e desabilita todas as outras `TabsTrigger` com `Lock` icon + `opacity-40 cursor-not-allowed`. O `onValueChange` do `Tabs` ignora mudanças enquanto `sidebarLocked`.

### Regras de admin #1 (intocável)

- `currentUserProfile = profiles.find(pr => pr.user_id === user?.id)`, `isCurrentUserMainAdmin = currentUserProfile?.code === '1'`.
- Apenas o admin `#1` vê **Editar**, **Alterar Senha**, **Desativar/Reativar**, **Excluir** e **Permissões** na lista de usuários.
- `handleSaveUser` só envia `email`/`password` quando o chamador é `#1`.
- Botão **Histórico** (abre `AuditHistoryModal`) só aparece para o `#1`.
- Restrição espelhada server-side em `manage-users` (defesa em profundidade).

---

## 3. Modelo de dados consumido

### 3.1. Tabelas / storage

| Recurso | Operações | Uso |
|---------|-----------|-----|
| `profiles` | SELECT `.order('created_at')`, UPDATE nome próprio | Lista de usuários (RLS por `get_user_company_id()`). |
| `companies` | SELECT `.eq('id', user.company_id).single()`, UPDATE `name`/`logo_url` | Identidade da empresa. |
| `platform_settings` | SELECT `key,value` | Lê `monthly_price` (default `147.00`). |
| `company_settings` | SELECT `monthly_plan_value`, UPDATE `subscription_status`+`grace_period_end` | Preço custom e cancelamento. |
| `payment_history` | SELECT `.order('created_at' desc).limit(20)` | Último pagamento + modal "Ver todos". |
| Storage `company-logos` | `upload(path, upsert:true)`, `remove`, `list`, `getPublicUrl` | Path `${company_id}/logo.${ext}` (máx 2 MB). Cache-buster `?t=Date.now()` na URL salva em `companies.logo_url`. |

### 3.2. Edge Functions invocadas

| Função | Ações | Contexto |
|--------|-------|----------|
| `manage-users` | `check_email` (debounce 600 ms), `create`, `update` (name/role/email/password/status), `change_password`, `update_permissions`, `delete` | Valida JWT via `getClaims`, exige `caller.role='admin'`, gera código sequencial `#2-#50` (admin) ou aleatório `#100-#999` (outros) evitando colisão com `weavers.code`. |
| `update-user-email` | `{ new_email, password }` | Verifica senha e troca email em `auth.users`. |
| `check-subscription` | Header `Authorization: Bearer <token>` | Retorna `{ status, days_left, trial_end, ... }`. |
| `create-pix-checkout` | `{ plan: 'monthly' | 'annual' }` | Devolve `{ pix_code, identifier, amount, plan_name }` e dispara `fbTrack('InitiateCheckout')`. |
| `check-pix-payment` | `{ identifier }` | Chamada a cada 5 s (`pixPollRef`); em `paid` dispara `fbTrack('Purchase')` + `subscription-updated`. |

### 3.3. Contextos e hooks locais

- `useAuth()` — `user`, `logout`.
- `useSharedCompanyData()` — `shiftSettings`, `saveShiftSettings`, `getMachines`, `saveMachines`.
- `useAuditLog()` — `logAction(action, details)` grava em `audit_logs` (autoria `Nome #Código`).
- `useSubscription()` — `sidebarLocked` (trava tudo exceto Planos).
- `usePermissions()` — importa `OVERRIDE_PERMISSIONS` (`financial`, `dashboard`, `production`, `reports`, `outsource`).

---

## 4. Estrutura de código (top-level)

```
ROLE_PERMISSIONS map           → matriz Allowed/Denied por role
RolePermissionsDisplay         → grid 1/2 col; badges verdes (allowed) e cinzas riscados (denied)
ROLES array (9 roles)          → value/label/description/color
PERMISSIONS array              → legado, não usado atualmente
SettingsPage() (default export)
  ├─ ~35 useState
  ├─ 4 refs: emailCheckTimer, logoInputRef, pixPollRef, (input file)
  ├─ 4 useEffect
  ├─ 15 handlers async
  └─ JSX: Header + Tabs (5 TabsContent) + 7 Dialogs/AlertDialogs
```

### 4.1. `ROLES` (9 papéis)

| value | label | Cor | Descrição |
|-------|-------|-----|-----------|
| `admin` | Administrador | red | Acesso total |
| `lider` | Líder | purple | Máquinas, artigos, revisão, mecânica |
| `lider_noite` | Líder da Noite | indigo | Líder + OC/OT completo |
| `lider_mecanica` | Líder de Mecânica | orange | Cria/gerencia OMs |
| `mecanico` | Mecânico | emerald | Máquinas + mecânica |
| `revisador` | Revisador | yellow | Somente Revisão |
| `expedicao` | Expedição Malha | blue | Ordem de Faturamento |
| `freteiro` | Freteiro | cyan | OFR — só as próprias |
| `lider_frete` | Líder de Frete | teal | OFR completo + cadastros |

`getRoleColor(role)` / `getRoleLabel(role)` resolvem badge/nome com fallback.

### 4.2. Blocos de estado

1. **Tabs/nav** — `tab`, `showLogoutDialog`, `showAuditHistory`.
2. **Perfis** — `profiles`, `userSearch`, `loadingProfiles`, `company`.
3. **Modal usuário** — `showUserModal`, `editingUser`, `showDeleteUser`, `deleteWord`, `deletingUser`, `showPassword`, `userForm={name,email,password,role}`, `saving`, `emailCheckStatus (idle|checking|valid|invalid)`, `emailCheckError`.
4. **Trocar senha (admin→outro)** — `changePasswordUser`, `adminNewPassword`, `showAdminNewPw`, `savingAdminPw`.
5. **Empresa** — `uploadingLogo`, `editingShifts`, `shiftForm`, `savingShifts`, `showProductionMode`, `editingCompanyName`, `companyNameForm`, `savingCompanyName`.
6. **Perfil próprio** — `editingProfile`, `profileName`, `profileEmail`, `profilePassword`, `savingProfile`, `showProfilePassword`, `changingPassword`, `currentPassword`, `newPassword`, `showCurrentPw`, `showNewPw`, `savingPassword`.
7. **Assinatura** — `subStatus`, `loadingSub`, `checkingOut`, `platformSettings`, `companyPlanValue`, `cancellingSubscription`, `showCancelDialog`.
8. **Pix** — `pixModal`, `pixCode`, `pixIdentifier`, `pixAmount`, `pixPlanName`, `pixStatus (pending|paid|failed)`, `checkingPixStatus`, `paymentHistory`, `loadingHistory`, `showAllPayments`.
9. **Permissões extras** — `permissionsUser`, `permOverrides`, `savingPerms`.

### 4.3. `useEffect`

1. `[sidebarLocked]` — força `setTab('plans')`.
2. `[user?.name, user?.email]` — sincroniza `profileName`.
3. `[user]` — Promise.all de 4 queries + `checkSubscription()` + `fetchPaymentHistory()`.
4. cleanup — `clearInterval(pixPollRef.current)` no unmount.

---

## 5. Fluxos principais

### 5.1. Editar perfil próprio (`handleSaveProfile`)

- Valida `profileName` não vazio; compara `nameChanged` / `emailChanged`.
- Nome: `UPDATE profiles SET name WHERE user_id`.
- Email: valida regex, exige `profilePassword`, chama `update-user-email`. Sucesso → toast; falha exibe `data.error`.
- Após sucesso: `refreshProfiles()` e reset dos campos.

### 5.2. Alterar senha própria (`handleChangePassword`)

- Exige `currentPassword` + `newPassword ≥ 6`.
- Verifica a atual via `signInWithPassword({ email: user.email, password: currentPassword })` (rethrow "Senha atual incorreta").
- Chama `supabase.auth.updateUser({ password: newPassword })`.

### 5.3. Nome da empresa (`handleSaveCompanyName`)

- `UPDATE companies SET name WHERE id = company_id`. Slug permanece imutável.

### 5.4. Upload/remoção de logo

- `handleLogoUpload`: `size ≤ 2 MB`; path `${company_id}/logo.${ext}`; `remove([path])` + `upload(path, upsert:true)` + `getPublicUrl` + `?t=Date.now()` → grava em `companies.logo_url`.
- `handleRemoveLogo`: `list(company_id)` → `remove(all)` → `UPDATE companies SET logo_url=null`.

### 5.5. CRUD de usuários (`manage-users`)

#### Criar (`create`)
- Role obrigatório antes de digitar email (`disabled={!userForm.role}`).
- Role `admin`: aviso e `checkAdminEmail` (debounce 600 ms) → `check_email`. UI: `checking` / "✓ Email disponível" / mensagem específica (mesma empresa vs outra empresa).
- `manage-users` gera `code` via `generateUniqueCode(role)`:
  - admin → maior code 1–50 + 1 (hard limit 50).
  - outros → aleatório 100–999 sem colidir com `profiles.code` nem `weavers.code`.
- Cria via `auth.admin.createUser` + insere em `profiles`.
- Auditoria: `user_create`.

#### Editar (`update`)
- `bodyPayload={ action:'update', user_id, name }`.
- Role admin imutável (UI mostra Lock; role não vai no payload).
- Se `isCurrentUserMainAdmin`: envia `email` e/ou `password ≥ 6` quando alterados.
- Auditoria: `user_update`.

#### Alterar senha (`change_password`)
- Só admin #1 dispara; server-side valida novamente (bug histórico corrigido).
- Auditoria: `user_password_change`.

#### Desativar/reativar (`update` com `status`)
- Alterna entre `active`/`inactive`. Realtime em `AuthContext` bloqueia o usuário desativado sem F5.
- Auditoria: `user_deactivate` / `user_reactivate`.

#### Excluir (`delete`)
- Modal exige digitar exatamente `EXCLUIR`. Remove `auth.users` + cascata em `profiles`.
- Auditoria: `user_delete`.

#### Permissões extras (`update_permissions`)
- Modal toggle das 5 chaves de `OVERRIDE_PERMISSIONS` → grava `permission_overrides` no perfil.
- Auditoria: `user_permissions_update`.

### 5.6. Turnos de trabalho

- `shiftForm` com 6 `<input type="time">` (Manhã/Tarde/Noite start/end).
- `saveShiftSettings(shiftForm)` persiste em `company_settings` e afeta cálculos de eficiência globalmente.

### 5.7. Modo de Registro de Produção

- Botão abre `<ProductionModeModal>` que recebe `getMachines`/`saveMachines`. Define por máquina: **rolos**, **voltas** ou **IoT**.

### 5.8. IoT (ESP32)

- `<IotDevicesManager />` gerencia tokens/pareamento (ver `docs/iot.md`).

### 5.9. Assinatura (Planos)

#### Status

| Status | Badge | UI |
|--------|-------|-----|
| `free` | Verde "Plano Grátis" | Card de planos oculto |
| `trial` | "Período de Teste" | `days_left` + `trial_end` |
| `grace` | Âmbar "Carência" | Aviso de bloqueio próximo |
| `active` | Verde "Assinatura Ativa" | `next_billing_date` + plano + botão Cancelar |
| `cancelling` | Verde "Assinatura Cancelada" | Acesso até `next_billing_date` |
| `blocked` | Vermelho "Acesso Bloqueado" | Sem opção além de assinar |

Card de planos só aparece quando `status !== 'free' && !== 'active' && !== 'cancelling'`.

#### Preço

- Base = `companyPlanValue ?? platform_settings.monthly_price ?? 147.00`.
- Mensal = `R$ base/mês`.
- Anual = `base * 12 * 0.6` (40% OFF) → equivale a `base * 0.6/mês`.

#### Fluxo Pix

1. `handleCheckout(plan)` → `create-pix-checkout` → abre `pixModal` + `fbTrack('InitiateCheckout')`.
2. `startPixPolling(identifier)` → `setInterval 5000 ms` chamando `check-pix-payment`.
3. `paid` → `clearInterval` + `fbTrack('Purchase')` + atualiza status/histórico + `window.dispatchEvent('subscription-updated')`.
4. `failed` → `clearInterval` + UI de falha.
5. Fechar modal cancela o polling.

#### Cancelar assinatura

- `handleCancelSubscription`:
  - `gracePeriodEnd = paymentHistory.find(paid && next_billing_date)?.next_billing_date ?? now+30d`.
  - `UPDATE company_settings SET subscription_status='cancelling', grace_period_end`.
  - Re-verifica assinatura e emite evento global.

#### Histórico

- Card mostra o último; botão "Ver todos (N)" abre `showAllPayments` (`max-w-lg`, scrollável).
- Status: `paid→Pago`, `pending→Pendente`, `failed→Falhou`, `expired→Expirado`.

---

## 6. UI / componentes

- **Header:** ícone `Settings` + título + botão "Sair" com `AlertDialog` → `logout()`.
- **Tabs responsivas:** `flex flex-wrap gap-1 h-auto p-1`; `TabsTrigger` `flex-1 min-w-[80px] text-xs sm:text-sm`.
- **Perfil:** grid `lg:grid-cols-3`. Card avatar + forms condicionais + card "Permissões de Acesso" (`RolePermissionsDisplay`).
- **Usuários:** card "Padrões de Email por Função" (grid até 4 col). Input global de busca filtra por `name/email/code/roleLabel/role`. Cards com avatar, badges (`#code`, status, role) e botões restritos ao admin #1.
- **Empresa:** duas colunas (identidade + funções | turnos + modo de produção + IoT + padrões de email).
- **Planos:** card único (status + planos + histórico + botões).
- **Dialogs:**
  - Novo/Editar Usuário — `max-w-md`, ESC/click-fora **bloqueados**.
  - Alterar Senha (admin→outro) — `sm:max-w-md`, autoFocus, toggle olho.
  - Permissões Extras — `sm:max-w-md`, cards clicáveis com checkbox estilizado.
  - Pix — QR + código copiável + estados.
  - Histórico — `max-w-lg max-h-[80vh]`.
  - AlertDialogs: Cancelar assinatura / Logout / Excluir (exige `EXCLUIR`).
  - `<AuditHistoryModal>` — só admin #1.

---

## 7. Segurança

1. **Admin #1 intocável** — client + server (`manage-users`).
2. **Verificação global de email para admins** — edge function com service role bypass RLS.
3. **Codes sequenciais admin (#2-#50)** — limite 50 admins/empresa.
4. **Role admin imutável** — client (Lock) + payload (`role` omitido).
5. **`change_password` só #1** — server-side.
6. **RLS ativa** em `profiles`, `companies`, `company_settings`, `payment_history`, `platform_settings`.
7. **`update-user-email`** exige senha atual antes de trocar email em `auth.users`.
8. **Bucket `company-logos`** com path prefixado por `company_id`.
9. **Cache-buster** `?t=<ts>` no logo evita stale image cross-user.

---

## 8. Auditoria (`useAuditLog`)

| Ação | Detalhes |
|------|----------|
| `user_create` | `{ name, email, role, code }` |
| `user_update` | `{ name, role, email }` |
| `user_delete` | `{ name, code, email }` |
| `user_deactivate` / `user_reactivate` | `{ name, code }` |
| `user_password_change` | `{ name, code }` |
| `user_permissions_update` | `{ name, code, permissions }` |
| `shift_settings_update` | via CompanyData |
| `company_logo_update` | implícito em UPDATE de `companies` |
| `production_mode_change` | via ProductionModeModal |

Consulta consolidada em `<AuditHistoryModal>` (só admin #1).

---

## 9. Realtime & bloqueio progressivo

- **Realtime em `profiles`:** `AuthContext` escuta `UPDATE` do próprio `user_id`. `status='inactive'` → overlay de bloqueio imediato.
- **Assinatura suspensa:** `SubscriptionContext` calcula `sidebarLocked=true` → `AppLayout` redireciona admin para `/settings`, `useEffect` força `tab='plans'`, demais abas ficam com `Lock` + `opacity-40`. Evento `subscription-updated` sincroniza header/badges.

---

## 10. Riscos, bugs históricos & observações

### Resolvidos
- `editingUser.id` (profile row) enviado no lugar de `user_id` (auth uid). ✅
- Botão Desativar enviava `p.id` em vez de `p.user_id`. ✅
- `TabsList` mobile quebrado (`grid-cols-5` → `flex flex-wrap`). ✅
- `useEffect` que força "Planos" ao virar `sidebarLocked`. ✅
- `change_password` sem restrição server-side. ✅
- Vazamentos mobile em "Padrões de Email", "Dispositivos IoT" e listagem de usuários. ✅

### Pontos de atenção
1. `profiles.select('*')` sem paginação — aceitável para dezenas; monitorar em empresas grandes.
2. `refreshProfiles` refaz o fetch inteiro após cada mutação.
3. `handleLogoUpload` só remove `path` com a mesma extensão — outros podem virar órfãos (usar `list()`+`remove(all)`).
4. `handleCancelSubscription` grava direto em `company_settings` (bypass edge function). RLS deve barrar não-admin.
5. `payment_history` limitado a 20 no modal "Ver todos".
6. Polling do Pix persiste enquanto o modal fica aberto; sem cancelamento em navegação sem unmount.
7. `emailCheckStatus` cai em `valid` silenciosamente se a edge function falhar — o server rejeita no submit, mas o feedback visual pode enganar.
8. `checkAdminEmail` só roda para role `admin`; emails de outros papéis (também globais em `auth.users`) só são checados no submit.
9. Aba `telas` está `disabled` com badge "Breve" — `SettingsTelasTab` já existe e pode ser destravada.
10. Não há UI para o admin editar seu próprio `monthly_plan_value` (só platform).
11. `refreshProfiles` após mutação não limpa `userSearch` — filtro permanece.
12. `AlertDialog` de logout sempre disponível, mesmo com `sidebarLocked`.

---

## 11. Integrações externas

- **`fbPixel.fbTrack`** — `InitiateCheckout` (Pix) e `Purchase` (confirmação).
- **`qrcode.react` (`QRCodeSVG`)** — QR do Pix.
- **`date-fns` + `ptBR`** — "dd 'de' MMMM 'de' yyyy" e "dd/MM/yyyy 'às' HH:mm".
- **`sonner`** — toasts globais.
- **`window.dispatchEvent('subscription-updated')`** — sincroniza Header/badges.

---

## 12. Checklist de aderência ao código

- [x] 5 abas: Perfil, Usuários (admin), Empresa (admin), Telas (admin, breve), Planos.
- [x] `sidebarLocked` força `tab='plans'` e desabilita as demais.
- [x] Admin `#1` tem todos os botões privilegiados.
- [x] Role de admin imutável após criação.
- [x] `check_email` com debounce 600 ms apenas para role `admin`.
- [x] Preço = `companyPlanValue ?? platform_settings.monthly_price ?? 147.00`; anual = base × 12 × 0.6.
- [x] Poll do Pix a cada 5 s com cleanup no unmount.
- [x] `fbTrack` em `InitiateCheckout` e `Purchase`.
- [x] `logAction` para todas as mutações de usuário.
- [x] Realtime de `status` espelhado no `AuthContext`.
- [x] Bucket `company-logos` com path por `company_id` + cache-buster.

---

## 13. Fora do escopo

- Visão funcional narrativa → `docs/configuracoes.md`.
- Auditoria completa → `docs/auditoria.md`.
- Modo TV / dispositivos → `docs/iot.md`, `docs/iotTV.md`, `docs/modotv.md`.
- Código Deno das Edge Functions → `docs/edge-functions.md`.

---

*Documento 100% aderente a `src/pages/Settings.tsx` na revisão de 19/07/2026. Atualizar sempre que a estrutura de abas, roles, edge functions consumidas, contratos de `manage-users` ou fluxo de assinatura mudarem.*