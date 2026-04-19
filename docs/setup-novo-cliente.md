# 🚀 Setup de Novo Cliente — Checklist de Replicação

> **Status:** 📐 **Referência** — passo a passo de onboarding de uma nova empresa-tenant


> Guia passo a passo para criar um novo projeto Lovable a partir deste template para um novo cliente.

---

## 📋 Pré-requisitos

- [ ] Acesso ao GitHub do projeto base (conectado via Lovable)
- [ ] Conta Lovable com plano ativo
- [ ] Dados do novo cliente (nome, email, whatsapp)

---

## 1. Criar Novo Projeto

### Opção A: Remix (recomendada)
1. No dashboard Lovable, abrir o projeto base
2. Settings → "Remix this project"
3. Renomear para o nome do cliente

### Opção B: Via GitHub
1. Fork/clone do repositório
2. Criar novo projeto Lovable
3. Conectar ao novo repositório

---

## 2. Configuração do Lovable Cloud

O novo projeto terá seu próprio Lovable Cloud (banco separado). Executar:

### 2.1 Banco de Dados
- [ ] Verificar que todas as tabelas foram criadas pelas migrations
- [ ] Verificar RLS policies em todas as tabelas
- [ ] Verificar funções: `get_user_company_id()`, `get_user_companies()`, `set_active_company()`, `is_platform_admin()`, `prevent_profile_privilege_escalation()`
- [ ] Verificar trigger `prevent_profile_privilege_escalation` em `profiles`
- [ ] Verificar enum `machine_status`

### 2.2 Storage
- [ ] Criar bucket `company-logos` (público)
- [ ] Criar bucket `payment-receipts` (público)

### 2.3 Edge Functions
Todas as Edge Functions são deployadas automaticamente. Verificar:
- [ ] `create-company-profile` — funcionando
- [ ] `manage-users` — funcionando
- [ ] `admin-api` — funcionando
- [ ] `daily-backup` — funcionando

### 2.4 Secrets
Configurar todos os secrets necessários:
- [ ] `ADMIN_PASSWORD` — senha para setup do admin da plataforma
- [ ] `STRIPE_SECRET_KEY` — se usar pagamento por cartão
- [ ] `SYNCPAY_CLIENT_ID` + `SYNCPAY_CLIENT_SECRET` — se usar Pix
- [ ] `ULTRAMSG_INSTANCE_ID` + `ULTRAMSG_TOKEN` — se usar notificações WhatsApp

### 2.5 Cron Jobs
Configurar via SQL (pg_cron + pg_net):
- [ ] `daily-backup` — todo dia às 00:00 UTC
- [ ] `notify-accounts-due` — todo dia às 11:00 UTC (08:00 BRT)
- [ ] `check-subscription` — verificação de assinatura
- [ ] `notify-subscription-status` — alertas de pagamento

---

## 3. Setup Inicial

### 3.1 Criar Platform Admin
```bash
# Via Edge Function setup-admin
curl -X POST https://{SUPABASE_URL}/functions/v1/setup-admin \
  -H "Content-Type: application/json" \
  -d '{"admin_password": "...", "email": "admin@email.com", "password": "..."}'
```

### 3.2 Registrar Primeira Empresa
1. Acessar a URL publicada
2. Clicar em "Registrar"
3. Preencher dados do cliente
4. Sistema cria: empresa + perfil + settings

### 3.3 Configurar Empresa (via /admin)
1. Login como platform admin
2. Ir em `/admin`
3. Configurar:
   - [ ] Valor do plano mensal
   - [ ] Status da assinatura (free para início)
   - [ ] Módulos habilitados (enabled_nav_items)

---

## 4. Customizações por Cliente

### 4.1 Branding
- Logo via Settings → aba Empresa
- Tema claro/escuro automático (tokens CSS)

### 4.2 Módulos
Ativar/desativar via admin-api:
```
dashboard, faturamento-total, machines, clients-articles,
production, outsource, weavers, reports, settings,
revision, mecanica, contas-pagar, residuos, invoices, fechamento
```

### 4.3 Turnos
Configurar horários em Settings → aba Turnos

---

## 5. Publicação

- [ ] Publicar no Lovable
- [ ] Configurar domínio customizado (se aplicável)
- [ ] Testar login/registro
- [ ] Testar CRUD de cada módulo ativo
- [ ] Verificar backup automático funcionando

---

## 6. Pós-Deploy

- [ ] Enviar credenciais ao cliente
- [ ] Orientar sobre instalação PWA (Android/iOS)
- [ ] Configurar WhatsApp para notificações (se contratado)

---

## ⚠️ O que NÃO fazer

- ❌ Remover RLS multi-tenant (estrutura compartilhada mesmo com projeto isolado)
- ❌ Editar `client.ts`, `types.ts`, `.env` manualmente
- ❌ Modificar `supabase/config.toml` project_id
- ❌ Criar tabelas sem RLS
- ❌ Criar tabelas sem incluir no backup

---

*Última atualização: 09/04/2026*
