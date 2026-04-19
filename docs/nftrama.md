# 📄 NFTRAMA.MD — Especificação Personalizada do Módulo de Notas Fiscais (Trama Têxtil)

> **Status:** 📐 **Referência** — especificações específicas da empresa Trama Certa


> **👤 CLIENTE:** `admin@felipe.com`
> **📅 Criado em:** 08/04/2026
> **📌 Base:** nf.md (v1) com customizações específicas
> **Modelo de negócio:** Facção + Compra Própria de Fio — o cliente envia fio OU a malharia compra fio próprio (Sul Brasil), produz malha e cobra por kg.

---

## 📌 Visão Geral das Mudanças

### Diferenças em relação ao nf.md (v1):

1. **Aba "Saída" reorganizada** — Venda de Fio removida da aba Saída e colocada como aba separada
2. **Nova NF — Entrada (Fio)** — Adicionado toggle "Sul Brasil" (compra própria)
3. **Nova NF — Saída (Malha)** — Adicionado campo "Tinturaria" (destino)
4. **Todos os seletores de listas longas** — Obrigatório usar `SearchableSelect` (com lupa de pesquisa)

---

## 📑 Abas (TabsList)

| # | Aba | Descrição | Mudança vs v1 |
|---|-----|-----------|---------------|
| 1 | **Entrada** | NFs de fio recebido (facção + compra própria) | Toggle "Sul Brasil" no formulário |
| 2 | **Saída Malha** | NFs de malha entregue (com destino tinturaria) | Campo Tinturaria adicionado; Venda de Fio removida |
| 3 | **Venda de Fio** | NFs de venda de fio (aba independente) | **NOVA ABA** — separada da Saída |
| 4 | **Saldo Fios** | Saldo por cliente/fio | Sem mudança |
| 5 | **Saldo Global** | Saldo global por tipo de fio | Sem mudança |
| 6 | **Estoque Malha** | Produção vs entregas por cliente/artigo | Sem mudança |
| 7 | **Fio Terceiros** | Estoque de fio em facções terceirizadas | Sem mudança |
| 8 | **Tipos de Fio** | CRUD de tipos de fio | Sem mudança |

### Tipos de NF:
```typescript
type InvoiceType = 'entrada' | 'saida' | 'venda_fio';
// Não muda no banco — apenas a organização das abas muda
```

---

## 🆕 Mudança 1: Toggle "Sul Brasil" na Entrada (Fio)

### Comportamento:
- **Localização:** No formulário "Nova NF — Entrada (Fio)", acima do campo Cliente/Fornecedor
- **Componente:** Switch/Toggle com label "Sul Brasil"
- **Estado:** `formSulBrasil` (boolean, default: `false`)

### Lógica:
| Sul Brasil | Label do campo | Significado |
|------------|----------------|-------------|
| ❌ Desativado | **Cliente*** | Fio recebido de um cliente (modelo facção normal) |
| ✅ Ativado | **Fornecedor*** | Fio de compra própria (a malharia comprou o fio) |

### Detalhes técnicos:
- O campo continua usando a mesma lista de `clients` como opções (SearchableSelect)
- No banco, `client_id` e `client_name` são preenchidos normalmente
- A distinção "Sul Brasil" pode ser salva no campo `observations` da invoice com prefixo `[SUL BRASIL]` ou em um campo futuro
- O toggle é **visual** — muda apenas o label exibido para o usuário

### Impacto nos cálculos:
- **Saldo de Fios:** NFs de entrada com "Sul Brasil" ativo devem ser contabilizadas separadamente ou com indicador visual
- **Saldo Global:** Entradas "Sul Brasil" somam normalmente no total de compras

---

## 🆕 Mudança 2: Campo "Tinturaria" na Saída (Malha)

### Comportamento:
- **Localização:** No formulário "Nova NF — Saída (Malha)", campo adicional após Cliente
- **Componente:** Input de texto livre
- **Estado:** `formDestinationName` (string)
- **Campo no banco:** `destination_name` na tabela `invoices` (já existe no schema)

### Detalhes:
- Campo **opcional** — pode ficar vazio se a saída for direta ao cliente
- Registra o nome da tinturaria/destino para onde a malha está sendo enviada
- Exibido na tabela de NFs da aba "Saída Malha" como coluna adicional
- Exibido no modal de visualização da NF

### Exemplos de uso:
- "Tinturaria ABC"
- "Tinturaria São Paulo"
- Vazio (entrega direta ao cliente)

---

## 🆕 Mudança 3: Aba "Venda de Fio" Separada

### Antes (v1):
- Venda de Fio estava **dentro** da aba "Saída" junto com Saída de Malha
- O botão "Nova NF" na aba Saída tinha seleção de tipo (Saída Malha / Venda de Fio)

### Depois (Trama):
- **Aba "Venda de Fio"** é independente com seu próprio:
  - Botão "Nova NF — Venda de Fio"
  - KPIs próprios (Total NFs, Peso Total, Valor Total, Pendentes)
  - Filtros próprios (Status, Cliente, Mês, Busca)
  - Tabela própria
- A aba "Saída Malha" exibe **apenas** NFs do tipo `saida`
- A aba "Venda de Fio" exibe **apenas** NFs do tipo `venda_fio`

### Filtro `filteredInvoices` ajustado:
```typescript
// Aba Entrada: type === 'entrada'
// Aba Saída Malha: type === 'saida' (APENAS saida, sem venda_fio)
// Aba Venda de Fio: type === 'venda_fio' (APENAS venda_fio)
```

---

## 🔍 Mudança 4: SearchableSelect Obrigatório em Todas as Listas

### Regra:
Todo seletor que exibe uma lista potencialmente longa **DEVE** usar o componente `SearchableSelect` com lupa de pesquisa integrada.

### Campos afetados:

| Local | Campo | Componente |
|-------|-------|------------|
| Formulário NF (todos os tipos) | Cliente / Fornecedor | `SearchableSelect` |
| Formulário NF Entrada | Tipo de Fio (por item) | `SearchableSelect` |
| Formulário NF Saída | Artigo (por item) | `SearchableSelect` |
| Formulário NF Venda de Fio | Tipo de Fio (por item) | `SearchableSelect` |
| Filtros de todas as abas | Filtro Cliente | `SearchableSelect` |
| Filtros Saldo Fios | Filtro Tipo de Fio | `SearchableSelect` |
| Filtros Saldo Global | Filtro Tipo de Fio | `SearchableSelect` |
| Filtros Estoque Malha | Filtro Artigo | `SearchableSelect` |
| Filtros Fio Terceiros | Filtro Empresa / Fio | `SearchableSelect` |
| Formulário Fio Terceiros | Empresa / Tipo de Fio | `SearchableSelect` |

### Configuração do SearchableSelect:
- Lista abre **obrigatoriamente para baixo** (`side="bottom"`)
- `overscroll-behavior: contain` — scroll não vaza para a página
- Suporte a teclado: setas navegam, Enter confirma
- Largura otimizada para nomes longos (sem truncamento excessivo)

---

## 📝 Formulários Detalhados

### Nova NF — Entrada (Fio)

```
┌─────────────────────────────────────────────┐
│  Nova NF — Entrada (Fio)                    │
├─────────────────────────────────────────────┤
│                                             │
│  [Toggle] Sul Brasil                        │
│                                             │
│  Cliente* / Fornecedor*  [SearchableSelect] │
│  Nº da NF*               [Input numérico]   │
│  Data Emissão*           [Input date]       │
│  Status                  [Select]           │
│  Observações             [Textarea]         │
│                                             │
│  ── Itens ──                                │
│  Tipo de Fio*  [SearchableSelect]           │
│  Quantidade (kg)*  [Input numérico]         │
│  Caixas            [Input numérico]         │
│  Valor/kg          [Input numérico]  *fin   │
│                          [+ Adicionar Item] │
│                                             │
│  Total: R$ X.XXX,XX                         │
│              [Cancelar]  [Salvar]           │
└─────────────────────────────────────────────┘
```

### Nova NF — Saída (Malha)

```
┌─────────────────────────────────────────────┐
│  Nova NF — Saída (Malha)                    │
├─────────────────────────────────────────────┤
│                                             │
│  Cliente*      [SearchableSelect]           │
│  Tinturaria    [Input texto] (opcional)     │
│  Nº da NF*    [Input numérico]              │
│  Data Emissão* [Input date]                 │
│  Status        [Select]                     │
│  Observações   [Textarea]                   │
│                                             │
│  ── Itens ──                                │
│  Artigo*       [SearchableSelect]           │
│  Quantidade (kg)*  [Input numérico]         │
│  Rolos             [Input numérico]         │
│  Valor/kg          [Input numérico]  *fin   │
│                          [+ Adicionar Item] │
│                                             │
│  Total: R$ X.XXX,XX                         │
│              [Cancelar]  [Salvar]           │
└─────────────────────────────────────────────┘
```

### Nova NF — Venda de Fio

```
┌─────────────────────────────────────────────┐
│  Nova NF — Venda de Fio                     │
├─────────────────────────────────────────────┤
│                                             │
│  Cliente*      [SearchableSelect]           │
│  Nº da NF*    [Input numérico]              │
│  Data Emissão* [Input date]                 │
│  Status        [Select]                     │
│  Observações   [Textarea]                   │
│                                             │
│  ── Itens ──                                │
│  Tipo de Fio*  [SearchableSelect]           │
│  Quantidade (kg)*  [Input numérico]         │
│  Caixas            [Input numérico]         │
│  Valor/kg          [Input numérico]  *fin   │
│                          [+ Adicionar Item] │
│                                             │
│  Total: R$ X.XXX,XX                         │
│              [Cancelar]  [Salvar]           │
└─────────────────────────────────────────────┘
```

---

## 📊 Tabela de NFs — Aba "Saída Malha"

| Coluna | Descrição |
|--------|-----------|
| Nº NF | Número da nota fiscal |
| Cliente | Nome do cliente |
| Tinturaria | Nome da tinturaria/destino (se preenchido) |
| Data | Data de emissão |
| Peso (kg) | Peso total |
| Valor | Valor total (se canSeeFinancial) |
| Status | Badge com cor |
| Ações | Ver, Conferir, Cancelar |

---

## 🗄️ Alterações no Banco de Dados

### Tabela `invoices` — campos utilizados:
- `destination_name` (text, nullable) — **já existe no schema** — usado para guardar o nome da tinturaria
- `buyer_name` (text, nullable) — já existe mas NÃO utilizado nesta versão

### Nenhuma migration necessária — os campos já existem.

---

## ⚙️ Estado Adicional (State)

```typescript
// Toggle Sul Brasil (apenas no formulário de entrada)
const [formSulBrasil, setFormSulBrasil] = useState(false);

// Campo Tinturaria (apenas no formulário de saída)
const [formDestinationName, setFormDestinationName] = useState('');
```

---

## 🔄 Impacto nos Cálculos

### Saldo de Fios:
- Sem mudança na lógica de cálculo
- Entradas "Sul Brasil" contam normalmente como recebimento de fio

### Saldo Global:
- Sem mudança

### Estoque de Malha:
- Sem mudança — usa NFs do tipo `saida` normalmente

### Venda de Fio:
- Sem mudança na lógica — apenas separação visual em aba própria

---

## 📋 Checklist de Implementação

- [ ] Separar aba "Venda de Fio" da aba "Saída"
- [ ] Criar TabsTrigger para "Venda de Fio"
- [ ] Criar TabsContent para "Venda de Fio" com KPIs, filtros e tabela próprios
- [ ] Ajustar filteredInvoices para separar `saida` de `venda_fio`
- [ ] Renomear aba "Saída" para "Saída Malha"
- [ ] Adicionar toggle "Sul Brasil" no formulário de Entrada
- [ ] Mudar label "Cliente" → "Fornecedor" quando Sul Brasil ativo
- [ ] Adicionar campo "Tinturaria" no formulário de Saída Malha
- [ ] Salvar `destination_name` na tabela `invoices`
- [ ] Exibir coluna "Tinturaria" na tabela da aba Saída Malha
- [ ] Garantir SearchableSelect em todos os seletores de lista longa
- [ ] Testar todos os fluxos: criar, conferir, cancelar NFs de cada tipo

---

*Documento criado em: 08/04/2026*
*Status: ❌ REVERTIDO — Implementado e revertido em 08/04/2026. A lógica condicional `isTrama` foi removida; todos os usuários usam a v1 (nf.md) uniformemente.*
*Base: nf.md (v1) + customizações Trama Têxtil*
