# 📊 RPCREPORTS.MD — Documentação de RPCs para Relatórios (Reports)

Este documento detalha os cálculos realizados no front-end do módulo de Relatórios (`src/pages/Reports.tsx`). Ao criar RPCs para substituir esses cálculos, **os algoritmos e lógicas devem se manter exatamente os mesmos**, garantindo consistência nos dados.

## 📌 Diretrizes Gerais
- **NÃO MUDAR NADA:** Os cálculos atuais foram validados e devem ser replicados no SQL (PL/pgSQL).
- **Contexto Multi-empresa:** Sempre filtrar por `company_id`.
- **Filtros:** As RPCs devem aceitar os mesmos filtros (Período, Turno, Máquina, Cliente, Artigo).

## 🧮 Lógica de Cálculos por Aba

### 1. KPIs Gerais (Cards Superiores)
- **Total de Rolos:** Soma simples de `rolls_produced`.
- **Total Produzido (kg):** Soma simples de `weight_kg`.
- **Valor Total (Faturamento):** Soma simples de `revenue`.
- **Eficiência Média:** 
  - Fórmula: `SUM(efficiency * weight_kg) / SUM(weight_kg)`
  - *Nota:* Apenas para registros onde `efficiency > 0`. É uma média ponderada pelo peso.

### 2. Por Turno (`byShift`)
- **Agrupamento:** Agrupar por `shift`.
- **Métricas por Turno:**
  - Soma de `rolls_produced`, `weight_kg` e `revenue`.
  - **Eficiência do Turno:** `SUM(efficiency * weight_kg) / SUM(weight_kg)` (ponderada).
  - **% da Produção:** `(Soma Rolos do Turno / Total Geral de Rolos) * 100`.
  - **% do Faturamento:** `(Soma Faturamento do Turno / Total Geral de Faturamento) * 100`.

### 3. Por Máquina (`byMachine`)
- **Agrupamento:** Agrupar por `machine_id` (ou `machine_name` se ID for nulo).
- **Métricas por Máquina:**
  - Soma de `rolls_produced`, `weight_kg` e `revenue`.
  - **Eficiência da Máquina:** `SUM(efficiency * weight_kg) / SUM(weight_kg)` (ponderada).
  - **Participação:** `% de rolos` e `% de faturamento` em relação ao total.

### 4. Por Cliente (`byClient`)
- **Agrupamento:** Agrupar pelo `client_name` associado ao `article_id` (via join com `articles`).
- **Métricas por Cliente:**
  - Soma de `rolls_produced`, `weight_kg` e `revenue`.
  - **Eficiência do Cliente:** `SUM(efficiency * weight_kg) / SUM(weight_kg)` (ponderada).
  - **Participação:** `%` de rolos, kg e faturamento.

### 5. Por Artigo (`byArticle`)
- **Agrupamento:** Agrupar por `article_id` (ou `article_name`).
- **Métricas por Artigo:**
  - Soma de `rolls_produced`, `weight_kg` e `revenue`.
  - **Eficiência do Artigo:** `SUM(efficiency * weight_kg) / SUM(weight_kg)` (ponderada).
  - **Participação:** `%` de kg e faturamento.

### 6. Evolução (Gráfico de Linha/Área)
- **Agrupamento:** Agrupar por `date`.
- **Métricas por Dia:**
  - Soma de `rolls_produced` e `revenue`.
  - Ordenação ascendente por data.

## 🛠️ Sugestão de RPCs a serem criadas
1. `get_report_kpis`: Retorna os 4 valores principais.
2. `get_report_by_shift`: Retorna lista para a aba Turno.
3. `get_report_by_machine`: Retorna lista para a aba Máquina.
4. `get_report_by_client`: Retorna lista para a aba Cliente.
5. `get_report_by_article`: Retorna lista para a aba Artigo.
6. `get_report_evolution`: Retorna dados temporais.

---
*Última atualização: 11/05/2026 09:15 (Brasília)*
