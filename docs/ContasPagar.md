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
| `notification_sent` | BOOLEAN | Sim | Se a notificação já foi processada (padrão: false) |
| `notification_status` | TEXT | Sim | Status do envio: `pendente`, `enviado`, `erro` (padrão: `pendente`) |
| `notification_error` | TEXT | Não | Mensagem de erro do envio quando `notification_status = 'erro'` |
| `receipt_url` | TEXT | Não | URL pública do comprovante de pagamento (Storage bucket `payment-receipts`) |
| `receipt_change_count` | INTEGER | Sim | Contador de alterações do comprovante (máximo 2, padrão: 0) |
| `short_id` | TEXT | Sim | ID único de 4 dígitos por empresa (auto-gerado: 0001, 0002, ...) |
| `paid_amount` | NUMERIC | Não | Valor efetivamente pago (quando diferente do original, ex: com juros) |
| `observations` | TEXT | Não | Observações adicionais |
| `created_at` | TIMESTAMPTZ | Sim | Data de criação (auto-gerado) |
| `updated_at` | TIMESTAMPTZ | Sim | Última atualização (auto-gerado) |

### RLS (Row Level Security)

- **SELECT**: Usuário autenticado pode ler registros da própria empresa (`company_id = get_user_company_id()`)
- **INSERT**: Usuário autenticado pode inserir registros para a própria empresa
- **UPDATE**: Usuário autenticado pode atualizar registros da própria empresa
- **DELETE**: Usuário autenticado pode excluir registros da própria empresa

---

## 3. Fluxo de Notificação WhatsApp (UltraMsg)

### Arquitetura

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────────┐     ┌──────────┐
│  pg_cron     │────▶│  Edge Function       │────▶│  UltraMsg API    │────▶│ WhatsApp │
│ (diário)     │     │ notify-accounts-due  │     │  (REST POST)     │     │ Usuário  │
└──────────────┘     └─────────────────────┘     └──────────────────┘     └──────────┘
```

### Por que UltraMsg?

| Critério | Twilio | UltraMsg |
|----------|--------|----------|
| Cobrança | Por mensagem enviada | Mensal por plano |
| Previsibilidade de custo | ❌ Variável | ✅ Fixo |
| Templates | Obrigatório (aprovação Meta) | Texto livre |
| Integração | Connector Gateway | API REST direta |

### Fluxo Detalhado

1. **Cron Job (pg_cron + pg_net)**: Executa diariamente (ex: às 08:00 horário de Brasília)
2. **Edge Function `notify-accounts-due`**:
   - Busca contas com `due_date = CURRENT_DATE + 1` (véspera) e `notification_sent = false` e `status = 'pendente'`
   - Busca contas com `due_date = CURRENT_DATE` (dia do vencimento) e `status = 'pendente'`
   - Para cada conta, envia POST direto para **UltraMsg API** com mensagem formatada
   - Marca `notification_sent = true` e `notification_status = 'enviado'` após envio bem-sucedido (apenas véspera)
   - Em caso de erro, registra `notification_status = 'erro'` e `notification_error` com motivo
3. **UltraMsg API**:
   - Recebe os dados via POST (token + número + mensagem)
   - Envia mensagem via WhatsApp Web

### Dados enviados à UltraMsg API

A Edge Function envia um POST direto para `https://api.ultramsg.com/{INSTANCE_ID}/messages/chat` com:

```json
{
  "token": "ULTRAMSG_TOKEN",
  "to": "+5547992102017",
  "body": "🔔 *Lembrete de Pagamento - MalhaGest*\n\nVocê tem um pagamento com vencimento *amanhã*:\n\n🆔 *ID:* #0001\n📋 *Fornecedor:* Fornecedor XYZ\n📝 *Descrição:* Óleo lubrificante\n💰 *Valor:* R$ 1.250,00\n📅 *Vencimento:* 03/04/2026\n\nAcesse o sistema para mais detalhes.\n\n⚠️ Mensagem automática, esse não é um canal de suporte."
}
```

### Templates das Mensagens (montados na Edge Function)

**Véspera (dia anterior ao vencimento):**
```
🔔 *Lembrete de Pagamento - MalhaGest*

Você tem um pagamento com vencimento *amanhã*:

🆔 *ID:* #{short_id}
📋 *Fornecedor:* {supplier_name}
📝 *Descrição:* {description}
💰 *Valor:* R$ {amount}
📅 *Vencimento:* {due_date}

Acesse o sistema para mais detalhes.

⚠️ Mensagem automática, esse não é um canal de suporte.
```

**Dia do vencimento (se ainda pendente):**
```
⚠️ *VENCIMENTO HOJE - MalhaGest*

A conta *#{short_id}* vence *hoje* e ainda consta como pendente no sistema:

📋 *Fornecedor:* {supplier_name}
📝 *Descrição:* {description}
💰 *Valor:* R$ {amount}
📅 *Vencimento:* {due_date}

Se já foi paga, atualize o sistema.
Se não foi, pague para evitar juros.

⚠️ Mensagem automática, esse não é um canal de suporte.
```

### Variáveis de Ambiente (Secrets)

| Variável | Descrição | Status |
|----------|-----------|--------|
| `ULTRAMSG_INSTANCE_ID` | ID da instância UltraMsg | ✅ Configurado |
| `ULTRAMSG_TOKEN` | Token de autenticação da instância | ✅ Configurado |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role para consultas sem RLS | ✅ Já configurado |

> **Nota:** O secret `REPORTANA_WEBHOOK_URL` ainda existe como legado/fallback, mas não é mais utilizado pelo notify-accounts-due.

---

## 4. Edge Function: `notify-accounts-due`

### Responsabilidades
1. Consultar `accounts_payable` onde `due_date = amanhã`, `status = 'pendente'`, `notification_sent = false` (notificação de véspera)
2. Consultar `accounts_payable` onde `due_date = hoje`, `status = 'pendente'` (notificação no dia do vencimento)
3. Para cada registro, enviar POST direto para `UltraMsg API` com mensagem formatada (inclui short_id)
4. Atualizar `notification_sent = true` e `notification_status = 'enviado'` em caso de sucesso (apenas véspera)
5. Registrar `notification_status = 'erro'` e `notification_error` com motivo em caso de falha
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
- **Listagem**: Tabela com todas as contas, filtro por status (pendente, pago, vencido), mês de vencimento e fornecedor
- **Filtro por Mês**: Select com meses disponíveis baseado nas datas de vencimento, formatado como "abr/2026"
- **Filtro por Fornecedor**: Select com lista única de fornecedores cadastrados
- **Cadastro**: Modal/formulário para registrar nova conta com campos obrigatórios
- **Edição**: Editar dados da conta antes do vencimento
- **Marcar como Pago**: Botão para alterar status para `pago` e registrar `paid_at`. Disponível para contas pendentes e vencidas. Modal inclui campo de upload de comprovante (opcional).
- **Comprovante de Pagamento**: Upload de PDF, PNG ou JPG no momento da confirmação. Armazenado no Storage bucket `payment-receipts`.
- **Exclusão**: Remover registro (com confirmação)

#### Comprovante de Pagamento

| Ação | Descrição |
|------|-----------|
| Upload no pagamento | Campo opcional no modal de confirmação de pagamento |
| Adicionar depois | Se não foi enviado na hora do pagamento, ícone ⬆ (azul) aparece para adicionar depois. Não conta como alteração. |
| Visualizar | Ícone 👁 (azul) abre modal interno com preview do comprovante (PDF em iframe, imagens inline). Baixa o arquivo via SDK do Supabase Storage, evitando bloqueios de navegador (ERR_BLOCKED_BY_CLIENT). Inclui botão "Baixar". |
| Alterar | Ícone ⬆ (âmbar) permite substituir o comprovante — **máximo 2 vezes** |
| Bloqueio | Após 2 alterações, botão de alterar é removido permanentemente |

> **Storage**: Bucket `payment-receipts` (público). Caminho: `{company_id}/{account_id}.{ext}`. Aceita PDF, PNG, JPG.

#### Status de Notificação (coluna Notificação)
| Status | Exibição | Descrição |
|--------|----------|-----------|
| Pendente | Data/hora prevista (ex: 07/04/2026 8:00) | Aguardando envio pelo cron diário |
| Enviado | Badge verde "Enviado" | Notificação entregue com sucesso |
| Erro | Badge vermelho "Não Enviado" + tooltip com motivo | Falha no envio — hover mostra o erro |

> **Regra de UI:** Quando `notification_status = 'erro'`, o badge vermelho "Não Enviado" é exibido como alerta visual, mas **NÃO bloqueia** os botões de Confirmar pagamento e Editar. Todas as ações financeiras permanecem disponíveis independentemente do status da notificação.

#### Campos do Formulário
1. **Fornecedor** (texto, obrigatório)
2. **Descrição** (texto, obrigatório)
3. **Categoria** (select: Insumos, Peças, Agulhas, Serviços, Outros)
4. **Valor (R$)** (numérico, obrigatório)
5. **Data de Vencimento** (date, obrigatório)
6. **WhatsApp para Notificação** (telefone, obrigatório, sem +55, ex: 47992102017. Máscara visual: (XX) X XXXX-XXXX)
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
- [x] Anexar comprovante de pagamento (Storage)

---

## 10. Histórico de Alterações

| Data/Hora (Brasília) | Descrição |
|----------------------|-----------|
| 01/04/2026 - XX:XX | Documentação inicial do módulo Contas a Pagar |
| 02/04/2026 - 10:45 | Substituição do Twilio pela Reportana (webhook) para notificações WhatsApp. Secret `REPORTANA_WEBHOOK_URL` configurado. Documentação atualizada com fluxo, dados do webhook e template de mensagem. |
| 02/04/2026 - 11:30 | Implementação completa: tabela `accounts_payable` (RLS), página `/contas-pagar` (CRUD + filtros + KPIs), Edge Function `notify-accounts-due` (deploy + teste OK), cron job diário 08:00 Brasília, integração rotas/sidebar/permissões. |
| 03/04/2026 - XX:XX | Documentação atualizada: formato do número WhatsApp corrigido para +55XXXXXXXXXXX (formatado pela Edge Function). Número armazenado sem prefixo, com máscara visual (XX) X XXXX-XXXX no formulário. Botão "Enviar Teste" adicionado com Edge Function `test-webhook`. |
| 07/04/2026 - 08:30 | **Rastreamento de erros de notificação:** Adicionados campos `notification_status` e `notification_error` à tabela. Edge Function `notify-accounts-due` agora salva resultado (enviado/erro + motivo). Interface exibe badge "Não Enviado" com tooltip do erro e oculta botões confirmar/editar quando há falha. |
| 07/04/2026 - 09:00 | **Comprovante de pagamento:** Bucket `payment-receipts` criado no Storage. Campos `receipt_url` e `receipt_change_count` adicionados. Modal de confirmação de pagamento agora inclui upload opcional de comprovante (PDF/PNG/JPG). Botões de visualizar (👁) e alterar (⬆) comprovante na tabela. Limite de 2 alterações do comprovante após envio inicial, com bloqueio permanente. |
| 07/04/2026 - 09:30 | **Visualização de comprovante em modal interno:** Substituído `window.open` por download via SDK Supabase Storage + exibição em Dialog interno (PDF em iframe, imagens inline). Evita bloqueio `ERR_BLOCKED_BY_CLIENT` por navegadores/extensões. Inclui botão "Baixar" no modal. |
| 07/04/2026 - 10:00 | **Pagamento desbloqueado + filtros:** (1) Botões Confirmar pagamento e Editar agora visíveis mesmo com erro de notificação — erro não bloqueia ações financeiras; (2) Confirmar pagamento disponível também para contas "vencido"; (3) Novos filtros: mês de vencimento e fornecedor. |
| 07/04/2026 - 10:30 | **Validações de formulário:** (1) Calendário de vencimento bloqueado para datas passadas (min = hoje); (2) Campo Valor (R$) aceita apenas dígitos, vírgula e ponto — caracteres filtrados automaticamente. |
| 07/04/2026 - 01:20 | **5 melhorias:** (1) ID único 4 dígitos (`short_id`) auto-gerado por empresa; (2) Botão excluir removido para contas pagas; (3) Campo "Valor com juros" para contas vencidas (`paid_amount`); (4) Notificação no dia do vencimento; (5) Busca por ID. |
