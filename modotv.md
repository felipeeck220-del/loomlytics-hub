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
/tela              → Tela de input do código (pública, sem login)
/tela/painel       → Painéis industriais (após validação do código)
```

- **Acesso:** Via código numérico de 5 dígitos — sem necessidade de login
- **Proteção:** O código vincula a TV à empresa; apenas permite leitura de dados
- **Ideal para TVs:** Controle remoto só precisa digitar 5 números

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

## 📊 Painéis — Arquitetura de Painéis Fixos (sem rotação)

### Mudança de Conceito (2026-04-01)

**Antes:** 5 painéis rotativos automáticos em carrossel.
**Agora:** Cada TV conectada = 1 painel fixo separado. O admin controla o conteúdo de cada painel nas Configurações.

### Modelo de Painéis

- Cada TV que se conecta via código de 8 dígitos cria um **painel individual** (Painel 1, Painel 2, etc.)
- O admin seleciona nas **Configurações > Telas** o que cada painel exibe
- Por enquanto, o único tipo de conteúdo disponível é **"Grid de Máquinas"** (mais opções futuras: eficiência do turno, ranking, etc.)
- O admin pode **ativar/desativar máquinas** individualmente para cada painel
- Mudanças feitas pelo admin são refletidas **em tempo real** nos painéis via Supabase Realtime

### Tabela `tv_panels`

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `company_id` | `uuid` | No | — | FK → companies |
| `code` | `text` | No | — | Código de 8 dígitos (UNIQUE) |
| `name` | `text` | No | — | "Painel 1", "Painel 2", etc. |
| `panel_type` | `text` | No | `'machine_grid'` | Tipo de conteúdo exibido |
| `enabled_machines` | `jsonb` | No | `'[]'` | Array de machine IDs visíveis |
| `is_connected` | `boolean` | No | `false` | Se uma TV está usando este painel |
| `created_at` | `timestamptz` | No | `now()` | — |

**Nota:** A coluna `tv_code` em `company_settings` deixa de ser usada para conexão direta. Cada painel tem seu próprio `code` na tabela `tv_panels`.

---

### Painel: Grid de Máquinas (`TvMachineGrid.tsx`)

**Único painel disponível na V1.** Exibe um grid responsivo com todas as máquinas habilitadas pelo admin.

#### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [LOGO]  EMPRESA  │  🕐 14:32  │  Painel 1  │  28/03/2026  │  ← Header
├──────────────────────────────────────────────────────────────┤
│  📅 Produção referente a: 27/03/2026 (última produção)      │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ TEAR 01 │  │ TEAR 02 │  │ TEAR 03 │  │ TEAR 04 │       │
│  │ 92.1%   │  │ 88.3%   │  │ 95.0%   │  │ 78.2%   │       │
│  │ ████████ │  │ ██████░░ │  │ █████████ │  │ █████░░░ │    │
│  │ 12 pçs  │  │ 10 pçs  │  │ 14 pçs  │  │ 8 pçs   │       │
│  │ João S. │  │ Maria L.│  │ Pedro C.│  │ Ana R.  │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ TEAR 05 │  │ TEAR 06 │  │ TEAR 07 │  │ TEAR 08 │       │
│  │ ...     │  │ ...     │  │ ...     │  │ ...     │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
└──────────────────────────────────────────────────────────────┘
```

#### Dados por Card — Modo Manual (Rolos/Voltas)

| Elemento | Detalhe |
|----------|---------|
| **Nº máquina** | "TEAR 01" — topo do card |
| **Eficiência** | `XX.X% / 100%` — eficiência atingida |
| **Barra de progresso** | Largura proporcional à eficiência (100% = cheia) |
| **Cor da barra** | 🟢 Verde se ≥ `target_efficiency`, 🟡 Amarelo se entre meta-10% e meta, 🔴 Vermelho se < meta-10% |
| **Peças produzidas** | Quantidade de rolos ou voltas (conforme production_mode da máquina) |
| **Nome do tecelão** | Nome do tecelão que registrou produção |
| **Data referência** | No topo do grid: "Produção referente a: DD/MM/YYYY" — último dia com produção registrada |

#### Dados por Card — Modo IoT (futuro)

Mesmos dados do modo manual, **mais:**

| Elemento | Detalhe |
|----------|---------|
| **Status** | Abaixo do nº da máquina: "Produzindo", "Parada", "Manutenção", etc. |
| **Cor do card inteiro** | 🟢 Verde = ativa/produzindo ou parada sem motivo, 🟡/🟠 Amarelo/Laranja = manutenção ou troca |
| **Atualização** | Eficiência e peças em **tempo real** |

#### Lógica de Data (modo manual)

```typescript
// Buscar o último dia com produção registrada para a empresa
// NÃO é necessariamente "ontem" — pode ser qualquer dia anterior
const { data } = await supabase
  .from('productions')
  .select('date')
  .eq('company_id', companyId)
  .order('date', { ascending: false })
  .limit(1);
const lastProductionDate = data?.[0]?.date; // ex: "2026-03-27"
```

#### Grid Responsivo

- O grid se adapta ao número de máquinas habilitadas
- Usa CSS Grid com `auto-fill` / `minmax` para caber todas
- Cards maiores para poucas máquinas, menores para muitas

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

## 🔄 Realtime — Sincronização Admin ↔ Painéis

As mudanças feitas pelo admin nas Configurações (habilitar/desabilitar máquinas, desconectar TV) devem refletir **imediatamente** nos painéis conectados.

**Implementação:** Supabase Realtime na tabela `tv_panels`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_panels;
```

O painel (TV) escuta mudanças na sua row de `tv_panels`:
```typescript
supabase
  .channel('tv-panel-changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'tv_panels',
    filter: `id=eq.${panelId}`,
  }, (payload) => {
    // Atualizar enabled_machines, panel_type, is_connected, etc.
    // Se is_connected = false → redirecionar para /tela (desconectado pelo admin)
  })
  .subscribe();
```

---

## ⚙️ Configurações — Aba "Telas"

### Nova aba em Settings.tsx

Adicionar uma **5ª aba "Telas"** (apenas para admin) na página de Configurações.

### Layout da Aba

```
┌──────────────────────────────────────────────────────────────┐
│  📺 Telas Conectadas                                        │
│                                                              │
│  Para conectar uma TV ao painel de produção:                │
│  1. Na TV, acesse malhagest.site/tela                       │
│  2. Digite o código de 8 dígitos gerado abaixo              │
│                                                              │
│  [+ Gerar Código para Nova Tela]                            │
│                                                              │
│  ────────────────────────────────────────                    │
│                                                              │
│  📺 Painel 1  •  Código: 48271053  •  🟢 Conectado         │
│  Tipo: Grid de Máquinas                                      │
│  Máquinas: ☑ TEAR 01  ☑ TEAR 02  ☐ TEAR 03  ☑ TEAR 04     │
│  [Desconectar TV]                                            │
│                                                              │
│  📺 Painel 2  •  Código: 91635274  •  ⚪ Aguardando        │
│  Tipo: Grid de Máquinas                                      │
│  Máquinas: ☑ Todas                                           │
│  [Excluir Código]                                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Funcionalidades

| Ação | Detalhe |
|------|---------|
| **Gerar Código** | Cria novo registro em `tv_panels` com código de 8 dígitos único. Nome automático: "Painel N" (N = próximo número sequencial) |
| **Seletor de Máquinas** | Checkboxes para cada máquina da empresa. Admin ativa/desativa quais aparecem no grid daquele painel. Default: todas ativas |
| **Desconectar TV** | Seta `is_connected = false` no painel. A TV recebe via Realtime e volta para a tela de input |
| **Excluir Código** | Remove o registro de `tv_panels`. Código deixa de ser válido |
| **Tipo de conteúdo** | Por enquanto fixo em "Grid de Máquinas" (seletor desabilitado/exibindo apenas essa opção). Futuro: dropdown com mais opções |

### Regras

- Apenas **admin** pode acessar a aba "Telas"
- Cada "Gerar Código" cria um painel independente com código único
- Quando uma TV se conecta usando o código, o campo `is_connected` fica `true`
- O admin pode gerar múltiplos códigos (um por TV)
- Mudanças nas máquinas habilitadas refletem em tempo real no painel

---

## 🛣️ Registro de Rota

### Em `App.tsx`

```tsx
// Rotas públicas (sem autenticação)
<Route path="/tela" element={<TvCodeEntry />} />
<Route path="/tela/painel" element={<TvPanel />} />
```

### Acesso

- **NÃO** adicionar ao menu sidebar nem ao bottom nav mobile
- `/tela` é rota **pública** (sem login necessário)
- TV acessa `malhagest.site/tela` → digita código → exibe painel
- Código fica salvo no `localStorage` da TV para reconexão automática

---

## 📱 Responsividade

O Modo Tela é **exclusivamente desktop/TV**. Não precisa de layout mobile.

Se acessado em mobile (< 768px):
- Mostrar mensagem: "O Modo Tela é otimizado para TVs e monitores. Acesse em uma tela maior."
- Botão para voltar ao Dashboard

---

## 🔒 Segurança

| Aspecto | Detalhe |
|---------|---------|
| Permissão | Código permite **somente leitura** dos painéis |
| Sem login | Não cria sessão de usuário, apenas valida o código |
| Invalidação | Admin pode desconectar/excluir a qualquer momento |
| Unicidade | Código único entre TODAS as empresas (constraint UNIQUE em `tv_panels.code`) |
| Brute force | 100.000.000 combinações possíveis (8 dígitos); segurança adequada para uso industrial |
| localStorage | TV salva o código localmente para reconexão automática |
| RLS | Tabela `tv_panels` com policy anon SELECT onde `code IS NOT NULL`, dados de produção via Edge Function com service role |

---

## 🔑 Sistema de Acesso por Código (TV Code)

### Fluxo Atualizado

1. **Admin** acessa **Configurações > Telas**
2. Clica em **"Gerar Código para Nova Tela"** → sistema cria registro em `tv_panels` com código de 8 dígitos
3. Admin configura quais máquinas aparecem nesse painel
4. **Na TV**, o operador acessa `malhagest.site/tela`
5. Tela exibe input numérico grande (otimizado para controle remoto)
6. Operador digita os 8 dígitos e confirma
7. Sistema valida o código via Edge Function `validate-tv-code` → se válido, marca `is_connected = true` e redireciona para `/tela/painel`
8. Código fica salvo no `localStorage` da TV — nas próximas vezes, reconecta automaticamente

### Edge Function `validate-tv-code` (já implementada)

- Recebe `{ code: "48271053" }`
- Busca `tv_panels` onde `code = code` (ou `company_settings.tv_code` na V1)
- Se encontrar: retorna `{ company_id, company_name, company_slug, logo_url, shift_settings }`
- Se não encontrar: retorna erro 404
- Não requer autenticação (chamada anônima)

### Banco de Dados

**Tabela `tv_panels`** (nova — substituindo a coluna `tv_code` em `company_settings`):

| Coluna | Tipo | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `id` | `uuid` | No | `gen_random_uuid()` | PK |
| `company_id` | `uuid` | No | — | FK → companies |
| `code` | `text` | No | — | UNIQUE |
| `name` | `text` | No | — | "Painel 1", "Painel 2", etc. |
| `panel_type` | `text` | No | `'machine_grid'` | Tipo de conteúdo |
| `enabled_machines` | `jsonb` | No | `'[]'` | Array de machine IDs |
| `is_connected` | `boolean` | No | `false` | TV está usando este painel |
| `created_at` | `timestamptz` | No | `now()` | — |

**Nota:** A coluna `tv_code` em `company_settings` (migration anterior) pode ser mantida como legado ou removida.

---

## 📋 Checklist de Implementação

### Fase 1 (MVP — V1)
- [ ] Criar tabela `tv_panels` com migration + RLS
- [ ] Adicionar aba "Telas" em Settings.tsx (gerar código, listar painéis, seletor de máquinas)
- [ ] Criar `src/pages/TvCodeEntry.tsx` (input de código com teclado virtual)
- [ ] Criar `src/pages/TvPanel.tsx` (página do painel com header + grid)
- [ ] Criar `src/components/tv/TvMachineGrid.tsx` (grid de máquinas)
- [ ] Criar `src/components/tv/TvHeader.tsx` (relógio, nome do painel, logo)
- [ ] Atualizar Edge Function `validate-tv-code` para buscar em `tv_panels`
- [ ] Implementar Realtime para sincronização admin ↔ painéis
- [ ] Registrar rotas `/tela` e `/tela/painel` em `App.tsx`
- [ ] Forçar dark mode na página
- [ ] Testar em resolução 1920×1080
- [ ] Atualizar `mestre.md`

### Fase 2 (Melhorias)
- [ ] Mais tipos de painel (eficiência do turno, ranking, alertas de parada, totais de produção)
- [ ] Modo IoT com dados em tempo real e status de máquina no card
- [ ] Animações avançadas (countUp, gauge animado)
- [ ] Alertas sonoros opcionais

---

## 📅 Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 2026-03-29 | Documentação inicial criada (planejamento pré-implementação) |
| 2026-04-01 | Adicionada seção completa do Sistema de Acesso por Código (TV Code): fluxo de código de 8 dígitos, tela de input `/tela`, configurações do admin, segurança e Edge Function |
| 2026-04-01 | Código TV alterado de 5 para 8 dígitos (100M combinações) para maior segurança |
| 2026-04-01 | **MUDANÇA ARQUITETURAL:** Substituído carrossel de 5 painéis rotativos por painéis fixos individuais. Cada TV = 1 painel. Admin controla conteúdo por painel nas Configurações > Telas |
| 2026-04-01 | Nova tabela `tv_panels` substitui coluna `tv_code` em `company_settings`. Cada painel tem seu próprio código, nome, tipo de conteúdo e seleção de máquinas |
| 2026-04-01 | Conteúdo V1: apenas "Grid de Máquinas". Modo manual mostra último dia com produção registrada. Modo IoT (futuro) mostra dados em tempo real com status |
| 2026-04-01 | Admin pode ativar/desativar máquinas por painel. Mudanças refletem em tempo real via Supabase Realtime |
| 2026-04-01 | Nova aba "Telas" em Configurações: gerar códigos, gerenciar painéis, selecionar máquinas, desconectar TVs |
