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
- [ ] Mensagens motivacionais rotativas
- [ ] Supabase Realtime para updates instantâneos
- [ ] Animações avançadas (countUp, gauge animado)
- [ ] Alertas sonoros opcionais (buzzer quando máquina para)

---

## 🔑 Sistema de Acesso por Código (TV Code)

### Visão Geral

Para evitar que o operador precise fazer login com email/senha usando o controle remoto da TV (experiência péssima), o acesso ao Modo Tela é feito via **código numérico de 8 dígitos**.

### Fluxo

1. **Admin** acessa **Configurações > Empresa** e visualiza o código de 5 dígitos da empresa (gerado automaticamente no primeiro acesso)
2. **Admin** pode clicar em **"Gerar novo código"** a qualquer momento — o código anterior é invalidado imediatamente
3. **Na TV**, o operador acessa `loomlytics-hub.lovable.app/tela`
4. Tela exibe um **input numérico grande** (botões enormes, otimizado para controle remoto)
5. Operador digita os 8 dígitos e confirma
6. Sistema valida o código → se válido, redireciona para `/tela/painel` com os dados da empresa vinculada
7. Código fica salvo no `localStorage` da TV — nas próximas vezes, reconecta automaticamente

### Banco de Dados

**Coluna nova em `company_settings`:**

| Coluna | Tipo | Nullable | Default | Constraint |
|--------|------|----------|---------|------------|
| `tv_code` | `text` | Yes | `null` | `UNIQUE` (entre todas as empresas) |

- O código é gerado pela aplicação: 8 dígitos numéricos aleatórios (00000000-99999999)
- Antes de salvar, verifica se o código já existe em outra empresa (uniqueness)
- Se colidir, gera outro até encontrar um único

### Rota `/tela` (Input do Código)

**Características da tela de input:**
- Rota **pública** (não requer autenticação)
- Fundo escuro (dark mode forçado)
- Logo do MalhaGest centralizada no topo
- Campo de input com 8 caixas numéricas grandes (estilo OTP/PIN)
- Teclado numérico virtual na tela (para controle remoto de TV)
- Botões grandes: `0-9`, `Apagar`, `Confirmar`
- Feedback visual: código inválido → shake + mensagem de erro
- Código válido → fade out + redirect para `/tela/painel`

```
┌──────────────────────────────────────────┐
│                                          │
│           🏭 MALHAGEST                   │
│                                          │
│       Digite o código da empresa         │
│                                          │
│     ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐  │
│     │ 4 │ │ 8 │ │ 2 │ │ 7 │ │ 1 │ │ 0 │ │ 5 │ │ _ │  │
│     └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘ └───┘  │
│                                          │
│     ┌─────┐ ┌─────┐ ┌─────┐            │
│     │  1  │ │  2  │ │  3  │            │
│     ├─────┤ ├─────┤ ├─────┤            │
│     │  4  │ │  5  │ │  6  │            │
│     ├─────┤ ├─────┤ ├─────┤            │
│     │  7  │ │  8  │ │  9  │            │
│     ├─────┤ ├─────┤ ├─────┤            │
│     │ ⌫  │ │  0  │ │  ✓  │            │
│     └─────┘ └─────┘ └─────┘            │
│                                          │
└──────────────────────────────────────────┘
```

### Rota `/tela/painel` (Painéis)

- Valida o código salvo no `localStorage` ao montar
- Se código inválido ou expirado → redireciona de volta para `/tela`
- Carrega dados da empresa vinculada ao código (via query anônima com RLS adequado)
- Exibe os painéis rotativos normalmente

### Configurações (Settings.tsx)

Na aba **Empresa**, adicionar card:

```
┌──────────────────────────────────────────┐
│  📺 Código do Modo TV                    │
│                                          │
│  Código atual:  4 8 2 7 1 0 5 3          │
│                                          │
│  Use este código para conectar TVs       │
│  da fábrica ao painel de produção.       │
│                                          │
│  [🔄 Gerar novo código]                  │
│                                          │
│  ⚠️ Gerar novo código desconectará       │
│  todas as TVs conectadas atualmente.     │
└──────────────────────────────────────────┘
```

- Apenas **admin** pode ver/gerar o código
- Botão "Gerar novo código" pede confirmação antes de executar
- Se a empresa ainda não tem código, exibe botão "Gerar código" no lugar

### Segurança

| Aspecto | Detalhe |
|---------|---------|
| Permissão | Código permite **somente leitura** dos painéis |
| Sem login | Não cria sessão de usuário, apenas valida o código |
| Invalidação | Admin pode trocar o código a qualquer momento |
| Unicidade | Código único entre TODAS as empresas (constraint UNIQUE) |
| Brute force | 100.000.000 combinações possíveis (8 dígitos); segurança adequada para uso industrial |
| localStorage | TV salva o código localmente para reconexão automática |

### Edge Function ou Query Direta?

**Opção recomendada: Edge Function `validate-tv-code`**
- Recebe `{ code: "48271053" }`
- Busca `company_settings` onde `tv_code = code`
- Se encontrar: retorna `{ valid: true, company_id, company_name }` + dados necessários para os painéis
- Se não encontrar: retorna `{ valid: false }`
- Não requer autenticação (chamada anônima)

---

## 📅 Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 2026-03-29 | Documentação inicial criada (planejamento pré-implementação) |
| 2026-04-01 | Adicionada seção completa do Sistema de Acesso por Código (TV Code): fluxo de código de 8 dígitos, tela de input `/tela`, configurações do admin, segurança e Edge Function |
| 2026-04-01 | Código TV alterado de 5 para 8 dígitos (100M combinações) para maior segurança |
