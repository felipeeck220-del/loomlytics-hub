# 📄 NUVEMFISCAL.MD — Integração Nuvem Fiscal para Consulta de NF-e

> **Status:** 📋 **Planejado** — integração Nuvem Fiscal para consulta automática de NF-e (sem código no projeto ainda)


> **Objetivo:** Usar a API da Nuvem Fiscal para consultar dados de NF-e pela Chave de Acesso (44 dígitos) e preencher automaticamente o formulário "Nova NF — Entrada (Fio)" no módulo de Notas Fiscais.

---

## 📌 Visão Geral da Integração

### O que é a Nuvem Fiscal?
API SaaS brasileira para automação fiscal. Oferece emissão, consulta e distribuição de documentos fiscais (NF-e, NFS-e, CT-e, etc.) via REST API com autenticação OAuth 2.0.

### Qual endpoint usar?
**Distribuição NF-e** (`POST /distribuicao/nfe`) com `tipo_consulta: "cons-chave"`.

> ⚠️ **Limitação importante:** A consulta por chave de acesso via Distribuição NF-e **só funciona para notas onde o CNPJ cadastrado é o destinatário** (ou seja, notas recebidas). Isso é perfeito para o MalhaGest, pois no modelo de facção a malharia **recebe** NFs de entrada de fio dos clientes.

### Plano e custos
- **Plano gratuito:** ~50 requisições/mês (suficiente para testes e uso leve)
- **Planos pagos:** A partir de R$ 49/mês com volume maior
- Detalhes: https://nuvemfiscal.com.br/precos

---

## 🔐 Autenticação

### Fluxo OAuth 2.0 (client_credentials)

```
POST https://auth.nuvemfiscal.com.br/oauth/token
Content-Type: application/x-www-form-urlencoded

client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&grant_type=client_credentials&scope=empresa%20distribuicao-nfe
```

**Resposta:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1Q...",
  "token_type": "bearer",
  "scope": "empresa distribuicao-nfe",
  "expires_in": 3600
}
```

### Secrets necessários no projeto
| Secret | Descrição |
|--------|-----------|
| `NUVEMFISCAL_CLIENT_ID` | Client ID da conta Nuvem Fiscal |
| `NUVEMFISCAL_CLIENT_SECRET` | Client Secret da conta Nuvem Fiscal |

---

## 🏢 Pré-requisitos por Empresa

Cada empresa (CNPJ) que quiser consultar NF-e precisa:

1. **Estar cadastrada na Nuvem Fiscal** via `POST /empresas`
2. **Ter certificado digital A1 (.pfx)** cadastrado via `PUT /empresas/{cpf_cnpj}/certificado`
3. **Ter configuração de Distribuição NF-e** habilitada

> 💡 **Para o MVP**, o cadastro de empresa e certificado será feito manualmente no console da Nuvem Fiscal. Futuramente, pode ser automatizado via API.

---

## 📡 Fluxo de Consulta (Passo a Passo)

### 1. Usuário escaneia/digita a Chave de Acesso (44 dígitos)

O campo "Chave de Acesso SEFAZ" já existe no formulário de Nova NF com:
- Validação de 44 dígitos numéricos
- Detecção automática de scanner USB (HID)

### 2. Frontend dispara consulta ao Edge Function

```typescript
// No formulário de Nova NF, ao completar 44 dígitos válidos:
const { data, error } = await supabase.functions.invoke('consultar-nfe', {
  body: { chave_acesso: '33250560409075024507550010012202071054770684' }
});
```

### 3. Edge Function `consultar-nfe`

```
POST /consultar-nfe
Authorization: Bearer <user_jwt>
Body: { "chave_acesso": "44_digitos" }
```

**Fluxo interno da Edge Function:**

```
1. Validar JWT do usuário (getClaims)
2. Resolver company_id → buscar CNPJ da empresa (tabela companies ou nova coluna)
3. Obter token OAuth da Nuvem Fiscal (cache se possível)
4. POST https://api.nuvemfiscal.com.br/distribuicao/nfe
   Body: {
     "cpf_cnpj": "<CNPJ_DA_EMPRESA>",
     "ambiente": "producao",
     "tipo_consulta": "cons-chave",
     "cons_chave": "<CHAVE_44_DIGITOS>"
   }
5. Aguardar processamento (status pode ser "processando")
6. GET https://api.nuvemfiscal.com.br/distribuicao/nfe/{id}
   → Verificar status até "concluido"
7. GET https://api.nuvemfiscal.com.br/distribuicao/nfe/documentos?distribuicao_id={id}
   → Obter documento(s) retornado(s)
8. GET https://api.nuvemfiscal.com.br/distribuicao/nfe/documentos/{doc_id}/xml
   → Baixar XML completo da NF-e
9. Parsear XML e retornar dados estruturados ao frontend
```

### 4. Dados extraídos do XML da NF-e

O XML da NF-e (schema `nfeProc > NFe > infNFe`) contém:

| Campo XML | Campo no Formulário | Mapeamento |
|-----------|---------------------|------------|
| `ide > nNF` | Nº da NF | `formInvoiceNumber` |
| `ide > dhEmi` | Data Emissão | `formIssueDate` (formato yyyy-MM-dd) |
| `emit > xNome` | Cliente (emitente) | Buscar por nome em `clients` |
| `emit > CNPJ` | — | Auxiliar para match de cliente |
| `det > prod > xProd` | Tipo de Fio (nome) | Match em `yarn_types` |
| `det > prod > qCom` | Quantidade (kg) | `formItems[].weight_kg` |
| `det > prod > vUnCom` | Valor/kg | `formItems[].value_per_kg` |
| `det > prod > vProd` | Subtotal | `formItems[].subtotal` |
| `total > ICMSTot > vNF` | Valor Total NF | Soma automática |
| `infProt > chNFe` | Chave de Acesso | Já preenchida |

### 5. Frontend recebe e preenche o formulário

```typescript
// Resposta da Edge Function:
interface NfeConsultaResult {
  success: boolean;
  data?: {
    numero_nf: string;
    data_emissao: string;        // yyyy-MM-dd
    emitente_cnpj: string;
    emitente_nome: string;
    valor_total: number;
    chave_acesso: string;
    itens: Array<{
      descricao: string;         // nome do produto/fio
      quantidade_kg: number;
      valor_unitario: number;
      valor_total: number;
      ncm: string;
      unidade: string;
    }>;
  };
  error?: string;
}
```

O formulário:
1. Auto-preenche `formInvoiceNumber` com o nº da NF
2. Auto-preenche `formIssueDate` com a data de emissão
3. Tenta fazer match do emitente com a lista de `clients` (por nome ou CNPJ futuro)
4. Para cada item da NF, tenta fazer match com `yarn_types` pelo nome
5. Preenche `weight_kg` e `value_per_kg` de cada item
6. Exibe indicador visual de dados preenchidos automaticamente
7. **Usuário pode editar/corrigir** qualquer campo antes de salvar

---

## 🗂️ Arquitetura dos Arquivos

```
supabase/functions/consultar-nfe/index.ts    # Edge Function principal
src/pages/Invoices.tsx                        # Formulário (já existente — adicionar botão de consulta)
```

### Edge Function: `consultar-nfe/index.ts`

**Responsabilidades:**
- Autenticação do usuário (JWT)
- Resolução do CNPJ da empresa
- OAuth 2.0 com Nuvem Fiscal (obter access_token)
- Chamada à API de Distribuição NF-e
- Polling do status até conclusão
- Download e parse do XML
- Retorno dos dados estruturados

**Dependências Deno:**
- Nenhuma externa necessária (fetch nativo + DOMParser ou regex para XML)

---

## 🎨 Alterações no Frontend (Invoices.tsx)

### Novo botão no formulário de NF Entrada:

Ao lado do campo "Chave de Acesso SEFAZ", adicionar um botão **"Consultar NF-e"** que:
1. Só aparece quando a chave tem 44 dígitos válidos
2. Mostra loading spinner durante consulta
3. Ao retornar, preenche automaticamente os campos
4. Exibe toast de sucesso/erro
5. Campos preenchidos ganham borda/ícone visual indicando "auto-preenchido"

### Fluxo visual:

```
[Campo Chave de Acesso: _________________________________ ] [🔍 Consultar NF-e]
                                                              ↓ (loading...)
[✓ Dados carregados! Nº NF, Data, Cliente e 3 itens preenchidos automaticamente]
```

### Comportamento quando a consulta falha:
- Toast de erro com mensagem clara
- Formulário continua editável manualmente (não bloqueia)
- Motivos comuns: CNPJ não é destinatário, certificado expirado, nota não encontrada

---

## ⚠️ Limitações e Considerações

1. **Só funciona para notas recebidas** (empresa é destinatária)
2. **Requer certificado digital A1** cadastrado na Nuvem Fiscal
3. **Limite de requisições** no plano gratuito (~50/mês)
4. **Tempo de resposta**: A SEFAZ pode demorar alguns segundos para retornar
5. **Polling necessário**: A distribuição é assíncrona (status: processando → concluido)
6. **CNPJ da empresa**: Precisamos armazenar o CNPJ de cada empresa no sistema
7. **Cache de token**: O access_token da Nuvem Fiscal dura 1h — ideal cachear

---

## 📋 Checklist de Implementação

### Fase 1 — Infraestrutura
- [ ] Adicionar coluna `cnpj` na tabela `companies` (migration)
- [ ] Configurar secrets: `NUVEMFISCAL_CLIENT_ID` e `NUVEMFISCAL_CLIENT_SECRET`
- [ ] Criar Edge Function `consultar-nfe`
- [ ] Cadastrar empresa + certificado na Nuvem Fiscal (manual pelo cliente)

### Fase 2 — Edge Function
- [ ] Implementar autenticação OAuth 2.0
- [ ] Implementar consulta por chave (`cons-chave`)
- [ ] Implementar polling de status
- [ ] Implementar download e parse de XML
- [ ] Retornar dados estruturados

### Fase 3 — Frontend
- [ ] Adicionar botão "Consultar NF-e" no formulário
- [ ] Implementar chamada à Edge Function
- [ ] Auto-preencher campos do formulário com dados retornados
- [ ] Match automático de cliente e tipos de fio
- [ ] Indicadores visuais de auto-preenchimento
- [ ] Toast de sucesso/erro
- [ ] Tratamento de estados: loading, erro, sem dados

### Fase 4 — Configuração por Empresa
- [ ] Tela em Configurações para inserir CNPJ da empresa
- [ ] Instruções para o cliente cadastrar empresa + certificado na Nuvem Fiscal
- [ ] Validação se a empresa está pronta para consultas

---

## 🔗 Referências

- [Documentação API Nuvem Fiscal](https://dev.nuvemfiscal.com.br/docs/api/)
- [Autenticação OAuth 2.0](https://dev.nuvemfiscal.com.br/docs/autenticacao)
- [Distribuição NF-e](https://dev.nuvemfiscal.com.br/docs/distribuicao-nfe/)
- [Endpoint POST /distribuicao/nfe](https://dev.nuvemfiscal.com.br/docs/api/#tag/Distribuicao-NF-e/operation/GerarDistribuicaoNfe)
- [Endpoint GET /distribuicao/nfe/documentos](https://dev.nuvemfiscal.com.br/docs/api/#tag/Distribuicao-NF-e/operation/ListarDocumentosDistribuicaoNfe)
- [Cadastro de empresas](https://dev.nuvemfiscal.com.br/docs/empresas)
- [Estado atual do módulo NF](docs/nf.md)

---

*Documento criado em: 10/04/2026*
*Status: 📝 PLANEJADO — Aguardando aprovação para implementação*
