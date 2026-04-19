# 🔧 Edge Functions — Documentação Completa

> **Status:** 📐 **Referência** — visão geral das Edge Functions Deno (Supabase)


> Todas as Edge Functions do projeto MalhaGest (Deno, deploy automático)

---

## 📌 Visão Geral

Edge Functions são funções serverless executadas no Lovable Cloud. Usam Deno runtime e são deployadas automaticamente. Localizadas em `supabase/functions/<nome>/index.ts`.

### Estratégia de Autenticação
- **`getClaims(token)`** para validação de identidade (evita erros 500/401 do `getUser`)
- **Cliente duplo:** `userClient` (JWT) + `adminClient` (Service Role)
- **Resolução de company_id:** `user_active_company` → fallback `profiles`

---

## 📋 Lista de Edge Functions

### Autenticação e Usuários

| Função | JWT | Descrição |
|--------|-----|-----------|
| `create-company-profile` | — | Registro: cria empresa + perfil + settings + user_active_company |
| `manage-users` | ✅ | CRUD de usuários: create (auth + profile), update (role/status), delete |
| `update-user-email` | ✅ | Altera email do auth.users + registra em `email_history` |
| `setup-admin` | ❌ | Setup inicial do platform admin (protegido por ADMIN_PASSWORD) |

### Administração

| Função | JWT | Descrição |
|--------|-----|-----------|
| `admin-api` | ❌ (manual) | API administrativa: list_companies, list_users, update_settings, list_backups, trigger_backup, get/update_platform_settings |

### Pagamentos

| Função | JWT | Descrição |
|--------|-----|-----------|
| `create-checkout` | ✅ | Cria sessão Stripe Checkout |
| `create-pix-checkout` | ✅ | Gera cobrança Pix via SyncPayments |
| `check-pix-payment` | ✅ | Verifica status do pagamento Pix |
| `check-pix-expiry` | ❌ | Verifica Pix expirado (dias 4-5 de atraso) |
| `syncpay-webhook` | ❌ | Webhook confirmação automática SyncPayments |
| `check-subscription` | ❌ | Cron: verifica e atualiza status da assinatura |
| `customer-portal` | ✅ | Redireciona para portal Stripe |
| `notify-subscription-status` | ❌ | Cron: alertas de pagamento via WhatsApp |

### Backup

| Função | JWT | Descrição |
|--------|-----|-----------|
| `daily-backup` | ❌ | Backup diário de 29 tabelas por empresa (cron 00:00 UTC) |
| `restore-backup` | ❌ (manual) | Restauração de backup (verifica platform_admin) |

### Notificações WhatsApp

| Função | JWT | Descrição |
|--------|-----|-----------|
| `notify-accounts-due` | ❌ | Notifica contas a pagar via UltraMsg (véspera + dia) |
| `test-webhook` | ❌ | Teste manual de envio WhatsApp |

### IoT

| Função | JWT | Descrição |
|--------|-----|-----------|
| `machine-webhook` | ❌ | Recebe dados ESP32: leituras RPM, contagem de peças, detecção paradas |

### TV Panel

| Função | JWT | Descrição |
|--------|-----|-----------|
| `validate-tv-code` | ❌ | Valida código 5 dígitos e conecta TV à empresa |
| `tv-panel-data` | ❌ | Busca dados de produção para painéis TV |

---

## 🔑 Secrets Utilizados

| Secret | Uso |
|--------|-----|
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Operações privilegiadas |
| `SUPABASE_ANON_KEY` | Client-side (edge functions públicas) |
| `ADMIN_PASSWORD` | Setup do platform admin |
| `STRIPE_SECRET_KEY` | Checkout e portal Stripe |
| `SYNCPAY_CLIENT_ID` | Pagamentos Pix |
| `SYNCPAY_CLIENT_SECRET` | Pagamentos Pix |
| `ULTRAMSG_INSTANCE_ID` | WhatsApp API |
| `ULTRAMSG_TOKEN` | WhatsApp API |
| `REPORTANA_WEBHOOK_URL` | Legado (não usado) |
| `LOVABLE_API_KEY` | API Lovable |

---

## 🔄 Cron Jobs (pg_cron)

| Job | Horário | Edge Function |
|-----|---------|---------------|
| Backup diário | 00:00 UTC | `daily-backup` |
| Notificações contas | 11:00 UTC (08:00 BRT) | `notify-accounts-due` |
| Verificação assinatura | Cron configurado | `check-subscription` |
| Notificação assinatura | Cron configurado | `notify-subscription-status` |

---

## ⚠️ Regras para Novas Edge Functions

1. Código em `supabase/functions/<nome>/index.ts`
2. CORS headers obrigatórios para preflight
3. Usar `getClaims(token)` para autenticação
4. Usar Service Role apenas para operações privilegiadas
5. Logar erros para diagnóstico
6. Documentar neste arquivo após criação

---

*Última atualização: 09/04/2026*
