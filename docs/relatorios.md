# 📈 Relatórios — Documentação Completa

> Módulo de relatórios analíticos (`src/pages/Reports.tsx` — ~1603 linhas)

---

## 📌 Visão Geral

O módulo **Relatórios** oferece análises detalhadas de produção com múltiplas perspectivas, gráficos interativos e exportação PDF/CSV.

- **Rota:** `/:slug/reports`
- **Acesso:** Apenas `admin`
- **Arquivo:** `src/pages/Reports.tsx`

---

## 📊 Abas de Análise

| Aba | Key | Gráfico | Descrição |
|-----|-----|---------|-----------|
| Por Turno | `turno` | BarChart | Rolos, kg, faturamento por turno |
| Por Máquina | `maquina` | BarChart horizontal | Eficiência com barra de progresso vs meta |
| Por Artigo | `artigo` | BarChart | Produção por artigo com cliente |
| Por Tecelão | `tecelao` | BarChart | Produção individual por tecelão |
| Por Cliente | `cliente` | PieChart | Distribuição por cliente |
| Tendência | `tendencia` | AreaChart | Evolução temporal (rolos, kg, faturamento, eficiência) |
| Comparativo | `comparativo` | — | Comparação entre períodos |

---

## 🔍 Filtros

### Filtros de Data (mesma lógica do Dashboard)
| Controle | Tipo | Comportamento |
|----------|------|---------------|
| 7/15/30 dias | Button | setDayRange(N) |
| Todo período | Button | setDayRange(0) |
| Dia específico | Calendar | setCustomDate |
| Mês | Select | setFilterMonth |
| De/Até | Calendar × 2 | setDateFrom/setDateTo |

**Default:** `dayRange = 30` (diferente do Dashboard que é 15)

### Filtros Adicionais
- **Turno** — manha/tarde/noite
- **Cliente** — por ID (com fallback por client_name)
- **Artigo** — por ID
- **Máquina** — por ID (com fallback por machine_name)
- **Busca textual** — por máquina, cliente ou artigo (nas tabelas)

### Lógica de Filtragem
Idêntica ao Dashboard — mesma ordem de prioridade documentada em `mestre.md`.

**Diferença no filtro de Cliente:**
- Reports tem fallback por `client_name` para dados legados sem `client_id`

**Diferença no filtro de Máquina:**
- Match por `machine_id` OU `machine_name` (fallback)

---

## 📊 Cálculos por Aba

### Por Turno
- Agrupa `filtered` por `shift`
- Calcula: rolos, kg, faturamento, eficiência média

### Por Máquina
- Agrupa por `machine_id` (ou `machine_name`)
- Calcula: rolos, kg, eficiência média, meta eficiência (ponderada)
- Ordena por rolos DESC
- Busca textual em `searchMachine`

### Por Artigo
- Agrupa por `article_id`
- Calcula: rolos, kg, faturamento
- Mostra cliente vinculado ao artigo

### Por Tecelão
- Agrupa por `weaver_id` (ou `weaver_name`)
- Calcula: rolos, kg, faturamento, eficiência

### Por Cliente
- Via `articleClientName` map: article.client_id → client.name
- Agrupa produções por cliente
- PieChart com proporção

### Tendência
- Agrupa por data
- Séries: rolos, kg, faturamento, eficiência
- AreaChart com eixo Y duplo (valores + eficiência)

### Comparativo
- Compara período atual vs período anterior
- Mesma lógica de período anterior do Dashboard/FaturamentoTotal

---

## 📥 Exportação

### Controles
| Config | Tipo | Opções |
|--------|------|--------|
| `exportMode` | Select | `admin` (com financeiro) / `employee` (sem financeiro) |
| `includeCharts` | Switch | Incluir gráficos no PDF |
| `exportFormat` | Select | `pdf` / `csv` |

### PDF
- Canvas-to-image para gráficos (ref via `useRef`)
- Cabeçalho: barra colorida + logo + nome empresa + data
- Tabelas com zebra striping
- Rodapé: "Relatório gerado automaticamente pelo sistema MalhaGest"
- Formato landscape A4
- `sanitizePdfText()` para remover caracteres problemáticos

### CSV
- Separador `;` (compatibilidade Excel pt-BR)
- Headers traduzidos
- Valores formatados para pt-BR

---

## 🔗 Dependências

| Hook | Uso |
|------|-----|
| `useSharedCompanyData()` | productions, machines, clients, articles, shiftSettings |
| `useAuth()` | company_id (para buscar logo) |
| `usePermissions()` | canSeeFinancial |

### Bibliotecas
- `recharts` — BarChart, PieChart, AreaChart, LineChart
- `date-fns` + `ptBR`
- `@/lib/pdfUtils` — sanitizePdfText
- `@/lib/formatters` — formatNumber, formatCurrency, formatWeight, formatPercent

### Query Extra
```typescript
// Busca logo e nome da empresa para o PDF
supabase.from('companies').select('logo_url, name').eq('id', company_id)
```

---

## 🎨 Cores dos Gráficos

```typescript
const CHART_COLORS = [
  'hsl(142, 71%, 45%)',  // Verde
  'hsl(38, 92%, 50%)',   // Amarelo
  'hsl(221, 83%, 53%)',  // Azul
  'hsl(0, 84%, 60%)',    // Vermelho
  'hsl(280, 60%, 50%)',  // Roxo
  'hsl(199, 89%, 48%)',  // Ciano
];

const SHIFT_CHART_COLORS = {
  'Manhã': 'hsl(38, 92%, 50%)',
  'Tarde': 'hsl(25, 95%, 53%)',
  'Noite': 'hsl(221, 83%, 53%)',
};
```

---

*Última atualização: 09/04/2026*
