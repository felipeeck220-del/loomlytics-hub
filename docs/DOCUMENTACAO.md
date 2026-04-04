# LoomLytics Hub — Documentação Técnica Completa

> Sistema de gestão para empresas do setor têxtil (tecelagens), com controle de máquinas, produção, tecelões, clientes, artigos, terceirização e relatórios.

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Stack Tecnológica](#stack-tecnológica)
3. [Estrutura de Pastas](#estrutura-de-pastas)
4. [Arquitetura do Sistema](#arquitetura-do-sistema)
5. [Banco de Dados (Supabase)](#banco-de-dados-supabase)
6. [Autenticação e Autorização](#autenticação-e-autorização)
7. [Edge Functions (Backend)](#edge-functions-backend)
8. [Páginas e Funcionalidades](#páginas-e-funcionalidades)
9. [Segurança](#segurança)
10. [Como Rodar Localmente](#como-rodar-localmente)

---

## Visão Geral

**LoomLytics Hub** é uma plataforma SaaS multi-tenant para gestão de tecelagens. Cada empresa (tenant) tem seus próprios dados isolados via Row-Level Security (RLS). A plataforma inclui:

- Cadastro de máquinas com status e logs de manutenção
- Gestão de clientes e artigos (tecidos)
- Registro de produção por turno (manhã, tarde, noite)
- Controle de tecelões com turnos fixos ou específicos
- Módulo de terceirização com cálculo de lucro
- Relatórios e dashboard com métricas
- Painel de administração global (`/admin`) para super admins

**URL publicada:** `https://loomlytics-hub.lovable.app`

---

## Stack Tecnológica

| Camada     | Tecnologia                          |
|------------|-------------------------------------|
| Frontend   | React 18 + TypeScript + Vite        |
| UI         | shadcn/ui + Tailwind CSS + Radix UI |
| Gráficos   | Recharts                            |
| Roteamento | React Router DOM v6                 |
| Estado     | React Context + TanStack React Query|
| Backend    | Supabase (Lovable Cloud)            |
| Auth       | Supabase Auth (email/password)      |
| DB         | PostgreSQL (via Supabase)           |
| Edge Funcs | Deno (Supabase Edge Functions)      |
| Formulários| React Hook Form + Zod               |

---

## Estrutura de Pastas

```
├── public/                      # Arquivos estáticos
├── src/
│   ├── App.tsx                  # Rotas e providers principais
│   ├── main.tsx                 # Entry point
│   ├── index.css                # Tokens CSS (design system)
│   ├── components/
│   │   ├── AppLayout.tsx        # Layout com sidebar
│   │   ├── AppSidebar.tsx       # Menu lateral dinâmico
│   │   ├── NavLink.tsx          # Link de navegação
│   │   ├── MachinePerformanceModal.tsx
│   │   └── ui/                  # Componentes shadcn/ui
│   ├── contexts/
│   │   ├── AuthContext.tsx      # Autenticação (login, register, logout)
│   │   └── CompanyDataContext.tsx # Dados da empresa (provider global)
│   ├── hooks/
│   │   ├── useCompanyData.ts    # CRUD completo de todas as entidades
│   │   └── use-mobile.tsx       # Detecção de mobile
│   ├── integrations/supabase/
│   │   ├── client.ts            # Cliente Supabase (auto-gerado)
│   │   └── types.ts             # Types do DB (auto-gerado)
│   ├── lib/
│   │   ├── formatters.ts        # Formatação de valores (moeda, %, etc.)
│   │   └── utils.ts             # Utilitários (cn, etc.)
│   ├── pages/
│   │   ├── Login.tsx            # Tela de login
│   │   ├── Register.tsx         # Cadastro de empresa + admin
│   │   ├── Dashboard.tsx        # Dashboard com métricas
│   │   ├── Machines.tsx         # CRUD de máquinas
│   │   ├── ClientsArticles.tsx  # CRUD de clientes e artigos
│   │   ├── Production.tsx       # Registro de produção
│   │   ├── Weavers.tsx          # CRUD de tecelões
│   │   ├── Outsource.tsx        # Módulo de terceirização
│   │   ├── Reports.tsx          # Relatórios
│   │   ├── Settings.tsx         # Configurações da empresa
│   │   ├── Admin.tsx            # Painel super admin (/admin)
│   │   └── NotFound.tsx         # 404
│   └── types/
│       └── index.ts             # Interfaces TypeScript
├── supabase/
│   ├── config.toml              # Configuração das edge functions
│   ├── functions/
│   │   ├── admin-api/           # API do painel admin (JWT + platform_admins)
│   │   ├── create-company-profile/ # Cria empresa + perfil no registro
│   │   ├── manage-users/        # CRUD de usuários da empresa
│   │   └── setup-admin/         # Setup inicial do super admin
│   └── migrations/              # Migrações SQL (auto-gerenciadas)
```

---

## Arquitetura do Sistema

### Fluxo de Dados

```
Usuário → React App → Supabase Client SDK → PostgreSQL (com RLS)
                     → Edge Functions (operações privilegiadas)
```

### Multi-Tenancy

Cada tabela de dados possui uma coluna `company_id`. As RLS policies usam a função `get_user_company_id()` que lê o `company_id` do perfil do usuário autenticado, garantindo isolamento total entre empresas.

### Contextos React

1. **AuthContext** (`src/contexts/AuthContext.tsx`):
   - Gerencia sessão, login, registro e logout
   - Carrega perfil do usuário com dados da empresa
   - Expõe: `user`, `loading`, `login()`, `register()`, `logout()`

2. **CompanyDataContext** (`src/contexts/CompanyDataContext.tsx`):
   - Wrapper do hook `useCompanyData()`
   - Fornece acesso a todas as entidades (machines, clients, articles, weavers, productions, etc.)
   - Inclui funções de CRUD para cada entidade

---

## Banco de Dados (Supabase)

### Tabelas

| Tabela                | Descrição                                         |
|-----------------------|---------------------------------------------------|
| `companies`           | Empresas (tenants)                                |
| `profiles`            | Perfis de usuários (ligados a auth.users)          |
| `machines`            | Máquinas de tecelagem                             |
| `machine_logs`        | Logs de status das máquinas                       |
| `clients`             | Clientes da empresa                               |
| `articles`            | Artigos (tecidos) com peso, valor e voltas        |
| `article_machine_turns`| Voltas por rolo específicas por máquina/artigo   |
| `weavers`             | Tecelões com turnos                               |
| `productions`         | Registros de produção por turno                   |
| `outsource_companies` | Empresas terceirizadas                            |
| `outsource_productions`| Produções terceirizadas com cálculo de lucro     |
| `company_settings`    | Configurações por empresa (plano, nav items, status)|
| `platform_admins`     | Super admins da plataforma                        |

### Enums

- `machine_status`: `ativa`, `manutencao_preventiva`, `manutencao_corretiva`, `troca_artigo`, `inativa`

### Funções do Banco

| Função                                    | Descrição                                      |
|-------------------------------------------|-------------------------------------------------|
| `get_user_company_id()`                   | Retorna o company_id do usuário autenticado     |
| `is_platform_admin(_user_id uuid)`        | Verifica se é super admin                       |
| `prevent_profile_privilege_escalation()`  | Trigger que bloqueia alteração de company_id/role|

### Storage

- **Bucket `company-logos`**: Público, para logos das empresas

---

## Autenticação e Autorização

### Fluxo de Registro
1. Usuário preenche formulário (nome, email, empresa, WhatsApp, senha)
2. `supabase.auth.signUp()` cria o usuário no auth
3. Edge function `create-company-profile` cria a empresa e o perfil (usando service role)

### Fluxo de Login
1. `supabase.auth.signInWithPassword()`
2. `onAuthStateChange` detecta a sessão
3. Perfil é carregado de `profiles` com join em `companies`

### Roles
- **admin**: Administrador da empresa (pode gerenciar usuários)
- **user**: Usuário comum da empresa
- **platform_admin**: Super admin (tabela separada `platform_admins`)

### Proteções
- Trigger `prevent_profile_privilege_escalation` impede que usuários alterem `company_id` ou `role`
- RLS em todas as tabelas usando `get_user_company_id()`
- Edge functions validam JWT e roles antes de operações privilegiadas

---

## Edge Functions (Backend)

### `create-company-profile`
- **Quando**: No registro de nova empresa
- **O que faz**: Cria registro em `companies` e `profiles`
- **Auth**: Usa service role key (bypass RLS)

### `manage-users`
- **Quando**: Admin da empresa gerencia usuários
- **Ações**: `create`, `update`, `delete`
- **Auth**: JWT + verificação de role `admin` + mesmo `company_id`

### `admin-api`
- **Quando**: Super admin acessa `/admin`
- **Ações**: `list_companies`, `update_settings`
- **Auth**: JWT + verificação na tabela `platform_admins`
- **Config**: `verify_jwt = false` no config.toml (validação manual no código)

### `setup-admin`
- **Quando**: Setup inicial do super admin
- **Auth**: Protegido pelo secret `ADMIN_PASSWORD`
- **O que faz**: Cria usuário auth + registro em `platform_admins`

---

## Páginas e Funcionalidades

### `/login` — Login
Formulário de email/senha. Redireciona para `/` se autenticado.

### `/register` — Cadastro
Cria empresa + admin. Campos: nome, email, empresa, WhatsApp, senha.

### `/` — Dashboard
Métricas resumidas: máquinas ativas, produção do dia, eficiência média, receita.

### `/machines` — Máquinas
CRUD completo. Status com cores. Logs de manutenção. Modal de performance.

### `/clients-articles` — Clientes & Artigos
Duas abas: gestão de clientes e gestão de artigos. Artigos vinculados a clientes com peso, valor/kg e voltas por rolo.

### `/production` — Produção
Registro por data/turno/máquina/tecelão. Cálculo automático de eficiência, peso e receita. Suporta voltas por rolo específicas por máquina.

### `/weavers` — Tecelões
CRUD com código (#100-#999), turno fixo ou específico.

### `/outsource` — Terceirização
Gestão de empresas terceirizadas e suas produções. Cálculo de custo, receita e lucro.

### `/reports` — Relatórios
Relatórios de produção, eficiência e financeiros.

### `/settings` — Configurações
Upload de logo, dados da empresa, gestão de usuários.

### `/admin` — Painel Super Admin
Login separado. Lista todas as empresas. Permite ativar/desativar plataforma, definir valor do plano e controlar itens do menu por empresa.

---

## Segurança

### RLS (Row-Level Security)
- **Todas as tabelas** têm RLS habilitado
- Policies usam `get_user_company_id()` para isolamento por empresa
- `platform_admins` só permite SELECT do próprio registro
- `company_settings` é read-only para usuários (gerenciado via admin-api)

### Proteção contra Escalação de Privilégios
- Trigger `prevent_profile_privilege_escalation` no `profiles`
- Bloqueia alteração de `company_id` e `role` por qualquer usuário (exceto service_role)

### Edge Functions
- Validação de JWT no código (não via config.toml para admin-api)
- Verificação de roles e company_id antes de operações
- Service role key nunca exposta ao client

### Secrets Configurados
| Secret                      | Uso                              |
|-----------------------------|----------------------------------|
| `SUPABASE_URL`              | URL do projeto Supabase          |
| `SUPABASE_ANON_KEY`         | Chave anônima (client-side)      |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (edge functions)|
| `SUPABASE_PUBLISHABLE_KEY`  | Chave pública                    |
| `SUPABASE_DB_URL`           | URL do banco                     |
| `ADMIN_PASSWORD`            | Chave para setup do super admin  |
| `LOVABLE_API_KEY`           | API key do Lovable               |

---

## Como Rodar Localmente

```bash
# 1. Clone o repositório
git clone <URL_DO_GIT>

# 2. Instale dependências
npm install

# 3. Configure variáveis de ambiente (.env é auto-gerado pelo Lovable Cloud)
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_PUBLISHABLE_KEY=...

# 4. Inicie o servidor de desenvolvimento
npm run dev

# 5. Rode os testes
npm test
```

### Scripts Disponíveis
| Script         | Descrição                           |
|----------------|-------------------------------------|
| `npm run dev`  | Servidor de desenvolvimento (Vite)  |
| `npm run build`| Build de produção                   |
| `npm run preview`| Preview do build                  |
| `npm test`     | Roda testes (Vitest)                |
| `npm run lint` | Linting (ESLint)                    |

---

## Observações Importantes

1. **Arquivos auto-gerados** (NÃO editar manualmente):
   - `src/integrations/supabase/client.ts`
   - `src/integrations/supabase/types.ts`
   - `supabase/config.toml`
   - `.env`

2. **Migrações SQL**: Gerenciadas automaticamente pelo Lovable Cloud. Não editar diretamente.

3. **Deploy**: Frontend requer clique em "Update" no Lovable. Backend (edge functions, migrações) deploy automático.

4. **Super Admin**: O acesso ao `/admin` é exclusivo para usuários cadastrados na tabela `platform_admins`. O primeiro admin foi criado via edge function `setup-admin`.

---

*Documentação gerada em 14/03/2026*
