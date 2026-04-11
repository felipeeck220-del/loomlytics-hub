# ⚠️ Falhas (Tecelões > Aba Falhas) — Documentação Completa

> Aba de análise de falhas/defeitos por tecelão (`src/pages/Weavers.tsx` — componente `WeaverDefectsTab`)

---

## 📌 Visão Geral

A aba **Falhas** dentro do módulo Tecelões oferece análise detalhada de defeitos por tecelão, com filtros, KPIs, ranking, relatório individual e exportação.

- **Rota:** `/:slug/weavers` → aba "Falhas"
- **Acesso:** `admin`, `lider`
- **Dados:** `defect_records` (via `useSharedCompanyData`)

---

## 🔍 Filtros

| Controle | Tipo | Default | Comportamento |
|----------|------|---------|---------------|
| Mês | Select | Mês atual | Filtra `defect_records` por `date.startsWith(yyyy-MM)` |
| Todo período | Botão | — | Remove filtro de mês, mostra todos os registros |

### Meses disponíveis
- Extraídos dos `defect_records`: `date.substring(0, 7)`
- Sempre inclui mês atual
- Ordenados do mais recente para o mais antigo
- Formato exibido: "abril 2026" (ptBR locale)

---

## 📊 KPI Cards (4 cards)

| Card | Ícone | Cálculo |
|------|-------|---------|
| Total de Falhas | AlertTriangle (destructive) | `filtered.length` |
| Total em Kg | Scale | `sum(measure_value) where measure_type = 'kg'` |
| Total em Metros | Ruler | `sum(measure_value) where measure_type = 'metro'` |
| Tecelões com Falhas | Users | Quantidade de `weaver_id` distintos nos registros filtrados |

---

## 🏆 Ranking de Tecelões

- Lista ordenada por quantidade de falhas (DESC)
- Cada linha exibe: `Código — Nome` + total de falhas + kg + metros
- Clicável → abre modal de relatório individual do tecelão
- Badge de cor por gravidade:
  - 🟢 Verde: ≤ 3 falhas
  - 🟡 Amarelo: 4-7 falhas
  - 🔴 Vermelho: ≥ 8 falhas

---

## 📋 Modal de Relatório Individual

Ao clicar em um tecelão no ranking, abre modal com:

### KPIs individuais (3 cards)
- Total de falhas
- Total Kg
- Total Metros

### Agrupamentos (3 seções colapsáveis)
1. **Por Artigo** — agrupa falhas do tecelão por `article_name`, mostra contagem + kg + metros
2. **Por Máquina** — agrupa por `machine_name`, mostra contagem + kg + metros
3. **Por Defeito** — extrai tipo de defeito do prefixo `[NomeDefeito]` das `observations`, agrupa e conta

### Tabela detalhada
- Todas as falhas do tecelão no período filtrado
- Colunas: Data, Turno, Máquina, Artigo, Defeito, Medida, Observações

---

## 📤 Exportação

### PDF Geral
- Botão "Exportar PDF" no topo
- Conteúdo: KPIs gerais + ranking completo com métricas de cada tecelão
- Cabeçalho com logo + nome da empresa + período
- Padrão visual dos Relatórios (`Reports.tsx`)

### PDF Individual (dentro do modal)
- Botão "Exportar PDF" no modal do tecelão
- Conteúdo: KPIs individuais + agrupamentos + tabela detalhada
- Mesmo padrão visual

---

## 🔗 Dependências

| Hook | Uso |
|------|-----|
| `useSharedCompanyData()` | weavers, defectRecords, articles, machines |
| `useAuth()` | company_id (para buscar logo no PDF) |

### Bibliotecas
- `date-fns` + `ptBR` — formatação de meses
- `jsPDF` — exportação PDF
- `@/lib/pdfUtils` — sanitizePdfText
- `@/lib/formatters` — formatNumber, formatWeight

---

## 📝 Padrões

- Filtro de mês padrão: mês atual (ao abrir a aba)
- Artigos exibidos com padrão `NomeArtigo (NomeCliente)` nos agrupamentos
- Tecelões exibidos como `Nome #Código`

---

*Última atualização: 11/04/2026*
