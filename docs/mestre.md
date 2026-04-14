# 📋 MESTRE.MD — Documentação Mestre do Projeto MalhaGest

> **⚠️ INSTRUÇÕES OBRIGATÓRIAS PARA A IA (LOVABLE):**
>
> 1. **LEIA ESTE ARQUIVO INTEIRO ANTES** de qualquer modificação no projeto. Quando o usuário iniciar o prompt com **"leia o arquivo mestre.md"** ou qualquer variação (ex: "leia mestre.md", "consulte o mestre"), isso significa: **leia este arquivo por completo antes de prosseguir com qualquer alteração**.
> 2. Use-o como referência para entender a arquitetura, fluxos de dados e dependências entre módulos.
> 3. **🔴 OBRIGATÓRIO — Após TODA alteração concluída**, adicione uma nova linha na seção **"## 📅 Histórico de Alterações"** com data/hora no fuso **Brasília (UTC-3)** e descrição clara do que foi feito. **NÃO PULE ESTA ETAPA. NUNCA.**
> 4. **🔴 OBRIGATÓRIO — Atualize também** o campo `*Última atualização:*` no final do arquivo com a data/hora de Brasília.
> 5. Este arquivo é a **fonte de verdade** sobre o estado atual do sistema — mantenha-o sempre atualizado.
> 6. Nunca faça alterações em um módulo sem verificar aqui se há dependências com outros módulos.
> 7. **Atenção especial:** Filtros, sidebar, assinatura e layout são interconectados — modificar um pode quebrar outro.
> 8. **Fuso horário padrão:** Todas as datas/horas neste arquivo usam **horário de Brasília (UTC-3)**.

---

## 📌 Visão Geral

**MalhaGest** é um sistema SaaS de gestão para malharias no modelo de **facção** (cliente envia fio, malharia produz malha e cobra por kg). Gerencia máquinas (teares), tecelões, clientes, artigos, produção diária, revisão de qualidade, terceirização e relatórios analíticos.

- **URL publicada:** https://loomlytics-hub.lovable.app
- **Stack:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Lovable Cloud (Supabase) — autenticação, banco de dados PostgreSQL, Edge Functions, Storage
- **Multi-tenancy:** Cada empresa tem seus dados isolados via Row-Level Security (RLS) usando `get_user_company_id()`

---

## 🏗️ Arquitetura de Pastas

```
docs/                           # 📄 Documentação centralizada (mestre.md, nf.md, iot.md, etc.)
src/
├── App.tsx                    # Rotas e providers (lógica extraída para components/routes/)
├── main.tsx                   # Entry point
├── index.css                  # Tokens de design (CSS variables HSL)
├── types/                     # Tipos organizados por domínio
│   ├── index.ts               # Re-exports (compatibilidade — imports existentes continuam funcionando)
│   ├── company.ts             # Company
│   ├── machine.ts             # Machine, MachineLog, MachineStatus, ProductionMode
│   ├── client.ts              # Client, Article, ArticleMachineTurns
│   ├── shift.ts               # ShiftType, CompanyShiftSettings, getShiftMinutes, etc.
│   ├── weaver.ts              # Weaver
│   ├── production.ts          # Production, DefectRecord, MeasureType
│   └── user.ts                # User
├── contexts/
│   ├── AuthContext.tsx         # Autenticação, login, registro, sessão, multi-empresa
│   ├── CompanyDataContext.tsx  # Provider global — wraps useCompanyData
│   └── SubscriptionContext.tsx # Estado da assinatura/plano, sidebarLocked, fullyBlocked
├── hooks/
│   ├── useCompanyData.ts      # Busca e CRUD de TODOS os dados da empresa
│   ├── usePermissions.ts      # Controle de acesso por role (canAccess, filterNavItems, canSeeFinancial)
│   ├── useAuditLog.ts         # Hook para registro de auditoria
│   └── use-mobile.tsx         # Detecção de dispositivo móvel (< 768px)
├── lib/
│   ├── formatters.ts          # Formatação pt-BR (moeda, número, peso, %)
│   ├── downtimeUtils.ts       # Cálculo de paradas de máquina por turno com clipping
│   ├── auditLog.ts            # Função para inserir log de auditoria
│   ├── fbPixel.ts             # Utilitário Facebook Pixel — fbTrack(event, params?)
│   └── utils.ts               # cn() e utilitários
├── components/
│   ├── routes/                 # Componentes de roteamento (extraídos de App.tsx)
│   │   ├── RootRedirect.tsx    # Redirect / → /admin ou /:slug
│   │   ├── PublicRoute.tsx     # Guard para rotas públicas
│   │   ├── CompanyRoute.tsx    # Resolve slug → empresa ativa
│   │   ├── CompanyRouteInner.tsx # Bloqueios (inativo, assinatura expirada)
│   │   └── ProtectedRoute.tsx  # Guard por role/permissão
│   ├── AppLayout.tsx           # Layout: header + sidebar + content + bottom nav
│   ├── AppSidebar.tsx          # Sidebar lateral com items filtrados por role + enabled_nav_items
│   ├── MobileBottomNav.tsx     # Navegação inferior mobile (role-specific)
│   ├── NavLink.tsx             # Link de navegação com className ativa
│   ├── ThemeProvider.tsx       # Tema claro/escuro
│   ├── MachinePerformanceModal.tsx  # Modal de performance de máquinas
│   ├── MaintenanceViewModal.tsx     # Modal de visualização de manutenção
│   ├── ProductionModeModal.tsx      # Modal de modo de produção (rolos/voltas)
│   └── ui/                     # Componentes shadcn/ui
├── pages/
│   ├── Dashboard.tsx           # Painel principal com KPIs e gráficos
│   ├── FaturamentoTotal.tsx   # Faturamento consolidado (admin only) — malhas + terceirizado + resíduos
│   ├── Machines.tsx            # Gestão de máquinas/teares
│   ├── ClientsArticles.tsx     # Gestão de clientes e artigos
│   ├── Production.tsx          # Registro de produção diária
│   ├── Revision.tsx            # Registro de revisão/defeitos
│   ├── Mecanica.tsx            # Módulo mecânica
│   ├── Outsource.tsx           # Produção terceirizada
│   ├── Weavers.tsx             # Gestão de tecelões
│   ├── Reports.tsx             # Relatórios analíticos com gráficos e exportação
│   ├── AccountsPayable.tsx     # Contas a pagar
│   ├── ResidueSales.tsx        # Vendas de resíduos (modelo cliente-cêntrico)
│   ├── Invoices.tsx            # Notas fiscais (entrada/saída/venda de fio)
│   ├── Fechamento.tsx          # Fechamento mensal
│   ├── Settings.tsx            # Configurações da empresa (turnos, logo, usuários, assinatura)
│   ├── Login.tsx               # Login global
│   ├── CompanyLogin.tsx        # Login por slug /:slug/login
│   ├── Register.tsx            # Registro de nova empresa
│   ├── Admin.tsx               # Painel administrativo da plataforma
│   ├── Vendas.tsx              # Página de vendas/landing
│   ├── PaymentSuccess.tsx      # Confirmação de pagamento
│   └── NotFound.tsx            # Página 404
├── integrations/supabase/
│   ├── client.ts               # ⛔ AUTO-GERADO — NÃO EDITAR
│   └── types.ts                # ⛔ AUTO-GERADO — NÃO EDITAR
supabase/
├── config.toml                 # Configuração do projeto (NÃO editar project_id)
├── functions/                  # Edge Functions (deploy automático)
│   ├── admin-api/              # API administrativa (list_companies, list_users, etc.)
│   ├── create-company-profile/ # Criação de empresa no registro
│   ├── manage-users/           # Gestão de usuários da empresa
│   ├── update-user-email/      # Alteração de email com histórico
│   ├── setup-admin/            # Setup do admin da plataforma
│   ├── create-checkout/        # Checkout Stripe
│   ├── create-pix-checkout/    # Checkout Pix (SyncPayments)
│   ├── check-pix-payment/      # Verificação de pagamento Pix
│   ├── syncpay-webhook/        # Webhook SyncPayments
│   ├── check-subscription/     # Verificação de assinatura
│   ├── customer-portal/        # Portal do cliente Stripe
│   ├── daily-backup/           # Backup automático (pg_cron 00:00 UTC + manual)
│   └── restore-backup/         # Restauração de backup
```

## 🎨 Padrões de UI (obrigatórios para novos módulos)

### Seletor de Artigo em Modais
- **Formato de exibição:** `NomeArtigo (NomeCliente)` — quando o artigo possui `client_name`
- **Busca:** Filtra por nome do artigo **e** por nome do cliente
- **Implementação:** Criar helper `getArticleLabel(a)` que retorna `a.client_name ? \`${a.name} (${a.client_name})\` : a.name`
- **Aplicar em:** Todo modal que contenha seletor de artigo (Produção, Revisão, Terceirizado, NFs, etc.)

---

## 🔐 Autenticação e Autorização

### Fluxo de Autenticação (`AuthContext.tsx`)

**Estrutura do contexto:**
```typescript
interface AuthContextType {
  user: AppUser | null;        // Usuário logado com company_id, company_slug, role
  companies: UserCompany[];    // Lista de empresas do usuário
  loading: boolean;
  login(email, password): Promise<{success, error?}>;
  register(data): Promise<{success, error?, slug?}>;
  logout(): Promise<void>;
  setActiveCompany(companyId): Promise<void>;
}
```

**Fluxos:**

1. **Login (`login`):**
   - `supabase.auth.signInWithPassword` → `onAuthStateChange` dispara
   - `loadUserData()` → `fetchProfile()` + `fetchUserCompanies()` em paralelo
   - `fetchProfile()` busca `profiles` com join em `companies` (nome, slug) via `maybeSingle()`
   - `fetchUserCompanies()` chama RPC `get_user_companies()` que retorna company_id, name, slug, role

2. **Registro (`register`):**
   - `supabase.auth.signUp` → recebe `authData.user`
   - Chama Edge Function `create-company-profile` com `{user_id, admin_name, admin_email, company_name, whatsapp}`
   - Edge Function cria: company (com slug) + profile (role=admin) + company_settings (defaults) + user_active_company
   - Retorna `slug` para redirecionamento

3. **Multi-empresa:**
   - `user_active_company` (1 registro por user_id PK)
   - `set_active_company(companyId)` → RPC valida que user pertence à empresa → upsert em `user_active_company`
   - Após trocar empresa, refaz `fetchProfile()` para atualizar contexto

4. **Sessão:**
   - Persistida em `localStorage`
   - `autoRefreshToken: true` no client Supabase
   - `onAuthStateChange` escuta mudanças de sessão

5. **Logout (`logout`):**
   - `supabase.auth.signOut()` → limpa user e companies do estado

### Roles e Permissões (`usePermissions.ts`)

**Mapeamento completo:**
```typescript
const ROLE_ALLOWED_KEYS: Record<AppRole, string[]> = {
  admin:     ['dashboard', 'faturamento-total', 'machines', 'clients-articles', 'production', 'revision', 'mecanica', 'outsource', 'weavers', 'reports', 'contas-pagar', 'residuos', 'invoices', 'fechamento', 'settings'],
  lider:     ['machines', 'clients-articles', 'revision', 'mecanica', 'weavers'],
  mecanico:  ['machines', 'mecanica'],
  revisador: ['revision'],
};
```

**Funções exportadas:**
| Função | Retorno | Uso |
|--------|---------|-----|
| `canAccess(key)` | boolean | Verifica se role pode acessar a key |
| `filterNavItems(items)` | T[] | Filtra array de items por role |
| `canSeeFinancial` | boolean | `true` apenas para `admin` |
| `canAccessRoute(path)` | boolean | Verifica se rota é permitida |
| `defaultRoute` | string | Primeira rota permitida do role |
| `allowedKeys` | string[] | Array completo de keys permitidas |

**Dupla filtragem de sidebar:**
1. Primeiro: `enabled_nav_items` da `company_settings` (admin plataforma pode ativar/desativar módulos)
2. Depois: `filterNavItems` por role do usuário
3. No mobile: remove items que já estão no `MobileBottomNav`

### Rotas (`App.tsx`)

```
/login                    → Login global (PublicRoute)
/register                 → Registro de empresa (PublicRoute)
/:slug/login              → Login por empresa (CompanyLogin)
/:slug                    → Dashboard (CompanyRoute + ProtectedRoute)
/:slug/faturamento-total  → Faturamento Total (admin only)
/:slug/machines           → Máquinas
/:slug/clients-articles   → Clientes & Artigos
/:slug/production         → Produção
/:slug/revision           → Revisão
/:slug/mecanica           → Mecânica
/:slug/outsource          → Terceirizado
/:slug/weavers            → Tecelões
/:slug/reports            → Relatórios
/:slug/contas-pagar       → Contas a Pagar (admin only)
/:slug/residuos           → Resíduos (admin only)
/:slug/invoices           → Notas Fiscais (admin only)
/:slug/fechamento         → Fechamento Mensal (admin only)
/:slug/settings           → Configurações
/admin                    → Painel Admin da Plataforma
/vendas                   → Página de Vendas
/payment-success          → Sucesso do Pagamento
```

**CompanyRoute:** Valida que o slug na URL corresponde à empresa ativa do usuário
**ProtectedRoute:** Verifica se o role tem acesso à rota via `canAccessRoute()`

---

## 🗄️ Modelo de Dados (Tabelas Supabase)

### Tabelas Principais

| Tabela | Colunas-chave | Descrição |
|--------|---------------|-----------|
| `companies` | id, name, slug, admin_name, admin_email, whatsapp, logo_url | Empresas cadastradas |
| `profiles` | user_id, company_id, name, email, role, status, code | Perfis de usuários |
| `user_active_company` | user_id (PK), company_id | Empresa ativa do usuário |
| `company_settings` | company_id (unique), turnos (6 campos), subscription_status, trial_end_date, grace_period_end, platform_active, enabled_nav_items, monthly_plan_value, stripe_customer_id | Configurações da empresa |
| `machines` | company_id, number, name, rpm, status (enum), article_id, production_mode | Teares |
| `machine_logs` | machine_id, status, started_at, ended_at, started_by_name/code, ended_by_name/code | Histórico de status |
| `machine_maintenance_observations` | machine_id, machine_log_id, company_id, observation | Observações de manutenção |
| `clients` | company_id, name, contact, observations | Clientes |
| `articles` | company_id, client_id, name, weight_per_roll, value_per_kg, turns_per_roll, target_efficiency | Artigos/malhas |
| `article_machine_turns` | article_id, machine_id, company_id, turns_per_roll | Voltas específicas por artigo+máquina |
| `weavers` | company_id, code, name, phone, shift_type, fixed_shift, start_time, end_time | Tecelões |
| `productions` | company_id, date, shift, machine_id/name, weaver_id/name, article_id/name, rpm, rolls_produced, weight_kg, revenue, efficiency | Produção diária |
| `defect_records` | company_id, date, shift, machine_id/name, article_id/name, weaver_id/name, measure_type (kg/metro), measure_value | Defeitos/revisão |
| `outsource_companies` | company_id, name, contact | Empresas terceirizadas |
| `outsource_productions` | company_id, outsource_company_id, article_id, date, rolls, weight_kg, client/outsource_value_per_kg, profit_per_kg, total_revenue/cost/profit | Produção terceirizada |
| `payment_history` | company_id, plan, amount, status, pix_code, transaction_id, paid_at, next_billing_date | Pagamentos |
| `audit_logs` | company_id, user_id, action, details (jsonb), user_name, user_role, user_code | Auditoria |
| `company_backups` | company_id, backup_date, data (jsonb), created_at | Backups (múltiplos por dia) |
| `platform_admins` | user_id, email | Admins da plataforma |
| `platform_settings` | key, value | Configurações globais (trial_days, monthly_price) |
| `email_history` | company_id, old_email, new_email, changed_by | Histórico de emails |
| `yarn_types` | company_id, name, composition, color, observations | Tipos de fio |
| `invoices` | company_id, type (entrada/saida/venda_fio), invoice_number, client_id, issue_date, total_weight_kg, total_value, status | Notas Fiscais |
| `invoice_items` | invoice_id, company_id, yarn_type_id, article_id, weight_kg, quantity_rolls, value_per_kg, subtotal | Itens das NFs |
| `outsource_yarn_stock` | company_id, outsource_company_id, yarn_type_id, quantity_kg, reference_month | Estoque de fio em terceiros |
| `residue_materials` | company_id, name, unit (kg/unidade), default_price | Catálogo de materiais residuais |
| `residue_clients` | company_id, name | Compradores de resíduos |
| `residue_client_prices` | company_id, client_id, material_id, unit_price | Preço por material por cliente (UNIQUE client+material) |
| `residue_sales` | company_id, client_id, material_id, client_name, date, quantity, unit_price, total, romaneio | Vendas de resíduos |
| `accounts_payable` | company_id, supplier_name, description, category, amount, due_date, whatsapp_number, status, short_id, paid_amount, receipt_url | Contas a pagar |
| `tv_panels` | company_id, code, name, panel_type, enabled_machines, is_connected | Painéis TV |
| `iot_devices` | company_id, machine_id, token, name, active, firmware_version, last_seen_at | Dispositivos IoT |
| `machine_readings` | company_id, machine_id, rpm, total_rotations, is_running | Leituras IoT brutas |
| `iot_shift_state` | company_id, machine_id, current_shift, total_turns, partial_turns, completed_rolls, rpm_sum, rpm_count | Estado do turno IoT |
| `iot_downtime_events` | company_id, machine_id, shift, started_at, ended_at, duration_seconds | Paradas detectadas IoT |
| `iot_machine_assignments` | company_id, machine_id, weaver_id, shift, active | Associação tecelão-máquina IoT |

### Status de Máquina (Enum `machine_status`)

| Valor | Label | Cor CSS |
|-------|-------|---------|
| `ativa` | Ativa | `bg-success/10 text-success` |
| `manutencao_preventiva` | Manutenção Preventiva | `bg-warning/10 text-warning` |
| `manutencao_corretiva` | Manutenção Corretiva | `bg-destructive/10 text-destructive` |
| `troca_artigo` | Troca de Artigo | `bg-info/10 text-info` |
| `troca_agulhas` | Troca de Agulheiro | `bg-purple-500/10 text-purple-600` |
| `inativa` | Inativa | `bg-muted text-muted-foreground` |

### Modos de Produção

| Modo | Descrição | Cálculo |
|------|-----------|---------|
| `rolos` | Produção por rolos | peso_kg = rolos × peso_por_rolo |
| `voltas` | Produção por voltas | rolos = voltas / voltas_por_rolo → peso_kg = rolos × peso_por_rolo |

---

## 📊 Fluxo de Dados (`useCompanyData.ts`)

### Carregamento Inicial
- Ao montar `CompanyDataProvider`, o hook busca **TODOS** os dados via `Promise.all` (9 queries paralelas)
- Usa `fetchAll()` com paginação recursiva (PAGE_SIZE=1000) para superar limite do Supabase
- Ordenação determinística: `order(coluna, ascending)` + `order('id', ascending: true)` para paginação estável
- `sb()` é um helper: `(supabase.from as any)(table)` para evitar tipagem estrita

### Tabelas carregadas e ordenação
```
machines                  → company_id, order by number ASC
clients                   → company_id, order by name ASC
articles                  → company_id, order by name ASC
weavers                   → company_id, order by code ASC
productions               → company_id, order by date DESC
machine_logs              → últimos 1000 (sem paginação, order by started_at DESC)
article_machine_turns     → company_id, order by created_at ASC
company_settings          → company_id, maybeSingle()
defect_records            → company_id, order by date DESC
```

### Mappers (DB → App Types)
Cada tabela tem um `mapXxx()` que converte row do banco para interface TypeScript:
- `mapMachine`: converte `article_id: null` → `undefined`, `production_mode` default `'rolos'`
- `mapProduction`: usa `normalizeShift()` para converter strings legadas
- `mapArticle`: converte campos numéricos com `Number()`
- **`normalizeShift(shift)`**: `.toLowerCase().normalize('NFD').replace(diacríticos)` → retorna `'manha'|'tarde'|'noite'`

### Getters (useCallback memoizados)
```typescript
getMachines(), getMachineLogs(), getClients(), getArticles(),
getWeavers(), getProductions(), getArticleMachineTurns(), getDefectRecords()
```

### Operações de Escrita (⚠️ CRÍTICO — entenda o padrão antes de modificar)

| Função | Padrão | Detalhes |
|--------|--------|---------|
| `saveMachines(data)` | **Upsert + Delete removidos** | Compara IDs atuais vs novos → delete removidos → upsert restantes |
| `saveMachineLogs(data)` | **Upsert** | Upsert todos os logs passados |
| `saveClients(data)` | **Delete ALL + Insert** | Deleta TODOS do company_id → insere novos |
| `saveArticles(data)` | **Delete ALL + Insert** | Deleta TODOS do company_id → insere novos |
| `saveWeavers(data)` | **Delete ALL + Insert** | Deleta TODOS do company_id → insere novos |
| `saveProductions(data)` | **Delete ALL + Insert (batch 500)** | Deleta TODOS → insere em batches de 500 |
| `addProductions(newRecords)` | **Insert incremental** | NÃO deleta nada — apenas adiciona registros novos |
| `updateProductions(idsToDelete, newRecords)` | **Delete específicos + Insert** | Deleta IDs listados → insere novos → atualiza state local |
| `deleteProductions(ids)` | **Delete específicos** | Deleta IDs listados → remove do state local |
| `addDefectRecords(newRecords)` | **Insert incremental** | Insere novos → adiciona ao início do state |
| `deleteDefectRecords(ids)` | **Delete específicos** | Deleta IDs → remove do state |
| `saveArticleMachineTurns(articleId, data)` | **Delete por article_id + Insert** | Deleta todos do artigo → insere novos → refetch completo |
| `saveShiftSettings(data)` | **Update** | Update na `company_settings` do company_id |

**⚠️ PERIGO:** `saveClients`, `saveArticles`, `saveWeavers`, `saveProductions` fazem **DELETE ALL** antes do insert. Se houver erro no insert após o delete, dados são perdidos. Usar `addProductions`/`updateProductions`/`deleteProductions` para operações incrementais quando possível.

---

## 🎛️ Sistema de Filtros — Dashboard e Relatórios (⚠️ SEÇÃO CRÍTICA)

### Estados de Filtro

| Estado | Tipo | Default Dashboard | Default Reports | Descrição |
|--------|------|-------------------|-----------------|-----------|
| `dayRange` | number | 15 | 30 | Dias de intervalo. **0 = "Todo período"** |
| `customDate` | Date \| undefined | undefined | undefined | Data específica (seletor de calendário) |
| `dateFrom` | Date \| undefined | undefined | undefined | Início do intervalo customizado |
| `dateTo` | Date \| undefined | undefined | undefined | Fim do intervalo customizado |
| `filterMonth` | string | 'all' | 'all' | Mês específico (formato 'yyyy-MM') |
| `filterShift` | string | 'all' | 'all' | Turno (manha/tarde/noite) |
| `filterClient` | string | 'all' | 'all' | Cliente (por ID) |
| `filterArticle` | string | 'all' | 'all' | Artigo (por ID) |
| `filterMachine` | string | — | 'all' | Máquina (apenas em Reports) |

### Controles de Filtro na UI (Dashboard)

**Barra de filtros (`Card` com `shadow-material`):**
1. **Botões de período:** `7 dias`, `15 dias`, `30 dias`, `Todo período`
   - Estilo ativo: `btn-gradient` (quando dayRange=X e nenhum outro filtro de data)
   - onClick: `setDayRange(X); setCustomDate(undefined); setFilterMonth('all'); setDateFrom(undefined); setDateTo(undefined);`

2. **Seletor de dia (Popover Calendar):** Botão "Dia" com ícone CalendarIcon
   - Exibe data selecionada se `customDate` definido
   - onSelect: `setCustomDate(d); setFilterMonth('all'); setDayRange(15); setDateFrom(undefined); setDateTo(undefined);`

3. **Select de Mês:** Dropdown com meses disponíveis (dos dados + mês atual)
   - Formato: "março 2026" (ptBR locale)
   - onChange: `setFilterMonth(v); setCustomDate(undefined); setDateFrom(undefined); setDateTo(undefined);`
   - **⚠️ NÃO reseta dayRange** — isso é intencional para manter consistência

4. **Separador visual** (`w-px h-6 bg-border mx-1`)

5. **Intervalo customizado "De" / "Até":** Dois Popover Calendars
   - "De" onSelect: `setDateFrom(d); setFilterMonth('all'); setCustomDate(undefined); setDayRange(15);`
   - "Até" onSelect: `setDateTo(d); setFilterMonth('all'); setCustomDate(undefined); setDayRange(15);`

6. **Separador visual**

7. **Select de Turno:** "Turno" → options: Manhã, Tarde, Noite
8. **Select de Cliente:** "Cliente" → lista de clientes
9. **Select de Artigo:** "Artigo" → lista de artigos

**Reports adiciona:** Select de Máquina

### ⚠️ Lógica de Filtragem de Dados (`useMemo` — IDÊNTICO em Dashboard e Reports)

```typescript
// ORDEM DE PRIORIDADE — NÃO ALTERAR
if (dayRange === 0 && filterMonth === 'all' && !customDate && !dateFrom && !dateTo) {
  // 1. "Todo período" — NENHUM filtro de data aplicado
} else if (dateFrom || dateTo) {
  // 2. Intervalo customizado De/Até (pode ser apenas um dos dois)
} else if (filterMonth !== 'all') {
  // 3. Filtro por mês — data.startsWith(filterMonth)
} else if (customDate) {
  // 4. Data específica — data === customDate
} else {
  // 5. Últimos N dias (fallback) — subDays(today, dayRange - 1) a today
}

// Filtros adicionais (aplicados APÓS filtro de data):
if (filterShift !== 'all') → filtra por shift
if (filterClient !== 'all') → busca artigos do cliente → filtra por article_id
if (filterArticle !== 'all') → filtra por article_id
if (filterMachine !== 'all') → filtra por machine_id OU machine_name (fallback)
```

### Filtro de Cliente — Diferença entre Dashboard e Reports
- **Dashboard:** `articles.filter(a => a.client_id === filterClient)`
- **Reports:** `articles.filter(a => a.client_id === filterClient || (selectedClient && a.client_name === selectedClient.name))`
  - Reports tem fallback por `client_name` para dados legados sem `client_id`

### Filtro de Máquina (Reports only)
```typescript
// Busca por machine_id OU por machine_name quando machine_id está vazio
data = data.filter(p => 
  p.machine_id === filterMachine || 
  (!p.machine_id && selectedMachine && p.machine_name === selectedMachine.name)
);
```

### Reset de Filtros
**Regras de reset (ao selecionar um filtro, reseta os conflitantes):**
- Selecionar **dia range (7/15/30/Todo)** → limpa `customDate`, `filterMonth`, `dateFrom`, `dateTo`
- Selecionar **mês** → limpa `customDate`, `dateFrom`, `dateTo` (**NÃO reseta dayRange**)
- Selecionar **customDate** → limpa `filterMonth`, `dateFrom`, `dateTo`, seta `dayRange=15`
- Selecionar **dateFrom** → limpa `filterMonth`, `customDate`, seta `dayRange=15`
- Selecionar **dateTo** → limpa `filterMonth`, `customDate`, seta `dayRange=15`

**Botão "Limpar Filtros":**
```typescript
clearFilters = () => {
  setDayRange(15); // Dashboard: 15, Reports: 30
  setCustomDate(undefined);
  setDateFrom(undefined);
  setDateTo(undefined);
  setFilterMonth('all');
  setFilterShift('all');
  setFilterClient('all');
  setFilterArticle('all');
  // Reports também: setFilterMachine('all');
};
```
Visível quando `hasActiveFilters = filterShift !== 'all' || filterClient !== 'all' || filterArticle !== 'all' || filterMonth !== 'all' || !!dateFrom || !!dateTo`

### Subtítulo Dinâmico (`periodSummary` / `periodLabel`)
Label exibido abaixo do título (ex: "01/03/2026 a 29/03/2026"):
- Segue a **mesma lógica de prioridade** dos filtros
- Para "Todo período": usa `min(dates)` a `max(dates)` dos dados filtrados
- Para mês: primeiro dia a último dia do mês
- Para dayRange: `subDays(today, dayRange-1)` a `today`
- Adicionado turno ativo ao final se `filterShift !== 'all'`

### `availableMonths` (memoizado)
- Extrai meses únicos dos dados de produção: `productions.map(p => p.date.substring(0, 7))`
- Sempre inclui mês atual: `months.add(format(new Date(), 'yyyy-MM'))`
- Ordenado reverso (mais recente primeiro)

---

## 📈 Dashboard (`Dashboard.tsx` — 775 linhas)

### KPIs Exibidos (Cards no topo)
| KPI | Ícone | Visibilidade | Cálculo |
|-----|-------|-------------|---------|
| Rolos produzidos | Package | Todos | `sum(rolls_produced)` |
| Peso total | Scale | Todos | `sum(weight_kg)` |
| Faturamento | DollarSign | `canSeeFinancial` (admin only) | `sum(revenue)` |
| Eficiência média | Gauge | Todos | `avg(efficiency)` com indicador vs meta |
| Faturamento/hora | DollarSign | `canSeeFinancial` | `totalRevenue / calendarHours` |
| Kg/hora | Clock | Todos | `totalWeight / calendarHours` |

**Indicador de eficiência:** Badge colorido comparando com `avgTargetEfficiency`:
- `≥ meta`: verde (sucesso) | `≥ meta-10`: amarelo (aviso) | `< meta-10`: vermelho (perigo)

### Cálculo de Horas Calendário (`calendarHours`)
```
Se filterShift !== 'all':
  horas = dias × (minutos_do_turno / 60)
Senão:
  horas = dias × 24

Cálculo de "dias":
  - Todo período (dayRange=0): usa Set(filtered.map(p.date)).size (dias com dados)
  - dateFrom+dateTo: differenceInCalendarDays + 1
  - dateFrom (sem dateTo): differenceInCalendarDays(today, dateFrom) + 1
  - dateTo (sem dateFrom): 1
  - customDate: 1
  - filterMonth: se mês atual → dias com produção, senão → dias do mês
  - dayRange: dayRange
```

### Seções do Dashboard
1. **Máquinas Paradas** — Grid de cards com máquinas em status != `ativa` e != `inativa`
   - Exibe: nome da máquina, status (badge colorido), tempo decorrido (atualiza a cada 1 segundo via `nowTick`)
   - Tempo vem do `machine_logs` aberto (sem `ended_at`) mais recente para aquela máquina
   - Clique no card → navega para `/:slug/machines`

2. **Produção por Turno** — 3 cards (Manhã, Tarde, Noite)
   - Cada card mostra: rolos, kg, faturamento (se admin)
   - Usa labels de turno com horários da empresa: `companyShiftLabels[shift].split(' (')[0]`

3. **Tendência de Produção** — `AreaChart` (recharts)
   - Dados agrupados por data: rolos, kg, faturamento, eficiência
   - X: `dd/MM` (ptBR), Y: valores
   - `ResponsiveContainer` height 300px
   - Série de faturamento exibida apenas para admin

4. **Top Máquinas** — Ranking das 5 melhores por rolos produzidos
   - Barra de progresso mostrando eficiência vs meta
   - Match de produção por `machine_id` OU `machine_name` (fallback para dados legados)

### Botões e Ações
- **"Ver Performance Completa"** → abre `MachinePerformanceModal`
- **Quick actions no header** (ícones): Máquinas, Produção, Relatórios → navegam para respectivas páginas
- **"Limpar Filtros"** → `clearFilters()` (visível quando `hasActiveFilters`)

---

## 📋 Relatórios (`Reports.tsx` — 1391 linhas)

### Abas de Análise
| Aba | Key | Gráfico | Tabela |
|-----|-----|---------|--------|
| Por Turno | `turno` | BarChart (rolos, kg, faturamento por turno) | Tabela com totais por turno |
| Por Máquina | `maquina` | BarChart horizontal | Tabela com eficiência e barra de progresso vs meta |
| Por Artigo | `artigo` | BarChart | Tabela com cliente, rolos, kg, faturamento |
| Por Tecelão | `tecelao` | BarChart | Tabela com produção por tecelão |
| Por Cliente | `cliente` | PieChart | Tabela com totais por cliente |
| Tendência | `tendencia` | AreaChart (evolução temporal) | — |
| Comparativo | `comparativo` | — | Comparação entre períodos |

### Filtros Adicionais (além dos padrões)
- **Busca por máquina** (`searchMachine`): Input de texto para filtrar na tabela "Por Máquina"
- **Busca por cliente** (`searchClient`): Input na aba "Por Cliente"
- **Busca por artigo** (`searchArticle`): Input na aba "Por Artigo"

### Exportação
**Controles:**
- `exportMode`: `'admin'` (com financeiro) ou `'employee'` (sem financeiro)
- `includeCharts`: Switch para incluir/excluir gráficos
- `exportFormat`: `'pdf'` ou `'csv'`

**Processo de geração:**
- PDF: Canvas-to-image para gráficos, renderiza com HTML→PDF
- CSV: Gera texto CSV com separador `;` para compatibilidade com Excel pt-BR
- Cabeçalho com logo da empresa (buscado via query em `companies.logo_url`)

### Agrupamento de dados
- **Por Máquina:** Match com `machine_id` OU `machine_name` (fallback)
- **Por Cliente:** Via `articleClientName` map: article.client_id → clients table → name OU article.client_name
- **Por Artigo:** `filtered.filter(p => p.article_id === a.id)`
- Todos filtram `records > 0` e ordenam por relevância

---

## ⚙️ Máquinas (`Machines.tsx`)

### Funcionalidades
- **CRUD completo** de máquinas
- **Nome padrão:** `"TEAR XX"` (XX = número com zero à esquerda se < 10)
- **Alteração de status:** Dropdown com todos os 6 status
  - Ao mudar status: cria novo `machine_log` (started_at = now, started_by = usuário logado)
  - Fecha log anterior (ended_at = now, ended_by = usuário logado)
- **Vinculação de artigo:** Select com artigos da empresa
- **RPM:** Input numérico
- **Modo de produção:** 'rolos' ou 'voltas' (alterável via `ProductionModeModal`)
- **Observações de manutenção:** Vinculadas ao `machine_log` ativo via `machine_maintenance_observations`

### Persistência
- Usa `saveMachines()` para salvar alterações (upsert + delete removidos)
- Usa `saveMachineLogs()` para salvar logs (upsert)
- Observações: insert direto em `machine_maintenance_observations`

---

## 🧵 Produção (`Production.tsx`)

### Fluxo de Registro
1. Selecionar **data** (Calendar popover) e **turno** (Select)
2. Selecionar **máquina** → auto-preenche artigo vinculado + RPM
3. Selecionar **tecelão** (filtrado por turno: fixo=turno ou específico=dentro do horário)
4. Informar **rolos** OU **voltas** (conforme `production_mode` da máquina)
5. Sistema calcula automaticamente:

### Cálculos
```
Se modo "rolos":
  peso_kg = rolos × weight_per_roll (do artigo)

Se modo "voltas":
  voltas_por_rolo = article_machine_turns[article_id+machine_id] || article.turns_per_roll
  rolos_equivalentes = voltas / voltas_por_rolo
  peso_kg = rolos_equivalentes × weight_per_roll

faturamento = peso_kg × value_per_kg (do artigo)

eficiência = (produção_real / produção_teórica) × 100
  produção_teórica = RPM × minutos_do_turno
```

### Voltas por Rolo Específicas
`article_machine_turns` permite configurar voltas diferentes para cada combinação artigo+máquina:
- Se existe registro para (article_id, machine_id) → usa esse valor
- Senão → usa `article.turns_per_roll` (padrão do artigo)

### Ações disponíveis
- **Adicionar produção:** `addProductions()` (incremental)
- **Editar produção:** `updateProductions()` (delete + insert específico)
- **Excluir produção:** `deleteProductions()` (delete específico)
- **Tabela de produções:** Listagem com filtros de data/turno, botões de editar/excluir por registro

---

## 🔍 Revisão (`Revision.tsx`)

- Registro de **defeitos** encontrados na revisão
- Campos: data, turno, máquina, artigo, tecelão, tipo de medida (kg ou metros), valor, observações
- Medição em **kg** ou **metros** (`measure_type`)
- Usa `addDefectRecords()` e `deleteDefectRecords()`
- Tabela com listagem e botão excluir por registro

---

## 🔧 Mecânica (`Mecanica.tsx`)

- Acessível por `mecanico` e `admin`
- Visualização de máquinas com status de manutenção
- Observações de manutenção durante paradas
- Usa dados de `machines`, `machine_logs` e `machine_maintenance_observations`

---

## 🏭 Terceirizado (`Outsource.tsx`)

### Modelo de Dados
- `outsource_companies`: Empresas terceirizadas (nome, contato, observações)
- `outsource_productions`: Produção terceirizada com cálculo automático:

```
profit_per_kg = client_value_per_kg - outsource_value_per_kg
total_revenue = weight_kg × client_value_per_kg
total_cost = weight_kg × outsource_value_per_kg
total_profit = weight_kg × profit_per_kg
```

### Funcionalidades
- CRUD de empresas terceirizadas
- CRUD de produções terceirizadas
- Cálculos de lucro automáticos
- Filtros de período

---

## 👷 Tecelões (`Weavers.tsx`)

### Campos
- **Código:** `#100` a `#999` (único)
- **Turno:**
  - `shift_type: 'fixo'` → `fixed_shift`: manha/tarde/noite
  - `shift_type: 'especifico'` → `start_time` + `end_time` (HH:MM)
- **Telefone:** Opcional

### Uso no registro de produção
- Filtrados por turno selecionado na tela de produção
- Turno fixo: aparece se `fixed_shift === turno`
- Turno específico: aparece se horário está dentro do turno

---

## 👥 Clientes & Artigos (`ClientsArticles.tsx`)

### Clientes
- CRUD simples: nome, contato, observações
- Usa `saveClients()` (delete all + insert)

### Artigos
- Vinculados a um cliente via `client_id`
- Campos: nome, peso/rolo (kg), valor/kg (R$), voltas/rolo, meta eficiência (%)
- **Voltas específicas por máquina:** Modal para configurar `article_machine_turns`
  - Permite definir voltas/rolo diferentes para cada máquina
  - Usa `saveArticleMachineTurns()`

---

## 💰 Sistema de Assinatura (`SubscriptionContext.tsx`)

### Status e Comportamento

| Status | `sidebarLocked` | `fullyBlocked` | Comportamento |
|--------|-----------------|----------------|---------------|
| `free` | false | false | Acesso total, sem cobrança |
| `trial` | false | false | Acesso total, badge "Teste grátis • Xd" |
| `active` | false | false | Acesso total, badge "Assinatura Ativa" com Crown |
| `cancelling` | false | false | Acesso total até fim do período, badge "Assinatura Cancelada" |
| `grace` | false | false | Carência 5 dias após trial, badge "Em Atraso" |
| `overdue` | **true** (admin) | **true** (outros) | Pagamento atrasado |
| `blocked` | **true** (admin) | **true** (outros) | Bloqueado |
| `cancelled` | **true** (admin) | **true** (outros) | Cancelado |

### Cálculos internos
```typescript
isExpired = status === 'blocked' || status === 'cancelled' || status === 'overdue';
sidebarLocked = isExpired && isAdmin;    // Admin: sidebar com cadeados, só Settings
fullyBlocked = isExpired && !isAdmin;     // Outros: tela de bloqueio total
```

### Lógica de determinação de status
1. Se `subscription_status === 'free'` → status `free`
2. Se `subscription_status === 'active'` → status `active`
3. Se `subscription_status === 'cancelling'`:
   - Se `grace_period_end` expirou → `cancelled`
   - Senão → `cancelling`
4. Se `subscription_status === 'trial'`:
   - Calcula dias restantes: `trial_end_date - now`
   - Se `> 0` → `trial` (com `trialDaysLeft`)
   - Se `≤ 0`: verifica carência (5 dias após trial_end_date)
     - Se dentro da carência → `grace`
     - Se após → `blocked`

### Refresh automático
- `window.addEventListener('subscription-updated')` → re-busca dados
- Disparado após pagamentos bem-sucedidos

### Pagamento
- **Pix:** Via SyncPayments — Edge Function `create-pix-checkout` gera QR Code
  - Polling automático via `check-pix-payment` a cada 5 segundos
  - Webhook `syncpay-webhook` para confirmação assíncrona
- **Cartão:** Via Stripe — Edge Function `create-checkout` gera sessão
  - Até 12x no plano anual
- **Valores:** Configuráveis por empresa no `/admin` (campo `monthly_plan_value`)
- **Plano anual:** 40% de desconto (calculado: mensal × 12 × 0.6)

---

## 📱 Layout e Responsividade

### Desktop (`AppLayout.tsx`)
**Estrutura:**
```
┌─────────────────────────────────────────────────┐
│ Header (h-14, sticky top-0 z-10)                │
│ ┌──────┐ ┌──────────────────────────────────┐   │
│ │Sidebar│ │                                  │   │
│ │(colla-│ │     Content (Outlet)             │   │
│ │psible)│ │                                  │   │
│ │      │ │                                  │   │
│ └──────┘ └──────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Header contém (da esquerda para direita):**
1. `SidebarTrigger` (botão hamburger)
2. (centro/direita) Badge de turno atual (Manhã/Tarde/Noite) + data
3. Badge de assinatura (conforme status)
4. Separador vertical
5. Botão tema (Sun/Moon)
6. Botão notificações (Bell)
7. Dropdown do usuário: nome, role, empresa, botão Sair

**Dropdown de logout:** Abre `AlertDialog` de confirmação

### Sidebar (`AppSidebar.tsx`)
- `Sidebar collapsible="icon"` (shadcn/ui sidebar)
- **Header:** Logo da empresa (buscada de `companies.logo_url`) OU ícone padrão MalhaGest
- **Items:** Filtrados por:
  1. `enabled_nav_items` da `company_settings`
  2. `filterNavItems()` por role
  3. No mobile: remove items do `MobileBottomNav` para evitar duplicação

**Item bloqueado (assinatura expirada):**
- Ícone `Lock` com cor `text-muted-foreground/40`
- `cursor-not-allowed`, não clicável
- Exceção: `settings` nunca é bloqueado

**Redirect automático:** Se `sidebarLocked` e rota não é `/settings` → redireciona para settings

### Mobile (`MobileBottomNav.tsx`)
**Barra inferior fixa** (`fixed bottom-0 left-0 right-0 z-50`):
- Visível apenas em `md:hidden`
- Safe area para devices com home indicator: `h-[env(safe-area-inset-bottom)]`
- **Content padding:** `main` tem `pb-20` no mobile para não sobrepor bottom nav

**Items por role:**
```typescript
const MOBILE_FOOTER_KEYS = {
  admin:     ['dashboard', 'production', 'outsource', 'settings'],
  lider:     ['dashboard', 'machines', 'production', 'revision', 'mecanica', 'outsource'],
  mecanico:  ['machines', 'mecanica'],
  revisador: ['production', 'revision'],
};
```

**Filtragem adicional:** `enabled_nav_items` (company) → `filterNavItems` (role)

**Item ativo:** Detectado por `location.pathname.startsWith(slugPrefix/path)` ou pathname === slugPrefix para dashboard

**Item bloqueado:** Ícone Lock, `cursor-not-allowed`, exceção para settings

**Deduplicação sidebar/bottom:** `getMobileFooterKeys()` exportada — sidebar remove esses items no mobile

---

## 🛡️ Painel Admin da Plataforma (`Admin.tsx` — 850 linhas)

### Acesso
- Rota: `/admin`
- Requer login com email/senha de um usuário que exista em `platform_admins`
- Verificado via `supabase.from('platform_admins').select().eq('user_id', session.user.id)`

### Abas

**1. Empresas:**
- Tabela: Nome, Admin, Email, WhatsApp (link wa.me), Usuários, Plano (R$), Status, Criado em
- Clique na linha → abre modal de configuração

**Modal de empresa:**
- Valor do plano mensal (Input numérico)
- Toggle "Usuário Grátis" (marca `subscription_status = 'free'`, força `platform_active = true`)
- Toggle "Acesso à Plataforma" (desabilitado se gratuito)
- Grid de toggles para `enabled_nav_items` (ativar/desativar módulos individualmente)
- Histórico de emails (se existir)

**2. Usuários:**
- Tabela: Nome, Email, Empresa, Cargo (badge), Status, Criado em
- Clique → modal para ativar/desativar módulos do sidebar da empresa

**3. Configurações da Plataforma:**
- Dias de teste (trial)
- Preço mensal padrão
- Cálculo automático do plano anual (40% desconto)

**4. Backups:**
- Listagem agrupada por empresa em cards, cada card com nome da empresa + badge de contagem
- Dentro de cada card: tabela com Data do Backup (badge), Criado em (data+hora), botão Reverter
- Botão "Executar Backup Agora" → chama `admin-api` action `trigger_backup`
- Botão "Reverter" por backup → `confirm()` + chama `restore-backup` Edge Function
- Filtro por nome da empresa
- Backups ordenados por `created_at DESC`

### Edge Function `admin-api` — Actions disponíveis
| Action | Descrição |
|--------|-----------|
| `list_companies` | Lista empresas com settings, user_count, email_history |
| `list_users` | Lista profiles com company info |
| `update_settings` | Atualiza company_settings (plano, active, nav items, subscription_status) |
| `update_user_nav_items` | Atualiza enabled_nav_items de uma empresa |
| `get_platform_settings` | Busca platform_settings (key-value) |
| `update_platform_settings` | Upsert nas platform_settings |
| `list_backups` | Lista backups com company name, ordenado por created_at DESC |
| `trigger_backup` | Chama daily-backup Edge Function via HTTP |

---

## 🔄 Sistema de Backup

### Backup Automático
- **Cron job:** `pg_cron` configurado para executar `daily-backup` **todo dia às 00:00 UTC**
- **Sem constraint UNIQUE** em (company_id, backup_date) — permite múltiplos backups por dia

### Edge Function `daily-backup`
- Busca todas as empresas
- Para cada empresa, busca dados de **29 tabelas**:
  ```
  machines, machine_logs, machine_maintenance_observations, articles,
  article_machine_turns, clients, weavers, productions, defect_records,
  outsource_companies, outsource_productions, outsource_yarn_stock,
  profiles, company_settings, audit_logs, payment_history,
  invoices, invoice_items, residue_materials, residue_sales,
  accounts_payable, yarn_types, tv_panels, email_history,
  iot_devices, iot_downtime_events, iot_machine_assignments,
  iot_shift_state, machine_readings, companies (o próprio registro)
  ```
- `machine_logs` é buscado via `machine_id IN (machines da empresa)`
- Insere registro em `company_backups` com JSON completo
- Limpa backups > 30 por empresa (mantém os 30 mais recentes)

### ⚠️ REGRA OBRIGATÓRIA — Novas Tabelas e Backup
> **Toda vez que uma nova tabela for criada no banco de dados**, ela **DEVE** ser adicionada em:
> 1. `supabase/functions/daily-backup/index.ts` → array `TABLES_TO_BACKUP`
> 2. `supabase/functions/restore-backup/index.ts` → arrays `DELETE_ORDER` e `INSERT_ORDER` (respeitando ordem de dependência FK)
> 3. Esta seção do `mestre.md` → lista de tabelas acima
>
> **NÃO é permitido** criar uma tabela com dados de empresa sem incluí-la no sistema de backup. Isso garante que nenhum dado seja perdido em restaurações.

### Edge Function `restore-backup`
- Requer autenticação de platform_admin
- Busca backup pelo ID
- **Delete em ordem** (filhos primeiro): outsource_productions → defect_records → productions → ... → profiles
- **Insert em ordem** (pais primeiro): profiles → company_settings → clients → machines → ...
- Insere em batches de 100
- Atualiza registro da empresa (update, não insert)

---

## 🔒 Segurança

### Row-Level Security (RLS)
- **Padrão:** `company_id = get_user_company_id()` para SELECT, INSERT, UPDATE, DELETE
- **`machine_logs`:** `machine_id IN (SELECT id FROM machines WHERE company_id = get_user_company_id())`
- **`company_backups`:** Apenas `platform_admins` podem SELECT e DELETE
- **`platform_admins`:** Apenas o próprio usuário pode SELECT seu registro

### Funções de Segurança (SECURITY DEFINER)
| Função | Descrição |
|--------|-----------|
| `get_user_company_id()` | Retorna UUID da empresa ativa do usuário (de `user_active_company`) |
| `get_user_companies()` | Lista empresas do usuário (join profiles + companies) |
| `set_active_company(_company_id)` | Define empresa ativa (valida acesso via profiles) |
| `is_platform_admin(_user_id)` | Retorna boolean se é admin da plataforma |

### Trigger de Proteção
- `prevent_profile_privilege_escalation`: Em UPDATE de `profiles`, impede alteração de `company_id` e `role` (exceto service_role)

---

## 🎨 Design System

### Tokens CSS (`index.css`)
- Todas as cores em **HSL** — NUNCA usar hex ou rgb em componentes
- Suporta tema claro e escuro via `ThemeProvider` (next-themes)
- Cores semânticas: `--primary`, `--secondary`, `--destructive`, `--success`, `--warning`, `--info`
- Variantes de botão: `btn-gradient` (gradiente primário)
- Sombras: `shadow-material` (cards)

### Componentes UI
- Base: **shadcn/ui** (Radix + Tailwind)
- **NUNCA** usar cores hardcoded (`text-red-500`) — sempre tokens semânticos (`text-destructive`)
- **NUNCA** editar `client.ts`, `types.ts`, `.env`

---

## 📦 Dependências Principais

| Pacote | Uso | Onde |
|--------|-----|------|
| `react-router-dom` | Roteamento SPA | App.tsx, todos os componentes |
| `@tanstack/react-query` | Cache de dados | Reports.tsx (logo) |
| `@supabase/supabase-js` | Client Supabase | useCompanyData, AuthContext, etc. |
| `recharts` | Gráficos | Dashboard, Reports (BarChart, AreaChart, LineChart, PieChart) |
| `date-fns` + `date-fns/locale/ptBR` | Datas | Filtros, formatação |
| `sonner` | Toasts | Importado via `@/hooks/use-toast` |
| `lucide-react` | Ícones | Todos os componentes |
| `zod` | Validação | Edge functions |
| `react-hook-form` | Formulários | Settings, Register |
| `qrcode.react` | QR Code Pix | Settings (pagamento) |
| `next-themes` | Tema claro/escuro | ThemeProvider |

---

## 🔧 Utilitários

### `formatters.ts`
```typescript
formatNumber(value, decimals=0)  → "1.234" (pt-BR)
formatCurrency(value)            → "R$ 1.234,56"
formatWeight(value)              → "1.234,5 kg"
formatPercent(value)             → "85,3%"
```

### `downtimeUtils.ts`
- **`calculateShiftDowntime(machineLogs, machineId, dateStr, shift, shiftSettings, totalShiftMinutes)`**
  - Filtra logs de parada (manutencao_preventiva, corretiva, troca_artigo, inativa)
  - Clipa duração nos limites do turno (shiftStart/shiftEnd)
  - Trata turnos que cruzam meia-noite (noite 22:00→05:00 → end.setDate(+1))
  - Retorna: `{ events[], totalDowntimeMinutes, effectiveShiftMinutes }`

- **`formatDowntimeMinutes(minutes)`** → `"2h 30min"`, `"45min"`, `"3h"`

### `auditLog.ts`
- `logAudit(action, details, user)` → insere em `audit_logs`

---

## ⏰ Turnos

### Configuração Padrão (`DEFAULT_SHIFT_SETTINGS`)
| Turno | Início | Fim | Duração |
|-------|--------|-----|---------|
| Manhã | 05:00 | 13:30 | 510 min |
| Tarde | 13:30 | 22:00 | 510 min |
| Noite | 22:00 | 05:00 | 420 min |

### Funções utilitárias (`types/index.ts`)
- `getShiftMinutes(start, end)`: Calcula duração em minutos (trata cruzamento de meia-noite)
- `getCompanyShiftMinutes(settings)`: Retorna `Record<ShiftType, number>` com durações
- `getCompanyShiftLabels(settings)`: Retorna `Record<ShiftType, string>` com labels formatados

### Detecção de turno atual (`getCurrentShift()`)
```typescript
const h = new Date().getHours();
if (h >= 5 && h < 13) return 'manha';
if (h >= 13 && h < 22) return 'tarde';
return 'noite';
```
Usado no header (AppLayout) para badge de turno e no Dashboard para highlight.

---

## 🔄 Edge Functions

| Função | JWT | Descrição |
|--------|-----|-----------|
| `admin-api` | false | Operações administrativas (verifica platform_admin internamente) |
| `create-company-profile` | — | Cria empresa + perfil + settings no registro |
| `manage-users` | — | CRUD de usuários da empresa (create, delete, update role/status) |
| `update-user-email` | — | Alteração de email com histórico em `email_history` |
| `setup-admin` | — | Setup inicial do admin da plataforma |
| `create-checkout` | — | Cria sessão de checkout Stripe |
| `create-pix-checkout` | — | Gera cobrança Pix via SyncPayments |
| `check-pix-payment` | — | Verifica status do pagamento Pix |
| `check-pix-expiry` | — | Verifica Pix expirado nos dias 4-5 de atraso |
| `syncpay-webhook` | — | Webhook para confirmação automática SyncPayments |
| `check-subscription` | — | Verifica e atualiza status da assinatura |
| `customer-portal` | — | Redireciona para portal Stripe |
| `daily-backup` | false | Backup automático dos dados de todas as empresas |
| `restore-backup` | false | Restauração de backup (verifica platform_admin internamente) |
| `notify-accounts-due` | false | Notificação WhatsApp (UltraMsg) de contas a pagar (véspera + dia) |
| `test-webhook` | false | Teste de envio WhatsApp via UltraMsg |
| `notify-subscription-status` | false | Cron diário de verificação de pagamentos e alertas de suspensão |
| `machine-webhook` | false | Recebe dados do ESP32 (IoT), processa leituras e produção automática |
| `validate-tv-code` | false | Valida código de 5 dígitos e conecta TV à empresa |
| `tv-panel-data` | false | Busca dados de produção para painéis TV |

---

## 📝 Convenções de Código

1. **Tipos:** Definidos em `src/types/index.ts` — NUNCA duplicar
2. **Dados:** Acessar SEMPRE via `useSharedCompanyData()` — NUNCA buscar direto do Supabase nas páginas
3. **Formatação:** Usar `formatters.ts` — NUNCA formatar manualmente
4. **Cores:** Usar tokens CSS semânticos — NUNCA usar cores hardcoded
5. **RLS:** Toda tabela nova DEVE ter policies baseadas em `get_user_company_id()`
6. **Arquivos protegidos:** NUNCA editar `client.ts`, `types.ts`, `.env`
7. **Edge Functions:** Código em `supabase/functions/<name>/index.ts` — sem subpastas
8. **Filtros:** Qualquer alteração nos filtros de Dashboard DEVE ser replicada em Reports (e vice-versa)
9. **Match de dados legados:** Sempre usar fallback por `machine_name`/`article_name` quando `machine_id`/`article_id` pode ser null
10. **Batches:** Inserts de produção em batches de 500 para evitar timeout

---

## ⚠️ Dependências Críticas Entre Módulos

| Se modificar... | Verifique impacto em... |
|-----------------|------------------------|
| Filtros (Dashboard) | Reports (mesma lógica), periodSummary |
| `useCompanyData` (getters/savers) | TODAS as páginas que usam dados |
| `types/index.ts` | TODOS os componentes que importam tipos |
| `usePermissions` | Sidebar, MobileBottomNav, ProtectedRoute |
| `SubscriptionContext` | AppLayout, AppSidebar, MobileBottomNav |
| `AppSidebar` items | MobileBottomNav (deduplicação) |
| `machine_status` enum | types/index.ts, Machines, Dashboard, downtimeUtils |
| `company_settings` (schema) | useCompanyData, SubscriptionContext, AppSidebar, Admin |
| `articles` (schema) | Production (cálculos), Reports, ClientsArticles |
| Edge Functions (admin-api) | Admin.tsx |
| `daily-backup` | restore-backup (mesmas tabelas), Admin (backups tab) |

---

## 📅 Histórico de Alterações

| Data & Hora (Brasília) | Alteração |
|------------------------|-----------|
| 28/03/2026 21:00 | Criação deste arquivo mestre.md |
| 28/03/2026 21:15 | Correção do filtro de mês no Dashboard/Reports (dayRange===0 bloqueava filtro) |
| 28/03/2026 21:30 | Correção do filtro por máquina nos Relatórios (fallback por machine_name) |
| 28/03/2026 22:00 | Renomeação TEAR 3→TEAR 03, TEAR 4→TEAR 04 |
| 28/03/2026 22:15 | Vinculação de 19.531 produções ao machine_id correto via migração |
| 28/03/2026 22:30 | Remoção de prefixos "Todos os" nos filtros de Relatórios |
| 28/03/2026 23:00 | Criação dos artigos MALHA 1,12-115 MISTO e MALHA 1,35-115 MISTO |
| 28/03/2026 23:15 | Vinculação de 777 produções órfãs aos novos artigos (0 órfãs restantes) |
| 29/03/2026 00:00 | Backup: removida constraint UNIQUE(company_id,backup_date) para múltiplos/dia |
| 29/03/2026 00:05 | Backup: alterado de UPSERT para INSERT no daily-backup |
| 29/03/2026 00:06 | Backup: configurado pg_cron para executar daily-backup todo dia às 00:00 UTC |
| 29/03/2026 00:10 | Backup: list_backups agora ordena por created_at DESC (mostra hora correta) |
| 29/03/2026 01:00 | Reescrita completa do mestre.md com detalhamento exaustivo de todos os módulos |
| 29/03/2026 02:00 | Facebook Pixel integrado (ID 952929367422534) — PageView, CompleteRegistration, InitiateCheckout, Purchase |
| 29/03/2026 22:00 | Corrigida exclusão de usuários (admin-api DELETE) — agora remove perfil e usuário auth corretamente |
| 29/03/2026 22:15 | Adicionado loading spinner no botão de exclusão de usuário (estado "Excluindo...") |
| 29/03/2026 23:00 | Removida opção "Configurações" do sidebar/bottom nav para usuários não-admin; adicionado botão "Sair" no sidebar footer |
| 30/03/2026 00:00 | PWA: criado `public/sw.js` (service worker mínimo) e registro condicional em `main.tsx` para habilitar instalação no Android/Chrome |
| 30/03/2026 00:15 | Botão "Instalar App" no sidebar — detecta plataforma (Android/iOS/Desktop), exibe instruções iOS, usa `beforeinstallprompt` no Android |
| 30/03/2026 00:30 | Regras do mestre.md reforçadas: fuso Brasília obrigatório, histórico obrigatório após cada alteração, instrução de leitura prévia |
| 30/03/2026 01:00 | Login de platform_admin redireciona para /admin via window.location.href (evita race condition com PublicRoute); RootRedirect também verifica platform_admins para redirecionar admins da plataforma |
| 30/03/2026 02:00 | **AUDITORIA PRÉ-LANÇAMENTO:** BUG CRÍTICO corrigido — `saveArticles()` em `useCompanyData.ts` NÃO incluía `target_efficiency` no mapeamento de rows para insert, causando reset para 80% (default do DB) toda vez que artigos eram salvos. Campo adicionado: `target_efficiency: a.target_efficiency ?? 80` |
| 30/03/2026 02:00 | **AUDITORIA PRÉ-LANÇAMENTO:** BUG corrigido — `addDefectRecords()` em `useCompanyData.ts` NÃO incluía `created_by_name` e `created_by_code` no mapeamento, impedindo rastreabilidade de quem registrou o defeito. Campos adicionados ao insert |
| 30/03/2026 03:00 | **CORREÇÃO:** `machine_logs` agora usa `fetchAll` com paginação (sem limite de 1000 registros) |
| 30/03/2026 03:00 | **CORREÇÃO:** `troca_agulhas` adicionado à lista de DOWNTIME_STATUSES — desconta tempo parado do cálculo de eficiência |
| 30/03/2026 03:00 | **CORREÇÃO:** `saveClients/saveArticles/saveWeavers` agora usam UPSERT + DELETE seletivo em vez de DELETE ALL + INSERT |
| 30/03/2026 16:00 | **AUDITORIA ASSINATURA:** BUG corrigido — cancelamento de assinatura agora seta `grace_period_end` (antes ficava eternamente em `cancelling`). `check-subscription` Edge Function agora: (1) verifica `grace_period_end` no status `cancelling` e transiciona para `cancelled` quando expirado, (2) trata `blocked`/`cancelled` antes do trial check, (3) Stripe check encapsulado em try-catch para não falhar quando sistema usa Pix |
| 31/03/2026 00:30 | **IMPORTAÇÃO FIREBASE:** Importados 261 registros de produção dos dias 27, 28 e 29/03 do Firebase para o Supabase (empresa Trama Certa, usuário felipeeck182@gmail.com) |
| 31/03/2026 01:00 | **CORREÇÃO DADOS:** Corrigido dia 25/03 — faltavam 2 rolos do TEAR 22 turno tarde (COTTON LEVE PENTEADO, múltiplos artigos). Registro inserido, total agora bate com Firebase (898 rolos) |
| 31/03/2026 01:30 | **FORMATAÇÃO:** Eficiência agora exibida com 2 casas decimais (ex: 76,90%) em todo o sistema — `formatPercent` em `formatters.ts` alterado de `toFixed(1)` para `toFixed(2)`, e corrigidos `toFixed(1)` manuais em `Production.tsx` e `Weavers.tsx` |
| 31/03/2026 02:00 | **UI MOBILE:** Modal "Registrar Falha" (Revisão) melhorado para mobile — campos agora empilham em coluna única (`grid-cols-1 sm:grid-cols-2`) e dropdown de Máquina forçado a abrir para baixo (`position="popper" side="bottom"`) |
| 31/03/2026 02:15 | **CORREÇÃO:** Nome de máquinas 1-9 agora usa `padStart(2, '0')` no save (era `TEAR ${number}` sem padding). Corrigido "TEAR 1" → "TEAR 01" no banco. 4 ocorrências corrigidas em `Machines.tsx` |
| 31/03/2026 02:30 | **RENOMEAÇÃO:** "Troca de Agulhas" → "Troca de Agulheiro" em todo o sistema (`types/index.ts`, `Machines.tsx`, `Mecanica.tsx`) |
| 31/03/2026 03:00 | **REDESIGN PDF:** Exportação de relatórios PDF redesenhada para igualar o sistema antigo — header com barra teal/verde-claro com logo, nome da empresa e data; tabela limpa com bordas leves, cabeçalho cinza, linha TOTAL em bold. Adicionado `companyName` ao export |
| 31/03/2026 03:30 | **PDF — Remoção do cabeçalho do navegador:** Removido o título da aba (`<title>`) na janela de impressão para que o browser não exiba "31/03/2026, 00:24 RELATÓRIO PRODUÇÃO - MÁQUINAS" no topo do PDF impresso, pois já existe título e data no próprio relatório |

---

## 📊 Facebook Pixel (Rastreamento de Conversão)

**Pixel ID:** `952929367426534`

### Arquitetura
- **Script base:** Inserido diretamente no `index.html` (antes do `<div id="root">`) — carrega o SDK `fbevents.js` e inicializa o pixel com `fbq('init', '952929367426534')`.
- **Utilitário:** `src/lib/fbPixel.ts` exporta `fbTrack(event, params?)` — wrapper seguro que verifica se `window.fbq` existe antes de disparar.

### Eventos Disparados

| Evento | Onde é disparado | Arquivo | Momento |
|--------|-----------------|---------|---------|
| `PageView` | Página de Vendas `/vendas` | `src/pages/Vendas.tsx` | No `useEffect` ao montar o componente |
| `CompleteRegistration` | Registro de empresa `/register` | `src/pages/Register.tsx` | Após `register()` retornar sucesso (`result.success && result.slug`) |
| `InitiateCheckout` | Geração de PIX nas Configurações | `src/pages/Settings.tsx` | Após `create-pix-checkout` retornar com sucesso, inclui `{ value, currency: 'BRL', content_name }` |
| `Purchase` | Confirmação de pagamento PIX | `src/pages/Settings.tsx` | Quando polling de `check-pix-payment` retorna `status === 'paid'`, inclui `{ value, currency: 'BRL' }` |

### Dependências
- `index.html` → script base do pixel (não remover)
- `src/lib/fbPixel.ts` → usado por Vendas.tsx, Register.tsx, Settings.tsx
- **Não requer API key server-side** — rastreamento é 100% client-side

### ⚠️ Cuidados
- Ao alterar o fluxo de registro em `AuthContext.tsx` ou `Register.tsx`, garantir que `fbTrack('CompleteRegistration')` continue sendo chamado após sucesso.
- Ao alterar o fluxo de pagamento PIX em `Settings.tsx`, garantir que `InitiateCheckout` e `Purchase` continuem nos pontos corretos.
- O `PageView` do Vendas é disparado **além** do PageView automático do noscript fallback — isso é intencional para rastreamento SPA.

---

## 📅 Histórico de Alterações

- **31/03/2026 04:00** — Exportação PDF agora faz download direto do arquivo (com nome `relatorio_<tipo>_<data>.pdf`) em vez de abrir nova aba com diálogo de impressão.
- **31/03/2026 04:15** — Corrigido PDF em branco: elemento off-screen não era capturado pelo html2canvas.
- **31/03/2026 04:30** — Corrigido PDF em branco (2ª tentativa): iframe oculto com HTML completo.
- **31/03/2026 05:00** — Refatoração completa da exportação PDF: removido `html2pdf.js` e substituído por `jsPDF` direto (como no projeto antigo). PDFs são construídos programaticamente com cabeçalho estilizado, gráficos de barras horizontais e tabelas formatadas. 100% confiável, sem dependência de html2canvas. Aplicado em Reports.tsx e Outsource.tsx (landscape com KPIs).
- **31/03/2026 05:30** — Redesign do cabeçalho dos PDFs exportados: retângulo cinza com título centralizado, nome da empresa + data/hora na esquerda, período do filtro na direita. Aplicado em Reports.tsx e Outsource.tsx.
- **31/03/2026 06:00** — Logo da empresa agora é exportada no cabeçalho dos PDFs (Reports e Terceirizados) quando cadastrada em Configurações > Empresa. Imagem é carregada via canvas para base64 e inserida com `pdf.addImage()`.
- **31/03/2026 06:15** — Quando há logo cadastrada, o PDF exibe somente a logo (sem nome da empresa em texto) acima da data/hora no canto esquerdo. Sem logo, exibe o nome da empresa normalmente.
- **31/03/2026 06:30** — Logo no PDF agora é exportada com proporções originais (aspect ratio preservado), ajustada apenas na altura para caber no cabeçalho.
- **31/03/2026 04:19** — Cabeçalho dos PDFs de Relatórios e Terceirizados reajustado para seguir o layout do sistema legado: caixa cinza fina, título centralizado com quebra automática, data/hora dentro do cabeçalho à esquerda e período alinhado à direita.
- **31/03/2026 04:26** — Auditoria de código nos Relatórios e Terceirizados: removido template HTML morto (nunca usado) do export Outsource; removido import `useQuery` não utilizado em Reports.tsx; corrigido `setFont` duplicado no PDF header; adicionada coluna "Eficiência (%)" na tabela PDF "Por Turno" (faltava nos exports); corrigido label da legenda do gráfico de barras por turno (era "rolos", agora "Peças"); removido comentário desatualizado.
- **31/03/2026 04:45** — Corrigido valores de eficiência nos PDFs exportados (Por Turno e Por Máquina): agora exibem "%" após o número (ex: 34,5% em vez de 34,5).
- **31/03/2026 05:00** — Período do filtro no cabeçalho do PDF movido para a mesma altura da data/hora (parte inferior do cabeçalho, alinhado à direita).
- **01/04/2026 00:30** — Removido todo o histórico de pagamentos de teste (7 registros) da empresa do usuário felipeeck182@gmail.com via migration SQL.
- **01/04/2026 02:00** — Importados 88 registros de produção do dia 30/03/2026 do Firebase (gestao-malharia) para o Supabase (empresa Trama Certa). 30 manhã + 29 tarde + 29 noite. Artigo "NEO SOUL POWER" criado no Supabase (não existia). Total: 792 rolos, 16.094kg, R$26.293,17.
- **01/04/2026 03:30** — Melhorias no modal de registro de produção: (1) Fluxo de avanço alterado para ciclar turnos primeiro na mesma máquina (manhã→tarde→noite) antes de avançar para a próxima máquina; (2) Artigo selecionado agora persiste entre registros (não limpa ao avançar); (3) Filtro de artigo melhorado: busca por nome do cliente e normalização numérica (ex: "190" encontra "1,90").
- **01/04/2026 04:00** — Preview de eficiência no modal de produção redesenhado: fontes maiores (eficiência em 2xl/3xl), padding maior, borda colorida (verde se atingiu meta, vermelha se não), métricas mais legíveis.
- **01/04/2026 04:15** — Cores do preview de eficiência ajustadas para dark mode: backgrounds com opacidade (emerald/yellow/red 500/15-20%), textos com text-foreground/70 em vez de text-muted-foreground, bordas mais visíveis.
- **01/04/2026 04:30** — Pente fino no modal de produção: (1) articleSearch agora é limpo ao avançar (evita filtro residual no dropdown); (2) Corrigido exibição de `(null)` no dropdown de artigos quando client_name é nulo — agora mostra apenas o nome do artigo; (3) Mesma correção aplicada nos artigos adicionais.
- **02/04/2026 00:30** — Modal "Registrar Produção Terceirizada" ampliado de max-w-lg para w-[95vw] sm:w-[80vw] sm:max-w-2xl com max-h-[80vh] e overflow-y-auto, seguindo padrão de modais do sistema.
- **02/04/2026 03:00** — Correções no modal "Configurar Voltas por Máquina": (1) Adicionado estado de loading no botão salvar com spinner; (2) Adicionado try/catch com toast de erro; (3) Adicionada validação de máquinas duplicadas antes de salvar; (4) Botões desabilitados durante salvamento.
- **02/04/2026 03:30** — Adicionado campo de busca (lupa) na página de Produção para filtrar registros por máquina, tecelão ou artigo. Busca textual em tempo real, integrada com os filtros existentes. Limpa junto com "Limpar Filtros".
- **02/04/2026 04:00** — Produções registradas agora exibem o nome do cliente ao lado do artigo no formato "ARTIGO (CLIENTE)" na listagem de produção.
- **02/04/2026 04:30** — Filtro de data em Produção agora abre no último dia com produção registrada ao invés de sempre mostrar a data atual.
- **02/04/2026 05:00** — Redirecionamento PWA para colaboradores: (1) Slug da empresa é salvo no localStorage ao logar via CompanyLogin ou ao acessar AppLayout; (2) Tela de login raiz (/) auto-redireciona para /{slug-salvo}/login se houver slug no localStorage; (3) Adicionado botão "Acessar portal da empresa" na tela de login raiz com input para digitar o slug da empresa manualmente.
- **02/04/2026 05:30** — Valor/Kg oculto para usuários não-admin na listagem e no formulário de artigos (Clientes & Artigos), usando canSeeFinancial do usePermissions.
- **02/04/2026 06:00** — Módulo Terceirizado removido do acesso de usuários não-admin (lider). Agora apenas admin pode acessar.
- **02/04/2026 06:30** — Removidos Dashboard, Produção e Relatórios do acesso de não-admin. Líder agora acessa: Máquinas, Clientes & Artigos, Revisão, Mecânica, Tecelões. Revisador agora acessa apenas Revisão (produção removida).
- **02/04/2026 07:00** — Sistema de permissões extras por usuário: (1) Coluna `permission_overrides` (JSONB) adicionada à tabela `profiles`; (2) Ícone de olho na listagem de usuários (Settings > Usuários) abre modal para conceder permissões bloqueadas por padrão: Financeiro, Dashboard, Produção, Relatórios e Terceirizado; (3) `usePermissions` agora mescla permissões do role com overrides do usuário; (4) Edge Function `manage-users` suporta ação `update_permissions`; (5) Descrições de roles e ROLE_PERMISSIONS atualizados para refletir permissões restringidas.
- **02/04/2026 07:30** — Correção do botão Desativar usuário: (1) Enviava `p.id` (profile row) em vez de `p.user_id` (auth user id); (2) Botão de desativar agora oculto para o próprio admin logado (não pode desativar a si mesmo).
- **02/04/2026 08:00** — Terceirizados > Relatórios: Adicionado botão "Exportar por Malharia" que gera PDF agrupado por malharia terceirizada, com tabela detalhada por artigo mostrando kg produzidos, rolos, receita, custo e lucro/prejuízo. Inclui KPIs globais, barras coloridas por malharia e totais por empresa. Artigos ordenados por lucro decrescente.
- **02/04/2026 08:30** — Revisão de código (pente fino): Corrigido bug no botão Editar usuário (Settings > Usuários) que enviava `editingUser.id` (profile row) em vez de `editingUser.user_id` para a Edge Function `manage-users`. Sem outros bugs encontrados nas alterações recentes.
- **02/04/2026 09:00** — Corrigido bug de tela cinza após registro: a função `register` no AuthContext não carregava `companies` após criar a empresa via Edge Function, fazendo o CompanyRoute renderizar `null` (tela vazia). Agora `fetchUserCompanies()` é chamado junto com `fetchProfile()` após o registro.
- **02/04/2026 09:30** — Corrigido seletor de Artigo e Tecelão no modal de produção: substituído Select+Input (Radix) por novo componente `SearchableSelect` usando Popover+ScrollArea. Resolve: (1) lista começava de baixo para cima (Radix fazia scroll para item selecionado); (2) foco saía da busca ao digitar (typeahead interno do Radix capturava teclas). Busca agora recebe foco automaticamente ao abrir e mantém foco estável. Aplicado também nos seletores de artigos adicionais.
- **02/04/2026 09:45** — Aumentada área visível do SearchableSelect de 200px para 260px para mostrar mais itens simultaneamente, facilitando navegação manual por scroll.
- **02/04/2026 12:30** — Ajustado dropdown do SearchableSelect para navegação manual com lista completa visível por scroll nativo: removido `ScrollArea` do Radix dentro do seletor e substituído por container com `overflow-y-auto` e altura maior (360px), evitando a impressão de que existem apenas os itens da primeira tela.
- **02/04/2026 13:00** — Scrollbar lateral oculta no SearchableSelect (seletores de Artigo e Tecelão): adicionado `scrollbar-hide` (webkit), `scrollbarWidth: none` (Firefox) e `msOverflowStyle: none` (IE/Edge). Scroll continua funcionando via roda do mouse.
- **02/04/2026 13:30** — Subtítulo da página Produção agora exibe a data selecionada no filtro em vez da data atual fixa.
- **02/04/2026 14:00** — Pente fino no sistema de produção — 3 bugs corrigidos: (1) `created_by_name` e `created_by_code` não eram salvos no banco ao registrar/atualizar produção (campos faltavam no `addProductions`, `updateProductions` e `saveProductions`); (2) `mapProduction` não lia `created_by_name`/`created_by_code` do banco, então a informação de quem registrou era perdida ao recarregar; (3) Filtro de máquina/artigo na listagem de produção: selecionar "Todas as máquinas" ou "Todos os artigos" setava valor `"all"` que era comparado com `machine_id`, retornando 0 resultados — adicionado check `!== 'all'`.
- **02/04/2026 11:30** — **MÓDULO CONTAS A PAGAR:** Implementação completa conforme ContasPagar.md: (1) Tabela `accounts_payable` criada com RLS por `company_id`; (2) Página `/contas-pagar` com CRUD completo, filtros por status e busca, KPIs de totais pendente/vencido/pago; (3) Edge Function `notify-accounts-due` que busca contas vencendo amanhã e envia para webhook da Reportana (WhatsApp); (4) Cron job `pg_cron` configurado para executar diariamente às 08:00 (Brasília); (5) Atualização automática de status `vencido` para contas com vencimento passado; (6) Rota, sidebar e permissões configurados (apenas `admin`).
- **03/04/2026 00:00** — **MÓDULO IoT (Fases 1-3):** Implementação completa do monitoramento automático de produção via ESP32: (1) 5 tabelas criadas: `iot_devices`, `machine_readings`, `iot_shift_state`, `iot_downtime_events`, `iot_machine_assignments` com RLS e índices; (2) Edge Function `machine-webhook` criada e deployada — recebe dados do ESP32, valida token/empresa/máquina, salva leituras brutas, calcula delta de rotações, acumula voltas parciais, detecta paradas (cruzando IoT × machine_logs), troca automática de turno com crédito proporcional e insere produção automática; (3) UUID da empresa visível em Configurações → Empresa com botão copiar (admin); (4) UUID da máquina visível nos cards de Máquinas com botão copiar; (5) Tipo `ProductionMode` expandido para incluir `'iot'` com label "IoT (Automático)"; (6) Botão "Todas por IoT" adicionado ao modal de modo de produção. Nenhuma funcionalidade existente foi alterada — tudo é aditivo e só ativa quando `production_mode = 'iot'`.
- **03/04/2026 01:30** — **Pente fino IoT — 4 bugs corrigidos:** (1) `verify_jwt = false` adicionado no `config.toml` para `machine-webhook` — ESP32 envia token customizado, sem isso a função rejeitava todas as requisições; (2) `partial_turns` corrigido — acumulava infinitamente igual ao `total_turns`, agora armazena apenas o resto (voltas que não completaram 1 rolo); (3) Eficiência corrigida — usava `last_rpm` (última leitura) ao invés de RPM médio do turno; (4) Campos `rpm_sum` e `rpm_count` adicionados à tabela `iot_shift_state` para calcular RPM médio preciso (`rpm_sum / rpm_count`). Todos os campos são resetados na troca de turno.
- **03/04/2026 02:30** — **Interface de Gestão de Dispositivos IoT:** Criado componente `IotDevicesManager` em Configurações → Empresa (visível apenas para admin). Funcionalidades: (1) Listagem de dispositivos ESP32 com status online/offline (baseado em `last_seen_at` < 5 min), badge ativo/inativo, versão do firmware e tempo desde última comunicação; (2) Cadastro de novo dispositivo com seleção de máquina, geração automática de token de 32 caracteres e exibição dos dados para firmware (COMPANY_ID, MACHINE_ID, DEVICE_TOKEN) com botões de copiar; (3) Edição de nome, máquina e token; (4) Ativação/desativação sem remover; (5) Exclusão com confirmação; (6) Validação: uma máquina só pode ter um dispositivo IoT; (7) Botões de cópia rápida de token e machine_id na listagem. Componente: `src/components/IotDevicesManager.tsx`.
- **03/04/2026 03:00** — **UUIDs removidos das páginas Máquinas e Empresa:** O UUID da empresa (Configurações → Empresa → Identidade) e o UUID da máquina (cards de Máquinas) foram removidos dessas páginas. Agora esses IDs só aparecem no modal de cadastro de dispositivo IoT (`IotDevicesManager`), onde são realmente necessários para configurar o firmware do ESP32.
- **03/04/2026 03:30** — **IoT: dispositivos imutáveis + segurança:** (1) Dispositivos IoT não podem mais ser editados após criação — apenas excluir e criar novo (segurança); (2) Botão de editar removido da listagem; (3) Token mascarado na listagem (6 primeiros + 4 últimos) com botão de copiar token completo; (4) COMPANY_ID/MACHINE_ID mantidos no modal de criação com botões de copiar (único local onde aparecem); (5) UUIDs removidos das páginas Máquinas e Empresa — agora só visíveis no modal de cadastro IoT.
- **03/04/2026 04:00** — **IoT: botão copiar token na listagem:** Adicionado botão de copiar token completo na listagem de dispositivos (o token é mascarado visualmente mas pode ser copiado integralmente a qualquer momento).
- **03/04/2026 05:00** — **Cadeado "Em breve" em funcionalidades inacabadas:** (1) Sidebar: "Contas a Pagar" agora exibido com ícone de cadeado e badge "Em breve", não clicável; (2) Configurações → aba "Telas": tab desabilitada com badge "Em breve"; (3) Configurações → Empresa → "Dispositivos IoT": seção com overlay de cadeado e badge "Em breve", conteúdo desfocado e não interativo.
- **03/04/2026 06:00** — **Modal Produção Terceirizada — melhorias de navegação por teclado:** (1) Campo NF/ROM adicionado ao formulário e tabela (coluna `nf_rom` TEXT na tabela `outsource_productions`); (2) Navegação por setas ↑↓ no dropdown de artigos (substitui TAB que causava loop); (3) Enter seleciona artigo e avança para Peso automaticamente; (4) TAB no dropdown de artigo seleciona item destacado e avança normalmente; (5) Botões do dropdown com `tabIndex={-1}` para não roubar foco do fluxo TAB; (6) Grid de campos reorganizado (Peso, Rolos, Valor Repasse, NF/ROM em 4 colunas).
- **03/04/2026 06:30** — **Modal Terceirizado — correções de UX:** (1) TAB do campo de data (ano) agora vai direto para artigo (interceptado `onKeyDown` com `preventDefault` + foco manual); (2) Setas ↑↓ no dropdown de artigos agora fazem scroll automático (`scrollIntoView({ block: 'nearest' })`); (3) Scrollbar lateral do dropdown de artigos removida visualmente (`scrollbar-hide`, `scrollbarWidth: none`); (4) Modal aumentado de 80vw para 90vw (max-w de 2xl para 3xl).

- **03/04/2026 07:00** — **Modal Terceirizado — TAB data + Enter salvar + NF/ROM única:** (1) Data agora permite 3 tabs naturais (dia→mês→ano) e após o 3º tab vai para artigo (contador `dateTabCount`); (2) Enter no campo NF/ROM salva o registro (atalho); (3) Validação de NF/ROM duplicada: antes de salvar, verifica se o número já existe em todo o período — se duplicado, exibe alerta de erro com a data do registro existente; (4) Botão salvar também usa a mesma validação.

- **03/04/2026 08:00** — **Terceirizados — melhorias visuais e busca:** (1) KPI "Receita (Cliente)" renomeado para "Receita (PrimeiroNome)" e "Lucro" para "Lucro (PrimeiroNome)" usando primeiro nome da empresa cadastrada; (2) Card "Prejuízos" adicionado após Lucro (soma dos registros com lucro negativo); (3) Data dos registros agora exibe também a hora do registro (created_at); (4) Busca avançada na aba Produções (malharia, artigo, cliente, NF/ROM); (5) Busca na aba Malharias (por nome/contato); (6) Listagem de produções ordenada do mais recente para o mais antigo (por created_at DESC); (7) Interface `OutsourceProduction` agora inclui campo `nf_rom` tipado.

- **03/04/2026 09:00** — **Terceirizados — filtros de mês e período:** (1) Aba Produções: adicionados filtros por mês (botões dos últimos 6 meses com dados) e período personalizado (De/Até com calendário), integrados com busca textual existente; (2) Aba Relatórios: adicionado filtro por mês (mesma UX), complementando os filtros De/Até já existentes; (3) Selecionar mês limpa período personalizado e vice-versa; (4) Botão "Limpar" reseta todos os filtros; (5) periodLabel do PDF agora inclui nome do mês quando filtro por mês está ativo.

- **03/04/2026 10:00** — **Terceirizados — filtros aprimorados:** (1) Filtro de mês trocado de botões para Select dropdown (listagem completa de todos os meses com dados) em Produções e Relatórios; (2) Relatórios: adicionado seletor de malharia com busca (lupa), opção "Todas as malharias" e filtro por empresa específica; (3) Exportação PDF dinâmica: se "Todas" selecionado, mostra botões "Exportar por Malharia" e "Exportar PDF"; se malharia específica selecionada, exporta apenas dados daquela malharia; (4) Layout dos filtros compactado em linha horizontal (mês + período + malharia + resultado + limpar).

- **03/04/2026 11:00** — **Modal Terceirizado — manter aberto + formatação BR:** (1) Após salvar novo registro, modal permanece aberto com mesma malharia selecionada e demais campos limpos (artigo, peso, rolos, valor repasse, NF/ROM, obs); foco volta para data; (2) Peso (kg) agora formata em tempo real no padrão brasileiro (1.000,55) com separador de milhar e vírgula decimal; (3) Valor Repasse (R$/kg) também formata em BR (1,20); (4) Parsing correto de valores BR para cálculos e persistência no banco.

- **03/04/2026 12:00** — **Terceirizados — KPIs filtrados + Valor Repasse auto-vírgula:** (1) KPIs (Rolos, Peso, Receita, Custo, Lucro, Prejuízos) agora atualizam conforme filtro de mês/período selecionado na aba Produções; (2) Valor Repasse (R$/kg) reformatado: como nunca passa de R$10, auto-insere vírgula após 1º dígito (digitando "120" → "1,20", "350" → "3,50") para agilizar digitação; (3) Estado dos filtros (mês, de, até) movido para componente pai para sincronizar KPIs com dados filtrados.

- **03/04/2026 13:00** — **Terceirizados — correção filtro de meses:** Registro com data inválida `0202-03-20` corrigido para `2026-03-20` no banco. Adicionada validação no código: `availableMonths` agora filtra datas fora do range 2020-2099 para evitar meses inválidos no dropdown (Produções e Relatórios).

- **03/04/2026 14:00** — **Validação de data ±5 anos em todo o sistema:** (1) Criadas funções `getDateLimits()` e `isDateValid()` em `formatters.ts` para validar que o ano está no range ±5 do ano atual; (2) Todos os inputs `type="date"` agora possuem atributos `min`/`max` nativos do HTML (Outsource, Production, AccountsPayable, Mecanica); (3) Validação antes de salvar em todas as páginas: Outsource (`handleSaveWithValidation`), Production (`handleSave`), AccountsPayable (`handleSubmit`), Mecanica (`handleAddLog`); (4) Filtro de `availableMonths` em Outsource já filtrava datas fora de 2020-2099.

- **03/04/2026 16:00** — **MÓDULO VENDAS DE RESÍDUOS:** Implementação completa do controle de vendas de materiais residuais (papelão, plástico, óleo sujo, etc.): (1) 2 tabelas criadas: `residue_materials` (nome, unidade kg/un, preço padrão) e `residue_sales` (material, cliente, data, quantidade, preço unitário, total, romaneio, observações) com RLS por `company_id`; (2) Página `/residuos` com 2 abas: **Materiais** (CRUD de materiais com unidade dinâmica) e **Registros de Venda** (formulário com material, cliente, quantidade adaptativa kg/un, preço pré-preenchido, romaneio, preview de total); (3) KPIs filtráveis: Total Vendido (R$), Peso (kg), Unidades, Nº Registros; (4) Filtros: mês (Select), período De/Até (Calendar), busca textual (material, cliente, romaneio); (5) Exportação PDF com jsPDF+autoTable; (6) Modal mantém aberto após salvar (limpa campos exceto cliente); (7) Validação de data ±5 anos; (8) Sidebar: ícone Recycle, key `residuos`, acesso admin; (9) Rota, permissões e `enabled_nav_items` configurados; (10) Documentação em `Recycle.md`.

- **03/04/2026 17:00** — **Padronização PDF — regra global + Resíduos atualizado:** (1) Documentada regra global: **toda exportação PDF futura deve seguir o padrão visual da página Relatórios > Exportar** (cabeçalho com retângulo cinza `grayBg` + borda `border`, logo ou nome da empresa à esquerda, título centralizado fonte 14 bold, data/hora embaixo à esquerda, período do filtro embaixo à direita, mesmas cores semânticas `colors.textDark`/`textMid`/`grayBg`/`border`); (2) PDF de Vendas de Resíduos refatorado para seguir este padrão (antes usava header simples sem logo/borda).

- **03/04/2026 18:00** — **nf.md atualizado com 4 novidades da análise de fechamento:** (1) Tipo `venda_fio` adicionado — saída de fio sem tecer (devolução ou venda direta ao cliente); (2) Campo `access_key` (chave de acesso SEFAZ, 44 dígitos, opcional) adicionado à tabela `invoices` — preparado para busca automática futura via API; (3) Seção "Controle de Estoque de Malha" adicionada — calcula malha produzida menos NFs de saída por cliente/artigo; (4) Seção "Integração com Fechamento Mensal" adicionada — documenta como o módulo NF alimenta o PDF de fechamento (estoque, receitas, venda de fio, faturamento total); (5) Fase 4 (Fechamento) e Fase 5 (SEFAZ) adicionadas ao roadmap.

- **03/04/2026 19:00** — **MÓDULO NOTAS FISCAIS (Fase 1):** Implementação completa do controle de NFs conforme `nf.md`: (1) 3 tabelas criadas: `yarn_types` (tipos de fio com composição e cor), `invoices` (NFs de entrada/saída/venda_fio com chave de acesso SEFAZ opcional), `invoice_items` (itens com fio ou artigo, peso, rolos, valor) — todas com RLS por `company_id`; (2) Coluna `yarn_type_id` adicionada à tabela `articles`; (3) Página `/:slug/invoices` com 4 abas: **Entrada** (NFs de fio recebido), **Saída** (NFs de malha + venda de fio), **Saldo de Fios** (consolidado por cliente/fio: recebido−vendido−consumido), **Tipos de Fio** (CRUD); (4) Formulário de nova NF com seleção de cliente, itens dinâmicos, chave de acesso, status pendente/conferida; (5) Listagem com filtros (mês, status, cliente, busca); (6) KPIs: NFs, peso total, valor total, pendentes; (7) Ações: visualizar, conferir, cancelar; (8) Sidebar: ícone FileText, key `invoices`, acesso admin; (9) Rota, permissões e `ROLE_ALLOWED_KEYS` configurados.

- **03/04/2026 21:00** — **SALDO DE FIOS + VÍNCULO ARTIGO↔FIO (saldofios.md):** (1) Campo `yarn_type_id` adicionado à interface `Article` e ao mapper `mapArticle` em `useCompanyData.ts`; (2) Formulário de artigo em `ClientsArticles.tsx` agora inclui campo "Tipo de Fio" (Select com yarn_types, opcional, permite limpar); (3) Cards de artigos exibem nome do fio vinculado; (4) Aba "Saldo de Fios" em `Invoices.tsx` completamente refeita: cálculo de **consumo** via `productions` cruzando `articles.yarn_type_id`, KPIs (Recebido/Consumido/Vendido/Saldo), filtros (mês, cliente, tipo de fio), grupos colapsáveis por cliente com totais, badge de alerta para saldo negativo, linha de total por cliente; (5) Sem migrations — `yarn_type_id` já existia em `articles`.

- **03/04/2026 22:00** — **ESTOQUE DE MALHA (estoquemalhas.md):** Nova aba "Estoque Malha" na página Notas Fiscais (5ª aba, entre Saldo Fios e Tipos de Fio). Calcula `Produzido − Entregue = Em Estoque` por cliente/artigo: (1) Produzido: soma `productions.weight_kg` e `rolls_produced` agrupado por `articles.client_id` + `article_id`; (2) Entregue: soma `invoice_items.weight_kg` e `quantity_rolls` de NFs tipo `saida` não canceladas; (3) KPIs: Produzido (kg), Entregue (kg), Em Estoque (kg), Rolos em Estoque; (4) Filtros: período (mês), cliente, artigo com botão limpar; (5) Tabela collapsible por cliente com colunas Produzido/Entregue/Estoque em kg e rolos; (6) Linha de TOTAL por cliente; (7) Indicadores visuais: positivo (success), negativo (destructive + badge Alerta), zero (muted); (8) Sem migrations — 100% frontend com dados já carregados.

- **03/04/2026 23:00** — **UX NOTAS FISCAIS — Lupas de busca e melhorias visuais:** (1) Aba "Estoque Malha": filtros de cliente e artigo substituídos por `SearchableSelect` com lupa de busca; clientes agora iniciam fechados (usuário clica para expandir); (2) Aba "Saldo de Fios": filtros de cliente e tipo de fio substituídos por `SearchableSelect` com lupa de busca; (3) Aba "Tipos de Fio": campo de busca com lupa adicionado ao cabeçalho (filtra por nome, composição, cor); ícone de editar fio trocado de `FileText` para `Pencil`.

- **03/04/2026 23:30** — **SALDO GLOBAL DE FIOS (saldofiosglobal.md):** Nova aba "Saldo Global" na página Notas Fiscais (4ª aba, entre Saldo Fios e Estoque Malha). Consolida TODOS os clientes e mostra por tipo de fio: (1) **Compra (mês):** soma `invoice_items.weight_kg` de NFs `entrada` no mês selecionado; (2) **Consumido (mês):** soma `productions.weight_kg` via `articles.yarn_type_id`; (3) **Vendas (mês):** soma `invoice_items.weight_kg` de NFs `venda_fio`; (4) **Estoque (acumulado):** compra total − consumo total − vendas total até o mês selecionado; (5) KPIs: Compra, Consumido, Vendas, Estoque; (6) Filtros: período (mês) + tipo de fio (SearchableSelect); (7) Tabela flat com linha TOTAL; (8) Indicadores visuais: positivo (success), negativo (destructive + badge Alerta); (9) Sem migrations — 100% frontend com dados já carregados.

- **04/04/2026 00:00** — **ESTOQUE FIO TERCEIROS (estoquefioterceiro.md):** (1) Migration: tabela `outsource_yarn_stock` criada com colunas `outsource_company_id`, `yarn_type_id`, `quantity_kg`, `reference_month`, `observations` + UNIQUE composta (company+facção+fio+mês) + RLS completa (SELECT/INSERT/UPDATE/DELETE) + índices + trigger `updated_at`; (2) Frontend: nova aba "Fio Terceiros" na página Notas Fiscais (7ª aba) com CRUD completo: queries diretas para `outsource_yarn_stock` e `outsource_companies`, 3 KPIs (Total em Terceiros, Facções com Estoque, Tipos de Fio), filtros (mês/facção/tipo de fio com SearchableSelect), tabela Collapsible agrupada por facção com linha TOTAL, ações editar/excluir (apenas admin); (3) Modal de adicionar/editar com SearchableSelect para facção e fio, input month, quantidade, observações; upsert na inserção; modal preserva facção após salvar.

- **04/04/2026 01:00** — **DESCONTO AUTOMÁTICO FIO TERCEIROS ↔ PRODUÇÃO TERCEIRIZADA:** Ao registrar/editar/excluir uma produção terceirizada (`outsource_productions`), o sistema agora desconta/devolve automaticamente o peso (kg) do estoque de fio (`outsource_yarn_stock`) para a facção correspondente. Requisitos: artigo deve ter `yarn_type_id` vinculado E deve existir registro de estoque para aquele mês/facção/fio. Na edição, reverte dedução antiga e aplica nova. Na exclusão, devolve peso ao estoque. Cache `outsource_yarn_stock` invalidado após operações. Documentado em `estoquefioterceiro.md`.

- **04/04/2026 17:01** — **MÓDULO FECHAMENTO MENSAL:** Implementação completa conforme `fechamentomensal.md`: (1) Página `/:slug/fechamento` com 10 seções consolidadas: Fechamento KG, Saldo de Fios por Tipo, Estoque de Malha, Receitas Próprias, Receitas de Terceiros, Prejuízos de Terceiros, Resíduos, Venda de Fio, Estoque Fio em Terceiros, Faturamento Total; (2) Seletor de mês + botão "Carregar Dados" (10 queries paralelas via Promise.all com paginação); (3) Preview visual em Cards com tabelas formatadas pt-BR, collapsibles por cliente/facção, indicadores visuais (success/destructive); (4) Exportação PDF multi-página (10 páginas) com cabeçalho padrão global (logo, título, data, período), jsPDF + autoTable; (5) Sidebar: ícone FileSpreadsheet, key `fechamento`, após Notas Fiscais; (6) Permissões: apenas admin; (7) Rota, ROLE_ALLOWED_KEYS, ROUTE_KEY_MAP e enabled_nav_items atualizados.


- **04/04/2026 17:30** — **MENSAGENS DE ERRO AMIGÁVEIS (getFriendlyErrorMessage):** Criada função utilitária `getFriendlyErrorMessage()` em `src/lib/utils.ts` que traduz erros técnicos do banco de dados em mensagens legíveis para o usuário. Trata: (1) Foreign key constraint → explica qual módulo impede a exclusão; (2) RLS → "sem permissão"; (3) Unique constraint → "registro duplicado"; (4) Not-null → "campos obrigatórios". Aplicada em todas as operações de exclusão: `Invoices.tsx` (yarn_types, outsource_yarn_stock), `ResidueSales.tsx` (residue_materials, residue_sales), `Outsource.tsx` (outsource_companies, outsource_productions).

- **04/04/2026 18:00** — **AUDITORIA E CORREÇÃO DE BUGS — Pente fino nas implementações recentes:**
  - **(1) BUG CRÍTICO — Limite 1000 registros em Invoices.tsx:** Queries de `invoices`, `invoice_items` e `outsource_yarn_stock` não tinham paginação, causando truncamento silencioso de dados acima de 1000 registros. Corrigido com `fetchAllPaginated()` com loop de paginação recursiva (mesmo padrão do Fechamento).
  - **(2) BUG — ClientsArticles exclusão com texto EXCLUIR:** Modal de exclusão ainda exigia digitar "EXCLUIR" ao invés do modal simples (Sim/Cancelar) definido como padrão. Corrigido para confirmação simples.
  - **(3) BUG — Mensagens de erro técnicas faltantes:** `Outsource.tsx` (saveMutation empresas, saveMutation produções) e `ResidueSales.tsx` (saveMat, saveSale) não usavam `getFriendlyErrorMessage`. Corrigido — agora TODOS os `onError` usam a função.
  - **(4) BUG — TabsList mobile quebrado:** Invoices.tsx usava `grid-cols-4` para 7 abas, causando layout quebrado no mobile. Corrigido para `flex flex-wrap` com `h-auto`.


## 📐 Padrão de Exportação PDF (Regra Global)

> **REGRA:** Toda exportação PDF criada futuramente no projeto DEVE seguir como referência o código de exportação da página **Relatórios (`Reports.tsx`) > Exportar**.

### Elementos obrigatórios do cabeçalho:
1. **Retângulo de fundo** cinza claro (`grayBg: [249, 250, 251]`) com borda (`border: [229, 231, 235]`), altura 25mm
2. **Lado esquerdo:** Logo da empresa (via `addImage`, max 24×14mm) OU nome da empresa (bold, 10pt); abaixo, data/hora atual (normal, 8pt, `textMid`)
3. **Centro:** Título do relatório (bold, 14pt, `textDark`)
4. **Lado direito:** Período do filtro ativo (normal, 8pt, `textMid`), alinhado à direita embaixo
5. **Cores semânticas:** `textDark: [17, 24, 39]`, `textMid: [75, 85, 99]`, `grayBg: [249, 250, 251]`, `border: [229, 231, 235]`
6. **Tabelas:** `headStyles: { fillColor: [60, 60, 60] }`, fontSize 8
7. **Margens:** 15mm

### Arquivo de referência:
`src/pages/Reports.tsx` — função `doExport()` → `addHeader()`

---

## 🛡️ Padrão de Mensagens de Erro (Regra Global)

> **REGRA:** Todo erro exibido ao usuário DEVE ser traduzido via `getFriendlyErrorMessage()` de `src/lib/utils.ts`. Nunca exibir mensagens técnicas do banco (ex: "violates foreign key constraint").

### Uso:
```typescript
import { getFriendlyErrorMessage } from '@/lib/utils';

// Em toast de erro:
toast({ title: 'Erro', description: getFriendlyErrorMessage(error.message), variant: 'destructive' });
```

### Erros tratados:
- **Foreign key constraint** → Mensagem específica por tabela referenciada
- **RLS violation** → "Você não tem permissão"
- **Unique constraint** → "Já existe um registro com esses dados"
- **Not-null violation** → "Preencha todos os campos obrigatórios"
- **Outros** → Mensagem original (fallback)

---

## 🔍 Padrão de Auditoria (Regra Global — OBRIGATÓRIA)

> **REGRA:** Toda nova funcionalidade que envolva criação, edição ou exclusão de dados **DEVE** incluir chamadas de auditoria via `useAuditLog`. Documentação completa em `auditoria.md`.

### Checklist obrigatório para novas features:
1. ✅ Importar `useAuditLog` no componente
2. ✅ Chamar `logAction('{modulo}_{operacao}', { detalhes })` em todo CREATE, UPDATE, DELETE
3. ✅ Seguir convenção de nomes: `{modulo}_{operacao}` (ex: `client_create`, `article_delete`)
4. ✅ Incluir `details` com informações úteis (nome do item, valores alterados)
5. ✅ Se tabela tiver `created_by_name`/`created_by_code`, usar `userTrackingInfo`
6. ✅ Atualizar `auditoria.md` com as novas ações

### Referência rápida:
```typescript
import { useAuditLog } from '@/hooks/useAuditLog';
const { logAction, userTrackingInfo } = useAuditLog();
logAction('modulo_create', { name: 'Item X', value: 100 });
```

- **03/04/2026 (horário real)** — **TERCEIRIZADOS — 3 melhorias UX no modal de produção:** (1) Validação de NF/ROM duplicada agora é **por malharia** (não global) — malharias diferentes podem ter mesmo número de romaneio; (2) Tecla ESC desabilitada no modal de Registrar Produção Terceirizada (evita fechar acidentalmente); (3) Navegação entre campos (Malharia, Data, Artigo, Peso, Rolos, Repasse, NF/ROM, Observações) via **setas ↑↓ do teclado** para troca rápida de input.

- **03/04/2026 (horário real)** — **4 MELHORIAS UX GLOBAIS:** (1) **Fechamento "Em teste"** — badge amber adicionado ao sidebar; (2) **DeleteConfirmDialog** — componente reutilizável criado (`src/components/DeleteConfirmDialog.tsx`) substituindo TODOS os `confirm()` nativos do navegador por modais visuais Excluir/Cancelar em: `Outsource.tsx` (malharias + produções), `ResidueSales.tsx` (materiais + vendas), `Invoices.tsx` (cancelar NF + fios + estoque terceiros), `Admin.tsx` (restaurar backup); (3) **Setas ↑↓←→** no modal de Produção Terceirizada — todas as 4 setas navegam entre campos (←→ não interferem em inputs de texto, apenas em date e selects); (4) **Ctrl+Enter** para salvar no modal (substituiu Enter simples no NF/ROM).

- **03/04/2026 21:00 (Brasília)** — **RASTREAMENTO DE AUTORIA (created_by) — Correções e adições em 4 módulos:** (1) **Production.tsx** — corrigido bug de stale closure no `handleSave` (faltavam `userName`, `userCode`, `logAction` nas dependências do `useCallback`), que impedia o `created_by_code` (#43 etc.) de aparecer nos registros; (2) **ResidueSales.tsx** — adicionado `useAuditLog` + colunas `created_by_name`/`created_by_code` no insert de vendas; (3) **Outsource.tsx** — adicionado `useAuditLog` + colunas `created_by_name`/`created_by_code` no insert de produções terceirizadas; (4) **Invoices.tsx** — substituído `(user as any)?.code` (que retornava `null`) por `userCode` do `useAuditLog` para correto rastreamento. **Migração:** adicionadas colunas `created_by_name` e `created_by_code` nas tabelas `residue_sales` e `outsource_productions`.

- **03/04/2026 21:30 (Brasília)** — **SIDEBAR COLLAPSED — Logo centralizada:** Quando o sidebar está colapsado (modo ícone), a logo da empresa agora aparece reduzida (32×32px) e centralizada, em vez de desaparecer. Fallback (ícone Factory) também centralizado. **Fix build:** corrigido `userName`/`userCode` fora de escopo em `ProductionsTab` do `Outsource.tsx` — adicionado `useAuditLog()` dentro do componente.
- **03/04/2026 22:00 (Brasília)** — **4 FIXES MOBILE:** (1) **Settings.tsx** — TabsList agora usa `flex flex-wrap` com `min-w-[80px]` em vez de `grid-cols-5`, evitando que abas fiquem espremidas no mobile; (2) **Outsource.tsx (Malharias)** — header do card mudado para `flex-col sm:flex-row` com botão "Nova Malharia" quebrando linha no mobile; (3) **Outsource.tsx (Produções)** — mesma correção para botão "Nova Produção"; (4) **Production.tsx** — card de produção registrada mudado para `flex-col sm:flex-row` evitando que nome do tear sobreponha Rolos/Meta/% no mobile.
- **03/04/2026 23:00 (Brasília)** — **FIX SESSÃO/LOGIN — Sessão única e persistente:** (1) Logout agora limpa completamente localStorage (remove todas as chaves `sb-*` e `supabase*`), sessionStorage e `malhagest_last_slug`, eliminando sessões fantasma de outros usuários; (2) `onAuthStateChange` agora trata explicitamente evento `SIGNED_OUT` para limpar estado imediatamente; (3) Guard `mounted` adicionado ao listener de auth para evitar updates em componente desmontado; (4) Sessão continua persistida (`persistSession: true`, `autoRefreshToken: true`) — usuário permanece logado até sair manualmente, inclusive no app PWA para Windows.

- **03/04/2026 23:30 (Brasília)** — **TERCEIRIZADOS — 3 melhorias visuais:** (1) **Badge Lucro/kg negativo** — mudado de `destructive` (fundo vermelho escuro, texto ilegível) para `outline` com fundo `red-100` e texto `red-700`, garantindo legibilidade tanto para lucro (verde) quanto prejuízo (vermelho); (2) **Formato de data** — listagem de produções e relatórios agora exibe datas no formato `dd-MM-yyyy` em vez de `yyyy-MM-dd`; (3) **PDF Export** — colunas Lucro/kg e Lucro Total agora coloridas em verde (lucro) e vermelho (prejuízo) com texto visível no PDF exportado.

- **04/04/2026 00:00 (Brasília)** — **TERCEIRIZADOS — Filtro e Exportação por Cliente:** Adicionado filtro de Cliente (com lupa de pesquisa) na aba Relatórios do módulo Terceirizado, idêntico ao filtro de Malharia existente. Adicionado botão "Exportar por Cliente" que gera PDF agrupado por cliente com artigos, malharias, receita, custo e lucro por artigo — seguindo o mesmo padrão visual do "Exportar por Malharia" (cabeçalho verde para clientes vs azul para malharias). O filtro de cliente também afeta os KPIs e a tabela de relatório.

- **04/04/2026 00:30 (Brasília)** — **PDF — Correção de caracteres garbled:** Criado utilitário `sanitizePdfText()` em `src/lib/pdfUtils.ts` que remove emoji e caracteres Unicode fora do Latin-1 (que jsPDF não renderiza), substituindo pontuação Unicode comum (em-dash, aspas curvas, etc.) por equivalentes ASCII. Aplicado em todos os 4 arquivos com exportação PDF: `Outsource.tsx`, `Reports.tsx`, `Fechamento.tsx`, `ResidueSales.tsx`. Corrigidos prefixos emoji (`🏭`, `👤`) nos cabeçalhos de seção do PDF por malharia/cliente.


- **04/04/2026 01:00 (Brasília)** — **TERCEIRIZADOS — Pente fino, 3 bugs corrigidos:** (1) **BUG — Limite 1000 registros:** Query de `outsource_productions` não paginava, truncando silenciosamente dados acima de 1000 registros. Corrigido com loop de paginação recursiva (PAGE_SIZE 1000); (2) **BUG — sanitizePdfText faltando:** Nomes de artigos e clientes/malharias nos PDFs "Exportar por Malharia" e "Exportar por Cliente" não passavam por `sanitizePdfText()`, podendo gerar caracteres corrompidos. Corrigido.

- **04/04/2026 01:15 (Brasília)** — **TERCEIRIZADOS — Atalho de salvar revertido para Enter simples:** Removida exigência de `Ctrl+Enter`, agora basta pressionar `Enter` (quando dropdown de artigo está fechado) para salvar o registro, conforme fluxo de alta velocidade documentado.

- **04/04/2026 01:30 (Brasília)** — **TERCEIRIZADOS — BUG created_by_name/code null:** Campos `created_by_name` e `created_by_code` estavam sempre `null` nas produções terceirizadas devido a stale closure no `useMutation` — os valores de `userName`/`userCode` do `useAuditLog` eram capturados antes do carregamento do perfil. Corrigido com `useRef` + `useEffect` para garantir valores atualizados no momento da execução da mutation.

- **04/04/2026 01:45 (Brasília)** — **TERCEIRIZADOS — Exibição de autor na listagem:** Adicionada linha com `Nome #ID` do autor abaixo da data/hora em cada registro da tabela de Produções Terceirizadas. Todos os registros existentes foram atualizados com `Felipe #1` como autor.

- **04/04/2026 02:00 (Brasília)** — **CONFIGURAÇÕES — Restrição de edição de perfil:** Apenas o administrador principal (#1) pode alterar nome e e-mail em Configurações > Meu Perfil. Outros admins veem uma mensagem informativa e podem apenas alterar a senha.

- **04/04/2026 02:15 (Brasília)** — **CONFIGURAÇÕES — Proteção total do admin #1:** Na aba Usuários, outros admins não conseguem mais editar, alterar senha, desativar ou excluir o administrador principal (#1). Apenas o próprio #1 pode gerenciar seu perfil. Botões de ação são completamente ocultados para o #1 quando visualizado por outros admins.

- **04/04/2026 02:30 (Brasília)** — **CONFIGURAÇÕES — Admin #1 pode editar email/senha de usuários:** No modal de edição de usuários (aba Usuários), o administrador principal (#1) agora pode alterar email e senha de qualquer usuário diretamente, sem precisar excluir e recriar. O campo de senha é opcional (deixar vazio mantém a atual). A edge function `manage-users` foi atualizada para suportar alteração de email (auth + profiles) e senha via `action: 'update'`, com verificação de que apenas #1 pode fazer essas alterações.

- **04/04/2026 03:00 (Brasília)** — **BLOQUEIO EM TEMPO REAL — Usuário desativado:** Quando o admin #1 desativa um usuário, a tela é bloqueada em tempo real (sem necessidade de recarregar) com overlay cinza, ícone de cadeado e mensagem informando que a conta foi desativada pelo administrador. O usuário pode fazer login mas verá a tela bloqueada. Implementado via Supabase Realtime na tabela `profiles` (realtime habilitado via migration). O campo `status` foi adicionado ao tipo `User` e o `AuthContext` escuta mudanças de status em tempo real.

- **04/04/2026 04:00 (Brasília)** — **CÓDIGOS SEQUENCIAIS PARA ADMINS (#2-#50):** (1) Edge Function `manage-users` atualizada: admins agora recebem códigos sequenciais #2, #3, #4... (próximo após o maior existente), com limite de 50 admins por empresa; #1 continua reservado ao criador; (2) Não-admins (líder, mecânico, revisador) continuam com códigos aleatórios #100-#999; (3) Usuário `admin@tales.com` adicionado como admin #2 na empresa de `felipeeck182@gmail.com`.


- **04/04/2026 04:15 (Brasília)** — **CONFIGURAÇÕES — Botão editar restrito ao admin #1:** Na aba Usuários, apenas o administrador principal (#1) vê o ícone de editar (lápis) para alterar nome e função de outros usuários. Admins não-#1 não veem mais esse botão.

- **04/04/2026 04:30 (Brasília)** — **DOCUMENTAÇÃO AUDITORIA:** Criado `auditoria.md` com documentação 100% detalhada do sistema de auditoria: arquitetura (`audit_logs` + `useAuditLog`), cobertura atual por módulo (7 com auditoria, 7 pendentes), convenção de nomes de ações, estrutura do campo `details`, especificação do modal de histórico (a implementar), e regra obrigatória para novas funcionalidades. Adicionada seção "Padrão de Auditoria (Regra Global — OBRIGATÓRIA)" no `mestre.md` com checklist de 6 itens que toda nova feature deve seguir.

- **04/04/2026 05:00 (Brasília)** — **AUDITORIA COMPLETA — Todos os módulos:** Implementado `logAction` explícito em todos os módulos pendentes: Tecelões (`weaver_create/update/delete`), Contas a Pagar (`account_create/update/delete/pay`), Resíduos (`residue_material_create/update/delete`, `residue_sale_create/delete`), Notas Fiscais (`invoice_create/confirm/cancel`, `yarn_type_create/update/delete`, `outsource_yarn_stock_create/update/delete`), Clientes & Artigos, Terceirizados e Configurações (usuários). Atualizado `auditoria.md` movendo todos para "✅ Implementado".

- **04/04/2026 05:15 (Brasília)** — **MODAL HISTÓRICO DE AÇÕES — Correções:** (1) Corrigido scroll que não funcionava — substituído `ScrollArea` por `overflow-y-auto` com layout flex correto; (2) Modal redimensionado para 80vw × 80vh conforme padrão do projeto; (3) Layout interno reestruturado com `shrink-0` no header/filtros/footer e `flex-1 min-h-0` na área de logs.

- **04/04/2026 05:45 (Brasília)** — **CORREÇÃO DE BUGS — Pente fino nas atualizações recentes:** (1) **AuditHistoryModal — loop infinito corrigido:** `fetchLogs` nos deps do `useEffect` causava refetch a cada mudança de filtro; refatorado para usar `doFetch` com filtros como parâmetro, eliminando closures obsoletas no `handleClear`; (2) **Segurança — `change_password` restrito ao admin #1:** A action `change_password` da edge function `manage-users` não verificava se o chamador era admin #1, permitindo que qualquer admin alterasse senhas; adicionada verificação server-side; (3) **UI — Botão Key (senha) restrito ao #1:** O botão de alterar senha na lista de usuários era visível para todos os admins; agora só aparece para o admin #1 (mesma regra do botão Pencil).

- **04/04/2026 06:00 (Brasília)** — **SEGURANÇA — Ações de usuário restritas ao admin #1:** Botões de desativar (XCircle), excluir (Trash2) e permissões extras (Eye) na aba Usuários agora são visíveis **somente** para o admin #1. Admins não-#1 não veem mais nenhum botão de ação sobre outros usuários, apenas visualizam a lista.

- **04/04/2026 06:30 (Brasília)** — **SEGURANÇA CRÍTICA — Verificação global de email para admins + bloqueio de mudança de função:** (1) Modal de criação de usuário reordenado: agora pede Nome → Função → Email → Senha; (2) Se função = admin, exibe alerta informando que admins fazem login na raiz e o email será verificado globalmente; (3) Edge Function `manage-users` agora faz verificação global de email (todas as empresas) para admins antes de criar; (4) Admins não podem ter a função alterada após criação — campo bloqueado no modal de edição e validado server-side na edge function; (5) No update, role não é enviado para admins existentes.

- **04/04/2026 07:00 (Brasília)** — **MODAL CRIAR USUÁRIO — UX progressiva:** (1) Label alterado de "Nome Completo" para "Nome"; (2) Email e Senha ficam desativados até selecionar função; (3) Para função Admin: email é liberado mas senha fica bloqueada até verificação em tempo real (debounce 600ms) confirmar que o email não existe globalmente — mostra "Verificando...", "✓ Email disponível" ou erro; (4) Para outras funções: email e senha são liberados imediatamente após seleção; (5) Botão "Criar Usuário" só é habilitado quando todos os campos estão válidos; (6) Ao trocar função, email e senha são resetados.

- **04/04/2026 07:30 (Brasília)** — **VERIFICAÇÃO GLOBAL DE EMAIL — Cross-empresa:** Verificação de email no modal de criação de admin agora é verdadeiramente global: usa action `check_email` na edge function `manage-users` (service role bypassa RLS) para verificar em TODAS as empresas do sistema + auth.users. Mensagens diferenciadas: "já cadastrado nesta empresa" vs "já cadastrado em outra empresa do sistema".

- **04/04/2026 08:00 (Brasília)** — **PAINEL ADMINISTRATIVO — 3 melhorias:** (1) **NAV_ITEMS atualizados:** Adicionados Resíduos, Notas Fiscais e Fechamento à lista de itens de navegação do painel admin (modal de empresa e usuário); (2) **Usuários agrupados por empresa:** Aba Usuários agora exibe cards separados por empresa, cada um com tabela própria e badge de contagem; (3) **Backup automático à meia-noite:** Configurado pg_cron para executar `daily-backup` às 03:00 UTC (00:00 Brasília) automaticamente todos os dias.

- **04/04/2026 09:00 (Brasília)** — **BACKUP — Cobertura completa + listagem agrupada:** (1) **29 tabelas no backup:** Adicionadas 15 tabelas faltantes ao `daily-backup` e `restore-backup`: invoices, invoice_items, residue_materials, residue_sales, outsource_yarn_stock, accounts_payable, yarn_types, tv_panels, email_history, iot_devices, iot_downtime_events, iot_machine_assignments, iot_shift_state, machine_readings; (2) **Listagem agrupada por empresa:** Aba Backups no /admin agora exibe cards separados por empresa com badge de contagem, em vez de tabela única; (3) **Regra obrigatória documentada:** Adicionada regra no mestre.md exigindo que toda nova tabela seja incluída no sistema de backup.

- **04/04/2026 10:00 (Brasília)** — **REFATORAÇÃO ARQUITETURAL — 3 melhorias de organização:** (1) **Documentação organizada:** Todos os 15 arquivos `.md` de documentação movidos da raiz para pasta `docs/` (mestre.md, nf.md, iot.md, modotv.md, etc.) — README.md permanece na raiz; (2) **App.tsx refatorado:** Extraídos 5 componentes de roteamento para `src/components/routes/`: RootRedirect, PublicRoute, CompanyRoute, CompanyRouteInner, ProtectedRoute — App.tsx reduzido de 213 para 85 linhas; (3) **types/index.ts dividido por domínio:** Tipos separados em 7 arquivos: company.ts, machine.ts, client.ts, shift.ts, weaver.ts, production.ts, user.ts — index.ts mantém re-exports para compatibilidade total.

- **04/04/2026 20:40 (Brasília)** — **CORREÇÃO DADOS — Remoção de produções duplicadas:** Identificados e removidos registros de produção duplicados na empresa de `felipeeck182@gmail.com`. Foram encontrados **77 grupos duplicados** em 2 datas (19/07/2025 e 28/08/2025) — cada combinação de máquina+turno+artigo tinha 2 registros idênticos com mesmos valores. Mantido o registro mais antigo de cada grupo e removido o duplicado. Verificação pós-correção confirmou zero duplicatas restantes no banco.

- **06/04/2026 22:30 (Brasília)** — **ULTRAMSG — Substituição Reportana → UltraMsg:** Edge Functions `notify-accounts-due` e `test-webhook` atualizadas para usar API UltraMsg (instance168759) em vez do webhook Reportana. Secrets `ULTRAMSG_INSTANCE_ID` e `ULTRAMSG_TOKEN` configurados. Mensagens montadas diretamente na Edge Function (texto livre, sem templates Meta). Teste via curl confirmou envio com sucesso (`sent: "true"`). Secrets da Reportana mantidos como fallback. Documentação completa em `docs/ultramsg.md`.

- **06/04/2026 23:15 (Brasília)** — **CONTAS A PAGAR — 3 melhorias:** (1) **Máscara WhatsApp corrigida:** Backspace agora funciona corretamente — input trabalha apenas com dígitos e formata na exibição, sem travar em parênteses/hífens; (2) **Múltiplos WhatsApp:** Campo WhatsApp agora suporta múltiplos números de envio com botão "Adicionar número" — armazenados como comma-separated no banco, Edge Function `notify-accounts-due` envia para todos; (3) **Modal confirmar pagamento:** Botão ✓ agora abre modal de confirmação (Confirmar/Cancelar) com dados da conta antes de marcar como pago; (4) **Label atualizado:** Campo WhatsApp agora informa que é o número que receberá a notificação de vencimento.

- **07/04/2026 00:15 (Brasília)** — **NOTIFICAÇÕES WHATSAPP — Implementação completa conforme not.md:** (1) **Boas-vindas:** `create-company-profile` envia mensagem WhatsApp via UltraMsg após cadastro com link do sistema, dias de trial e data de expiração; (2) **Pagamento Pix confirmado:** `syncpay-webhook` envia confirmação de pagamento com valor e próxima data de vencimento; (3) **Cron diário (08:00 BRT):** Criada edge function `notify-subscription-status` com lógica completa de 5 dias: dias 1-3 envia aviso de pendência, dias 4-5 gera Pix automático via SyncPayments e envia código, dia 6 suspende conta; (4) **Cron horário:** Criada edge function `check-pix-expiry` que verifica Pix expirados (~1h) e notifica; (5) **Cron jobs configurados:** pg_cron agendado: `notify-subscription-status` às 11:00 UTC (08:00 BRT) diário, `check-pix-expiry` a cada hora; (6) Todas as mensagens incluem rodapé obrigatório de mensagem automática.

- **07/04/2026 00:20 (Brasília)** — **PENTE FINO — 6 bugs corrigidos nas últimas atualizações:** (1) **`manage-users` check_email:** Removida chamada `listUsers({perPage:1})` desperdiçada e limitado busca auth a 50 em vez de 1000 (escalabilidade); (2) **`notify-subscription-status` — formatCurrency:** Substituído `toLocaleString('pt-BR')` por `toFixed(2).replace('.',',')` para garantir formatação correta no Deno; (3) **`notify-subscription-status` — stripe_customer_id:** Campo agora incluído na query SELECT e usado diretamente na verificação Pix/Cartão (antes fazia query extra desnecessária); (4) **`notify-subscription-status` — verificação "já pagou":** Movida para antes de todas as branches (evita duplicação de código); (5) **`check-pix-expiry` — filtro `plan=auto_billing`:** Agora filtra apenas Pix gerados automaticamente pelo cron (plan="auto_billing"), evitando marcar como expirado Pix manuais do usuário; (6) **`notify-accounts-due` — rodapé obrigatório:** Adicionado `⚠️ Mensagem automática, esse não é um canal de suporte.` às mensagens de contas a pagar.

- **07/04/2026 08:00 (Brasília)** — **CONTAS A PAGAR — Coluna Notificação:** Adicionada coluna "Notificação" na tabela de listagem exibindo a data/hora prevista do envio da notificação WhatsApp (1 dia antes do vencimento às 8:00). Visível apenas em desktop (hidden em mobile).

- **07/04/2026 08:30 (Brasília)** — **CONTAS A PAGAR — Rastreamento de erros de notificação:** (1) **Novos campos no banco:** `notification_status` (pendente/enviado/erro) e `notification_error` (motivo do erro) adicionados à tabela `accounts_payable`; (2) **Edge Function atualizada:** `notify-accounts-due` agora salva o resultado do envio (sucesso → "enviado", falha → "erro" + mensagem de erro da UltraMsg); (3) **UI atualizada:** Coluna Notificação exibe badge "Enviado" (verde), "Não Enviado" (vermelho com tooltip do erro), ou data prevista (pendente). *(Nota: inicialmente botões eram ocultados em erro, mas isso foi revertido na atualização de 07/04 10:00 — botões agora ficam sempre visíveis.)*

- **07/04/2026 09:00 (Brasília)** — **CONTAS A PAGAR — Comprovante de pagamento:** (1) **Storage:** Bucket `payment-receipts` criado (público) para armazenar comprovantes PDF/PNG/JPG; (2) **Novos campos:** `receipt_url` e `receipt_change_count` adicionados à tabela `accounts_payable`; (3) **Modal de pagamento:** Campo de upload opcional de comprovante integrado ao modal de confirmação; (4) **Ações na tabela:** Botão visualizar (👁 azul) abre comprovante em nova aba, botão alterar (⬆ âmbar) permite substituir — máximo 2 alterações, após isso botão é removido permanentemente; (5) **Documentação:** ContasPagar.md atualizado com nova seção de comprovantes.

- **06/04/2026 — PENTE FINO GERAL — Auditoria de documentação e integração:** (1) **ContasPagar.md:** Seções 3, 5, 7 e 8 corrigidas — todas as referências à Reportana substituídas por UltraMsg (API real utilizada). Templates de mensagem atualizados com short_id e mensagem de véspera+dia. Secrets atualizados (ULTRAMSG_INSTANCE_ID/TOKEN); (2) **mestre.md:** ROLE_ALLOWED_KEYS atualizado (faltavam contas-pagar, residuos, invoices, fechamento para admin). Tabela de Edge Functions completada (+8 funções: notify-accounts-due, test-webhook, machine-webhook, validate-tv-code, tv-panel-data, notify-subscription-status, check-pix-expiry). Modelo de dados completado (+13 tabelas: yarn_types, invoices, invoice_items, outsource_yarn_stock, residue_materials, residue_sales, accounts_payable, tv_panels, iot_devices, machine_readings, iot_shift_state, iot_downtime_events, iot_machine_assignments); (3) **test-webhook Edge Function:** Bug corrigido — `toLocaleDateString("pt-BR")` substituído por formatação manual (`dd/mm/yyyy`) para garantir funcionamento consistente no Deno runtime.

- **07/04/2026 09:30 (Brasília)** — **CONTAS A PAGAR — Modal interno para comprovantes:** Substituído `window.open` (que era bloqueado pelo navegador com `ERR_BLOCKED_BY_CLIENT`) por download via SDK Supabase Storage + exibição em Dialog interno. PDF exibido em iframe, imagens exibidas inline. Inclui botão "Baixar". Documentação ContasPagar.md atualizada.

- **07/04/2026 10:00 (Brasília)** — **CONTAS A PAGAR — Pagamento com erro de notificação + filtros:** (1) **Pagamento desbloqueado:** Botões "Confirmar pagamento" e "Editar" agora ficam visíveis mesmo quando `notification_status = 'erro'` — erro de notificação não bloqueia mais ações financeiras; badge vermelho "Não Enviado" permanece como alerta visual; (2) **Confirmar pagamento em vencido:** Botão de confirmar pagamento agora aparece também para contas com status "vencido" (antes só aparecia em "pendente"); (3) **Filtro por mês:** Select com meses disponíveis (baseado nas datas de vencimento das contas), formatados como "abr/2026"; (4) **Filtro por fornecedor:** Select com lista única de fornecedores cadastrados.

- **07/04/2026 10:30 (Brasília)** — **CONTAS A PAGAR — Validações de formulário:** (1) **Calendário bloqueado para datas passadas:** Campo de vencimento agora usa `min` = data atual, impedindo seleção de dias anteriores a hoje; validação server-side também rejeita datas passadas; (2) **Valor somente numérico:** Campo "Valor (R$)" agora aceita apenas dígitos, vírgula e ponto — caracteres alfabéticos e especiais são filtrados automaticamente; `inputMode="decimal"` ativado para teclado numérico em mobile.

- **07/04/2026 11:00 (Brasília)** — **PENTE FINO — 2 correções:** (1) **`notify-accounts-due` — formatCurrency:** Substituído `toLocaleString('pt-BR')` por `toFixed(2).replace('.', ',')` para garantir formatação correta no Deno (mesmo fix aplicado anteriormente nas outras edge functions); (2) **Histórico mestre.md — inconsistência corrigida:** Entrada de 07/04 08:30 dizia "Botões ocultos em erro" mas isso foi revertido em 07/04 10:00 — texto atualizado com nota de que o comportamento foi revertido, eliminando ambiguidade.


- **09/04/2026 04:30 (Brasília)** — **AUDITORIA DE CÓDIGO — Pente fino nas últimas 10 atualizações:** Revisão completa de código e banco de dados cobrindo atualizações de 07/04 a 09/04: (1) **TypeScript:** Build 100% limpo (0 erros); (2) **Banco de dados:** 0 erros nos logs PostgreSQL; (3) **ESC/clique-fora nos modais:** Verificados todos os 15+ modais em 11 arquivos — 100% com `onEscapeKeyDown` e `onInteractOutside`; (4) **SearchableSelect:** `side="bottom"` e `avoidCollisions={false}` confirmados; (5) **Resíduos (cliente-cêntrico):** Tabelas `residue_clients`, `residue_client_prices` com RLS ok, fluxo de venda com `client_id` funcional; (6) **FaturamentoTotal:** Queries com `fetchAllPaginated`, filtros de data, KPIs e gráfico funcionais; (7) **Faturamento no sidebar:** Bug corrigido — `enabled_nav_items` de empresas existentes atualizado via migration para incluir `faturamento-total`; (8) **mestre.md:** Seção "Arquitetura de Pastas" atualizada com 5 páginas faltantes (FaturamentoTotal, AccountsPayable, ResidueSales, Invoices, Fechamento). Nenhum bug encontrado no código ou banco.

- **09/04/2026 15:23 (Brasília)** — **PENTE FINO — Correções reais nas últimas 10 atualizações:** (1) **Faturamento Total:** corrigida a comparação do período anterior para filtro por **mês** (mês anterior completo) e **dia específico** (7 dias antes), eliminando percentuais incorretos; (2) **Faturamento Total:** badges e linha total agora mostram corretamente **+100%** quando o período anterior é zero e o atual possui receita; (3) **Faturamento Total:** botão **Limpar Filtros** e sincronização de `dayRange` ajustados para os filtros de dia e intervalo; (4) **Consultas defensivas:** trocado `.single()` por `.maybeSingle()` em Sidebar, Relatórios e Resíduos para evitar falhas quando não houver registro; (5) **mestre.md:** snippet de permissões do admin corrigido para incluir `faturamento-total`.

- **09/04/2026 16:00 (Brasília)** — **DASHBOARD — Bug fix `troca_agulhas` + limpeza mestre.md:** (1) **Dashboard:** Status `troca_agulhas` adicionado aos mapas `statusLabels`, `statusIcons` e `statusColors` na seção "Máquinas Paradas" — antes, máquinas com esse status apareciam sem label, ícone ou cor; (2) **mestre.md:** Entradas do histórico reordenadas cronologicamente e duplicação de "Última atualização" removida.

- **09/04/2026 19:00 (Brasília)** — **NOTAS FISCAIS — Chave de Acesso SEFAZ reativada + Scanner automático:** (1) **Campo reativado:** Campo "Chave de Acesso SEFAZ" descomentado no formulário de Nova NF e no modal de visualização — exibe contador de dígitos e indicador "✓ Chave válida" ao atingir 44 dígitos; (2) **Validação reativada:** Validação de 44 dígitos numéricos no `handleSaveInvoice` reativada (antes comentada); (3) **Scanner automático (HID):** Listener global `keydown` ativo quando o modal está aberto detecta digitação rápida (<80ms entre teclas) de 44 dígitos — preenche o campo automaticamente sem necessidade de foco no input, compatível com leitores USB Zebra/Honeywell em modo HID; (4) **Toast de confirmação:** Feedback visual ao detectar leitura bem-sucedida do scanner.

- **09/04/2026 20:00 (Brasília)** — **HEADER — Indicador de conexão + botão refresh inteligente:** (1) **Indicador de rede:** Ícone de barras de sinal no header fixo mostra qualidade da conexão em tempo real — verde (4 barras, boa), amarelo/laranja (2 barras, média), vermelho (1 barra, fraca), X vermelho (sem conexão). Usa `navigator.connection` (Network Information API) com fallback para `navigator.onLine` em Safari/iOS. Tooltip mostra descrição textual. Hook `useNetworkStatus` com polling a cada 10s como fallback; (2) **Botão refresh inteligente:** Ícone de refresh (RefreshCw) no header recarrega apenas os dados do banco (via `refreshData` / `loadAllData` do `useCompanyData`) sem recarregar toda a página — animação de spin durante o carregamento, botão desabilitado durante refresh; (3) **Refatoração `useCompanyData`:** Lógica de carregamento extraída para `loadAllData` (useCallback), mappers movidos para antes da definição, `refreshData` exposto no retorno do hook; (4) **Novos arquivos:** `src/hooks/useNetworkStatus.ts`, `src/components/NetworkStatusIcon.tsx`.

- **09/04/2026 21:00 (Brasília)** — **PENTE FINO — Botão refresh + documentação:** (1) **BUG CRÍTICO — Loading infinito:** `loadAllData` não tinha `try/catch` — se qualquer query falhasse, `setLoading(false)` nunca era chamado, travando a UI em loading permanente. Corrigido com `try/catch/finally`; (2) **Toast de feedback:** Botão refresh agora exibe toast verde "Dados atualizados" ao concluir com sucesso ou toast vermelho "Erro ao atualizar" em caso de falha; (3) **Documentação:** Criado `docs/botaorefresh.md` com documentação 100% detalhada — arquitetura, APIs utilizadas, tabelas recarregadas, tratamento de erros, limitações conhecidas, posição no header e dependências entre arquivos.

- **10/04/2026 10:00 (Brasília)** — **COMPARATIVO DE PERÍODOS — Correção filtro por dia:** (1) **Dashboard + Faturamento Total:** Comparativo ao filtrar por dia específico agora usa o **dia anterior (D-1)** em vez do mesmo dia da semana anterior (D-7). Ex: dia 25/03 agora compara com 24/03, não com 18/03. Corrigido `subDays(customDate, 7)` → `subDays(customDate, 1)` nos dois arquivos; (2) **Documentação:** `faturamentototal.md` atualizado para refletir nova regra.

- **10/04/2026 14:00 (Brasília)** — **TECELÕES + PRODUÇÃO — UX melhorias:** (1) **Tecelões — Exclusão simplificada:** Modal de exclusão agora usa botões Excluir/Cancelar em vez de exigir digitação de "EXCLUIR"; (2) **Produção — Artigo principal removível:** Quando há artigos extras adicionados, o artigo principal agora exibe botão X para remoção — ao remover, o primeiro artigo extra é promovido a principal; (3) **Produção — Artigos persistentes:** Após registrar produção e avançar para próxima máquina/turno, os artigos adicionados permanecem na tela (apenas rolos são limpos), evitando retrabalho de seleção.

- **10/04/2026 15:00 (Brasília)** — **PRODUÇÃO — Redesign detalhes expandidos:** (1) **Estilo FaturamentoTotal aplicado:** Cards de detalhes expandidos da produção registrada agora usam o padrão visual do Faturamento Total — `border-l-4` com cores semânticas, tipografia `uppercase tracking-wider` nos labels, layout `flex items-start justify-between` com ícone à direita; (2) **Meta do artigo na primeira linha:** Card "Meta" na grade principal agora exibe a meta calculada com `target_efficiency` do artigo (ex: "Meta (80%)") em vez de mostrar meta 100% fixa; (3) **Cores preservadas:** Cores de status (success/warning/destructive) mantidas conforme regras de eficiência existentes; (4) **Import Card/CardContent adicionado** ao Production.tsx.

- **11/04/2026 10:00 (Brasília)** — **REVISÃO — Fix "Registrado por" não exibido:** `mapDefectRecord` em `useCompanyData.ts` não mapeava `created_by_name` e `created_by_code` do banco — campos adicionados ao mapper. A coluna "Registrado por" na tabela já existia mas mostrava "—" por falta dos dados no objeto mapeado.

- **11/04/2026 11:00 (Brasília)** — **PRODUÇÃO — Cards expandidos com fundo colorido sutil:** Cards dos detalhes expandidos da produção agora possuem fundo com tint sutil da cor do acento (`bg-emerald-500/5`, `bg-blue-500/5`, `bg-amber-500/5`, `bg-teal-500/5`, `bg-violet-500/5`, `bg-red-500/5`) para melhor distinção visual e legibilidade. Cada card tem cor única: Rolos (verde), Peso (azul), Faturamento (teal), Meta (âmbar), Registro (violeta), Tempo Parada (vermelho/azul). Todos os campos existentes foram mantidos.

- **11/04/2026 14:00 (Brasília)** — **REVISÃO — 5 melhorias de UX:** (1) **Filtro padrão "Todas as datas":** Ao abrir a página, nenhum filtro de data é aplicado — mostra todos os registros; (2) **Filtro por mês:** Adicionado select de mês com meses disponíveis baseados nos registros existentes; (3) **Edição de falhas:** Botão de editar (lápis) em cada linha — abre modal preenchido com dados da falha, permite alterar qualquer campo; `updateDefectRecords` adicionado ao `useCompanyData.ts`; (4) **Seletores abrem para baixo:** Tecelão e Artigo agora usam `side="bottom"` e `avoidCollisions={false}` para sempre abrir para baixo; (5) **Auto-foco na busca:** Ao abrir seletores de Artigo e Tecelão, o campo de pesquisa recebe foco automático via `autoFocus`.

- **11/04/2026 15:00 (Brasília)** — **PADRÃO — Artigo com nome do cliente em seletores:** Estabelecido padrão global: todo seletor de artigo em modais deve exibir `Artigo (Cliente)` — ex: "Meia Malha (Têxtil ABC)". Implementado no modal Registrar/Editar Falha (Revisão). Busca também filtra por nome do cliente. Documentado em `docs/mestre.md` (seção Padrões de UI) e `docs/revisao.md`.

- **11/04/2026 15:30 (Brasília)** — **REVISÃO — Tecelão com código na tabela:** Coluna Tecelão na listagem de falhas agora exibe `Nome #Código` (ex: "João #12"), buscando o código do tecelão pelo `weaver_id`.

- **11/04/2026 16:00 (Brasília)** — **REVISÃO — Modal Registrar Falha ajustado:** Largura do modal alterada de `max-w-lg` para `max-w-2xl`, um aumento sutil para melhor acomodar os campos.

- **11/04/2026 17:00 (Brasília)** — **TECELÕES > FALHAS — Redesign completo da aba:** (1) **Filtro por mês:** Select com meses disponíveis (padrão: mês atual) + opção "Todo período"; (2) **4 KPI Cards:** Total Falhas, Total Kg, Total Metros, Tecelões com Falhas; (3) **Ranking:** Lista ordenada por quantidade de falhas com badges coloridos (verde ≤3, amarelo 4-7, vermelho ≥8); (4) **Modal de detalhes individual:** Ao clicar no ranking, abre modal com KPIs individuais + agrupamentos por Artigo (com padrão `Nome (Cliente)`), Máquina e Defeito + tabela detalhada; (5) **Exportação PDF geral:** Ranking completo com métricas; (6) **Exportação PDF individual:** Relatório completo do tecelão selecionado; (7) **Documentação:** Criado `docs/falhas.md` com documentação completa da aba.

- **11/04/2026 18:00 (Brasília)** — **TECELÕES > Summary Cards:** Removido card "Turno Fixo" e adicionados cards "Tarde" e "Noite". Grid agora exibe 5 cards: Total, Carga Horária, Manhã, Tarde, Noite.
- **11/04/2026 19:00 (Brasília)** — **AUDITORIA — Melhorias visuais + Histórico de Login:** (1) **Ícones por tipo de ação:** Criação (verde), edição (azul), exclusão (vermelho), desativação (amarelo); (2) **Badge de módulo:** Cada registro exibe badge colorido do módulo (Máquinas, Produção, Revisão, etc.); (3) **Agrupamento por dia:** Registros separados por "Hoje", "Ontem" e datas formatadas; (4) **Filtro por módulo:** Novo select com todos os módulos do sistema; (5) **Aba Logins:** Nova tabela `login_history` com captura automática de IP (ipify), geolocalização (ipapi.co), dispositivo, navegador e OS via `trackLogin()` no AuthContext; (6) **Documentação:** Atualizado `docs/auditoria.md` com toda a nova arquitetura.

- **11/04/2026 20:00 (Brasília)** — **AUDITORIA — Fix altura do modal Histórico:** `TabsContent` do Radix não propagava `flex-1` corretamente, causando listagem ocupando apenas metade do modal. Substituído por renderização condicional (`{activeTab === 'actions' && <div>}`) com `flex-1 min-h-0` — listagem agora ocupa 100% da altura disponível nas abas Ações e Logins.

- **11/04/2026 21:00 (Brasília)** — **ASSINATURA — Bloqueio total para contas suspensas/expiradas:** (1) **Status "suspended" adicionado:** `SubscriptionContext` agora reconhece o status `suspended` (definido pela edge function `notify-subscription-status`) como estado expirado, ativando `sidebarLocked` (admin) e `fullyBlocked` (não-admin); (2) **Sidebar trancada:** Todos os itens do menu ficam com cadeado exceto "Configurações"; (3) **Settings — abas bloqueadas:** Quando assinatura expirada, apenas a aba "Planos" fica acessível — Perfil, Usuários e Empresa ficam desabilitadas com ícone de cadeado; (4) **Redirecionamento automático:** `AppLayout` redireciona admin para `/settings` se tentar acessar outra rota; (5) **Edge function check-subscription:** Adicionado `suspended` à lista de status bloqueados; (6) **Badge no header:** Status "suspended" exibe badge "Conta Suspensa" em vermelho; (7) **Fix useEffect tab sync:** Adicionado `useEffect` em `Settings.tsx` para forçar tab "Planos" quando `sidebarLocked` muda de false→true (corrige bug onde `useState` initial value não atualizava após mount).

- **13/04/2026 12:00 (Brasília)** — **SIDEBAR — Vendas de Resíduos removido de "Em teste":** Módulo `residuos` retirado do conjunto `TESTING_KEYS` no `AppSidebar.tsx`. O badge "Em teste" não aparece mais ao lado do item no menu lateral. Módulo agora exibido como funcionalidade estável.

- **13/04/2026 15:00 (Brasília)** — **PRODUÇÃO — Cadastro rápido inline + eficiência sem 0 rolos:** (1) **Cadastro rápido de Tecelão:** Botão `+` ao lado do seletor de tecelão no modal de registro de produção — abre modal de cadastro rápido sem fechar o registro; após salvar, o novo tecelão é automaticamente selecionado no formulário; componente `QuickAddWeaver.tsx`; (2) **Cadastro rápido de Artigo:** Botão `+` ao lado do seletor de artigo — abre modal com campos nome, cliente, peso/rolo, valor/kg, voltas/rolo, meta eficiência; após salvar, o novo artigo é automaticamente selecionado; componente `QuickAddArticle.tsx`; (3) **Eficiência média sem 0 rolos:** Produções com 0 rolos não são mais consideradas no cálculo da eficiência média do turno (`shiftKPIs.avgEfficiency`), evitando distorção da métrica.


- **13/04/2026 16:00 (Brasília)** — **GLOBAL — Eficiência média exclui 0 rolos em todo o projeto:** Regra aplicada em todos os módulos que calculam eficiência média: `Dashboard.tsx` (KPIs principais, comparação período anterior, performance por máquina, gráfico tendência diária), `Reports.tsx` (KPIs, por máquina, gráfico por data), `Weavers.tsx` (eficiência média do tecelão), `MachinePerformanceModal.tsx` (eficiência por máquina), `Production.tsx` (KPIs do turno). Produções com `rolls_produced === 0` são filtradas antes do cálculo de média, evitando distorção.

- **13/04/2026 17:00 (Brasília)** — **PENTE FINO — Bug corrigido no TvMachineGrid:** Eficiência média no painel TV (`TvMachineGrid.tsx`) não excluía produções com 0 rolos do cálculo, contrariando a regra global. Corrigido: agora filtra `prods.filter(p => p.rolls_produced > 0)` antes de calcular a média, igual aos demais módulos. Nenhum outro bug encontrado na auditoria completa (Dashboard, Reports, Weavers, Production, MachinePerformanceModal, FaturamentoTotal, Fechamento — todos OK).

- **13/04/2026 18:00 (Brasília)** — **RESÍDUOS — Autoria nos registros de venda:** Na listagem de vendas de resíduos (`ResidueSales.tsx`), abaixo da data/hora de cada registro agora é exibido o nome e código (`Nome #ID`) do usuário que registrou a venda, usando os campos `created_by_name` e `created_by_code` já existentes na tabela `residue_sales`.


- **13/04/2026 19:00 (Brasília)** — **RESÍDUOS — Botão editar nos registros de venda:** Adicionado botão de edição (ícone lápis) em cada registro da listagem de vendas de resíduos. Ao clicar, abre o dialog preenchido com os dados da venda (cliente, material, quantidade, preço, romaneio, observações) para edição. Atualiza no banco via `UPDATE` em `residue_sales`. Auditoria registrada com ação `residue_sale_update`.

- **14/04/2026 10:00 (Brasília)** — **FATURAMENTO TOTAL — Terceirizado agora exibe Lucro:** Card "Terceirizado" renomeado para "Terceirizado (Lucro)" e campo de dados alterado de `total_revenue` (receita) para `total_profit` (lucro). Alteração aplicada nos KPI cards, gráfico de tendência (AreaChart) e tabela de resumo. Documentação `faturamentototal.md` atualizada.

- **14/04/2026 10:30 (Brasília)** — **FATURAMENTO TOTAL — Cor do Terceirizado no gráfico:** Cor da área "Terceirizado (Lucro)" no AreaChart alterada de `--accent` (muito clara no dark mode) para laranja vibrante (`hsl(25, 95%, 53%)`) para melhor visibilidade.

- **14/04/2026 11:00 (Brasília)** — **PENTE FINO — Auditoria pré-lançamento:** (1) **Build:** TypeScript 0 erros; (2) **Eficiência sem 0 rolos:** Confirmado em 6 arquivos (Dashboard, Reports, Weavers, Production, MachinePerformanceModal, TvMachineGrid); (3) **QuickAdd components:** `company_id: ''` é seguro — `saveWeavers`/`saveArticles` substituem pelo `companyId` correto no upsert; (4) **Fechamento:** Não calcula eficiência — sem impacto; (5) **BUG CORRIGIDO — ResidueSales edição sobrescreve preço:** Ao editar uma venda, os `useEffect` de auto-preenchimento de preço (por material/cliente) disparavam e substituíam o preço original da venda pelo preço padrão do cliente. Corrigido com `skipPriceAutoUpdate` ref que bloqueia os useEffects durante a carga dos dados de edição.


- **14/04/2026 15:00 (Brasília)** — **NOTAS FISCAIS — Reestruturação Entrada/Venda de Fio:** (1) **Aba "Entrada" → "Entrada de Fio"** e **"Saída" → "Venda de Fio"**; (2) **Modal Entrada de Fio:** Cliente removido, adicionado "Fornecedor" (texto livre) e "Marca do Fio" (texto livre) por item; (3) **Modal Venda de Fio:** Cliente removido, adicionado "Cliente" (texto livre) e "Marca do Fio" (dropdown com marcas disponíveis em saldo); (4) **Coluna `brand`** adicionada em `invoice_items`; (5) **Busca** inclui fornecedor/comprador; (6) **View dialog** exibe Fornecedor e Marca.

- **14/04/2026 16:30 (Brasília)** — **NOTAS FISCAIS — Formatação brasileira no campo Peso (kg):** Input de peso nos modais Entrada de Fio e Venda de Fio agora aceita e exibe valores no formato brasileiro (1.234,56). Separadores de milhar (ponto) são adicionados automaticamente ao digitar, vírgula usada como separador decimal. Componente reutilizável `BrazilianWeightInput` criado em `src/components/`.

- **14/04/2026 17:00 (Brasília)** — **NOTAS FISCAIS — Peso com 2 casas decimais:** `formatWeight` e todas as exibições de peso em Notas Fiscais agora mostram 2 casas decimais após a vírgula (ex: 7.027,70 em vez de 7.027,7).

- **14/04/2026 18:00 (Brasília)** — **NOTAS FISCAIS — Reestruturação Saída Malha + Venda de Fio:** (1) **Nº NF opcional em Venda de Fio:** Campo "Nº da NF" não é mais obrigatório no modal de Venda de Fio — se vazio, salva como "S/N"; (2) **Botão "Nova Saída (Malha)" removido:** Substituído por dois botões na aba "Venda de Fio": "Venda de Fio" (principal) e "Saída Malha" (outline); (3) **Modal Saída Malha — Tinturaria:** Campo "Cliente" substituído por "Tinturaria" com opção Manual (texto livre) ou Terceiros (lista de malharias terceirizadas do módulo Terceirizado); salvo em `destination_name`; (4) **Modal Saída Malha — Artigo livre:** Campo de artigo agora é input de texto livre (sem seletor), permitindo registrar qualquer artigo sem necessidade de cadastro prévio; (5) **Listagem:** Coluna "Cliente/Tinturaria" exibe `destination_name` para NFs de saída; (6) **Busca:** Inclui `destination_name` na busca textual.
- **14/04/2026 19:00 (Brasília)** — **NOTAS FISCAIS — Abas independentes + Modal Saída Malha simplificado:** (1) **Abas separadas:** "Entrada de Fio", "Venda de Fio" e "Saída Malha" agora são 3 abas independentes (antes Venda de Fio e Saída Malha compartilhavam a mesma aba); (2) **Modal Saída Malha simplificado:** Tinturaria é campo obrigatório (input texto), abaixo há seletor opcional "Terceiros" que ao selecionar preenche automaticamente o campo Tinturaria — sem mais botões toggle Manual/Terceiros; (3) **Removidos Rolos e R$/kg** do modal e visualização de Saída Malha — apenas Artigo (texto livre) e Peso (kg) nos itens; (4) **Subtotal/valor** exibido apenas para Venda de Fio, não mais para Saída Malha.
- **14/04/2026 19:30 (Brasília)** — **NOTAS FISCAIS — Tinturaria e Terceiros independentes no modal Saída Malha:** Tinturaria (input texto obrigatório) e Terceiros (seletor opcional de malharias terceirizadas) agora são campos separados e independentes — sem vínculo entre eles. Tinturaria salva em `destination_name`, Terceiros salva em `buyer_name`. Tabela da aba Saída Malha exibe ambas as colunas. View dialog também mostra ambos os campos.

---

*Última atualização: 14/04/2026 19:30 (Brasília)*
