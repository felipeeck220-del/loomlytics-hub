# 📊 Relatórios — Estratégia de Filtros e Exportação

Este documento detalha o funcionamento esperado dos filtros e da aba de exportação para o módulo de Relatórios, servindo como guia imutável para a implementação técnica.

---

## 🔍 Detalhamento dos Filtros (100% Detalhado)

Para garantir a consistência dos dados, os filtros devem operar exatamente sob as seguintes regras:

### 1. Filtros de Período
| Filtro | Comportamento Esperado |
|--------|-----------------------|
| **7 Dias** | Filtra produções dos últimos 7 dias corridos, incluindo hoje. |
| **15 Dias** | Filtra produções dos últimos 15 dias corridos, incluindo hoje. |
| **30 Dias** | Filtra produções dos últimos 30 dias corridos, incluindo hoje. |
| **Todo período** | Remove as restrições de data, exibindo desde o primeiro registro até o último. |
| **Escolher dia** | Filtra exclusivamente o dia selecionado no calendário. |
| **Mês** | Seleciona um mês específico. O intervalo deve ser do dia 1 ao último dia do mês selecionado. |
| **De / Até** | Permite definir um intervalo customizado. Se "De" for preenchido sem "Até", filtra de "De" até hoje. |

### 2. Filtros de Seleção (Combos)
- **Turno:** Filtra por Manhã, Tarde ou Noite. Se "Todos" for selecionado, agrupa os três.
- **Máquina:** Filtra os dados apenas da máquina selecionada. Deve listar todas as máquinas ativas e inativas da empresa.
- **Cliente:** Filtra a produção vinculada aos artigos daquele cliente específico.
- **Artigo:** Filtra a performance de um artigo específico em todas as máquinas onde ele rodou.

---

## 📤 Aba Exportar (Modo e Formato)

A funcionalidade de exportação deve seguir rigorosamente as definições abaixo:

### 1. Configurações de Exportação
- **Modo:**
  - **Admin:** Exportação completa, incluindo valores financeiros (faturamento, valor por kg, etc.).
  - **Equipe:** Exportação operacional, ocultando todos os dados de valores e faturamento, focando apenas em Kg, Peças e Eficiência.
- **Formato:**
  - **PDF:** Relatório estilizado, com cabeçalho da empresa, logotipo e gráficos inclusos.
  - **CSV:** Planilha bruta para manipulação de dados em Excel ou softwares similares.

### 2. Tipos de Exportação

#### **Exportação Geral**
- **Relatório Completo:** Gera um documento consolidando todas as abas (Turno, Máquina, Cliente, Artigo) em um único PDF ou CSV.

#### **Exportação Específica**
- **Por Artigo:** Detalhamento técnico por malha (Rolos, Kg, Valor).
- **Por Máquina:** Performance individual de cada teador (Eficiência, tempo parado, produção).
- **Por Turno:** Análise comparativa de produtividade entre Manhã, Tarde e Noite.
- **Por Cliente:** Consolidado de tudo que foi produzido para um cliente específico no período.

---

## 📈 Gráficos na Exportação
- Deve haver um switch **"Incluir gráficos"**. Se ativado, o PDF deve renderizar os gráficos de tendência e distribuição idênticos aos visualizados na tela.

---

*Documento de referência para implementação de relatórios — Não alterar sem aprovação.*
