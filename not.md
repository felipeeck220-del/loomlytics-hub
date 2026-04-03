# 📱 Sistema de Notificações WhatsApp — Documentação Completa

> **Arquivo de referência:** `not.md`  
> **Última atualização:** 03/04/2026  
> **Status:** Planejado — Aguardando aprovação para implementação

---

## 📌 Visão Geral

O sistema de notificações WhatsApp do MalhaGest é dividido em **duas partes** com regras distintas de destinatário:

| Parte | Descrição | Destinatário |
|-------|-----------|-------------|
| **Parte 1** — Notificações Automáticas | Boas-vindas, pagamentos, vencimentos, suspensão | **WhatsApp da empresa** (campo `whatsapp` da tabela `companies`) |
| **Parte 2** — Aba Notificações (Lembretes) | Lembretes personalizados criados pelo usuário | **WhatsApp informado no cadastro do lembrete** (igual ao módulo Contas a Pagar) |

### Integração de Envio

Todas as mensagens são enviadas via **Reportana** utilizando **um único webhook** (`REPORTANA_WEBHOOK_URL` — o mesmo já usado no módulo Contas a Pagar), com a **API Oficial do WhatsApp Business (Meta)**.

**Diferenciação por `type`:** Cada envio inclui um campo `type` no body do POST. Do lado da Reportana, o usuário cria uma validação que verifica o `type` e direciona para a automação/mensagem correta.

```
MalhaGest (Edge Function)
    → POST para REPORTANA_WEBHOOK_URL (único)
    → body: { type: "boas_vindas", phone: "55...", ...variáveis }

Reportana (lado do usuário)
    → IF type == "boas_vindas" → automação de boas-vindas
    → IF type == "pag_pix_confirmado" → automação pix confirmado
    → IF type == "pag_card_erro" → automação erro cartão
    → ... etc (8 types no total)
```

- Números armazenados apenas como dígitos no banco (ex: `47992102017`)
- Máscara visual no front-end: `(XX) X XXXX-XXXX`
- Prefixo `+55` adicionado automaticamente no momento do disparo

---

## 🟢 PARTE 1 — Notificações Automáticas do Sistema

### Destinatário

**WhatsApp cadastrado na empresa** — campo `whatsapp` da tabela `companies`.  
Este número é definido pelo admin no momento do cadastro da empresa e pode ser alterado nas configurações.

> ⚠️ Se o campo `whatsapp` estiver vazio, a notificação **não será enviada** (sem erro, apenas ignorada).

---

### 1.1 🎉 Boas-vindas (Após Cadastro)

**Quando dispara:** Imediatamente após a criação da empresa (na edge function `create-company-profile`).

**Destinatário:** WhatsApp da empresa.

**Conteúdo da mensagem:**
- Saudação personalizada com o nome do admin
- Confirmação de que o cadastro foi realizado com sucesso
- Link direto para acessar o sistema usando o slug da empresa  
  Exemplo: `https://loomlytics-hub.lovable.app/nome-empresa`
- Informação sobre o período de teste gratuito  
  Exemplo: "Você tem **90 dias grátis** para explorar todos os recursos!"
- Mensagem de boas-vindas calorosa

**Exemplo de mensagem:**
```
🎉 Olá, João!

Bem-vindo ao MalhaGest! Seu cadastro foi realizado com sucesso.

🔗 Acesse seu sistema:
https://loomlytics-hub.lovable.app/tecelagem-joao

🎁 Você tem 90 dias de teste gratuito para explorar todos os recursos!

Qualquer dúvida, estamos à disposição.
— Equipe MalhaGest
```

---

### 1.2 💳 Notificações de Pagamento

**Destinatário:** WhatsApp da empresa (em todos os cenários abaixo).

#### Cenário A — ✅ Pagamento Pix Confirmado
- **Quando:** Ao receber confirmação do SyncPayments (webhook `syncpay-webhook`)
- **Mensagem:** "Seu pagamento de R$ X foi confirmado! Sua assinatura está ativa até DD/MM/AAAA."

#### Cenário B — ✅ Pagamento Cartão Confirmado
- **Quando:** Ao processar pagamento com sucesso via Stripe
- **Mensagem:** "Pagamento no cartão confirmado! Próxima cobrança em DD/MM/AAAA."

#### Cenário C — ⚠️ Lembrete Pré-Vencimento (Somente Pix)
- **Quando:** 1 dia antes do vencimento (cron diário às 08:00 BRT)
- **Condição:** Apenas empresas que pagam via **Pix** (cartão cobra automaticamente)
- **Mensagem:** "Olá! Sua assinatura vence amanhã (DD/MM). Acesse o sistema para gerar seu Pix e evitar interrupção."

#### Cenário D — ❌ Erro no Pagamento do Cartão
- **Quando:** Quando a cobrança automática do cartão falha
- **Condição:** Apenas empresas que pagam via **Cartão**
- **Mensagem:** "Houve um problema na cobrança do seu cartão. Atualize seus dados de pagamento para evitar a suspensão do serviço."

#### Cenário E — 🔔 Aviso de Suspensão (Faltam 5 dias)
- **Quando:** No dia do vencimento, quando o pagamento não foi identificado (cron diário às 08:00 BRT)
- **Mensagem:** "Sua assinatura venceu. Você tem 5 dias para regularizar antes da suspensão do acesso."

#### Cenário F — 🚫 Conta Suspensa
- **Quando:** 5 dias após o vencimento sem pagamento (cron diário às 08:00 BRT)
- **Ação adicional:** Altera `subscription_status` para `suspended`
- **Mensagem:** "Sua conta MalhaGest foi suspensa por falta de pagamento. Regularize sua situação para restaurar o acesso completo."

---

### 1.3 ⏰ Cron Job Diário — Verificação de Pagamentos

**Frequência:** Diariamente às **08:00 (horário de Brasília)**  
**Edge Function:** `notify-subscription-status` (a ser criada)

**Lógica:**
1. Busca todas as empresas com `subscription_status` = `active` ou `trial`
2. Para cada empresa:
   - Se `trial_end_date` ou data de vencimento é **amanhã** e plano é **Pix** → Envia cenário C
   - Se data de vencimento é **hoje** e não há pagamento → Envia cenário E
   - Se data de vencimento foi há **5+ dias** e não há pagamento → Suspende conta + Envia cenário F

---

## 🔔 PARTE 2 — Aba Notificações (Lembretes Personalizados)

### Destinatário

**WhatsApp informado no cadastro de cada lembrete** — o usuário digita o número de destino ao criar o lembrete, exatamente como funciona no módulo **Contas a Pagar**.

> O campo WhatsApp é **obrigatório** ao criar um lembrete.  
> Formato de armazenamento: apenas dígitos (ex: `47992102017`)  
> Máscara no front-end: `(XX) X XXXX-XXXX`  
> Prefixo `+55` adicionado no disparo.

---

### 2.1 📍 Localização no Sistema

- Nova entrada no **sidebar**: ícone de sino (🔔) com o título **"Notificações"**
- Chave do item: `notifications`
- Posição: entre "Contas a Pagar" e "Configurações"
- Acessível conforme permissões do perfil do usuário

---

### 2.2 📋 Estrutura da Tabela `notifications`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim (auto) | Identificador único |
| `company_id` | UUID (FK → companies) | Sim | Empresa dona do lembrete |
| `title` | TEXT | Sim | Título do lembrete (ex: "Reunião com fornecedor") |
| `description` | TEXT | Não | Detalhes adicionais |
| `whatsapp_number` | TEXT | Sim | Número de WhatsApp de destino (apenas dígitos) |
| `scheduled_date` | DATE | Sim | Data do evento |
| `scheduled_time` | TIME | Sim | Hora do evento |
| `notify_mode` | TEXT | Sim | Modo de antecedência da notificação |
| `status` | TEXT | Sim | `pending`, `sent`, `cancelled` |
| `sent_at` | TIMESTAMPTZ | Não | Data/hora em que foi efetivamente enviado |
| `created_by_name` | TEXT | Não | Nome de quem criou |
| `created_by_code` | TEXT | Não | Código de quem criou |
| `created_at` | TIMESTAMPTZ | Sim (auto) | Data de criação |
| `updated_at` | TIMESTAMPTZ | Sim (auto) | Data de última atualização |

---

### 2.3 ⏰ Modos de Notificação Disponíveis

| Valor (`notify_mode`) | Descrição |
|------------------------|-----------|
| `on_time` | No horário exato do evento |
| `15_min_before` | 15 minutos antes |
| `30_min_before` | 30 minutos antes |
| `1_hour_before` | 1 hora antes |
| `2_hours_before` | 2 horas antes |
| `1_day_before` | 1 dia antes |

---

### 2.4 ⚙️ Cron Job de Lembretes

**Frequência:** A cada **5 minutos**  
**Edge Function:** `notify-reminders` (a ser criada)

**Lógica:**
1. Busca todos os lembretes com `status` = `pending`
2. Para cada lembrete, calcula o **momento de disparo**:
   - `scheduled_date` + `scheduled_time` - antecedência do `notify_mode`
3. Se o momento de disparo já passou (ou está dentro da janela dos últimos 5 min):
   - Envia mensagem via Reportana para o `whatsapp_number` do lembrete
   - Atualiza `status` para `sent` e preenche `sent_at`

**Precisão:** Atraso máximo de **4 minutos e 59 segundos** (aceitável para lembretes).

**Exemplo prático:**
- Lembrete: "Reunião" em 15/04 às 14:00, modo `30_min_before`
- Momento de disparo: 15/04 às 13:30
- Cron das 13:30 detecta que é hora → envia mensagem
- Se o cron rodar às 13:32, ainda detecta (pois 13:30 já passou e status é `pending`)

---

### 2.5 🖥️ Funcionalidades da Tela de Notificações

#### Criação de Lembrete
- Formulário com campos: Título, Descrição (opcional), WhatsApp de destino, Data, Hora, Modo de notificação
- Validação do número de WhatsApp (11 dígitos)
- Máscara automática no campo WhatsApp

#### Lista de Lembretes
- Filtros disponíveis:
  - **Hoje** — lembretes agendados para o dia atual
  - **Esta semana** — lembretes dos próximos 7 dias
  - **Todos** — todos os lembretes
- Ordenação por data/hora (mais próximo primeiro)

#### Status Visual
| Status | Cor | Ícone |
|--------|-----|-------|
| `pending` | Amarelo | 🕐 Relógio |
| `sent` | Verde | ✅ Check |
| `cancelled` | Cinza | ❌ X |

#### Ações
- ✏️ **Editar** — apenas lembretes com status `pending`
- 🗑️ **Cancelar** — muda status para `cancelled` (não exclui do banco)
- 🗑️ **Excluir** — remove permanentemente (com confirmação)

---

### 2.6 📱 Exemplo de Mensagem de Lembrete

```
🔔 Lembrete MalhaGest

📌 Reunião com fornecedor de fios
📅 15/04/2026 às 14:00
📝 Levar amostras do artigo novo

⏰ Este é um lembrete de 30 minutos antes.
```

---

## 📡 Referência Completa de Types para Reportana

> **IMPORTANTE:** Todos os types usam o **mesmo webhook** (`REPORTANA_WEBHOOK_URL`).  
> A diferenciação da mensagem é feita **do lado da Reportana** com base no campo `type`.

---

### Tabela Resumo

| # | `type` | Descrição | Destino | Gatilho |
|---|--------|-----------|---------|---------|
| 1 | `boas_vindas` | Após cadastro da empresa | WhatsApp empresa | Cadastro |
| 2 | `pag_pix_confirmado` | Pagamento Pix confirmado | WhatsApp empresa | Webhook SyncPay |
| 3 | `pag_card_confirmado` | Pagamento Cartão confirmado | WhatsApp empresa | Webhook Stripe |
| 4 | `pag_pix_lembrete` | 1 dia antes do vencimento (Pix) | WhatsApp empresa | Cron diário 08h |
| 5 | `pag_card_erro` | Erro na cobrança do cartão | WhatsApp empresa | Webhook Stripe |
| 6 | `pag_aviso_suspensao` | Venceu, faltam 5 dias p/ suspensão | WhatsApp empresa | Cron diário 08h |
| 7 | `pag_conta_suspensa` | Conta suspensa por inadimplência | WhatsApp empresa | Cron diário 08h |
| 8 | `lembrete` | Lembrete personalizado do usuário | WhatsApp do lembrete | Cron 5 min |

---

### Payloads Detalhados por Type

#### 1. `boas_vindas`
```json
{
  "type": "boas_vindas",
  "phone": "5547992102017",
  "admin_name": "João Silva",
  "company_name": "Tecelagem João",
  "slug_url": "https://loomlytics-hub.lovable.app/tecelagem-joao",
  "trial_days": 90,
  "trial_end_date": "02/07/2026"
}
```

#### 2. `pag_pix_confirmado`
```json
{
  "type": "pag_pix_confirmado",
  "phone": "5547992102017",
  "admin_name": "João Silva",
  "company_name": "Tecelagem João",
  "amount": "147.00",
  "paid_at": "03/04/2026 14:32",
  "next_due_date": "03/05/2026"
}
```

#### 3. `pag_card_confirmado`
```json
{
  "type": "pag_card_confirmado",
  "phone": "5547992102017",
  "admin_name": "João Silva",
  "company_name": "Tecelagem João",
  "amount": "147.00",
  "paid_at": "03/04/2026 14:32",
  "next_due_date": "03/05/2026"
}
```

#### 4. `pag_pix_lembrete`
```json
{
  "type": "pag_pix_lembrete",
  "phone": "5547992102017",
  "admin_name": "João Silva",
  "company_name": "Tecelagem João",
  "due_date": "04/04/2026",
  "amount": "147.00",
  "slug_url": "https://loomlytics-hub.lovable.app/tecelagem-joao"
}
```

#### 5. `pag_card_erro`
```json
{
  "type": "pag_card_erro",
  "phone": "5547992102017",
  "admin_name": "João Silva",
  "company_name": "Tecelagem João",
  "amount": "147.00",
  "error_date": "03/04/2026",
  "slug_url": "https://loomlytics-hub.lovable.app/tecelagem-joao"
}
```

#### 6. `pag_aviso_suspensao`
```json
{
  "type": "pag_aviso_suspensao",
  "phone": "5547992102017",
  "admin_name": "João Silva",
  "company_name": "Tecelagem João",
  "due_date": "28/03/2026",
  "suspension_date": "02/04/2026",
  "slug_url": "https://loomlytics-hub.lovable.app/tecelagem-joao"
}
```

#### 7. `pag_conta_suspensa`
```json
{
  "type": "pag_conta_suspensa",
  "phone": "5547992102017",
  "admin_name": "João Silva",
  "company_name": "Tecelagem João",
  "due_date": "28/03/2026",
  "suspended_at": "02/04/2026"
}
```

#### 8. `lembrete`
```json
{
  "type": "lembrete",
  "phone": "5547999887766",
  "title": "Reunião com fornecedor",
  "description": "Levar amostras do artigo novo",
  "scheduled_date": "15/04/2026",
  "scheduled_time": "14:00",
  "notify_mode_label": "30 minutos antes",
  "created_by_name": "Maria"
}
```

---

## 🏗️ Arquitetura Técnica

```
┌─────────────────────────────────────────┐
│         EVENTOS DO SISTEMA              │
│  Cadastro │ Pagamento │ Vencimento      │
│  Lembretes do usuário                   │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      EDGE FUNCTIONS                     │
│                                         │
│  create-company-profile (boas-vindas)   │
│  syncpay-webhook (pagamento Pix)        │
│  notify-subscription-status (cron 24h)  │
│  notify-reminders (cron 5min)           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│     REPORTANA (WEBHOOK ÚNICO)           │
│     REPORTANA_WEBHOOK_URL               │
│     API Oficial WhatsApp Business       │
│                                         │
│  Recebe { type, phone, ...vars }        │
│  Valida o type → direciona para         │
│  automação correta com mensagem pronta  │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   DESTINATÁRIO                          │
│                                         │
│   Types 1-7: WhatsApp da empresa        │
│   Type 8:    WhatsApp do lembrete       │
└─────────────────────────────────────────┘
```

---

## 📋 Regras de Negócio Importantes

1. **Webhook único:** Todos os envios usam o mesmo `REPORTANA_WEBHOOK_URL`. A separação das mensagens é feita na Reportana pelo campo `type`.

2. **Parte 1 (Automáticas — types 1 a 7):** O número de destino é SEMPRE o `whatsapp` da tabela `companies`. Se estiver vazio, a notificação é silenciosamente ignorada.

3. **Parte 2 (Lembretes — type 8):** O número de destino é informado pelo usuário ao criar cada lembrete individualmente, no campo `whatsapp_number` da tabela `notifications`. O campo é obrigatório.

4. **Formato de números:** Armazenar apenas dígitos. Adicionar `+55` somente no momento do envio via Reportana.

5. **Horário de referência:** Todos os crons e cálculos de horário usam **horário de Brasília (BRT/BRST)**.

6. **Idempotência:** Após enviar um lembrete, o status muda para `sent`. O cron nunca reenvia lembretes já marcados como `sent` ou `cancelled`.

7. **Sem envio duplicado:** O cron de 5 minutos deve verificar se o lembrete ainda está `pending` antes de enviar, evitando race conditions.

8. **Segurança (RLS):** Lembretes são visíveis e editáveis apenas por usuários da mesma `company_id`.

---

## 📁 Arquivos Relacionados (a serem criados)

| Arquivo | Descrição |
|---------|-----------|
| `src/pages/Notifications.tsx` | Página principal da aba Notificações |
| `supabase/functions/notify-reminders/index.ts` | Cron de 5 min para disparar lembretes |
| `supabase/functions/notify-subscription-status/index.ts` | Cron diário para pagamentos/vencimentos |
| Migração SQL | Criação da tabela `notifications` com RLS |

---

## 🔄 Ordem de Implementação Sugerida

### Fase 1 — Notificações Automáticas
1. Integrar envio de boas-vindas na edge function `create-company-profile`
2. Integrar confirmação de pagamento Pix no `syncpay-webhook`
3. Criar edge function `notify-subscription-status` com cron diário
4. Implementar cenários C, D, E, F de pagamento

### Fase 2 — Aba Notificações (Lembretes)
1. Criar tabela `notifications` com RLS
2. Criar página `Notifications.tsx` com CRUD de lembretes
3. Adicionar item "Notificações" no sidebar
4. Criar edge function `notify-reminders` com cron de 5 min
5. Testar fluxo completo de criação → disparo → status

---

## 📝 Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 03/04/2026 | Criação do documento com plano completo detalhado |
| 03/04/2026 | Adicionada seção de Types para Reportana com payloads detalhados; esclarecido uso de webhook único com diferenciação por `type` |
