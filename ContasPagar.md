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
| `whatsapp_number` | TEXT | Sim | Número WhatsApp para notificação (formato: +5511999999999) |
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

## 3. Fluxo de Notificação WhatsApp

### Arquitetura

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐     ┌──────────┐
│  pg_cron     │────▶│  Edge Function       │────▶│  Twilio Gateway  │────▶│ WhatsApp │
│ (diário)     │     │ notify-accounts-due  │     │  (Connector)     │     │ Usuário  │
└──────────────┘     └─────────────────────┘     └──────────────────┘     └──────────┘
```

### Fluxo Detalhado

1. **Cron Job (pg_cron + pg_net)**: Executa diariamente (ex: às 08:00 horário de Brasília)
2. **Edge Function `notify-accounts-due`**:
   - Busca todas as contas com `due_date = CURRENT_DATE + 1` e `notification_sent = false` e `status = 'pendente'`
   - Para cada conta encontrada, envia mensagem via Twilio WhatsApp
   - Marca `notification_sent = true` após envio bem-sucedido
3. **Twilio (via Connector Gateway)**:
   - Utiliza o conector Twilio já disponível na plataforma
   - Envia mensagem para o número cadastrado no registro
   - Gateway URL: `https://connector-gateway.lovable.dev/twilio`

### Mensagem de Notificação (Template)

```
🔔 *Lembrete de Pagamento - MalhaGest*

Você tem um pagamento com vencimento *amanhã*:

📋 *Fornecedor:* {supplier_name}
📝 *Descrição:* {description}
💰 *Valor:* R$ {amount}
📅 *Vencimento:* {due_date}

Acesse o sistema para mais detalhes.
```

### Variáveis de Ambiente Necessárias

| Variável | Descrição | Origem |
|----------|-----------|--------|
| `LOVABLE_API_KEY` | Chave da API Lovable | Automático (conector) |
| `TWILIO_API_KEY` | Chave do conector Twilio | Conector Twilio (standard_connectors) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role para consultas sem RLS | Já configurado |

### Número de Origem (From)

O número de WhatsApp remetente será o número Twilio configurado pelo conector. Formato Twilio WhatsApp: `whatsapp:+14155238886` (sandbox) ou número aprovado.

---

## 4. Edge Function: `notify-accounts-due`

### Responsabilidades
1. Consultar `accounts_payable` onde `due_date = amanhã`, `status = 'pendente'`, `notification_sent = false`
2. Para cada registro, enviar WhatsApp via Twilio Gateway
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
    url := 'https://<project-ref>.supabase.co/functions/v1/notify-accounts-due',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon-key>"}'::jsonb,
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

## 7. Configuração do Conector Twilio

### Pré-requisitos
1. Conta Twilio ativa com número WhatsApp aprovado (ou sandbox para testes)
2. Conector Twilio vinculado ao projeto via `standard_connectors--connect`

### Passos
1. Vincular conector Twilio ao projeto
2. Secrets `LOVABLE_API_KEY` e `TWILIO_API_KEY` ficam disponíveis automaticamente
3. Configurar número de origem na Edge Function ou como secret adicional (`TWILIO_WHATSAPP_FROM`)

---

## 8. Considerações de Segurança

- **RLS ativo**: Cada empresa acessa apenas seus próprios registros
- **Validação de input**: Zod na Edge Function para validar corpo da requisição
- **Números WhatsApp**: Validados no formato E.164 antes de enviar
- **Service Role**: Usado apenas na Edge Function para consultas cross-company no cron
- **Rate limiting**: Controle de envio para evitar spam

---

## 9. Próximos Passos (Roadmap)

- [ ] Criar tabela `accounts_payable` com migração
- [ ] Criar página e componentes do módulo
- [ ] Configurar conector Twilio
- [ ] Criar Edge Function `notify-accounts-due`
- [ ] Configurar cron job com pg_cron + pg_net
- [ ] Adicionar ao menu lateral e `enabled_nav_items`
- [ ] Testes end-to-end
- [ ] Opção de recorrência mensal (auto-gerar próxima conta após pagamento)
- [ ] Relatório de despesas por período/categoria
- [ ] Anexar comprovante de pagamento (Storage)

---

## 10. Histórico de Alterações

| Data/Hora (Brasília) | Descrição |
|----------------------|-----------|
| 01/04/2026 - XX:XX | Documentação inicial do módulo Contas a Pagar |
