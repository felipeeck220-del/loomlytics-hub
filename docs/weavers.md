# 👥 Weavers.tsx — Módulo Tecelões

> **Status:** ✅ **Em Produção**
>
> Documento técnico do arquivo `src/pages/Weavers.tsx`. Para a aba "Falhas" especificamente, ver [`falhas.md`](./falhas.md). Para o cadastro funcional, ver [`teceloes.md`](./teceloes.md).

---

## 📌 Visão Geral

`Weavers.tsx` é a página `/:slug/weavers` — gestão completa de tecelões com cadastro, ranking, métricas individuais, histórico de produção e análise de falhas.

---

## 🧱 Estrutura em abas

| Aba | Conteúdo |
|-----|----------|
| **Tecelões** | Lista, cadastro, edição, exclusão (modal Excluir/Cancelar — sem digitar "EXCLUIR") |
| **Performance** | Ranking de produção/eficiência por tecelão, com filtros de período |
| **Falhas** | Análise de defeitos por tecelão (ver [`falhas.md`](./falhas.md)) |
| **Relatórios** | Exportação PDF individual por tecelão |

---

## 📊 Cards de resumo (topo da página)

5 cards executivos:

1. **Total** — quantidade total de tecelões cadastrados
2. **Carga Horária** — soma de horas semanais de todos
3. **Manhã** — tecelões do turno manhã
4. **Tarde** — tecelões do turno tarde
5. **Noite** — tecelões do turno noite

> Cards "Turno Fixo" foi removido. Substituído pela divisão por turno (Manhã/Tarde/Noite).

---

## 🏷️ Padrão de exibição

- **Listagem e seletores:** `Nome - Turno` (ex: "João - Manhã")
- **Tabelas com autoria:** `Nome #Código` (ex: "João #12")
- **Códigos:** únicos no formato #100-#999 (não-admin)

---

## 🎨 Badges de quantidade de falhas (aba Falhas)

| Cor | Faixa |
|-----|-------|
| 🟢 Verde | ≤ 3 falhas no período |
| 🟡 Amarelo | 4 a 7 falhas |
| 🔴 Vermelho | ≥ 8 falhas |

---

## 🔑 Regras importantes

1. **Eficiência média exclui produções com 0 rolos** (regra global). Filtra antes de calcular `avgEfficiency`.
2. **Cadastro rápido inline:** O modal de Produção tem botão `+` ao lado do seletor de tecelão que abre `QuickAddWeaver` sem fechar o registro principal.
3. **Auditoria obrigatória:** Toda criação/edição/exclusão registra `weaver_create / update / delete` em `audit_logs`.
4. **Listagem mostra autoria:** abaixo de cada registro de defeito, exibe `Nome #ID` de quem registrou (regra global de listagens com `created_by`).

---

## 📄 Exportação PDF

- **Ranking geral:** PDF com todos os tecelões + métricas (Falhas, Kg, Metros)
- **Individual:** PDF detalhado de um tecelão específico — KPIs, agrupamentos por Artigo (`Nome (Cliente)`), Máquina e Defeito + tabela detalhada
- Segue padrão global de exportação PDF (cabeçalho cinza, sanitização via `sanitizePdfText()`)

---

## 🔗 Dependências

- **Hook:** `useCompanyData` (weavers, productions, defect_records, machines, articles, clients)
- **Componentes:** `QuickAddWeaver`, `SearchableSelect`, `DeleteConfirmDialog`, `AuditHistoryModal`
- **Lib:** `jspdf`, `jspdf-autotable`, `pdfUtils.sanitizePdfText`

---

## 🐛 Bugs históricos resolvidos

- ✅ `created_by_name/code` não eram lidos pelo `mapDefectRecord` — coluna "Registrado por" mostrava "—"
- ✅ Modal de exclusão exigia digitar "EXCLUIR" — substituído por confirmação simples
- ✅ Eficiência média incluía produções com 0 rolos (distorcia métrica)
- ✅ Tecelão na coluna de Falhas exibia só nome — agora `Nome #Código`

---

*Para o sistema de auditoria completo, ver [`auditoria.md`](./auditoria.md).*
