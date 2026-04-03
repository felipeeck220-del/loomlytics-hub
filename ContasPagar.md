# Módulo Contas a Pagar

> Documentação técnica e funcional do módulo de Contas a Pagar com notificações via WhatsApp.

---

## 1. Visão Geral

O módulo **Contas a Pagar** permite que cada empresa cadastre e gerencie suas obrigações financeiras (compras de óleo, peças, agulhas, etc.), com **notificação automática via WhatsApp** 1 dia antes do vencimento.

### Objetivo
- Registrar entradas de compras/despesas com data de vencimento
- Notificar automaticamente o responsável via WhatsApp antes do vencimento
- Controlar status de pagamento (pendente, pago, vencido)
- Disponível para **todas as empresas** da plataforma

---

## 2. Estrutura de Dados

### Tabela: `accounts_payable`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `id` | UUID | Sim | Identificador único (auto-gerado) |
| `company_id` | UUID | Sim | Empresa proprietária do registro |
| `supplier_name` | TEXT | Sim | Nome do fornecedor |
| `description` | TEXT | Sim | Descrição do item/serviço (ex: "Óleo lubrificante") |
| `category` | TEXT | Não | Categoria da despesa (ex: "Insumos", "Peças", "Serviços") |
| `amount` | NUMERIC | Sim | Valor a pagar (R$) |
| `due_date` | DATE | Sim | Data de vencimento |
| `whatsapp_number` | TEXT | Sim | Número WhatsApp para notificação (armazenado sem prefixo, ex: 47992102017). A Edge Function formata para +55XXXXXXXXXXX antes do envio. |
| `status` | TEXT | Sim | Status: `pendente`, `pago`, `vencido` (padrão: `pendente`) |
| `paid_at` | TIMESTAMPTZ | Não | Data/hora em que foi marcado como pago |
| `notification_sent` | BOOLEAN | Sim | Se a notificação já foi enviada (padrão: false) |
| `observations` | TEXT | Não | Observações adicionais |
| `created_at` | TIMESTAMPTZ | Sim | Data de criação (auto-gerado) |
| `updated_at` | TIMESTAMPTZ | Sim | Última atualização (auto-gerado) |

### RLS (Row Level Security)

- **SELECT**: Usuário autenticado pode ler registros da própria empresa (`company_id = get_user_company_id()`)
- **INSERT**: Usuário autenticado pode inserir registros para a própria empresa
- **UPDATE**: Usuário autenticado pode atualizar registros da própria empresa
- **DELETE**: Usuário autenticado pode excluir registros da própria empresa

---

## 3. Fluxo de Notificação WhatsApp (Reportana)

### Arquitetura

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐     ┌──────────┐
│  pg_cron     │────▶│  Edge Function       │────▶│  Reportana       │────▶│ WhatsApp │
│ (diário)     │     │ notify-accounts-due  │     │  (Webhook)       │     │ Usuário  │
└──────────────┘     └─────────────────────┘     └──────────────────┘     └──────────┘
```

### Por que Reportana e não Twilio?

| Critério | Twilio | Reportana |
|----------|--------|-----------|
| Cobrança | Por mensagem enviada | Mensal fixo (ilimitado) |
| Previsibilidade de custo | ❌ Variável | ✅ Fixo |
| Integração | Connector Gateway | Webhook direto |

### Fluxo Detalhado

1. **Cron Job (pg_cron + pg_net)**: Executa diariamente (ex: às 08:00 horário de Brasília)
2. **Edge Function `notify-accounts-due`**:
   - Busca todas as contas com `due_date = CURRENT_DATE + 1` e `notification_sent = false` e `status = 'pendente'`
   - Para cada conta encontrada, envia POST para o **webhook da Reportana** com os dados
   - Marca `notification_sent = true` após envio bem-sucedido
3. **Reportana (Automação via Webhook)**:
   - Recebe os dados via webhook
   - Dispara mensagem WhatsApp usando template configurado na plataforma
   - O número de WhatsApp remetente é o conectado na conta Reportana (API Oficial do Meta)

### Dados enviados ao Webhook

A Edge Function envia um POST com o seguinte JSON:

```json
{
  "phone": "+5547992102017",
  "supplier_name": "Fornecedor XYZ",
  "description": "Óleo lubrificante",
  "amount": "1.250,00",
  "due_date": "03/04/2026",
  "company_name": "Malharia ABC"
}
```

### Template da Mensagem (configurado na Reportana)

```
🔔 *Lembrete de Pagamento - MalhaGest*

Você tem um pagamento com vencimento *amanhã*:

📋 *Fornecedor:* {{supplier_name}}
📝 *Descrição:* {{description}}
💰 *Valor:* R$ {{amount}}
📅 *Vencimento:* {{due_date}}

Acesse o sistema para mais detalhes.
```

> **Nota**: As variáveis `{{...}}` devem ser mapeadas na automação da Reportana para os campos recebidos via webhook.

### Variáveis de Ambiente (Secrets)

| Variável | Descrição | Status |
|----------|-----------|--------|
| `REPORTANA_WEBHOOK_URL` | URL completa do webhook (com token) | ✅ Configurado |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role para consultas sem RLS | ✅ Já configurado |

> **Segurança**: A URL do webhook contém o token de autenticação embutido. Armazenada como secret, nunca no código.

---

## 4. Edge Function: `notify-accounts-due`

### Responsabilidades
1. Consultar `accounts_payable` onde `due_date = amanhã`, `status = 'pendente'`, `notification_sent = false`
2. Para cada registro, enviar POST para `REPORTANA_WEBHOOK_URL` com dados da conta
3. Atualizar `notification_sent = true` em caso de sucesso
4. Logar erros para diagnóstico
5. Atualizar status para `vencido` em contas com `due_date < hoje` e `status = 'pendente'`

### Endpoint
- **Método**: POST
- **Autenticação**: Chamado via pg_cron com anon key (verify_jwt = false)

---

## 5. Cron Job (pg_cron)

### Configuração

```sql
-- Executa todos os dias às 08:00 UTC-3 (11:00 UTC)
SELECT cron.schedule(
  'notify-accounts-due-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://etsaleegdpswwsprwyzv.supabase.co/functions/v1/notify-accounts-due',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0c2FsZWVnZHBzd3dzcHJ3eXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjI4MTEsImV4cCI6MjA4ODU5ODgxMX0.HgrEhziu6UyoFlLznhTgeNN5KZ0xhCVvBkfyuIEcR90"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
```

> **Nota**: Requer extensões `pg_cron` e `pg_net` habilitadas.

---

## 6. Interface do Usuário

### Página: Contas a Pagar (`/contas-pagar`)

#### Funcionalidades
- **Listagem**: Tabela com todas as contas, filtro por status (pendente, pago, vencido) e período
- **Cadastro**: Modal/formulário para registrar nova conta com campos obrigatórios
- **Edição**: Editar dados da conta antes do vencimento
- **Marcar como Pago**: Botão para alterar status para `pago` e registrar `paid_at`
- **Exclusão**: Remover registro (com confirmação)

#### Cores de Status
| Status | Cor | Badge |
|--------|-----|-------|
| Pendente | Amarelo/Âmbar | `bg-amber-100 text-amber-800` |
| Pago | Verde | `bg-green-100 text-green-800` |
| Vencido | Vermelho | `bg-red-100 text-red-800` |

#### Campos do Formulário
1. **Fornecedor** (texto, obrigatório)
2. **Descrição** (texto, obrigatório)
3. **Categoria** (select: Insumos, Peças, Agulhas, Serviços, Outros)
4. **Valor (R$)** (numérico, obrigatório)
5. **Data de Vencimento** (date, obrigatório)
6. **WhatsApp para Notificação** (telefone, obrigatório, formato brasileiro)
7. **Observações** (textarea, opcional)

### Navegação

- Adicionado ao menu lateral (sidebar) com ícone `Receipt` ou `CreditCard`
- Key no `enabled_nav_items`: `contas-pagar`
- Acessível para roles: `admin` e `gerente`

---

## 7. Configuração da Reportana

### Pré-requisitos
1. Conta Reportana ativa com WhatsApp conectado (API Oficial do Meta)
2. Automação criada com trigger de **Webhook** na plataforma Reportana

### Passos Realizados
1. ✅ Automação "Contas a Pagar" criada na Reportana com trigger Webhook
2. ✅ URL do webhook salva como secret `REPORTANA_WEBHOOK_URL`
3. ✅ Template de mensagem configurado na automação da Reportana
4. Mapear variáveis do webhook (`phone`, `supplier_name`, `description`, `amount`, `due_date`, `company_name`) no editor da Reportana

### Vantagem de Custo
- Reportana cobra um valor **mensal fixo** com mensagens **ilimitadas**
- Diferente do Twilio que cobra **por mensagem enviada**
- Ideal para empresas com alto volume de contas a pagar

---

## 8. Considerações de Segurança

- **RLS ativo**: Cada empresa acessa apenas seus próprios registros
- **Validação de input**: Zod na Edge Function para validar corpo da requisição
- **Números WhatsApp**: Armazenados sem prefixo (ex: 47992102017), formatados para +55XXXXXXXXXXX pela Edge Function antes do envio à Reportana
- **Service Role**: Usado apenas na Edge Function para consultas cross-company no cron
- **Webhook URL como Secret**: URL com token embutido armazenada como `REPORTANA_WEBHOOK_URL`, nunca hardcoded
- **Rate limiting**: Controle de envio para evitar spam

---

## 9. Próximos Passos (Roadmap)

- [x] Criar tabela `accounts_payable` com migração
- [x] Criar página e componentes do módulo
- [x] Configurar integração Reportana (webhook + secret)
- [x] Criar Edge Function `notify-accounts-due`
- [x] Configurar cron job com pg_cron + pg_net
- [x] Adicionar ao menu lateral e `enabled_nav_items`
- [ ] Mapear variáveis no editor da automação Reportana
- [ ] Testes end-to-end
- [ ] Opção de recorrência mensal (auto-gerar próxima conta após pagamento)
- [ ] Relatório de despesas por período/categoria
- [ ] Anexar comprovante de pagamento (Storage)

---

## 10. Histórico de Alterações

| Data/Hora (Brasília) | Descrição |
|----------------------|-----------|
| 01/04/2026 - XX:XX | Documentação inicial do módulo Contas a Pagar |
| 02/04/2026 - 10:45 | Substituição do Twilio pela Reportana (webhook) para notificações WhatsApp. Secret `REPORTANA_WEBHOOK_URL` configurado. Documentação atualizada com fluxo, dados do webhook e template de mensagem. |
| 02/04/2026 - 11:30 | Implementação completa: tabela `accounts_payable` (RLS), página `/contas-pagar` (CRUD + filtros + KPIs), Edge Function `notify-accounts-due` (deploy + teste OK), cron job diário 08:00 Brasília, integração rotas/sidebar/permissões. |
