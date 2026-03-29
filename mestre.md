# 📋 MESTRE.MD — Documentação Mestre do Projeto MalhaGest

> **⚠️ INSTRUÇÕES PARA A IA (LOVABLE):**
>
> 1. **LEIA ESTE ARQUIVO ANTES** de qualquer modificação no projeto.
> 2. Use-o como referência para entender a arquitetura, fluxos de dados e dependências entre módulos.
> 3. **Após concluir alterações**, atualize este arquivo na seção relevante com o que foi modificado.
> 4. Este arquivo é a **fonte de verdade** sobre o estado atual do sistema — mantenha-o sempre atualizado.
> 5. Nunca faça alterações em um módulo sem verificar aqui se há dependências com outros módulos.

---

## 📌 Visão Geral

**MalhaGest** é um sistema SaaS de gestão para malharias/indústrias têxteis. Permite gerenciar máquinas (teares), tecelões, clientes, artigos, produção diária, revisão de qualidade, terceirização e relatórios analíticos.

- **URL publicada:** https://loomlytics-hub.lovable.app
- **Stack:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Lovable Cloud (Supabase) — autenticação, banco de dados PostgreSQL, Edge Functions, Storage
- **Multi-tenancy:** Cada empresa tem seus dados isolados via Row-Level Security (RLS) usando `get_user_company_id()`

---

## 🏗️ Arquitetura de Pastas

```
src/
├── App.tsx                    # Rotas, providers, proteção de rotas
├── main.tsx                   # Entry point
├── index.css                  # Tokens de design (CSS variables)
├── types/index.ts             # Interfaces e tipos globais
├── contexts/
│   ├── AuthContext.tsx         # Autenticação e gerenciamento de sessão
│   ├── CompanyDataContext.tsx  # Provider global de dados da empresa
│   └── SubscriptionContext.tsx # Estado da assinatura/plano
├── hooks/
│   ├── useCompanyData.ts      # Busca e CRUD de todos os dados da empresa
│   ├── usePermissions.ts      # Controle de acesso por role
│   ├── useAuditLog.ts         # Hook para registro de auditoria
│   └── use-mobile.tsx         # Detecção de dispositivo móvel
├── lib/
│   ├── formatters.ts          # Formatação pt-BR (moeda, número, peso, %)
│   ├── downtimeUtils.ts       # Cálculo de paradas de máquina por turno
│   ├── auditLog.ts            # Função para inserir log de auditoria
│   └── utils.ts               # Utilitários (cn, etc.)
├── components/
│   ├── AppLayout.tsx           # Layout principal (sidebar + conteúdo)
│   ├── AppSidebar.tsx          # Barra lateral de navegação
│   ├── MobileBottomNav.tsx     # Navegação inferior mobile
│   ├── NavLink.tsx             # Link de navegação com estado ativo
│   ├── ThemeProvider.tsx       # Tema claro/escuro
│   ├── MachinePerformanceModal.tsx  # Modal de performance de máquinas
│   ├── MaintenanceViewModal.tsx     # Modal de manutenção
│   ├── ProductionModeModal.tsx      # Modal de modo de produção
│   └── ui/                     # Componentes shadcn/ui
├── pages/
│   ├── Dashboard.tsx           # Painel principal com KPIs e gráficos
│   ├── Machines.tsx            # Gestão de máquinas/teares
│   ├── ClientsArticles.tsx     # Gestão de clientes e artigos
│   ├── Production.tsx          # Registro de produção diária
│   ├── Revision.tsx            # Registro de revisão/defeitos
│   ├── Mecanica.tsx            # Módulo mecânica
│   ├── Outsource.tsx           # Produção terceirizada
│   ├── Weavers.tsx             # Gestão de tecelões
│   ├── Reports.tsx             # Relatórios analíticos com gráficos
│   ├── Settings.tsx            # Configurações da empresa
│   ├── Login.tsx               # Login global
│   ├── CompanyLogin.tsx        # Login por slug da empresa
│   ├── Register.tsx            # Registro de nova empresa
│   ├── Admin.tsx               # Painel administrativo da plataforma
│   ├── Vendas.tsx              # Página de vendas/landing
│   ├── PaymentSuccess.tsx      # Confirmação de pagamento
│   └── NotFound.tsx            # Página 404
├── integrations/supabase/
│   ├── client.ts               # ⛔ AUTO-GERADO — NÃO EDITAR
│   └── types.ts                # ⛔ AUTO-GERADO — NÃO EDITAR
supabase/
├── config.toml                 # Configuração do projeto Supabase
├── functions/                  # Edge Functions
│   ├── admin-api/              # API administrativa
│   ├── create-company-profile/ # Criação de empresa no registro
│   ├── manage-users/           # Gestão de usuários
│   ├── update-user-email/      # Alteração de email
│   ├── setup-admin/            # Setup do admin da plataforma
│   ├── create-checkout/        # Checkout Stripe
│   ├── create-pix-checkout/    # Checkout Pix (SyncPayments)
│   ├── check-pix-payment/      # Verificação de pagamento Pix
│   ├── syncpay-webhook/        # Webhook SyncPayments
│   ├── check-subscription/     # Verificação de assinatura
│   ├── customer-portal/        # Portal do cliente Stripe
│   ├── daily-backup/           # Backup diário automático
│   └── restore-backup/         # Restauração de backup
```

---

## 🔐 Autenticação e Autorização

### Fluxo de Autenticação (`AuthContext.tsx`)

1. **Login:** `supabase.auth.signInWithPassword` → carrega perfil via `fetchProfile()` + empresas via RPC `get_user_companies()`
2. **Registro:** `supabase.auth.signUp` → Edge Function `create-company-profile` cria empresa, perfil e configurações
3. **Multi-empresa:** Um usuário pode pertencer a várias empresas. A empresa ativa é gerenciada via tabela `user_active_company` e RPC `set_active_company`
4. **Sessão:** Persistida em `localStorage`, auto-refresh habilitado

### Roles e Permissões (`usePermissions.ts`)

| Role       | Acesso                                                                                     |
|------------|--------------------------------------------------------------------------------------------|
| `admin`    | Tudo: dashboard, machines, clients-articles, production, revision, mecanica, outsource, weavers, reports, settings |
| `lider`    | Tudo exceto settings                                                                       |
| `mecanico` | Apenas: machines, mecanica                                                                 |
| `revisador`| Apenas: production, revision                                                               |

- **`canSeeFinancial`**: Apenas `admin` vê dados financeiros (faturamento, valor/kg)
- **`ProtectedRoute`**: Componente que redireciona se o role não tem acesso à rota
- **Sidebar dinâmico**: Itens filtrados por role E por `enabled_nav_items` (configurável pelo admin da plataforma)

### Rotas

```
/login                    → Login global (PublicRoute)
/register                 → Registro de empresa (PublicRoute)
/:slug/login              → Login por empresa (CompanyLogin)
/:slug                    → Dashboard (CompanyRoute + ProtectedRoute)
/:slug/machines           → Máquinas
/:slug/clients-articles   → Clientes & Artigos
/:slug/production         → Produção
/:slug/revision           → Revisão
/:slug/mecanica           → Mecânica
/:slug/outsource          → Terceirizado
/:slug/weavers            → Tecelões
/:slug/reports            → Relatórios
/:slug/settings           → Configurações
/admin                    → Painel Admin da Plataforma
/vendas                   → Página de Vendas
/payment-success          → Sucesso do Pagamento
```

---

## 🗄️ Modelo de Dados (Tabelas Supabase)

### Tabelas Principais

| Tabela                          | Descrição                                                |
|---------------------------------|----------------------------------------------------------|
| `companies`                     | Empresas cadastradas (nome, slug, admin, logo, whatsapp) |
| `profiles`                      | Perfis de usuários (user_id, company_id, role, status)   |
| `user_active_company`           | Empresa ativa do usuário (1 registro por user)           |
| `company_settings`              | Config da empresa (turnos, assinatura, módulos, plano)   |
| `machines`                      | Teares (nome, número, RPM, status, artigo_atual, modo)   |
| `machine_logs`                  | Histórico de status das máquinas (início/fim, quem)      |
| `machine_maintenance_observations` | Observações de manutenção vinculadas a logs           |
| `clients`                       | Clientes da empresa                                      |
| `articles`                      | Artigos/malhas (peso/rolo, valor/kg, voltas/rolo, meta)  |
| `article_machine_turns`         | Voltas/rolo específicas por artigo+máquina               |
| `weavers`                       | Tecelões (código, turno fixo ou específico)               |
| `productions`                   | Registros de produção (data, turno, máquina, tecelão...) |
| `defect_records`                | Registros de defeito/revisão (kg ou metros)              |
| `outsource_companies`           | Empresas terceirizadas                                   |
| `outsource_productions`         | Produção terceirizada com cálculo de lucro               |
| `payment_history`               | Histórico de pagamentos (Pix, status)                    |
| `audit_logs`                    | Log de auditoria (ação, usuário, detalhes)               |
| `company_backups`               | Backups diários automáticos (JSON)                       |
| `platform_admins`               | Administradores da plataforma                            |
| `platform_settings`             | Configurações globais da plataforma                      |
| `email_history`                 | Histórico de alterações de email                         |

### Status de Máquina (Enum `machine_status`)

| Valor                    | Label                    |
|--------------------------|--------------------------|
| `ativa`                  | Ativa                    |
| `manutencao_preventiva`  | Manutenção Preventiva    |
| `manutencao_corretiva`   | Manutenção Corretiva     |
| `troca_artigo`           | Troca de Artigo          |
| `troca_agulhas`          | Troca de Agulhas         |
| `inativa`                | Inativa                  |

### Modos de Produção

| Modo    | Descrição                                    |
|---------|----------------------------------------------|
| `rolos` | Produção calculada por rolos produzidos       |
| `voltas`| Produção calculada por voltas (convertida)    |

---

## 📊 Fluxo de Dados (`useCompanyData.ts`)

### Carregamento
- Ao montar o `CompanyDataProvider`, o hook `useCompanyData` busca **TODOS** os dados da empresa de uma vez via `Promise.all`
- Usa paginação recursiva (`fetchAll`) para superar o limite de 1000 registros do Supabase
- Ordenação determinística por coluna principal + `id` para garantir consistência na paginação

### Tabelas carregadas
```
machines       → ordenado por number
clients        → ordenado por name
articles       → ordenado por name
weavers        → ordenado por code
productions    → ordenado por date DESC
machine_logs   → últimos 1000 (sem paginação)
article_machine_turns → ordenado por created_at
company_settings → single record
defect_records → ordenado por date DESC
```

### Operações de escrita disponíveis
| Função              | Comportamento                                          |
|---------------------|--------------------------------------------------------|
| `saveMachines`      | Upsert + delete de removidos                           |
| `saveMachineLogs`   | Upsert                                                |
| `saveClients`       | Delete all + insert (substituição total)               |
| `saveArticles`      | Delete all + insert (substituição total)               |
| `saveWeavers`       | Delete all + insert (substituição total)               |
| `saveProductions`   | Delete all + insert em batches de 500                  |
| `addProductions`    | Insert incremental (sem deletar existentes)            |
| `updateProductions` | Delete IDs específicos + insert novos                  |
| `deleteProductions` | Delete IDs específicos                                 |
| `addDefectRecords`  | Insert incremental                                     |
| `deleteDefectRecords`| Delete IDs específicos                                |
| `saveShiftSettings` | Update no company_settings                             |
| `saveArticleMachineTurns` | Delete por article_id + insert                   |

### Normalização de Turnos
O `normalizeShift()` converte strings legadas (ex: "Manhã", "MANHA") para o formato padrão: `manha`, `tarde`, `noite`.

---

## 🎛️ Sistema de Filtros (Dashboard e Relatórios)

### Estados de filtro compartilhados

| Estado        | Tipo             | Padrão     | Descrição                              |
|---------------|------------------|------------|----------------------------------------|
| `dayRange`    | number           | 15 (Dash) / 30 (Rep) | Dias de intervalo (0 = todo período) |
| `customDate`  | Date \| undefined| undefined  | Data específica                        |
| `dateFrom`    | Date \| undefined| undefined  | Início do intervalo customizado        |
| `dateTo`      | Date \| undefined| undefined  | Fim do intervalo customizado           |
| `filterMonth` | string           | 'all'      | Mês (formato 'yyyy-MM')               |
| `filterShift` | string           | 'all'      | Turno                                  |
| `filterClient`| string           | 'all'      | Cliente                                |
| `filterArticle`| string          | 'all'      | Artigo                                 |
| `filterMachine`| string          | 'all'      | Máquina (apenas em Reports)            |

### ⚠️ Lógica de prioridade de filtros (CRÍTICO)

A lógica de filtragem segue esta ordem de prioridade no `useMemo`:

```
1. dayRange === 0 E filterMonth === 'all' E !customDate E !dateFrom E !dateTo
   → "Todo período" — sem filtro de data

2. dateFrom OU dateTo
   → Intervalo customizado De/Até

3. filterMonth !== 'all'
   → Filtro por mês

4. customDate
   → Data específica

5. dayRange > 0 (fallback)
   → Últimos N dias (inclui hoje)
```

**REGRA IMPORTANTE:** A condição "Todo período" (passo 1) só é ativada quando `dayRange === 0` **E** nenhum outro filtro de data está ativo. Caso contrário, os filtros de mês/data/intervalo têm precedência.

### Reset de filtros
Quando um filtro é selecionado, os outros são resetados:
- Selecionar mês → limpa `customDate`, `dateFrom`, `dateTo` (NÃO reseta `dayRange`)
- Selecionar dia range → limpa `customDate`, `filterMonth`, `dateFrom`, `dateTo`
- Selecionar customDate → limpa `filterMonth`, `dateFrom`, `dateTo`
- Selecionar De/Até → limpa `filterMonth`, `customDate`

### Subtítulo dinâmico
Tanto Dashboard quanto Relatórios exibem um label do período ativo (ex: "01/03/2026 a 29/03/2026"), calculado no `periodLabel` useMemo com a mesma lógica de prioridade.

---

## 📈 Dashboard (`Dashboard.tsx`)

### KPIs exibidos
- **Rolos produzidos** (total)
- **Peso total** (kg)
- **Faturamento** (R$) — apenas admin
- **Eficiência média** (%)
- **Faturamento/hora** (R$) — apenas admin
- **Kg/hora**

### Seções
1. **Máquinas paradas** — lista de máquinas em manutenção/troca com tempo decorrido
2. **Produção por turno** — cards com totais por turno (Manhã, Tarde, Noite)
3. **Tendência de produção** — gráfico AreaChart com Rolos, Kg, Faturamento, Eficiência
4. **Top Máquinas** — ranking por rolos produzidos com barra de eficiência

### Cálculo de horas calendário
- `calendarHours`: Calcula horas disponíveis baseado no período selecionado × 3 turnos × minutos/turno
- Para "Todo período": usa apenas dias com registros de produção
- Para intervalos: calcula dias do período × minutos dos turnos configurados

### Modal de Performance
- `MachinePerformanceModal`: Exibe cards de todas as máquinas com filtros próprios (inclui filtro por ano)

---

## 📋 Relatórios (`Reports.tsx`)

### Abas disponíveis
- **Por Turno**: Gráfico de barras + tabela com totais por turno
- **Por Máquina**: Performance de cada máquina com eficiência
- **Por Artigo**: Produção agrupada por artigo
- **Por Tecelão**: Produção agrupada por tecelão
- **Tendência**: Gráfico de linhas com evolução temporal
- **Comparativo**: Comparação entre períodos

### Exportação
- Formato PDF ou CSV
- Modo admin (com financeiro) ou funcionário (sem financeiro)
- Opção de incluir/excluir gráficos
- Cabeçalho com logo da empresa

---

## ⚙️ Máquinas (`Machines.tsx`)

### Funcionalidades
- CRUD de máquinas (nome padrão: "TEAR XX")
- Alteração de status com registro em `machine_logs`
- Vinculação de artigo atual
- Configuração de RPM
- Modo de produção (rolos/voltas)
- Observações de manutenção vinculadas ao log ativo

### Status e Cores
Cada status tem cor semântica definida em `MACHINE_STATUS_COLORS` (types/index.ts)

---

## 🧵 Produção (`Production.tsx`)

### Fluxo de registro
1. Selecionar data e turno
2. Selecionar máquina → auto-preenche artigo vinculado
3. Selecionar tecelão
4. Informar rolos OU voltas (conforme modo da máquina)
5. Sistema calcula: peso_kg, faturamento, eficiência

### Cálculo de eficiência
```
Se modo "rolos":
  peso_kg = rolos × peso_por_rolo
  
Se modo "voltas":
  rolos_equivalentes = voltas / voltas_por_rolo
  peso_kg = rolos_equivalentes × peso_por_rolo

faturamento = peso_kg × valor_por_kg

eficiência = (produção_real / produção_teórica) × 100
  onde produção_teórica = RPM × minutos_turno
```

### Voltas por rolo específicas
A tabela `article_machine_turns` permite configurar voltas/rolo diferentes para cada combinação artigo+máquina, sobrescrevendo o padrão do artigo.

---

## 🔍 Revisão (`Revision.tsx`)

- Registro de defeitos encontrados na revisão
- Medição em kg ou metros
- Vinculação a máquina, artigo e tecelão
- Usado para análise de qualidade nos relatórios

---

## 🔧 Mecânica (`Mecanica.tsx`)

- Módulo acessível por mecânicos e admins
- Visualização e gestão de manutenções
- Registro de observações durante paradas

---

## 🏭 Terceirizado (`Outsource.tsx`)

### Modelo
- Empresas terceirizadas cadastradas em `outsource_companies`
- Produções terceirizadas em `outsource_productions`
- Cálculo automático de lucro: `profit_per_kg = client_value_per_kg - outsource_value_per_kg`

---

## 👷 Tecelões (`Weavers.tsx`)

### Campos
- Código único (#100 - #999)
- Turno fixo (manha/tarde/noite) OU horário específico (start_time/end_time)
- Telefone (opcional)

---

## 👥 Clientes & Artigos (`ClientsArticles.tsx`)

### Clientes
- Nome, contato, observações

### Artigos
- Vinculados a um cliente
- Peso por rolo (kg), Valor por kg (R$), Voltas por rolo
- Meta de eficiência (% — padrão 80%)
- Voltas específicas por máquina (via `article_machine_turns`)

---

## 💰 Sistema de Assinatura (`SubscriptionContext.tsx`)

### Status possíveis

| Status       | Descrição                                                   |
|--------------|-------------------------------------------------------------|
| `free`       | Conta gratuita (sem restrições de cobrança)                 |
| `trial`      | Período de teste                                            |
| `active`     | Assinatura ativa e paga                                     |
| `cancelling` | Cancelamento solicitado (acesso até fim do período pago)    |
| `grace`      | Carência de 5 dias após vencimento                          |
| `overdue`    | Pagamento atrasado                                          |
| `blocked`    | Bloqueado por falta de pagamento                            |
| `cancelled`  | Cancelado definitivamente                                   |

### Comportamento por role quando bloqueado
- **Admin:** Sidebar com cadeados (🔒), acesso apenas a Configurações
- **Outros roles:** Tela de bloqueio total com mensagem

### Pagamento
- **Pix:** Via SyncPayments com QR Code e polling automático (`check-pix-payment`)
- **Cartão:** Via Stripe (até 12x no plano anual)
- **Valor padrão:** R$ 147,00/mês (customizável por empresa no /admin)
- **Plano anual:** 40% de desconto sobre 12 mensalidades

---

## 🛡️ Painel Admin da Plataforma (`Admin.tsx`)

### Funcionalidades
- Listagem de todas as empresas com status
- Ativação/desativação de empresas
- Configuração de módulos (sidebar items) por empresa
- Contato via WhatsApp (link wa.me)
- Precificação individual do plano
- Marcar empresa como "Gratuito"
- Listagem de todos os usuários
- Sincronização automática de alterações de email
- Histórico de emails anteriores

### Acesso
- Verificado via tabela `platform_admins` e função `is_platform_admin()`
- Rota: `/admin`

---

## 🔒 Segurança

### Row-Level Security (RLS)
- Todas as tabelas têm RLS habilitado
- Maioria usa `company_id = get_user_company_id()` para isolamento
- `get_user_company_id()` é uma função `SECURITY DEFINER` que busca a empresa ativa do usuário

### Trigger de proteção
- `prevent_profile_privilege_escalation`: Impede alteração de `company_id` e `role` via client-side (exceto service_role)

### Funções de segurança
- `get_user_company_id()` → Retorna UUID da empresa ativa
- `get_user_companies()` → Lista empresas do usuário
- `set_active_company()` → Define empresa ativa (verifica acesso)
- `is_platform_admin()` → Verifica se é admin da plataforma

---

## 🎨 Design System

### Tokens CSS (index.css)
- Usa variáveis HSL para todas as cores
- Suporta tema claro e escuro (via `ThemeProvider`)
- Cores semânticas: `--primary`, `--secondary`, `--destructive`, `--success`, `--warning`, `--info`

### Componentes UI
- Baseado em shadcn/ui (Radix primitives + Tailwind)
- Botões com variante `btn-gradient`
- Cards com `shadow-material`

---

## 📦 Dependências Principais

| Pacote                | Uso                                      |
|-----------------------|------------------------------------------|
| `react-router-dom`    | Roteamento SPA                           |
| `@tanstack/react-query`| Cache e sincronização de dados          |
| `@supabase/supabase-js`| Client Supabase                         |
| `recharts`            | Gráficos (BarChart, AreaChart, LineChart) |
| `date-fns`            | Manipulação de datas                     |
| `sonner`              | Toasts/notificações                      |
| `lucide-react`        | Ícones                                   |
| `zod`                 | Validação de schemas                     |
| `react-hook-form`     | Formulários                              |
| `qrcode.react`        | QR Code para pagamento Pix              |
| `framer-motion`       | *(não instalado atualmente)*             |

---

## 🔄 Edge Functions

| Função                    | Descrição                                              |
|---------------------------|--------------------------------------------------------|
| `admin-api`               | Operações administrativas da plataforma                |
| `create-company-profile`  | Cria empresa + perfil + settings no registro           |
| `manage-users`            | CRUD de usuários da empresa                            |
| `update-user-email`       | Alteração de email com histórico                       |
| `setup-admin`             | Setup inicial do admin da plataforma                   |
| `create-checkout`         | Cria sessão de checkout Stripe                         |
| `create-pix-checkout`     | Gera cobrança Pix via SyncPayments                     |
| `check-pix-payment`       | Verifica status do pagamento Pix                       |
| `syncpay-webhook`         | Webhook para confirmação automática SyncPayments       |
| `check-subscription`      | Verifica status da assinatura                          |
| `customer-portal`         | Redireciona para portal Stripe                         |
| `daily-backup`            | Backup automático diário dos dados                     |
| `restore-backup`          | Restauração de backup                                  |

---

## 🔧 Utilitários

### `formatters.ts`
- `formatNumber(value, decimals)` → "1.234" (pt-BR)
- `formatCurrency(value)` → "R$ 1.234,56"
- `formatWeight(value)` → "1.234,5 kg"
- `formatPercent(value)` → "85,3%"

### `downtimeUtils.ts`
- `calculateShiftDowntime()` → Calcula tempo de parada de uma máquina em um turno específico
- `formatDowntimeMinutes()` → "2h 30min"
- Clipa logs de parada nos limites do turno
- Turnos que cruzam meia-noite são tratados corretamente

### `auditLog.ts`
- `logAudit()` → Insere registro na tabela `audit_logs`

---

## ⏰ Turnos

### Configuração padrão
| Turno  | Início | Fim   | Duração |
|--------|--------|-------|---------|
| Manhã  | 05:00  | 13:30 | 510 min |
| Tarde  | 13:30  | 22:00 | 510 min |
| Noite  | 22:00  | 05:00 | 420 min |

### Configuração customizável
- Cada empresa pode personalizar horários em `company_settings`
- `getCompanyShiftMinutes()` calcula duração real a partir dos horários configurados
- `getCompanyShiftLabels()` gera labels com horários reais

---

## 📱 Responsividade

- **Desktop:** Sidebar lateral colapsável + conteúdo
- **Mobile:** Bottom navigation (`MobileBottomNav`) com itens filtrados por role
  - Items do bottom nav são removidos do sidebar para evitar duplicação
- Hook `use-mobile.tsx` detecta viewport < 768px

---

## 📝 Convenções de Código

1. **Tipos:** Definidos em `src/types/index.ts` — NUNCA duplicar
2. **Dados:** Acessar sempre via `useSharedCompanyData()` — NUNCA buscar direto do Supabase nas páginas
3. **Formatação:** Usar `formatters.ts` — NUNCA formatar manualmente
4. **Cores:** Usar tokens CSS semânticos — NUNCA usar cores hardcoded
5. **RLS:** Toda tabela nova DEVE ter policies baseadas em `get_user_company_id()`
6. **Arquivos protegidos:** NUNCA editar `client.ts`, `types.ts`, `.env`

---

## 📅 Histórico de Alterações

| Data & Hora          | Alteração                                                                      |
|----------------------|--------------------------------------------------------------------------------|
| 2026-03-29 00:00     | Criação deste arquivo mestre.md                                                |
| 2026-03-29 00:15     | Correção do filtro de mês no Dashboard/Reports (dayRange===0 bloqueava filtro) |
| 2026-03-29 00:30     | Correção do filtro por máquina nos Relatórios (fallback por machine_name)      |
| 2026-03-29 01:00     | Renomeação TEAR 3→TEAR 03, TEAR 4→TEAR 04                                     |
| 2026-03-29 01:15     | Vinculação de 19.531 produções ao machine_id correto via migração              |
| 2026-03-29 01:30     | Remoção de prefixos "Todos os" nos filtros de Relatórios                       |
| 2026-03-29 02:00     | Criação dos artigos MALHA 1,12-115 MISTO e MALHA 1,35-115 MISTO               |
| 2026-03-29 02:15     | Vinculação de 777 produções órfãs aos novos artigos (0 órfãs restantes)        |
| 2026-03-29 03:00     | Backup: removida constraint UNIQUE(company_id,backup_date) para múltiplos/dia  |
| 2026-03-29 03:05     | Backup: alterado de UPSERT para INSERT no daily-backup                         |
| 2026-03-29 03:06     | Backup: configurado pg_cron para executar daily-backup todo dia às 00:00 UTC   |
| 2026-03-29 03:10     | Backup: list_backups agora ordena por created_at DESC (mostra hora correta)     |

---

*Última atualização: 29/03/2026 03:10 UTC*
