# 📱 Sistema de Notificações WhatsApp — Documentação Completa

> **Arquivo de referência:** `not.md`  
> **Última atualização:** 06/04/2026  
> **Status:** Planejado — Aguardando implementação

---

## 📌 Visão Geral

O sistema de notificações WhatsApp do MalhaGest envia **notificações automáticas do sistema** para o WhatsApp da empresa. Não inclui lembretes personalizados — é exclusivamente para comunicação do ciclo de vida da conta (boas-vindas, pagamentos, vencimentos, suspensão).

### Integração de Envio

Todas as mensagens são enviadas via **UltraMsg** utilizando os secrets `ULTRAMSG_INSTANCE_ID` e `ULTRAMSG_TOKEN` já configurados no projeto.

```
MalhaGest (Edge Function)
    → POST para https://api.ultramsg.com/{INSTANCE_ID}/messages/chat
    → body: { token, to, body }
```

- Números armazenados apenas como dígitos no banco (ex: `47992102017`)
- Prefixo `+55` adicionado automaticamente no momento do disparo
- **Toda mensagem inclui no final:** `\n\n⚠️ Mensagem automática, esse não é um canal de suporte.`

### Destinatário

**WhatsApp cadastrado na empresa** — campo `whatsapp` da tabela `companies`.

> ⚠️ Se o campo `whatsapp` estiver vazio, a notificação **não será enviada** (sem erro, apenas ignorada).

---

## 🟢 Notificações do Sistema

### 1. 🎉 Boas-vindas (Após Cadastro)

**Quando dispara:** Imediatamente após a criação da empresa (na edge function `create-company-profile`).

**Template:**
```
🎉 Olá, {admin_name}!

Bem-vindo ao MalhaGest! Seu cadastro foi realizado com sucesso.

🔗 Acesse seu sistema:
{slug_url}

🎁 Você tem {trial_days} dias de teste gratuito para explorar todos os recursos!
Seu período de teste vai até {trial_end_date}.

Qualquer dúvida, estamos à disposição.
— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

**Variáveis:**
| Variável | Origem |
|----------|--------|
| `admin_name` | `companies.admin_name` |
| `slug_url` | `https://loomlytics-hub.lovable.app/{companies.slug}` |
| `trial_days` | 90 (padrão) |
| `trial_end_date` | Calculado: data atual + 90 dias, formato DD/MM/AAAA |

---

### 2. ✅ Pagamento Pix Confirmado

**Quando dispara:** Ao receber confirmação do SyncPayments (webhook `syncpay-webhook`).

**Template:**
```
✅ Pagamento confirmado!

Olá, {admin_name}!

Seu pagamento de R$ {amount} via Pix foi confirmado com sucesso.

📅 Sua assinatura está ativa até {next_due_date}.

Obrigado por confiar no MalhaGest!
— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

---

### 3. ✅ Pagamento Cartão Confirmado

**Quando dispara:** Ao processar pagamento com sucesso via Stripe.

**Template:**
```
✅ Pagamento no cartão confirmado!

Olá, {admin_name}!

Seu pagamento de R$ {amount} no cartão foi processado com sucesso.

📅 Próxima cobrança em {next_due_date}.

Obrigado por confiar no MalhaGest!
— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

---

### 4. ⏰ Lembrete Pré-Vencimento (1 dia antes — Somente Pix)

**Quando dispara:** 1 dia antes do vencimento (cron diário às 08:00 BRT).  
**Condição:** Apenas empresas que pagam via **Pix** (cartão cobra automaticamente).

**Template:**
```
⏰ Lembrete de vencimento

Olá, {admin_name}!

Sua assinatura do MalhaGest vence amanhã ({due_date}).
Valor: R$ {amount}

🔗 Acesse o sistema para gerar seu Pix e evitar interrupção:
{slug_url}

— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

---

### 5. ❌ Erro no Pagamento do Cartão

**Quando dispara:** Quando a cobrança automática do cartão falha.  
**Condição:** Apenas empresas que pagam via **Cartão**.

**Template:**
```
❌ Problema na cobrança do cartão

Olá, {admin_name}!

Houve um problema na cobrança do seu cartão em {error_date}.
Valor: R$ {amount}

🔗 Atualize seus dados de pagamento para evitar a suspensão:
{slug_url}

— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

---

### 6. 🔔 Aviso de Suspensão — Dia 1 (dia do vencimento sem pagamento)

**Quando dispara:** No dia do vencimento, quando o pagamento não foi identificado (cron diário às 08:00 BRT).  
**Repete:** Todos os dias de manhã durante 5 dias (dias 1 a 5).

**Template Dias 1, 2 e 3:**
```
🔔 Aviso de pendência — Dia {dia_atual}/5

Olá, {admin_name}!

Sua assinatura do MalhaGest venceu em {due_date} e ainda não identificamos o pagamento.

⚠️ Você tem {dias_restantes} dia(s) para regularizar antes da suspensão do acesso.

🔗 Acesse o sistema para efetuar o pagamento:
{slug_url}

— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

**Template Dias 4 e 5 (com Pix gerado automaticamente):**
```
🔔 URGENTE — Aviso de pendência — Dia {dia_atual}/5

Olá, {admin_name}!

Sua assinatura do MalhaGest venceu em {due_date}.

💰 Geramos um Pix de R$ {amount} para facilitar sua regularização:

📋 Código Pix (copia e cola):
{pix_code}

⏰ Este Pix expira em 1 hora. Após expirar, um novo será gerado automaticamente.

{dias_restantes == 0 ? "🚫 ÚLTIMO DIA! Se não pago hoje, sua conta será suspensa." : "⚠️ Falta apenas 1 dia para a suspensão."}

— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

**Template quando Pix expira (1 hora após envio do dia 4 ou 5):**
```
⏰ Pix expirado

Olá, {admin_name}!

O Pix de R$ {amount} gerado anteriormente expirou.

Se você ainda não regularizou, acesse o sistema para gerar um novo pagamento:
🔗 {slug_url}

{dia_atual == 5 ? "🚫 Sua conta será suspensa hoje se o pagamento não for identificado." : "⚠️ Amanhã é o último dia antes da suspensão."}

— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

---

### 7. 🚫 Conta Suspensa (Dia 6 — sem pagamento)

**Quando dispara:** 5 dias após o vencimento sem pagamento (cron diário às 08:00 BRT).  
**Ação adicional:** Altera `subscription_status` para `suspended`.

**Template:**
```
🚫 Conta suspensa

Olá, {admin_name}!

Sua conta MalhaGest foi suspensa por falta de pagamento.
O vencimento era {due_date} e já se passaram 5 dias sem regularização.

Para restaurar o acesso completo, efetue o pagamento:
🔗 {slug_url}

Após a confirmação do pagamento, seu acesso será restaurado automaticamente.

— Equipe MalhaGest

⚠️ Mensagem automática, esse não é um canal de suporte.
```

---

## ⏰ Cron Jobs

### Cron Diário — Verificação de Pagamentos (08:00 BRT)

**Edge Function:** `notify-subscription-status` (a ser criada)

**Lógica detalhada:**

1. Busca todas as empresas com `subscription_status` = `active` ou `trial`
2. Para cada empresa, calcula **dias desde o vencimento**:

| Dias desde vencimento | Ação |
|----------------------|------|
| **-1** (amanhã vence) | Se plano Pix → envia template 4 (lembrete pré-vencimento) |
| **0** (vence hoje) | Se não pagou → envia template 6 dia 1 |
| **1** | Envia template 6 dia 2 |
| **2** | Envia template 6 dia 3 |
| **3** (4º dia) | Gera Pix via SyncPayments → envia template 6 dia 4 com código Pix |
| **4** (5º dia) | Gera Pix via SyncPayments → envia template 6 dia 5 com código Pix |
| **5+** (6º dia) | Suspende conta (`subscription_status` = `suspended`) → envia template 7 |

### Cron de 1 hora — Verificação Pix Expirado (Dias 4 e 5)

**Edge Function:** `check-pix-expiry` (a ser criada ou integrada ao cron existente)

**Lógica:**
1. Busca pagamentos pendentes criados há ~1 hora nos dias 4 e 5 de atraso
2. Verifica se o Pix foi pago
3. Se não pago → envia template de "Pix expirado"

---

## 🏗️ Arquitetura Técnica

```
┌─────────────────────────────────────────┐
│         EVENTOS DO SISTEMA              │
│  Cadastro │ Pagamento │ Vencimento      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      EDGE FUNCTIONS                     │
│                                         │
│  create-company-profile (boas-vindas)   │
│  syncpay-webhook (pagamento Pix)        │
│  notify-subscription-status (cron 24h)  │
│  check-pix-expiry (cron 1h dias 4-5)   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│     ULTRAMSG API                        │
│     POST /messages/chat                 │
│                                         │
│     Secrets:                            │
│     - ULTRAMSG_INSTANCE_ID              │
│     - ULTRAMSG_TOKEN                    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   DESTINATÁRIO                          │
│   WhatsApp da empresa (companies.wpp)   │
└─────────────────────────────────────────┘
```

---

## 📋 Regras de Negócio

1. **Destinatário único:** Todas as notificações vão para o `whatsapp` da tabela `companies`. Se vazio, ignorar silenciosamente.

2. **Formato de números:** Armazenar apenas dígitos. Adicionar `+55` no momento do envio.

3. **Horário de referência:** Todos os crons usam **horário de Brasília (BRT/BRST)**.

4. **Rodapé obrigatório:** Toda mensagem termina com `⚠️ Mensagem automática, esse não é um canal de suporte.`

5. **Fluxo de suspensão (5 dias):**
   - Dias 1-3: Mensagem diária de aviso
   - Dias 4-5: Gera Pix automaticamente + envia código + verifica expiração em 1h
   - Dia 6: Suspende conta + notifica

6. **Pix automático (dias 4 e 5):**
   - Gerado via SyncPayments (mesma integração de pagamento existente)
   - Valor = `monthly_plan_value` da `company_settings`
   - Expira em 1 hora
   - Se expirado sem pagamento → envia aviso de expiração
   - Se pago → ativa conta automaticamente (via `syncpay-webhook` existente)

7. **Idempotência:** O cron deve verificar se já enviou a notificação do dia para evitar duplicatas (pode usar campo `notification_sent_date` ou lógica baseada em `payment_history`).

---

## 📁 Arquivos Relacionados (a serem criados/alterados)

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/notify-subscription-status/index.ts` | Cron diário 08h BRT para verificar pagamentos e enviar notificações |
| `supabase/functions/check-pix-expiry/index.ts` | Verifica Pix expirado nos dias 4-5 e notifica |
| `supabase/functions/create-company-profile/index.ts` | Adicionar envio de boas-vindas (alterar existente) |
| `supabase/functions/syncpay-webhook/index.ts` | Adicionar envio de confirmação de pagamento (alterar existente) |

---

## 🔄 Ordem de Implementação Sugerida

1. Criar helper/util de envio UltraMsg (reutilizável entre edge functions)
2. Integrar envio de boas-vindas na `create-company-profile`
3. Integrar confirmação de pagamento Pix no `syncpay-webhook`
4. Criar `notify-subscription-status` com cron diário
5. Implementar geração automática de Pix nos dias 4-5
6. Criar `check-pix-expiry` para verificar Pix expirado
7. Implementar bloqueio de conta no dia 6

---

## 📝 Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 03/04/2026 | Criação do documento com plano completo |
| 03/04/2026 | Adicionada seção de Types para Reportana |
| 06/04/2026 | Removida Parte 2 (Lembretes). Documento agora cobre apenas notificações automáticas do sistema |
| 06/04/2026 | Migrado de Reportana para UltraMsg |
| 06/04/2026 | Adicionados templates completos de mensagem com rodapé automático |
| 06/04/2026 | Detalhado fluxo de suspensão: 5 dias de aviso diário, Pix automático nos dias 4-5, verificação de expiração em 1h, bloqueio no dia 6 |
