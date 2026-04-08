# 📄 NFv2.MD — Evolução do Módulo de Notas Fiscais (Opção A)

> **⚠️ INSTRUÇÕES:**
> Este documento descreve as mudanças planejadas sobre o estado atual documentado em `nf.md`.
> Se esta v2 falhar, reverter ao estado descrito em `nf.md` (snapshot de 08/04/2026).
> **Base**: `nf.md` = estado atual. **Este arquivo** = apenas as mudanças.

---

## 📌 Resumo das Mudanças

### 1. Venda de Fio — Adicionar campo "Cliente Comprador"
### 2. Novo tipo de NF: `saida_malha` — Saída de malha para tinturaria
### 3. Estoque de Malha — Ajustar cálculo para usar `saida_malha`

---

## 🔧 Mudança 1: Campo "Cliente Comprador" na Venda de Fio

### Problema atual:
A Venda de Fio (`venda_fio`) registra apenas o cliente **dono do fio** (quem enviou), mas NÃO registra **para quem o fio foi vendido**. Na planilha do usuário (2.png), ele anota o "cliente" que comprou o fio (ex: JR DUBLAGEM, GIANESINI, LINI, IDZ).

### Solução:

#### Alteração no banco — tabela `invoices`:
```sql
ALTER TABLE public.invoices ADD COLUMN buyer_name text DEFAULT NULL;
```

| Campo novo | Tipo | Nullable | Descrição |
|------------|------|----------|-----------|
| buyer_name | text | Yes | Nome do comprador (apenas para venda_fio) |

> **Nota**: Usamos `buyer_name` (texto livre) em vez de FK para cliente, pois o comprador pode não ser um cliente cadastrado da facção. É um campo desnormalizado para simplicidade.

#### Alteração no formulário de NF (Dialog):
- Quando `formType === 'venda_fio'`, exibir campo adicional:
  ```
  Label: "Comprador / Cliente da Venda *"
  Input: texto livre
  Placeholder: "Ex: JR DUBLAGEM"
  ```
- O campo é **obrigatório** para venda de fio
- Salvar em `invoices.buyer_name`

#### Alteração na tabela de listagem (aba Saída):
- Adicionar coluna "Comprador" após "Cliente" (apenas para NFs tipo `venda_fio`)
- Exibir `buyer_name` quando disponível

#### Alteração no Dialog de visualização:
- Mostrar "Comprador: {buyer_name}" quando tipo = venda_fio

#### Campos da planilha 2.png mapeados:
| Planilha | Sistema |
|----------|---------|
| data | issue_date |
| cliente | **buyer_name** (NOVO) |
| quant. | weight_kg (invoice_items) |
| caixas | quantity_boxes (invoice_items) — JÁ EXISTE |
| fio | yarn_type_id (invoice_items) |
| marca do fio | yarn_type → name ou composition (já coberto pelo cadastro de fio) |
| situação | status |

---

## 🆕 Mudança 2: Novo tipo `saida_malha` — Saída de Malha para Tinturaria

### Problema atual:
O tipo `saida` existe mas é genérico — representa "malha entregue ao cliente". Na realidade (planilha 3.png), a malha sai faturada direto para a **tinturaria**, não para o cliente. Os campos são: Data, Tinturaria, Artigo, Nº NFe, Peso, Terceiros.

### Solução:

#### Novo tipo de NF:
```typescript
type InvoiceType = 'entrada' | 'saida' | 'venda_fio' | 'saida_malha';
```

#### Labels atualizados:
```typescript
const TYPE_LABELS = {
  entrada: 'Entrada (Fio)',
  saida: 'Saída (Malha)',        // mantém (genérico, para outros usuários)
  venda_fio: 'Venda de Fio',
  saida_malha: 'Saída Malha (Tinturaria)',  // NOVO
};
```

#### Alteração no banco — tabela `invoices`:
```sql
ALTER TABLE public.invoices ADD COLUMN destination_name text DEFAULT NULL;
```

| Campo novo | Tipo | Nullable | Descrição |
|------------|------|----------|-----------|
| destination_name | text | Yes | Nome do destino (tinturaria) para saida_malha |

> **Nota**: Texto livre para o nome da tinturaria. Não é FK para manter simplicidade e flexibilidade.

#### Campos da planilha 3.png mapeados:
| Planilha | Sistema |
|----------|---------|
| DATA | issue_date |
| TINTURARIA | **destination_name** (NOVO) |
| ARTIGO | article_id + article_name (invoice_items) |
| Nº Nfe | invoice_number |
| PESO | weight_kg (invoice_items) |
| TERCEIROS | observations (texto livre) |

#### Alteração nas Abas:
A aba **"Saída"** passa a incluir 3 tipos:
- `saida` (Malha para cliente)
- `venda_fio` (Venda de fio)
- `saida_malha` (Malha para tinturaria) — **NOVO**

Na aba Saída, adicionar botão:
```tsx
<Button onClick={() => openNewInvoice('saida_malha')} size="sm" variant="outline" className="gap-1.5">
  <Plus className="h-4 w-4" /> Saída Malha (Tinturaria)
</Button>
```

#### Formulário para `saida_malha`:
1. **Cliente*** — Select (cliente dono do artigo)
2. **Tinturaria*** — Input texto livre (destination_name)
3. **Nº da NF*** — Input
4. **Data Emissão*** — Input date
5. **Status** — Select (pendente/conferida)
6. **Itens:**
   - Artigo (filtrado pelo cliente selecionado)
   - Peso (kg)
   - *(sem rolos, sem valor/kg — é faturamento direto)*
7. **Observações** — Textarea (campo "Terceiros" da planilha)

#### Filtro na aba Saída:
```typescript
if (activeTab === 'saida') filtered = filtered.filter(i => i.type === 'saida' || i.type === 'venda_fio' || i.type === 'saida_malha');
```

#### Na tabela de listagem:
- Coluna "Destino" exibida para `saida_malha` mostrando `destination_name`
- Badge de tipo atualizado para incluir `saida_malha`

---

## 📊 Mudança 3: Estoque de Malha — Ajustar para usar `saida_malha`

### Lógica atual:
```
Estoque = Produção - NFs saida (malha entregue ao cliente)
```

### Nova lógica:
```
Estoque = Produção - NFs saida (entregue ao cliente) - NFs saida_malha (entregue à tinturaria)
```

#### Alteração no `malhaEstoque` (useMemo):
```typescript
// Linha 761 atual:
const saidaInvs = invoices.filter(i => i.type === 'saida' && i.status !== 'cancelada' && matchMonth(i.issue_date));

// Nova:
const saidaInvs = invoices.filter(i => (i.type === 'saida' || i.type === 'saida_malha') && i.status !== 'cancelada' && matchMonth(i.issue_date));
```

#### Na tabela de Estoque de Malha:
Renomear colunas para clareza:
- "Entregue kg" → "Saída kg" (inclui entregas ao cliente + tinturaria)
- "Entregue Rolos" → "Saída Rolos"

---

## 🗄️ Resumo das Alterações no Banco

### Migração SQL:
```sql
-- Adicionar campo comprador para venda de fio
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS buyer_name text DEFAULT NULL;

-- Adicionar campo destino para saída de malha (tinturaria)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS destination_name text DEFAULT NULL;
```

### Nenhuma tabela nova.
### Nenhuma alteração em RLS (campos são opcionais na mesma tabela).

---

## 📱 Alterações na Interface

### Formulário NF (Dialog):
| Condição | Campo novo |
|----------|------------|
| `formType === 'venda_fio'` | Input "Comprador" (obrigatório) |
| `formType === 'saida_malha'` | Input "Tinturaria" (obrigatório) |

### State novo necessário:
```typescript
const [formBuyerName, setFormBuyerName] = useState('');        // venda_fio
const [formDestinationName, setFormDestinationName] = useState(''); // saida_malha
```

### resetForm atualizado:
```typescript
const resetForm = () => {
  // ... existentes ...
  setFormBuyerName('');
  setFormDestinationName('');
};
```

### handleSaveInvoice atualizado:
```typescript
// Validações adicionais:
if (formType === 'venda_fio' && !formBuyerName.trim()) {
  toast({ title: 'Informe o comprador', variant: 'destructive' }); return;
}
if (formType === 'saida_malha' && !formDestinationName.trim()) {
  toast({ title: 'Informe a tinturaria de destino', variant: 'destructive' }); return;
}

// No insert:
buyer_name: formType === 'venda_fio' ? formBuyerName.trim() : null,
destination_name: formType === 'saida_malha' ? formDestinationName.trim() : null,
```

### Listagem (tabela Saída):
- Coluna extra condicional:
  - Se `inv.type === 'venda_fio'`: mostrar `inv.buyer_name` como "Comprador"
  - Se `inv.type === 'saida_malha'`: mostrar `inv.destination_name` como "Destino"

### Dialog de visualização:
- Adicionar linhas condicionais:
  - "Comprador: {viewingInvoice.buyer_name}" se venda_fio
  - "Tinturaria: {viewingInvoice.destination_name}" se saida_malha

---

## 🔐 Permissões

Sem alteração — mesmas regras do `nf.md`.

---

## 📈 Impacto em Outros Módulos

### Fechamento Mensal:
- Saídas de malha para tinturaria (`saida_malha`) devem ser contabilizadas junto com saídas normais
- Produção - (saida + saida_malha) = Estoque de Malha

### Saldo de Fios:
- Sem impacto — `saida_malha` não consome fio, apenas registra a saída da malha pronta

### Saldo Global:
- Sem impacto

### Dashboard:
- Se houver card de Estoque de Malha, incluir `saida_malha` na dedução

---

## 🚀 Ordem de Implementação

### Passo 1 — Migração SQL
- Adicionar `buyer_name` e `destination_name` na tabela `invoices`

### Passo 2 — Atualizar TypeScript
- Adicionar `saida_malha` ao tipo `InvoiceType`
- Adicionar labels e cores
- Adicionar interface fields (buyer_name, destination_name)

### Passo 3 — Formulário
- Novo state: formBuyerName, formDestinationName
- Campo "Comprador" condicional para venda_fio
- Campo "Tinturaria" condicional para saida_malha
- Validações e salvamento

### Passo 4 — Listagem
- Botão "Saída Malha (Tinturaria)" na aba Saída
- Coluna condicional Comprador/Destino
- Filtro para incluir saida_malha

### Passo 5 — Estoque de Malha
- Incluir `saida_malha` no cálculo de entregas

### Passo 6 — Testes
- Criar NF saida_malha e verificar estoque
- Criar NF venda_fio com comprador e verificar listagem
- Verificar saldo de fios não é afetado por saida_malha

---

## ⚠️ Riscos e Rollback

### Se der errado:
1. Reverter código de `src/pages/Invoices.tsx` ao estado documentado em `nf.md`
2. As colunas `buyer_name` e `destination_name` podem permanecer no banco (são nullable, não quebram nada)
3. NFs do tipo `saida_malha` já criadas: alterar type para `saida` via SQL se necessário

### Riscos:
- **Baixo**: campos novos são nullable e opcionais
- **Baixo**: novo tipo `saida_malha` não interfere nos existentes
- **Médio**: cálculo de Estoque de Malha precisa incluir ambos os tipos

---

*Documento criado em: 08/04/2026*
*Base: nf.md (snapshot v1 de 08/04/2026)*
*Status: PLANEJADO — Aguardando aprovação para implementação*
