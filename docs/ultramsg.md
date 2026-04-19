# Integração UltraMsg – WhatsApp API

> **Status:** ✅ **Em Produção** — engine de notificações WhatsApp via UltraMsg


> Documentação técnica completa da integração UltraMsg para envio de mensagens WhatsApp no módulo Contas a Pagar.

---

## 1. Visão Geral

A **UltraMsg** é uma API de WhatsApp baseada em WhatsApp Web que permite envio de mensagens de texto via HTTP POST. Será utilizada como alternativa à Reportana para notificações do módulo **Contas a Pagar**.

### Dados da Instância

| Item | Valor |
|------|-------|
| **Instance ID** | `instance168759` |
| **Base URL** | `https://api.ultramsg.com/instance168759/` |
| **Endpoint de Envio** | `https://api.ultramsg.com/instance168759/messages/chat` |

### Diferenças: Reportana vs UltraMsg

| Critério | Reportana | UltraMsg |
|----------|-----------|----------|
| Tipo de API | API Oficial (WhatsApp Business API via Meta) | WhatsApp Web (não oficial) |
| Templates | Obrigatório (aprovação Meta) | Não necessário (texto livre) |
| Cobrança | Mensal fixo | Mensal por plano |
| Risco de banimento | Baixo | Moderado |
| Desconexão | Rara | Pode ocorrer (requer re-scan QR) |
| Integração | Webhook com automação | API REST direta |

---

## 2. API UltraMsg – Referência

### Endpoint: Enviar Mensagem de Texto

```
POST https://api.ultramsg.com/{instance_id}/messages/chat
```

### Parâmetros do Body (form-urlencoded ou JSON)

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `token` | string | ✅ Sim | Token de autenticação da instância |
| `to` | string | ✅ Sim | Número com código do país. Ex: `+5547992102017` ou `5547992102017@c.us` |
| `body` | string | ✅ Sim | Texto da mensagem (máx. 4096 caracteres, suporta emoji e UTF-8) |

### Exemplo de Requisição (JSON)

```json
POST https://api.ultramsg.com/instance168759/messages/chat
Content-Type: application/json

{
  "token": "SEU_TOKEN_AQUI",
  "to": "+5547992102017",
  "body": "🔔 *Lembrete de Pagamento*\n\nFornecedor: Fornecedor XYZ\nDescrição: Óleo lubrificante\nValor: R$ 1.250,00\nVencimento: 03/04/2026"
}
```

### Exemplo de Requisição (cURL)

```bash
curl -X POST "https://api.ultramsg.com/instance168759/messages/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "SEU_TOKEN_AQUI",
    "to": "+5547992102017",
    "body": "Teste de mensagem via UltraMsg"
  }'
```

### Resposta de Sucesso

```json
{
  "sent": "true",
  "message": "ok",
  "id": "true_5547992102017@c.us_XXXXXXXXXXXXXXXXXX"
}
```

### Resposta de Erro

```json
{
  "sent": "false",
  "message": "Phone number is not registered on WhatsApp",
  "id": null
}
```

---

## 3. Secrets (Variáveis de Ambiente)

### Novos Secrets Necessários

| Secret | Descrição | Exemplo |
|--------|-----------|---------|
| `ULTRAMSG_INSTANCE_ID` | ID da instância UltraMsg | `instance168759` |
| `ULTRAMSG_TOKEN` | Token de autenticação da instância | `xxxxxxxxxxxxxxxxx` |

### Secrets Existentes (mantidos)

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role para consultas sem RLS |
| `REPORTANA_WEBHOOK_URL` | Webhook da Reportana (backup/legado) |

> **Segurança**: Ambos os secrets são armazenados via Lovable Cloud e acessíveis apenas nas Edge Functions. Nunca hardcoded no código.

---

## 4. Arquitetura da Integração

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐     ┌──────────┐
│  pg_cron     │────▶│  Edge Function       │────▶│  UltraMsg API    │────▶│ WhatsApp │
│ (diário)     │     │ notify-accounts-due  │     │  (REST POST)     │     │ Usuário  │
└──────────────┘     └─────────────────────┘     └──────────────────┘     └──────────┘

┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐     ┌──────────┐
│  Botão UI    │────▶│  Edge Function       │────▶│  UltraMsg API    │────▶│ WhatsApp │
│ "Enviar      │     │  test-webhook        │     │  (REST POST)     │     │ Usuário  │
│  Teste"      │     │                      │     │                  │     │          │
└──────────────┘     └─────────────────────┘     └──────────────────┘     └──────────┘
```

---

## 5. Edge Function: `notify-accounts-due` (Alterações)

### Antes (Reportana)

```typescript
// Envia POST para webhook Reportana com payload JSON
const webhookResponse = await fetch(reportanaWebhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    phone: formattedPhone,
    supplier_name: account.supplier_name,
    description: account.description,
    amount: amountFormatted,
    due_date: dueDateFormatted,
    company_name: companyName,
  }),
});
```

### Depois (UltraMsg)

```typescript
const instanceId = Deno.env.get("ULTRAMSG_INSTANCE_ID")!;
const ultramsgToken = Deno.env.get("ULTRAMSG_TOKEN")!;
const ultramsgUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;

// Montar mensagem de texto formatada
const messageBody = `🔔 *Lembrete de Pagamento - MalhaGest*

Você tem um pagamento com vencimento *amanhã*:

📋 *Fornecedor:* ${account.supplier_name}
📝 *Descrição:* ${account.description}
💰 *Valor:* R$ ${amountFormatted}
📅 *Vencimento:* ${dueDateFormatted}

Acesse o sistema para mais detalhes.`;

const response = await fetch(ultramsgUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: ultramsgToken,
    to: formattedPhone,
    body: messageBody,
  }),
});

const result = await response.json();
const success = result.sent === "true";
```

### Mudanças Principais

1. **Sem webhook intermediário** — chamada direta à API UltraMsg
2. **Template na Edge Function** — mensagem montada no código (não precisa de automação externa)
3. **Validação de resposta** — checar `result.sent === "true"` em vez de `response.ok`
4. **Dois secrets novos** — `ULTRAMSG_INSTANCE_ID` e `ULTRAMSG_TOKEN`

---

## 6. Edge Function: `test-webhook` (Alterações)

### Antes (Reportana)

```typescript
const resp = await fetch(reportanaWebhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

### Depois (UltraMsg)

```typescript
const instanceId = Deno.env.get("ULTRAMSG_INSTANCE_ID")!;
const ultramsgToken = Deno.env.get("ULTRAMSG_TOKEN")!;
const ultramsgUrl = `https://api.ultramsg.com/${instanceId}/messages/chat`;

const messageBody = `🔔 *Teste de Notificação - MalhaGest*

📋 *Fornecedor:* Fornecedor Teste
📝 *Descrição:* Teste de notificação WhatsApp
💰 *Valor:* R$ 1.250,00
📅 *Vencimento:* ${new Date(Date.now() + 86400000).toLocaleDateString("pt-BR")}

✅ Se você recebeu esta mensagem, a integração está funcionando!`;

const resp = await fetch(ultramsgUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: ultramsgToken,
    to: formattedPhone,
    body: messageBody,
  }),
});

const result = await resp.json();
const success = result.sent === "true";
```

### Funcionalidade do Botão "Enviar Teste"

O botão já existe na UI do módulo Contas a Pagar. O fluxo permanece o mesmo:

1. Usuário clica em **"Enviar Teste"** no modal
2. Insere o número de WhatsApp para teste
3. Frontend chama `supabase.functions.invoke("test-webhook", { body: { phone } })`
4. Edge Function formata o número para `+55XXXXXXXXXXX`
5. Envia mensagem de teste via UltraMsg API
6. Retorna resultado (sucesso/erro) para o frontend
7. Toast de feedback exibido ao usuário

---

## 7. Formato do Número WhatsApp

| Etapa | Formato | Exemplo |
|-------|---------|---------|
| Armazenado no banco | 11 dígitos (sem +55) | `47992102017` |
| Máscara visual no formulário | `(XX) X XXXX-XXXX` | `(47) 9 9210-2017` |
| Enviado à UltraMsg API | `+55XXXXXXXXXXX` | `+5547992102017` |

### Lógica de Formatação (Edge Function)

```typescript
const cleanPhone = phone.replace(/\D/g, '');
const formattedPhone = cleanPhone.startsWith('55') 
  ? `+${cleanPhone}` 
  : `+55${cleanPhone}`;
```

---

## 8. Template da Mensagem (Texto Livre)

Diferente da Reportana que exige templates aprovados pelo Meta, a UltraMsg permite texto livre. O template é montado diretamente na Edge Function:

### Notificação de Vencimento (notify-accounts-due)

```
🔔 *Lembrete de Pagamento - MalhaGest*

Você tem um pagamento com vencimento *amanhã*:

📋 *Fornecedor:* {supplier_name}
📝 *Descrição:* {description}
💰 *Valor:* R$ {amount}
📅 *Vencimento:* {due_date}

Acesse o sistema para mais detalhes.
```

### Mensagem de Teste (test-webhook)

```
🔔 *Teste de Notificação - MalhaGest*

📋 *Fornecedor:* Fornecedor Teste
📝 *Descrição:* Teste de notificação WhatsApp
💰 *Valor:* R$ 1.250,00
📅 *Vencimento:* {data_amanhã}

✅ Se você recebeu esta mensagem, a integração está funcionando!
```

> **Formatação WhatsApp**: Use `*texto*` para **negrito** e `_texto_` para _itálico_. Quebras de linha com `\n`.

---

## 9. Tratamento de Erros

### Cenários de Erro

| Erro | Causa | Tratamento |
|------|-------|------------|
| `sent: "false"` | Número não registrado no WhatsApp | Log de erro, não marca como notificado |
| `401 Unauthorized` | Token inválido | Log de erro, retorna erro 500 |
| Timeout | API lenta ou indisponível | Retry não implementado (falha silenciosa) |
| Instância desconectada | WhatsApp Web deslogou | Log de erro, necessita re-scan QR |

### Validação na Edge Function

```typescript
// Verificar secrets antes de prosseguir
const instanceId = Deno.env.get("ULTRAMSG_INSTANCE_ID");
const ultramsgToken = Deno.env.get("ULTRAMSG_TOKEN");

if (!instanceId || !ultramsgToken) {
  console.error("ULTRAMSG_INSTANCE_ID ou ULTRAMSG_TOKEN não configurados");
  return new Response(
    JSON.stringify({ error: "UltraMsg não configurado" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### Validação da Resposta

```typescript
const result = await response.json();

if (result.sent === "true") {
  // Sucesso — marcar notification_sent = true
  await supabase
    .from("accounts_payable")
    .update({ notification_sent: true })
    .eq("id", account.id);
  notified++;
} else {
  // Falha — logar motivo
  console.error(`Falha ao enviar para ${account.id}: ${result.message}`);
  errors++;
}
```

---

## 10. Cron Job (Sem Alterações)

O cron job existente (pg_cron) continua chamando a Edge Function `notify-accounts-due` diariamente às 08:00 (Brasília) / 11:00 UTC. Nenhuma alteração necessária no cron — apenas a Edge Function muda internamente.

```sql
-- Já configurado, sem alteração
SELECT cron.schedule(
  'notify-accounts-due-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://etsaleegdpswwsprwyzv.supabase.co/functions/v1/notify-accounts-due',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ..."}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
```

---

## 11. Checklist de Implementação

- [x] Configurar secret `ULTRAMSG_INSTANCE_ID` com valor `instance168759`
- [x] Configurar secret `ULTRAMSG_TOKEN` com token da instância
- [x] Atualizar Edge Function `notify-accounts-due` (trocar Reportana → UltraMsg)
- [x] Atualizar Edge Function `test-webhook` (trocar Reportana → UltraMsg)
- [x] Deploy das Edge Functions
- [x] Testar via botão "Enviar Teste" na UI
- [x] Verificar recebimento da mensagem no WhatsApp
- [x] Testar cron job manualmente (invocar Edge Function)
- [x] Validar formatação da mensagem (negrito, emojis, quebras de linha)
- [x] Manter secrets da Reportana como fallback (não remover)

---

## 12. Considerações de Segurança

- **Token como Secret**: O token UltraMsg é armazenado como secret no Lovable Cloud, nunca no código
- **Instância WhatsApp Web**: Requer que o WhatsApp esteja conectado (scan QR). Se desconectar, mensagens entram em fila
- **Rate Limiting**: A UltraMsg tem limites por plano. Monitorar volume de envios
- **Fallback**: Manter `REPORTANA_WEBHOOK_URL` configurado para possível rollback
- **Validação de Input**: Número de telefone validado e formatado na Edge Function antes do envio

---

## 13. Histórico de Alterações

| Data/Hora (Brasília) | Descrição |
|----------------------|-----------|
| 06/04/2026 - XX:XX | Documentação inicial da integração UltraMsg. Instance ID: instance168759. Planejamento de substituição Reportana → UltraMsg nas Edge Functions notify-accounts-due e test-webhook. |
