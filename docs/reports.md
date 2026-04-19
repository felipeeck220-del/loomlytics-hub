# 📊 Reports.tsx — Detalhamento Técnico

> **Status:** ✅ **Em Produção**
>
> Documento técnico do arquivo `src/pages/Reports.tsx`. Para visão funcional dos relatórios, ver [`relatorios.md`](./relatorios.md).

---

## 📌 Visão Geral

`Reports.tsx` é a página `/:slug/reports` — concentra os **relatórios analíticos** de produção da empresa, com filtros, KPIs, gráficos e exportação PDF.

É o **arquivo de referência** para o padrão de exportação PDF do projeto (regra global do `mestre.md`): toda nova exportação deve seguir o cabeçalho desenhado em `Reports.tsx > doExport() > addHeader()`.

---

## 🧱 Estrutura

| Bloco | Função |
|-------|--------|
| **Filtros** | Período (mês ou intervalo De/Até), máquina, tecelão, artigo, turno |
| **KPIs** | Rolos, Peso (kg), Faturamento, Eficiência média (todos respeitam os filtros) |
| **Gráficos** | Gráfico por data, por máquina, por turno, por tecelão (recharts) |
| **Tabelas** | Por turno, por máquina, por tecelão — todas com totais |
| **Exportação PDF** | `jsPDF` + `autoTable` — landscape, cabeçalho padrão global, tabelas e gráficos |

---

## 🔑 Regras importantes

1. **Eficiência média exclui produções com 0 rolos** — regra global aplicada em todo o projeto. Filtra `prods.filter(p => p.rolls_produced > 0)` antes do cálculo.
2. **Filtros sem valor** — opção "Todas as máquinas / Todos os artigos" envia `"all"` no select; o filtro deve ignorar quando `value === "all"`.
3. **Comparativos:** filtros por mês comparam com mês anterior completo; filtros por dia específico comparam com **D-1**.
4. **`maybeSingle()`** em vez de `single()` em queries auxiliares (assinatura, perfil) para evitar erros quando não há registro.

---

## 📄 Exportação PDF — Referência global

O `addHeader()` é o **padrão obrigatório** para todo PDF do projeto:

| Elemento | Estilo |
|----------|--------|
| Fundo do cabeçalho | Retângulo cinza claro `[249, 250, 251]` com borda `[229, 231, 235]`, altura 25mm |
| Lado esquerdo | Logo (max 24×14mm) **OU** nome da empresa (bold 10pt) + data/hora (normal 8pt) |
| Centro | Título do relatório (bold 14pt) |
| Lado direito | Período do filtro ativo (normal 8pt, alinhado à direita embaixo) |
| Tabelas | `headStyles: { fillColor: [60, 60, 60] }`, fontSize 8 |
| Margens | 15mm |
| Sanitização | Todo texto dinâmico passa por `sanitizePdfText()` (`src/lib/pdfUtils.ts`) |

---

## 🔗 Dependências

- **Hook:** `useCompanyData` (productions, machines, weavers, articles, clients)
- **Lib:** `jspdf`, `jspdf-autotable`, `recharts`, `date-fns`, `formatters.ts`, `pdfUtils.ts`
- **Padrão visual:** seguido também por `Outsource.tsx`, `Fechamento.tsx`, `ResidueSales.tsx`

---

## 🐛 Bugs históricos resolvidos

- ✅ `setFont` duplicado no header do PDF
- ✅ Coluna "Eficiência (%)" faltando na tabela "Por Turno" do PDF
- ✅ Label "rolos" no gráfico por turno (corrigido para "Peças")
- ✅ Eficiência sem `%` no PDF (ex: "34,5" → "34,5%")
- ✅ `single()` substituído por `maybeSingle()` em consulta de empresa

---

*Para regras de exportação PDF completas, consultar `mestre.md > Padrão de Exportação PDF (Regra Global)`.*
