# 📺 MODO TELA (TV MODE) — Documentação Completa para Implementação

> **⚠️ INSTRUÇÕES PARA A IA (LOVABLE):**
>
> 1. Leia este arquivo **INTEIRO** antes de implementar qualquer parte do Modo Tela.
> 2. Consulte também `mestre.md` para entender a arquitetura base, tipos, contextos e padrões.
> 3. Após implementar, atualize este arquivo e o `mestre.md` com as alterações realizadas.

---

## 📌 Visão Geral

O **Modo Tela** é uma interface fullscreen otimizada para TVs instaladas no chão de fábrica. Exibe em tempo real métricas de produção, eficiência, ranking de tecelões e status das máquinas para motivar a equipe e dar visibilidade à gestão.

**Objetivo:** Permitir que a empresa coloque uma TV no setor de produção mostrando dados em tempo real, legíveis a 5-10 metros de distância, sem necessidade de interação do usuário.

---

## 🏗️ Arquitetura

### Rota

```
/:slug/tela       → Modo Tela (fullscreen, sem sidebar/header/bottom nav)
```

- **Proteção:** `CompanyRoute` (valida slug) + `ProtectedRoute` (qualquer role com acesso)
- **Acesso:** Qualquer usuário logado da empresa pode abrir. Ideal: usar uma conta específica (ex: `tv@empresa.com`) com role `revisador` ou criar role `tela` no futuro.
- **Alternativa futura:** Token/código da empresa para acesso sem login (bearer token via Edge Function)

### Arquivos a Criar

```
src/pages/TvMode.tsx                    # Página principal do Modo Tela
src/components/tv/TvShiftEfficiency.tsx  # Painel 1: Eficiência do turno atual
src/components/tv/TvWeaverRanking.tsx    # Painel 2: Ranking de tecelões
src/components/tv/TvMachineGrid.tsx      # Painel 3: Grid de status das máquinas
src/components/tv/TvProductionTotals.tsx # Painel 4: Totalizadores de produção
src/components/tv/TvDowntimeAlerts.tsx   # Painel 5: Alertas de parada
src/components/tv/TvHeader.tsx           # Header fixo (relógio, turno, logo)
src/components/tv/TvCarousel.tsx         # Controlador de rotação automática
src/hooks/useTvData.ts                  # Hook de dados com auto-refresh
```

### Dependências Existentes (NÃO criar novas)

- `useSharedCompanyData()` — Dados de máquinas, produções, tecelões, artigos, etc.
- `CompanyShiftSettings` + `getCompanyShiftMinutes()` — Configuração de turnos
- `downtimeUtils.ts` — Cálculo de paradas por turno
- `formatters.ts` — Formatação pt-BR (moeda, número, peso)
- `MACHINE_STATUS_LABELS`, `MACHINE_STATUS_COLORS` — Labels e cores de status

---

## 📐 Layout

### Estrutura Visual

```
┌─────────────────────────────────────────────────────────┐
│  🏭 [LOGO]   MALHAGEST   🕐 14:32   TURNO: Tarde      │  ← TvHeader (fixo, ~8% altura)
├─────────────────────────────────────────────────────────┤
│                                                         │
│              [PAINEL ROTATIVO ATUAL]                    │  ← TvCarousel (92% altura)
│                                                         │
│  Indicadores de página:  ● ○ ○ ○ ○                     │
└─────────────────────────────────────────────────────────┘
```

### Especificações de Tela

| Propriedade | Valor |
|-------------|-------|
| Resolução alvo | 1920×1080 (Full HD) |
| Aspect ratio | 16:9 |
| Fundo | `--background` (tema escuro forçado para TVs) |
| Fonte mínima | 24px para textos secundários |
| Fonte títulos | 48-72px |
| Fonte KPIs grandes | 96-128px |
| Legibilidade | 5-10 metros de distância |
| Cursor | `cursor: none` (ocultar mouse) |
| Scrollbar | Nenhuma (overflow hidden em tudo) |

### Tema

**Forçar tema escuro** independente da preferência do usuário:
- Fundo escuro reduz cansaço visual em ambiente de fábrica
- Maior contraste para legibilidade a distância
- Menor consumo de energia em TVs OLED

---

## 📊 Painéis (5 telas rotativas)

### Painel 1: Eficiência do Turno Atual (`TvShiftEfficiency.tsx`)

**Objetivo:** Mostrar a eficiência geral do turno em destaque máximo.

```
┌──────────────────────────────────────────┐
│                                          │
│          EFICIÊNCIA DO TURNO             │
│                                          │
│              ┌───────┐                   │
│              │       │                   │
│              │ 87.3% │  ← Gauge/Círculo │
│              │       │                   │
│              └───────┘                   │
│                                          │
│   Meta: 85%    Ontem: 82.1%              │
│                                          │
│   🟢 Acima da meta (+2.3%)              │
└──────────────────────────────────────────┘
```

**Dados necessários:**
- Filtrar `productions` por `date === hoje` e `shift === turnoAtual`
- Calcular eficiência média ponderada (mesmo algoritmo do Dashboard)
- Buscar `target_efficiency` dos artigos para calcular meta média
- Comparar com turno anterior e dia anterior

**Lógica de cores do gauge:**
| Condição | Cor |
|----------|-----|
| Eficiência ≥ meta | `text-success` (verde) |
| Eficiência entre meta-5% e meta | `text-warning` (amarelo) |
| Eficiência < meta-5% | `text-destructive` (vermelho) |

**Componente visual:**
- Usar SVG circular (gauge) com animação de preenchimento
- Número central gigante (128px)
- Subtexto com meta e comparativo

---

### Painel 2: Ranking de Tecelões (`TvWeaverRanking.tsx`)

**Objetivo:** Ranking dos tecelões do turno atual por eficiência, gerando competitividade.

```
┌──────────────────────────────────────────┐
│       🏆 RANKING DO TURNO — Tarde       │
│                                          │
│  🥇  1º  João Silva (#101)    94.2%     │
│  🥈  2º  Maria Santos (#102)  91.8%     │
│  🥉  3º  Pedro Lima (#103)    88.5%     │
│      4º  Ana Costa (#104)     85.1%     │
│      5º  Carlos Dias (#105)   82.3%     │
│      6º  Lucas Alves (#106)   79.0%     │
│      7º  Julia Ramos (#107)   76.4%     │
│                                          │
│  Média do turno: 85.3%                   │
└──────────────────────────────────────────┘
```

**Dados necessários:**
- Filtrar `productions` por `date === hoje` e `shift === turnoAtual`
- Agrupar por `weaver_id` → calcular eficiência média de cada tecelão
- Ordenar por eficiência decrescente
- Mostrar no máximo 8 tecelões (para caber na tela)

**Lógica visual:**
- Medalhas 🥇🥈🥉 nos 3 primeiros
- Barra de progresso horizontal para cada tecelão (proporcional à eficiência)
- Cor da barra segue a lógica de meta (verde/amarelo/vermelho)
- Nome + código do tecelão
- Se houver mais de 8, mostrar scroll automático lento ou paginar

---

### Painel 3: Grid de Status das Máquinas (`TvMachineGrid.tsx`)

**Objetivo:** Visão rápida de todas as máquinas e seus status atuais.

```
┌──────────────────────────────────────────────┐
│           STATUS DAS MÁQUINAS                │
│                                              │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
│  │TEAR 1│  │TEAR 2│  │TEAR 3│  │TEAR 4│    │
│  │  🟢  │  │  🟢  │  │  🔴  │  │  🟢  │    │
│  │ Ativa │  │ Ativa │  │Manut.│  │ Ativa │   │
│  │92.1%  │  │88.3%  │  │2h30  │  │90.5%  │   │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    │
│  │TEAR 5│  │TEAR 6│  │TEAR 7│  │TEAR 8│    │
│  │  🟡  │  │  🟢  │  │  ⚪  │  │  🟢  │    │
│  │Troca  │  │ Ativa │  │Inativa│ │ Ativa │   │
│  │45min  │  │85.7%  │  │  --  │  │91.2%  │   │
│  └──────┘  └──────┘  └──────┘  └──────┘    │
│                                              │
│  Resumo: 5 Ativas | 1 Manutenção | 1 Troca | 1 Inativa │
└──────────────────────────────────────────────┘
```

**Dados necessários:**
- `machines` → status atual de cada máquina
- `productions` do turno → eficiência por máquina (para máquinas ativas)
- `machineLogs` → tempo de parada para máquinas não-ativas (via `downtimeUtils.ts`)
- `articles` → nome do artigo rodando (via `machine.article_id`)

**Lógica visual:**
- Grid responsivo: 4 colunas para até 16 máquinas, 5 colunas para 17-25, etc.
- Cor do card segue `MACHINE_STATUS_COLORS`
- Máquinas ativas: mostrar eficiência do turno
- Máquinas paradas: mostrar tempo de parada no turno (formatDowntimeMinutes)
- Se máquina **acabou de parar** (< 5 min): animação de pulso/flash no card
- Rodapé com contagem por status

**Tamanho dos cards:**
- Adaptar ao número de máquinas:
  - 1-8 máquinas: cards grandes (~200×200px)
  - 9-16 máquinas: cards médios (~150×150px)
  - 17-30 máquinas: cards menores (~120×120px)

---

### Painel 4: Produção Acumulada do Turno (`TvProductionTotals.tsx`)

**Objetivo:** Totalizadores do turno com barra de progresso em relação à meta.

```
┌──────────────────────────────────────────┐
│       PRODUÇÃO DO TURNO — Tarde          │
│                                          │
│   🧶 ROLOS          ⚖️ PESO             │
│   ┌────────────┐    ┌────────────┐       │
│   │    127     │    │  1.523 kg  │       │
│   │  Meta: 150 │    │Meta: 1.800 │       │
│   │ ████████░░ │    │ ████████░░ │       │
│   │   84.7%    │    │   84.6%    │       │
│   └────────────┘    └────────────┘       │
│                                          │
│   💰 FATURAMENTO    📊 EFICIÊNCIA        │
│   ┌────────────┐    ┌────────────┐       │
│   │ R$ 12.450  │    │   87.3%    │       │
│   │Meta:R$15k  │    │  Meta: 85% │       │
│   │ ████████░░ │    │ ██████████ │       │
│   │   83.0%    │    │  ✅ 102.7% │       │
│   └────────────┘    └────────────┘       │
│                                          │
│  Comparativo ontem (turno Tarde):        │
│  Rolos: 142 | Kg: 1.704 | Fat: R$14.2k  │
└──────────────────────────────────────────┘
```

**Dados necessários:**
- Filtrar `productions` por `date === hoje` e `shift === turnoAtual`
- Somar: `rolls_produced`, `weight_kg`, `revenue`
- Calcular eficiência média ponderada
- Meta: baseada na média dos últimos 7 dias do mesmo turno (ou meta dos artigos)
- Comparativo: mesmos dados do turno anterior (ontem, mesmo turno)

**Lógica de meta:**
- Meta dinâmica = média dos últimos 7 dias úteis do mesmo turno
- Se não houver histórico suficiente, usar `target_efficiency` médio dos artigos em produção
- Barra de progresso colorida (verde se ≥ meta, amarelo se entre 90-100% da meta, vermelho se < 90%)

---

### Painel 5: Alertas de Parada (`TvDowntimeAlerts.tsx`)

**Objetivo:** Destacar máquinas paradas e tempo acumulado, incentivando ação rápida.

```
┌──────────────────────────────────────────┐
│       ⚠️ PARADAS DO TURNO               │
│                                          │
│  🔴 TEAR 3 — Manutenção Corretiva       │
│     Parado há 2h 30min                   │
│     Artigo: Meia-Malha PB               │
│                                          │
│  🟡 TEAR 5 — Troca de Artigo            │
│     Parado há 45min                      │
│     Artigo anterior: Ribana              │
│                                          │
│  🟣 TEAR 12 — Troca de Agulhas          │
│     Parado há 1h 15min                   │
│     Artigo: Jersey Listrado             │
│                                          │
│  ──────────────────────────              │
│  Total de paradas: 3 máquinas            │
│  Tempo total perdido: 4h 30min           │
│  Impacto estimado: ~18 rolos             │
└──────────────────────────────────────────┘
```

**Dados necessários:**
- `machines` com status ≠ `ativa`
- `machineLogs` filtrados pelo turno atual via `calculateShiftDowntime()`
- `articles` para nome do artigo na máquina parada
- Cálculo de impacto: `(minutos_parada / minutos_por_rolo) × máquinas_paradas`

**Lógica:**
- Ordenar por tempo de parada decrescente (mais crítica primeiro)
- Se não houver paradas: exibir mensagem positiva "✅ Todas as máquinas ativas! 🎉"
- Se máquina parada há mais de 2h: destaque vermelho pulsante
- Ícone/cor segue `MACHINE_STATUS_COLORS`
- Usar `formatDowntimeMinutes()` de `downtimeUtils.ts`

---

## 🔄 Rotação Automática (`TvCarousel.tsx`)

### Comportamento

| Configuração | Valor |
|--------------|-------|
| Intervalo padrão | 20 segundos por painel |
| Transição | Fade (opacity 0→1, 500ms) via framer-motion |
| Ordem | Eficiência → Ranking → Máquinas → Produção → Alertas |
| Loop | Infinito |
| Indicadores | Dots na parte inferior (● ativo, ○ inativo) |
| Pausa | Nenhuma (TV não tem interação) |

### Lógica de Pular Painéis

- **Painel Alertas:** Se não houver máquinas paradas, pular automaticamente
- **Painel Ranking:** Se houver menos de 2 tecelões no turno, pular

### Implementação

```typescript
// TvCarousel.tsx
interface TvCarouselProps {
  intervalMs?: number; // default 20000
  children: React.ReactNode[]; // Array de painéis
  skipIndices?: number[]; // Painéis a pular (dinâmico)
}

// Estado: currentIndex, avança com setInterval
// Transição: AnimatePresence do framer-motion
// Indicadores: array de dots renderizado no bottom
```

---

## 🕐 Header Fixo (`TvHeader.tsx`)

### Layout

```
┌──────────────────────────────────────────────────┐
│ [LOGO]  MALHAGEST  │  🕐 14:32:45  │  TURNO: Tarde (13:30 - 22:00)  │  28/03/2026 │
└──────────────────────────────────────────────────┘
```

### Especificações

| Elemento | Detalhe |
|----------|---------|
| Logo | `companies.logo_url` se existir, senão ícone genérico |
| Nome | Nome da empresa (`companies.name`) |
| Relógio | `HH:mm:ss` atualizado a cada segundo (`setInterval`) |
| Turno | Detectado automaticamente pelo horário atual vs `CompanyShiftSettings` |
| Data | `dd/MM/yyyy` formatado pt-BR |
| Altura | 64-80px (fixo, não rotaciona) |
| Fundo | Levemente diferente do body (`--card` ou `--muted`) |

### Detecção Automática de Turno

```typescript
function getCurrentShift(settings: CompanyShiftSettings): ShiftType {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Converter horários dos turnos para minutos
  // Comparar currentMinutes com cada range
  // Considerar turno noite que cruza meia-noite
  // Retornar 'manha' | 'tarde' | 'noite'
}
```

---

## 🔄 Auto-Refresh (`useTvData.ts`)

### Estratégia

**Opção A — Polling (recomendado para V1):**
```typescript
function useTvData(intervalMs = 60000) {
  // Reutiliza useSharedCompanyData() que já tem os dados em memória
  // Adiciona um refetch periódico
  // Retorna dados filtrados para turno atual + data atual
}
```

- Intervalo: **60 segundos** (1 minuto)
- Método: Re-executar queries do `useCompanyData` a cada intervalo
- Vantagem: Simples, sem configuração adicional

**Opção B — Realtime (futuro, V2):**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.productions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_logs;
```
- Supabase Realtime para updates instantâneos
- Mais complexo mas sem delay

### Hook Retorno

```typescript
interface TvData {
  currentShift: ShiftType;
  currentDate: string; // YYYY-MM-DD
  shiftSettings: CompanyShiftSettings;
  shiftLabels: Record<ShiftType, string>;
  
  // Painel 1 - Eficiência
  overallEfficiency: number;
  targetEfficiency: number;
  previousShiftEfficiency: number;
  
  // Painel 2 - Ranking
  weaverRanking: Array<{
    id: string;
    name: string;
    code: string;
    efficiency: number;
    rolls: number;
    weightKg: number;
  }>;
  
  // Painel 3 - Máquinas
  machineStatuses: Array<{
    id: string;
    name: string;
    number: number;
    status: MachineStatus;
    efficiency?: number;
    downtimeMinutes?: number;
    articleName?: string;
  }>;
  
  // Painel 4 - Totais
  totalRolls: number;
  totalWeightKg: number;
  totalRevenue: number;
  previousDayTotals: { rolls: number; weightKg: number; revenue: number };
  
  // Painel 5 - Paradas
  downtimeMachines: Array<{
    machineName: string;
    status: MachineStatus;
    statusLabel: string;
    downtimeMinutes: number;
    articleName?: string;
  }>;
  totalDowntimeMinutes: number;
}
```

---

## 🎨 Design System

### Cores (usar tokens semânticos)

| Elemento | Token | Uso |
|----------|-------|-----|
| Fundo da página | `bg-background` | Forçar dark mode |
| Cards | `bg-card` | Containers de dados |
| Texto principal | `text-foreground` | Números grandes |
| Texto secundário | `text-muted-foreground` | Labels |
| Sucesso (≥ meta) | `text-success` | Verde |
| Alerta (perto meta) | `text-warning` | Amarelo |
| Crítico (< meta) | `text-destructive` | Vermelho |
| Acento | `text-primary` | Destaques |
| Status máquinas | `MACHINE_STATUS_COLORS` | Já definido em types |

### Tipografia

```css
/* Classes Tailwind sugeridas para TV */
.tv-kpi-huge    { @apply text-[128px] font-black leading-none; }
.tv-kpi-large   { @apply text-7xl font-bold; }
.tv-title       { @apply text-5xl font-bold; }
.tv-subtitle    { @apply text-3xl font-semibold; }
.tv-body        { @apply text-2xl; }
.tv-caption     { @apply text-xl text-muted-foreground; }
```

### Animações

- **Transição entre painéis:** Fade in/out (framer-motion `AnimatePresence`)
- **Gauge de eficiência:** Animação de preenchimento circular ao entrar
- **Máquina parada recente:** Pulso CSS (`animate-pulse`) no card
- **Número mudando:** Contador animado (countUp effect)
- **Alerta crítico (> 2h parada):** Borda pulsante vermelha

---

## ⚙️ Configurações (futuro — na página Settings)

### Seção "Modo Tela" em Settings

A empresa poderá configurar:

| Configuração | Tipo | Default | Descrição |
|--------------|------|---------|-----------|
| `tv_enabled` | boolean | false | Ativa/desativa o modo tela |
| `tv_interval_seconds` | number | 20 | Tempo entre painéis |
| `tv_panels` | string[] | todos | Quais painéis exibir e ordem |
| `tv_show_revenue` | boolean | true | Mostrar faturamento na TV |
| `tv_show_ranking` | boolean | true | Mostrar ranking tecelões |
| `tv_motivational_messages` | string[] | [] | Mensagens motivacionais rotativas |

**Nota:** Para V1, usar valores hardcoded. Adicionar tabela/coluna de configuração na V2.

---

## 🛣️ Registro de Rota

### Em `App.tsx`

```tsx
// Adicionar dentro das rotas da empresa
<Route path="/:slug/tela" element={
  <CompanyRoute>
    <ProtectedRoute>
      <TvMode />
    </ProtectedRoute>
  </CompanyRoute>
} />
```

### Acesso

- **NÃO** adicionar ao menu sidebar nem ao bottom nav mobile
- Acessível apenas por URL direta: `https://loomlytics-hub.lovable.app/minha-empresa/tela`
- Instruir o admin a salvar como bookmark na TV
- TV deve ter um navegador (Chrome/Firefox) em modo kiosk/fullscreen

---

## 📱 Responsividade

O Modo Tela é **exclusivamente desktop/TV**. Não precisa de layout mobile.

Se acessado em mobile (< 768px):
- Mostrar mensagem: "O Modo Tela é otimizado para TVs e monitores. Acesse em uma tela maior."
- Botão para voltar ao Dashboard

---

## 🔒 Segurança

- Usa `CompanyRoute` (valida slug) + `ProtectedRoute` (valida auth)
- Dados filtrados por `company_id` via RLS (mesmo mecanismo de todas as páginas)
- Não expõe dados sensíveis além do que já é visível no Dashboard
- `canSeeFinancial` do `usePermissions` controla exibição de faturamento na TV

---

## 📋 Checklist de Implementação

### Fase 1 (MVP)
- [ ] Criar `src/pages/TvMode.tsx` com layout fullscreen
- [ ] Criar `TvHeader.tsx` com relógio, turno, logo
- [ ] Criar `TvShiftEfficiency.tsx` (gauge de eficiência)
- [ ] Criar `TvMachineGrid.tsx` (grid de status)
- [ ] Criar `TvProductionTotals.tsx` (totalizadores)
- [ ] Criar `TvWeaverRanking.tsx` (ranking)
- [ ] Criar `TvDowntimeAlerts.tsx` (alertas de parada)
- [ ] Criar `TvCarousel.tsx` (rotação automática)
- [ ] Criar `useTvData.ts` (hook com polling de 60s)
- [ ] Registrar rota `/:slug/tela` em `App.tsx`
- [ ] Forçar dark mode na página
- [ ] Testar em resolução 1920×1080
- [ ] Atualizar `mestre.md`

### Fase 2 (Melhorias)
- [ ] Configurações de TV na página Settings
- [ ] Mensagens motivacionais rotativas
- [ ] Supabase Realtime para updates instantâneos
- [ ] Modo kiosk (acesso sem login via token)
- [ ] Animações avançadas (countUp, gauge animado)
- [ ] Alertas sonoros opcionais (buzzer quando máquina para)

---

## 📅 Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 2026-03-29 | Documentação inicial criada (planejamento pré-implementação) |
