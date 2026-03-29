# 📄 NF.MD — Planejamento do Módulo de Notas Fiscais (Facção)

> **⚠️ INSTRUÇÕES:**
> Este arquivo documenta a estrutura planejada do módulo de Notas Fiscais para o MalhaGest.
> Modelo de negócio: **Facção** — o cliente envia o fio, a malharia produz a malha e cobra por kg produzido.
> A malharia NÃO compra fio — apenas recebe, produz e devolve como malha.

---

## 📌 Visão Geral do Fluxo

```
Cliente envia NF com fio
       ↓
Fio é recebido e registrado (NF Entrada)
       ↓
Fio é vinculado a 1 ou mais artigos do cliente
       ↓
Produção consome o fio (registrado automaticamente via artigo)
       ↓
Malha produzida é entregue ao cliente (NF Saída)
       ↓
Saldo de fio = Recebido − Consumido (por tipo de fio, por cliente)
```

---

## 🧶 Tipos de Fio (`yarn_types`)

Cadastro dos tipos de fio que circulam na facção. Um tipo de fio pode ser usado por vários clientes e vários artigos.

### Tabela: `yarn_types`

| Campo         | Tipo         | Obrigatório | Descrição                                      |
|---------------|--------------|-------------|------------------------------------------------|
| id            | uuid (PK)    | Sim         | Identificador único                            |
| company_id    | uuid (FK)    | Sim         | Multi-tenancy                                  |
| name          | text         | Sim         | Nome do fio (ex: "Algodão 30/1 branco")        |
| composition   | text         | Não         | Composição (ex: "100% algodão", "50/50 misto") |
| color         | text         | Não         | Cor do fio                                     |
| observations  | text         | Não         | Observações livres                             |
| created_at    | timestamptz  | Sim         | Auto (now())                                   |

### RLS
- `company_id = get_user_company_id()` para SELECT, INSERT, UPDATE, DELETE

### Exemplos de registros:
```
| Nome                    | Composição      | Cor     |
|-------------------------|-----------------|---------|
| Algodão 30/1            | 100% algodão    | Branco  |
| Poliéster 150           | 100% poliéster  | Preto   |
| Misto 50/50 30/1        | 50% alg / 50% pol | Cru   |
```

---

## 📥 Notas Fiscais (`invoices`)

Tabela principal para NFs de **entrada** (fio recebido do cliente) e **saída** (malha entregue ao cliente).

### Tabela: `invoices`

| Campo                  | Tipo         | Obrigatório | Descrição                                          |
|------------------------|--------------|-------------|---------------------------------------------------|
| id                     | uuid (PK)    | Sim         | Identificador único                                |
| company_id             | uuid (FK)    | Sim         | Multi-tenancy                                      |
| type                   | text         | Sim         | `entrada` (fio recebido) ou `saida` (malha entregue) |
| invoice_number         | text         | Sim         | Número da nota fiscal                              |
| client_id              | uuid (FK)    | Sim         | Cliente vinculado                                  |
| client_name            | text         | Não         | Nome denormalizado do cliente                      |
| issue_date             | text         | Sim         | Data de emissão (formato yyyy-MM-dd)               |
| total_weight_kg        | numeric      | Sim         | Peso total da NF (kg) — soma dos itens             |
| total_value            | numeric      | Não         | Valor total (apenas NF saída — kg × valor/kg)      |
| status                 | text         | Sim         | `pendente`, `conferida`, `cancelada`               |
| observations           | text         | Não         | Observações livres                                 |
| created_by_name        | text         | Não         | Quem registrou                                     |
| created_by_code        | text         | Não         | Código do usuário que registrou                    |
| created_at             | timestamptz  | Sim         | Auto (now())                                       |

### RLS
- `company_id = get_user_company_id()` para SELECT, INSERT, UPDATE, DELETE

### Status possíveis:

| Status       | Descrição                                    |
|--------------|----------------------------------------------|
| `pendente`   | NF registrada, aguardando conferência         |
| `conferida`  | NF conferida e validada                       |
| `cancelada`  | NF cancelada (não conta nos saldos)           |

---

## 📦 Itens da Nota Fiscal (`invoice_items`)

Cada NF pode ter múltiplos itens. Na **entrada**, os itens são tipos de fio. Na **saída**, os itens são artigos (malha).

### Tabela: `invoice_items`

| Campo           | Tipo         | Obrigatório | Descrição                                              |
|-----------------|--------------|-------------|--------------------------------------------------------|
| id              | uuid (PK)    | Sim         | Identificador único                                    |
| invoice_id      | uuid (FK)    | Sim         | NF vinculada                                           |
| company_id      | uuid (FK)    | Sim         | Multi-tenancy                                          |
| yarn_type_id    | uuid (FK)    | Condicional | Tipo de fio (obrigatório se NF entrada)                |
| yarn_type_name  | text         | Não         | Nome denormalizado do fio                              |
| article_id      | uuid (FK)    | Condicional | Artigo (obrigatório se NF saída)                       |
| article_name    | text         | Não         | Nome denormalizado do artigo                           |
| weight_kg       | numeric      | Sim         | Peso do item (kg)                                      |
| quantity_rolls  | numeric      | Não         | Quantidade de rolos (apenas NF saída)                  |
| value_per_kg    | numeric      | Não         | Valor por kg (apenas NF saída)                         |
| subtotal        | numeric      | Não         | weight_kg × value_per_kg (apenas NF saída)             |
| observations    | text         | Não         | Observações do item                                    |
| created_at      | timestamptz  | Sim         | Auto (now())                                           |

### RLS
- `company_id = get_user_company_id()` para SELECT, INSERT, UPDATE, DELETE

---

## 🔗 Vínculo Artigo ↔ Tipo de Fio

### Alteração na tabela `articles` (existente)

| Campo novo      | Tipo         | Obrigatório | Descrição                          |
|-----------------|--------------|-------------|------------------------------------|
| yarn_type_id    | uuid (FK)    | Não         | Tipo de fio que este artigo usa    |

### Regras:
- Um artigo usa **1 tipo de fio**
- Vários artigos podem usar o **mesmo tipo de fio**
- Quando a produção é registrada para um artigo, o sistema sabe automaticamente **qual fio está sendo consumido**

### Exemplo:
```
Cliente: Sul Brasil
├── NF 1234 (entrada) → Algodão 30/1 branco: 500kg
├── NF 1235 (entrada) → Poliéster 150 preto: 300kg
│
├── Artigo: MALHA 1,12-115 MISTO → usa Algodão 30/1 branco
├── Artigo: MALHA 1,35-115 MISTO → usa Algodão 30/1 branco
└── Artigo: MALHA PRETA 1,20     → usa Poliéster 150 preto
```

---

## 📊 Controle de Saldo de Fio

O saldo é calculado **por tipo de fio, por cliente**:

```
Saldo = Σ(kg NF entrada conferida) − Σ(kg produção dos artigos que usam esse fio)
```

### Exemplo de cálculo:

```
Cliente: Sul Brasil
Fio: Algodão 30/1 branco

ENTRADAS (NFs conferidas):
  NF 1234: 500 kg
  NF 1567: 300 kg
  Total recebido: 800 kg

CONSUMO (produção):
  MALHA 1,12-115 MISTO: 420 kg produzidos
  MALHA 1,35-115 MISTO: 200 kg produzidos
  Total consumido: 620 kg

SALDO: 800 - 620 = 180 kg de fio ainda na facção
```

### Métricas disponíveis:

| Métrica              | Cálculo                                    |
|----------------------|--------------------------------------------|
| Fio recebido         | Soma kg das NFs de entrada (status ≠ cancelada) |
| Fio consumido        | Soma kg da produção dos artigos vinculados ao fio |
| Saldo de fio         | Recebido − Consumido                       |
| Rendimento           | kg malha produzida / kg fio consumido       |
| Malha entregue       | Soma kg das NFs de saída (status ≠ cancelada) |
| Malha pendente       | Produzido − Entregue (malha pronta não enviada) |

---

## 📱 Telas Planejadas

### 1. Página Principal — Notas Fiscais (`/:slug/invoices`)

**Abas:**
- **Entrada** — NFs de fio recebido
- **Saída** — NFs de malha entregue
- **Saldo de Fios** — Visão consolidada por cliente/fio

**Filtros:**
- Período (data)
- Cliente
- Status (pendente, conferida, cancelada)

### 2. Listagem de NFs (por aba)

| Coluna         | Descrição                     |
|----------------|-------------------------------|
| Nº NF          | Número da nota fiscal          |
| Cliente        | Nome do cliente                |
| Data           | Data de emissão                |
| Peso (kg)      | Total de kg da NF              |
| Valor (R$)     | Total (apenas NF saída)        |
| Status         | Badge colorido                 |
| Ações          | Editar, Visualizar, Cancelar   |

### 3. Formulário — Nova NF

**NF Entrada (fio):**
1. Selecionar cliente
2. Informar Nº da NF e data
3. Adicionar itens:
   - Selecionar tipo de fio (ou cadastrar novo)
   - Informar peso (kg)
4. Observações
5. Salvar como `pendente` ou `conferida`

**NF Saída (malha):**
1. Selecionar cliente
2. Informar Nº da NF e data
3. Adicionar itens:
   - Selecionar artigo (filtrado pelo cliente)
   - Informar rolos e/ou peso (kg)
   - Valor/kg auto-preenchido do artigo
   - Subtotal calculado
4. Total calculado automaticamente
5. Observações
6. Salvar

### 4. Tela de Saldo de Fios

Visão por cliente expandível:

```
▼ Sul Brasil
  ┌──────────────────────┬───────────┬───────────┬─────────┐
  │ Tipo de Fio          │ Recebido  │ Consumido │ Saldo   │
  ├──────────────────────┼───────────┼───────────┼─────────┤
  │ Algodão 30/1 branco  │ 800 kg    │ 620 kg    │ 180 kg  │
  │ Poliéster 150 preto  │ 300 kg    │ 150 kg    │ 150 kg  │
  └──────────────────────┴───────────┴───────────┴─────────┘

▶ Outro Cliente
```

---

## 🔐 Permissões

| Role       | Acesso                                           |
|------------|--------------------------------------------------|
| `admin`    | Tudo: criar, editar, visualizar, cancelar NFs    |
| `lider`    | Tudo exceto cancelar NFs                          |
| `mecanico` | Sem acesso                                        |
| `revisador`| Sem acesso                                        |

- Dados financeiros (valor/kg, subtotal, total) seguem a regra `canSeeFinancial` (apenas admin)

---

## 🧭 Integração com Sidebar

- Novo item: **"Notas Fiscais"** com ícone `FileText`
- Rota: `/:slug/invoices`
- Adicionado ao array padrão de `enabled_nav_items` em `company_settings`
- Controlável pelo admin da plataforma (ativar/desativar por empresa)

---

## 📈 Integração com Módulos Existentes

| Módulo           | Integração                                                    |
|------------------|---------------------------------------------------------------|
| **Dashboard**    | Card "Saldo de Fios" — resumo geral por cliente               |
| **Relatórios**   | Nova aba "Notas Fiscais" com totais por cliente/período        |
| **Clientes**     | Ver NFs de entrada/saída e saldo de fio por cliente            |
| **Produção**     | Consumo de fio calculado automaticamente via artigo vinculado  |
| **Artigos**      | Campo "Tipo de Fio" no cadastro do artigo                      |
| **Backup**       | Tabelas `yarn_types`, `invoices`, `invoice_items` incluídas    |

---

## 🗄️ Resumo das Alterações no Banco

### Tabelas novas:
1. `yarn_types` — Tipos de fio
2. `invoices` — Notas fiscais (entrada e saída)
3. `invoice_items` — Itens de cada NF

### Alterações em tabelas existentes:
1. `articles` — Novo campo `yarn_type_id` (FK → yarn_types, nullable)

### RLS em todas as tabelas novas:
- `company_id = get_user_company_id()` para todas as operações (SELECT, INSERT, UPDATE, DELETE)

---

## ⚠️ Considerações Importantes

1. **NFs canceladas** não contam nos cálculos de saldo
2. **O consumo de fio é automático** — baseado na produção registrada × artigo × tipo de fio
3. **Não há emissão fiscal eletrônica** — é controle interno apenas
4. **FIFO implícito** — o saldo é global por tipo de fio/cliente, sem rastrear NF específica de consumo
5. **Rendimento** — a diferença entre fio recebido e malha produzida mostra a perda natural do processo

---

## 🚀 Fases de Implementação

### Fase 1 — Base
- [ ] Criar tabelas (`yarn_types`, `invoices`, `invoice_items`)
- [ ] Adicionar `yarn_type_id` em `articles`
- [ ] Criar página de NFs com abas (entrada/saída/saldo)
- [ ] Formulário de NF entrada (fio)
- [ ] Formulário de NF saída (malha)
- [ ] Listagem e filtros
- [ ] Integração com sidebar e permissões

### Fase 2 — Saldo e Controle
- [ ] Tela de saldo de fios por cliente
- [ ] Campo "Tipo de Fio" no cadastro de artigos
- [ ] Cálculo automático de consumo via produção

### Fase 3 — Relatórios e Dashboard
- [ ] Aba "Notas Fiscais" em Relatórios
- [ ] Card de saldo de fios no Dashboard
- [ ] Exportação de dados de NF (PDF/CSV)

---

*Documento criado em: 29/03/2026 03:30 UTC*
*Status: PLANEJADO — Aguardando aprovação para implementação*
