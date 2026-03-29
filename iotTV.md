# 📡📺 IoT + Modo TV — Integração de Dados em Tempo Real

> Documentação completa para integração do módulo IoT (sensores ESP32) com o Modo Tela (TV Mode),
> permitindo exibição de dados **em tempo real** no chão de fábrica.
>
> **Pré-requisitos:** Ler `iot.md` e `modotv.md` antes desta documentação.

---

## 📋 Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura da Integração](#2-arquitetura-da-integração)
3. [Fonte de Dados: IoT vs Manual](#3-fonte-de-dados-iot-vs-manual)
4. [Realtime — Supabase Channels](#4-realtime--supabase-channels)
5. [Painéis TV Aprimorados com IoT](#5-painéis-tv-aprimorados-com-iot)
6. [Novo Painel: Monitor IoT em Tempo Real](#6-novo-painel-monitor-iot-em-tempo-real)
7. [Hook `useTvIoTData`](#7-hook-usetviotdata)
8. [Fluxo de Dados Completo](#8-fluxo-de-dados-completo)
9. [Indicadores de Saúde dos Dispositivos](#9-indicadores-de-saúde-dos-dispositivos)
10. [Alertas Visuais Automáticos](#10-alertas-visuais-automáticos)
11. [Configurações Específicas](#11-configurações-específicas)
12. [Arquivos a Criar/Modificar](#12-arquivos-a-criarmodificar)
13. [Checklist de Implementação](#13-checklist-de-implementação)

---

## 1. Visão Geral

### Sem IoT (Modo TV V1 — `modotv.md`)
- Dados vêm de registros **manuais** na tabela `productions`
- Atualização via **polling a cada 60 segundos**
- Atraso real: depende de quando o operador registra (pode ser horas)

### Com IoT (Modo TV V2 — este documento)
- Dados vêm dos sensores ESP32 via tabela `machine_readings` + `iot_shift_state`
- Atualização via **Supabase Realtime** (instantâneo, <1 segundo)
- RPM, status e produção são calculados automaticamente em tempo real
- Sem dependência de ação humana para atualizar os dados

### Resultado
```
┌─────────────────────────────────────────────────────────────────┐
│                    TV NO SETOR DE PRODUÇÃO                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Dados atualizados a cada 10 segundos (via ESP32)        │   │
│  │  RPM ao vivo  │  Eficiência em tempo real  │  Kg/h live  │   │
│  │  Paradas detectadas automaticamente em <10s              │   │
│  │  Troca de turno automática                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  O tecelão olha pra TV e vê SUA eficiência atualizar ao vivo.  │
│  O gestor vê paradas sendo detectadas instantaneamente.         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Arquitetura da Integração

```
[ESP32 + Sensor] ──(POST a cada 10s)──▶ [Edge Function: machine-webhook]
                                                    │
                                                    ▼
                                        ┌───────────────────┐
                                        │  machine_readings  │──── Realtime ────┐
                                        │  iot_shift_state   │──── Realtime ────┤
                                        │  iot_downtime_events│─── Realtime ────┤
                                        │  machines (status) │──── Realtime ────┤
                                        │  productions       │──── Realtime ────┤
                                        └───────────────────┘                   │
                                                                                ▼
                                                                   ┌────────────────────┐
                                                                   │   Modo TV (Browser) │
                                                                   │   useTvIoTData()    │
                                                                   │   Realtime listener │
                                                                   └────────────────────┘
```

### Fluxo Detalhado

1. **ESP32** envia `{ company_id, machine_id, total_rotations, rpm, is_running }` a cada 10s
2. **Edge Function** processa, salva em `machine_readings`, atualiza `iot_shift_state`
3. **Supabase Realtime** emite evento de mudança nas tabelas
4. **Modo TV** (browser na TV) recebe o evento e atualiza os painéis **instantaneamente**
5. **Nenhum polling necessário** — os dados fluem automaticamente

---

## 3. Fonte de Dados: IoT vs Manual

O Modo TV deve funcionar com **ambas** as fontes de dados, dependendo de se a empresa tem IoT instalado ou não.

### Detecção Automática

```typescript
// useTvIoTData.ts
function useIoTAvailability(companyId: string): {
  hasIoT: boolean;       // Tem pelo menos 1 dispositivo IoT ativo
  iotMachineIds: string[]; // Máquinas com sensor IoT
  manualMachineIds: string[]; // Máquinas sem sensor (registro manual)
  mixedMode: boolean;    // Algumas com IoT, outras sem
}
```

### Comportamento por Cenário

| Cenário | Fonte de Dados | Refresh | Experiência |
|---------|---------------|---------|-------------|
| **Sem IoT** | `productions` (manual) | Polling 60s | Mesmo que modotv.md V1 |
| **IoT total** (todas as máquinas) | `machine_readings` + `iot_shift_state` | Realtime (<1s) | Experiência completa em tempo real |
| **IoT parcial** (algumas máquinas) | Mix: IoT + manual | Realtime + Polling | Indica visualmente quais são IoT |

### Indicador Visual de Fonte

Cada card de máquina no grid deve indicar a fonte:
```
┌──────────┐    ┌──────────┐
│ TEAR 01  │    │ TEAR 02  │
│ 📡 IoT  │    │ ✍️ Manual│
│ RPM: 24  │    │ --       │
│ 92.1%    │    │ 88.3%    │
└──────────┘    └──────────┘
```

- `📡` = Dados IoT em tempo real
- `✍️` = Dados do último registro manual

---

## 4. Realtime — Supabase Channels

### Tabelas que Precisam de Realtime

```sql
-- Habilitar realtime para tabelas IoT
ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_shift_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_downtime_events;

-- Tabelas já existentes que também precisam de realtime no TV
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.productions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_logs;
```

### Listener no Modo TV

```typescript
// useTvIoTData.ts — Realtime subscription
import { supabase } from "@/integrations/supabase/client";

function useTvRealtimeData(companyId: string) {
  const [readings, setReadings] = useState<Map<string, MachineReading>>(new Map());
  const [shiftStates, setShiftStates] = useState<Map<string, ShiftState>>(new Map());
  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([]);
  const [machineStatuses, setMachineStatuses] = useState<Map<string, MachineStatus>>(new Map());

  useEffect(() => {
    // Canal 1: Leituras de máquina (RPM ao vivo)
    const readingsChannel = supabase
      .channel('tv-machine-readings')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'machine_readings',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const reading = payload.new as MachineReading;
          setReadings(prev => {
            const next = new Map(prev);
            next.set(reading.machine_id, reading); // Última leitura por máquina
            return next;
          });
        }
      )
      .subscribe();

    // Canal 2: Estado do turno (produção acumulada)
    const shiftChannel = supabase
      .channel('tv-shift-state')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE
          schema: 'public',
          table: 'iot_shift_state',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const state = payload.new as ShiftState;
          setShiftStates(prev => {
            const next = new Map(prev);
            next.set(state.machine_id, state);
            return next;
          });
        }
      )
      .subscribe();

    // Canal 3: Eventos de parada (apenas downtimes INJUSTIFICADOS)
    // Conforme iot.md: manutenções justificadas NÃO geram iot_downtime_events
    const downtimeChannel = supabase
      .channel('tv-downtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'iot_downtime_events',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          // Atualizar lista de paradas ativas (sem ended_at)
          refreshDowntimeEvents();
        }
      )
      .subscribe();

    // Canal 4: Mudança de status das máquinas (tabela machines)
    const machinesChannel = supabase
      .channel('tv-machines')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'machines',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          // Atualizar status da máquina no grid
          refreshMachineStatuses();
        }
      )
      .subscribe();

    // Canal 5: Mudanças em machine_logs (manutenções)
    // Essencial para o cruzamento IoT × Status (conforme iot.md seção 10-11)
    // Detecta: mecânico registra manutenção → TV reclassifica parada de inesperada para justificada
    const machineLogsChannel = supabase
      .channel('tv-machine-logs')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT (nova manutenção), UPDATE (finalização com ended_at)
          schema: 'public',
          table: 'machine_logs',
        },
        (payload) => {
          // Atualizar mapa de status das máquinas
          refreshMachineStatuses();
          // Reclassificar downtimes ativos:
          // Se mecânico registrou manutenção DEPOIS da parada ser detectada,
          // a TV deve mudar o visual de 🔴 (inesperada) para 🔧 (justificada)
          reclassifyActiveDowntimes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(readingsChannel);
      supabase.removeChannel(shiftChannel);
      supabase.removeChannel(downtimeChannel);
      supabase.removeChannel(machinesChannel);
      supabase.removeChannel(machineLogsChannel);
    };
  }, [companyId]);

  return { readings, shiftStates, downtimeEvents, machineStatuses };
}
```

### Por que Realtime e não Polling?

| Aspecto | Polling (60s) | Realtime |
|---------|--------------|----------|
| Latência | 0-60s de atraso | <1 segundo |
| Dados ao vivo | Não (dados do minuto anterior) | Sim (RPM atualiza a cada 10s) |
| Tráfego | 1 query/min × N tabelas | Apenas eventos novos |
| Paradas | Detectada na próxima query | Detectada instantaneamente |
| UX na TV | Números "pulam" a cada 60s | Números fluem naturalmente |
| Custo | Mais queries no banco | WebSocket (mais eficiente) |

> **Conclusão**: Com IoT enviando dados a cada 10s, o **Realtime é obrigatório** para que a TV reflita os dados assim que chegam. Polling de 60s tornaria o sistema IoT inteiro sem sentido na TV.

---

## 5. Painéis TV Aprimorados com IoT

### Painel 1: Eficiência do Turno (APRIMORADO)

**Sem IoT** (original): Eficiência calculada dos registros manuais em `productions`.

**Com IoT** (aprimorado):
```
┌──────────────────────────────────────────┐
│          EFICIÊNCIA DO TURNO             │
│              EM TEMPO REAL 📡            │
│                                          │
│              ┌───────┐                   │
│              │ 87.3% │  ← Atualiza a    │
│              └───────┘    cada 10s       │
│                                          │
│   Meta: 85%    Há 10min: 85.1%          │
│   📈 Tendência: Subindo (+2.2%)         │
│                                          │
│   RPM médio: 23.8    Uptime: 94.2%      │
│   Máquinas ativas: 18/20                 │
└──────────────────────────────────────────┘
```

**Novos campos com IoT:**
- **RPM médio em tempo real**: Média dos `rpm` das últimas leituras de todas as máquinas ativas
- **Uptime em tempo real**: Calculado a partir de `iot_downtime_events` do turno
- **Tendência**: Comparar eficiência dos últimos 10min vs 10min anteriores (seta ↑↓)
- **Máquinas ativas**: Contagem ao vivo baseada em `is_running` das leituras

**Cálculo de eficiência em tempo real (com cruzamento IoT × Status):**

> ⚠️ A eficiência é calculada sobre o **tempo disponível**, não o tempo total do turno.
> Manutenções justificadas (status ≠ `ativa` em `machine_logs`) são descontadas do tempo do turno.
> Veja detalhes completos em `iot.md` — seção "Cruzamento IoT × Status da Máquina".

```typescript
function calculateRealtimeEfficiency(
  shiftStates: Map<string, ShiftState>,
  machines: Machine[],
  machineStatuses: Map<string, MachineStatus>, // Status atual de machine_logs
  machineLogs: MachineLog[],                    // Histórico do turno
  articles: Article[],
  settings: CompanyShiftSettings,
  shiftType: ShiftType
): number {
  let totalEfficiency = 0;
  let machineCount = 0;

  for (const [machineId, state] of shiftStates) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine || !state.last_rpm) continue;
    
    const currentStatus = machineStatuses.get(machineId) || 'ativa';
    
    // Se máquina está inativa, não entra no cálculo
    if (currentStatus === 'inativa') continue;

    const targetRpm = machine.rpm || 25;
    const rpmEfficiency = (state.last_rpm / targetRpm);
    
    // Calcular tempo disponível (descontando manutenções justificadas)
    const shiftStart = getShiftStartTime(settings, shiftType);
    const elapsed = (Date.now() - shiftStart.getTime()) / 1000;
    
    // Somar tempo em manutenção justificada (status ≠ 'ativa') via machine_logs
    const maintenanceLogs = machineLogs.filter(
      log => log.machine_id === machineId 
        && log.status !== 'ativa'
        && new Date(log.started_at) >= shiftStart
    );
    const maintenanceSeconds = maintenanceLogs.reduce((sum, log) => {
      const start = Math.max(new Date(log.started_at).getTime(), shiftStart.getTime());
      const end = log.ended_at ? new Date(log.ended_at).getTime() : Date.now();
      return sum + (end - start) / 1000;
    }, 0);
    
    const tempoDisponivel = elapsed - maintenanceSeconds;
    if (tempoDisponivel <= 0) continue;
    
    // Downtimes injustificados = soma de iot_downtime_events no turno
    // NOTA: conforme iot.md, a Edge Function só cria iot_downtime_events quando
    // status = 'ativa', portanto TODOS os registros nesta tabela são injustificados.
    // Não existe campo total_downtime_seconds no iot_shift_state (ver iot.md seção 6.3).
    // O cálculo é feito somando duration_seconds dos iot_downtime_events do turno:
    const downtimeSeconds = activeDowntimes
      .filter(d => d.machineId === machineId)
      .reduce((sum, d) => sum + d.durationSeconds, 0);
    const uptime = tempoDisponivel - downtimeSeconds;
    const uptimeRatio = uptime / tempoDisponivel;

    totalEfficiency += rpmEfficiency * uptimeRatio * 100;
    machineCount++;
  }

  return machineCount > 0 ? totalEfficiency / machineCount : 0;
}
```

---

### Painel 2: Ranking de Tecelões (APRIMORADO)

**Com IoT:**
```
┌──────────────────────────────────────────────────┐
│       🏆 RANKING LIVE DO TURNO — Tarde           │
│                                                   │
│  🥇  1º  João Silva (#101)    94.2%  ↑ 23.8 RPM │
│  🥈  2º  Maria Santos (#102)  91.8%  → 22.1 RPM │
│  🥉  3º  Pedro Lima (#103)    88.5%  ↓ 21.5 RPM │
│      4º  Ana Costa (#104)     85.1%  → 24.0 RPM │
│                                                   │
│  📡 Atualização em tempo real                     │
│  Média do turno: 89.9% (+2.1% vs ontem)          │
└──────────────────────────────────────────────────┘
```

**Novos campos:**
- **RPM atual** de cada tecelão (da máquina que opera)
- **Seta de tendência** (↑ melhorando, → estável, ↓ caindo — comparar últimos 5min)
- **Kg/h ao vivo** por tecelão
- O ranking **reordena em tempo real** (tecelão pode subir/descer ao vivo)

**Associação tecelão → máquina:**
- Via tabela `iot_machine_assignments` (escala fixa) — conforme definido em `iot.md` seção 12
- Via `iot_shift_state.weaver_id` (qual tecelão está na máquina agora)

---

### Painel 3: Grid de Máquinas (APRIMORADO)

**Com IoT + Cruzamento de Status:**
```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ TEAR 01      │  │ TEAR 02      │  │ TEAR 03      │  │ TEAR 04      │
│ 📡 Live      │  │ 📡 Live      │  │ 📡 Live      │  │ ✍️ Manual    │
│ 🟢 Ativa     │  │ 🟢 Ativa     │  │ 🔧 Manut.Prev│  │ 🟢 Ativa     │
│ RPM: 24      │  │ RPM: 22      │  │ RPM: 0       │  │ --           │
│ 92.1%        │  │ 88.3%        │  │ ⏸️ Justificado│  │ 90.5%        │
│ 2.3 kg/h     │  │ 2.1 kg/h     │  │  35min ⏱️    │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐
│ TEAR 05      │  │ TEAR 06      │
│ 📡 Live      │  │ 📡 Live      │
│ 🟢 Ativa     │  │ ⚠️ Ativa     │   ← Status ativa mas RPM = 0
│ RPM: 25      │  │ RPM: 0       │
│ 95.0%        │  │ 🔴 Parada!   │   ← PENALIZA eficiência
│ 2.5 kg/h     │  │ 12min ⏱️     │
└──────────────┘  └──────────────┘
```

**Diferença visual por tipo de parada (cruzamento IoT × Status):**

| Status da Máquina | Sinal IoT | Visual no Card | Cor do Card |
|-------------------|-----------|----------------|-------------|
| **Ativa** + RPM > 0 | Produzindo | 🟢 Normal, RPM ao vivo | `bg-success/10` |
| **Ativa** + RPM = 0 | Parada inesperada | 🔴 **Parada!** + Timer ao vivo | `bg-destructive/10` (pulsa) |
| **Manutenção Prev.** + RPM = 0 | Parada justificada | 🔧 **Manut. Prev.** + Timer | `bg-warning/10` (estável, sem pulso) |
| **Manutenção Corr.** + RPM = 0 | Parada justificada | 🔧 **Manut. Corr.** + Timer | `bg-warning/10` |
| **Troca de Artigo** + RPM = 0 | Parada justificada | 🔄 **Troca Artigo** + Timer | `bg-info/10` |
| **Troca de Agulhas** + RPM = 0 | Parada justificada | 🔧 **Troca Agulhas** + Timer | `bg-purple-500/10` |
| **Inativa** | Ignorado | ⚫ **Inativa** | `bg-muted` |
| **Manutenção** + RPM > 0 | ⚠️ Inconsistência | ⚠️ **Alerta!** RPM inesperado | `bg-warning/20` (pisca) |

> ⚠️ **Paradas justificadas** mostram timer mas **NÃO pulsam vermelho** — a cor é estável (amarelo/azul/roxo conforme tipo).
> Apenas paradas **injustificadas** (status `ativa` + RPM = 0) pulsam vermelho para chamar atenção.

**Novos campos por máquina (IoT):**
- **RPM ao vivo**: Última leitura do ESP32 (atualiza a cada 10s)
- **Kg/h ao vivo**: `(rpm_atual / voltas_por_rolo) × peso_por_rolo × 60`
- **Tempo de parada**: Timer ao vivo (conta segundos) quando `is_running = false`
- **Impacto da parada**: Rolos estimados perdidos durante o downtime
- **Indicador de sinal Wi-Fi**: `wifi_rssi` do ESP32 (🟢 forte, 🟡 médio, 🔴 fraco)

**Animações especiais IoT:**
- RPM muda → número faz transição suave (não "pula")
- Máquina para (`is_running: false`) → card pulsa vermelho imediatamente
- Máquina volta (`is_running: true`) → flash verde momentâneo
- RPM caindo continuamente → borda amarela de alerta

---

### Painel 4: Produção Acumulada (APRIMORADO)

**Com IoT:**
```
┌──────────────────────────────────────────┐
│       PRODUÇÃO LIVE DO TURNO — Tarde     │
│                                          │
│   🧶 ROLOS          ⚖️ PESO             │
│   ┌────────────┐    ┌────────────┐       │
│   │  127.35    │    │ 1.523,2 kg │       │  ← Decimais! IoT permite
│   │  +0.05/min │    │ +0.6 kg/min│       │  ← Taxa de produção ao vivo
│   │ ████████░░ │    │ ████████░░ │       │
│   │   84.7%    │    │   84.6%    │       │
│   └────────────┘    └────────────┘       │
│                                          │
│   💰 FATURAMENTO    📊 EFICIÊNCIA        │
│   ┌────────────┐    ┌────────────┐       │
│   │ R$ 12.456  │    │   87.3%    │       │
│   │ +R$9,20/min│    │  ↑ subindo │       │
│   └────────────┘    └────────────┘       │
│                                          │
│   📡 Dados IoT em tempo real             │
│   Último update: há 3 segundos           │
└──────────────────────────────────────────┘
```

**Diferenças com IoT:**
- **Rolos fracionários**: Em vez de "127 rolos", mostra "127.35 rolos" (parciais do `iot_shift_state`)
- **Taxa de produção**: Kg/min, rolos/hora, R$/hora — calculados em tempo real
- **Barras de progresso animadas**: Crescem continuamente (não em degraus)
- **Timestamp do último update**: "Há 3 segundos" para mostrar que é ao vivo

**Cálculo de totais IoT:**
```typescript
function calculateIoTTotals(
  shiftStates: Map<string, ShiftState>,
  articles: Map<string, Article>
): TvProductionTotals {
  let totalRolls = 0;
  let totalWeightKg = 0;
  let totalRevenue = 0;

  for (const [, state] of shiftStates) {
    const article = articles.get(state.article_id);
    if (!article) continue;

    const turnsPerRoll = article.turns_per_roll || 1;
    const rolls = state.completed_rolls + (state.partial_turns / turnsPerRoll);
    const kg = rolls * article.weight_per_roll;
    const revenue = kg * article.value_per_kg;

    totalRolls += rolls;
    totalWeightKg += kg;
    totalRevenue += revenue;
  }

  return { totalRolls, totalWeightKg, totalRevenue };
}
```

---

### Painel 5: Alertas de Parada (APRIMORADO com Cruzamento IoT × Status)

**Com IoT + Classificação Inteligente:**
```
┌──────────────────────────────────────────────────────┐
│       ⚠️ ALERTAS AO VIVO                            │
│                                                      │
│  🔴 TEAR 06 — PARADA INESPERADA 📡                  │
│     Status: Ativa | RPM: 0                           │  ← PENALIZA eficiência
│     ⏱️ Parado há 15:32 (contando...)                 │
│     Impacto: ~0.8 rolos perdidos | -3.2% eficiência  │
│                                                      │
│  🔧 TEAR 03 — MANUTENÇÃO PREVENTIVA 📡              │
│     Status: Manutenção Preventiva | RPM: 0           │  ← NÃO penaliza
│     ⏱️ Em manutenção há 35:10                        │
│     ℹ️ Tempo descontado do turno (sem impacto)       │
│                                                      │
│  🟡 TEAR 07 — RPM BAIXO ⚠️                         │
│     Status: Ativa | RPM: 8 (meta: 25)               │
│     Eficiência caiu para 32%                         │
│                                                      │
│  ⚠️ TEAR 09 — INCONSISTÊNCIA ⚠️                    │  ← NOVO
│     Status: Manutenção Corretiva | RPM: 22           │
│     Máquina produzindo mas marcada como manutenção!  │
│     Verificar com mecânico                           │
│                                                      │
│  🔵 TEAR 12 — DISPOSITIVO OFFLINE 📡❌              │
│     Último sinal há 2min 30s                         │
│     Verificar Wi-Fi ou ESP32                         │
│                                                      │
│  Resumo: 1 parada inesperada | 1 manutenção         │
│          1 RPM baixo | 1 inconsistência | 1 offline  │
│  Impacto eficiência: ~3.2 rolos/hora (só paradas     │
│  inesperadas contam)                                  │
└──────────────────────────────────────────────────────┘
```

**Tipos de alerta com cruzamento IoT × Status (alinhados com iot.md seção 11):**

| Tipo | Condição (IoT × Status) | Ícone | Cor | Penaliza Eficiência? |
|------|------------------------|-------|-----|---------------------|
| **Parada inesperada** | `RPM = 0` + status `ativa` por >30s | 🔴 | `text-destructive` | ✅ **SIM** |
| **Micro-parada** | `RPM = 0` + status `ativa` por <2min | ⚪ | `text-muted` | ✅ SIM (agrupada em relatórios — conforme iot.md) |
| **Parada longa sem registro** | `RPM = 0` + status `ativa` por >15min | 🔴🔔 | `text-destructive` | ✅ SIM + **alerta sugerindo registrar manutenção** (conforme iot.md) |
| **Manutenção justificada** | `RPM = 0` + status ≠ `ativa` e ≠ `inativa` | 🔧 | `text-warning` | ❌ NÃO (conforme iot.md: não cria `iot_downtime_events`) |
| **RPM baixo** | `rpm < 50% meta` + status `ativa` por >60s | 🟡 | `text-warning` | ✅ SIM (parcial) |
| **Inconsistência** | `RPM > 0` + status ≠ `ativa` (conforme iot.md: alerta automático) | ⚠️ | `text-orange-500` | — (alerta para admin) |
| **Dispositivo offline** | Sem leitura há >30s (3 envios perdidos — conforme iot.md: envio a cada 10s) | 🔵 | `text-info` | — (sem dados) |
| **Wi-Fi fraco** | `wifi_rssi < -80 dBm` | 📶 | `text-warning` | — (informativo) |

> **Nota sobre micro-paradas (conforme iot.md):** Paradas < 2min com status `ativa` são registradas como `iot_downtime_events` normalmente e penalizam eficiência, mas na TV são exibidas com destaque menor (sem pulso, cor `muted`). São agrupadas em relatórios.

> **Nota sobre parada longa >15min (conforme iot.md):** Emite alerta especial sugerindo que o mecânico registre manutenção. Ex: *"TEAR 01 parada há 16min sem manutenção registrada — registrar manutenção?"*

**Regras de exibição:**
- **Paradas inesperadas** ficam no **topo** (prioridade máxima) com card pulsante
- **Paradas longas >15min** ficam logo abaixo com alerta adicional de sugestão
- **Manutenções justificadas** são exibidas com visual calmo (sem pulso, cor estável)
- **Micro-paradas (<2min)** não aparecem individualmente no painel de alertas (só no relatório)
- **Inconsistências** piscam para chamar atenção do admin/mecânico
- O **impacto estimado** só contabiliza paradas inesperadas (não manutenções)

**Timer ao vivo:**
- Quando uma máquina para, o timer conta **em tempo real** no browser (não espera próximo envio)
- Usa `Date.now() - downtime_started_at` atualizado a cada segundo via `setInterval`
- Timer de manutenção justificada usa cor diferente (amarelo) do timer de parada inesperada (vermelho)
- Ao ultrapassar 15min (status `ativa`), timer muda para modo **urgente** com sugestão de registrar manutenção

---

## 6. Novo Painel: Monitor IoT em Tempo Real

### Painel 6 (NOVO — exclusivo IoT): `TvIoTMonitor.tsx`

**Objetivo:** Painel dedicado mostrando dados brutos IoT — RPM de cada máquina em tempo real com mini-gráficos.

```
┌────────────────────────────────────────────────────────┐
│              📡 MONITOR IoT — TEMPO REAL               │
│                                                        │
│  TEAR 01          TEAR 02          TEAR 03             │
│  RPM: 24.2        RPM: 22.8        RPM: 0             │
│  ▁▂▃▄▅▆▇█▇▆      ▁▂▃▃▄▄▅▅▆▅      ▇▆▅▄▃▂▁▁▁▁         │
│  ↑ Estável        ↑ Estável        ↓ Parada            │
│  🟢 Ok            🟢 Ok            🔴 Parada 5:32     │
│                                                        │
│  TEAR 04          TEAR 05          TEAR 06             │
│  RPM: 23.5        RPM: 18.1        RPM: 25.0          │
│  ▁▂▃▄▅▅▆▆▇▇      ▅▅▄▃▃▂▂▁▁▁      ▅▆▇▇▇█▇█▇█         │
│  ↑ Estável        ↓ Caindo ⚠️      ↑ Máxima           │
│  🟢 Ok            🟡 Atenção       🟢 Ok              │
│                                                        │
│  Última leitura global: há 2 segundos                  │
│  Dispositivos online: 18/20 📶                         │
└────────────────────────────────────────────────────────┘
```

**Especificações:**
- **Mini sparkline** por máquina: últimas 30 leituras (5 minutos de dados)
- **RPM com 1 casa decimal**: atualiza a cada 10s
- **Indicador de tendência**: ↑ subindo, → estável, ↓ caindo
- **Status por cor**: 🟢 normal, 🟡 RPM baixo, 🔴 parada
- **Grid adaptativo**: mesmo layout do Painel 3 (`TvMachineGrid`)

**Sparkline — implementação:**
```typescript
// Mini gráfico SVG inline (sem biblioteca externa)
function Sparkline({ data, width = 120, height = 30 }: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-primary"
      />
    </svg>
  );
}
```

**Buffer de leituras:**
```typescript
// Manter últimas 30 leituras por máquina (5 min de dados a cada 10s)
const [readingsBuffer, setReadingsBuffer] = useState<Map<string, number[]>>(new Map());

// Ao receber nova leitura:
setReadingsBuffer(prev => {
  const next = new Map(prev);
  const buffer = next.get(machineId) || [];
  buffer.push(reading.rpm);
  if (buffer.length > 30) buffer.shift(); // Manter apenas últimas 30
  next.set(machineId, buffer);
  return next;
});
```

---

## 7. Hook `useTvIoTData`

### Arquivo: `src/hooks/useTvIoTData.ts`

```typescript
interface TvIoTData extends TvData {
  // Dados IoT adicionais (complementam TvData de modotv.md)
  
  // Flag de disponibilidade
  hasIoT: boolean;
  iotMachineIds: string[];
  
  // Leituras em tempo real (última por máquina)
  liveReadings: Map<string, {
    machineId: string;
    rpm: number;
    isRunning: boolean;
    wifiRssi: number;
    lastSeenAt: Date;
  }>;
  
  // Status atual das máquinas (de machine_logs — para cruzamento IoT × Status)
  machineStatuses: Map<string, {
    machineId: string;
    status: MachineStatus;        // 'ativa' | 'manutencao_preventiva' | etc.
    statusSince: Date;            // Quando entrou neste status
    isJustifiedStop: boolean;     // true se status ≠ 'ativa' e ≠ 'inativa'
  }>;
  
  // Estado do turno por máquina (espelha iot_shift_state do iot.md seção 6.3)
  // NOTA: iot_shift_state NÃO tem campos de downtime/manutenção — esses são
  // calculados no frontend a partir de iot_downtime_events e machine_logs
  shiftStates: Map<string, {
    machineId: string;
    weaverId: string | null;
    articleId: string | null;         // Artigo em produção (campo article_id no DB)
    currentShift: string;             // 'manha' | 'tarde' | 'noite'
    partialTurns: number;             // Voltas parciais (não completaram 1 rolo)
    totalTurns: number;               // Total de voltas no turno
    completedRolls: number;           // Rolos completos no turno
    lastRpm: number;                  // Último RPM registrado
    shiftStartedAt: Date;             // Quando o turno iniciou
  }>;
  
  // Buffer de sparkline (últimas 30 leituras por máquina)
  rpmHistory: Map<string, number[]>;
  
  // Paradas ativas (com classificação de tipo)
  activeDowntimes: Array<{
    machineId: string;
    machineName: string;
    startedAt: Date;
    durationSeconds: number;            // Calculado ao vivo
    shift: string;
    type: 'inesperada' | 'justificada'; // NOVO: baseado no cruzamento IoT × Status
    machineStatus: MachineStatus;       // NOVO: status da máquina no momento
    penalizesEfficiency: boolean;       // NOVO: true apenas para 'inesperada'
  }>;
  
  // Alertas IoT (com novos tipos)
  alerts: Array<{
    type: 'parada_inesperada' | 'manutencao_justificada' | 'rpm_baixo' | 'inconsistencia' | 'offline' | 'wifi_fraco';
    machineId: string;
    machineName: string;
    message: string;
    severity: 'warning' | 'critical' | 'info';
    timestamp: Date;
    penalizesEfficiency: boolean;       // NOVO: para exibir impacto correto
  }>;
  
  // Dispositivos
  devicesOnline: number;
  devicesTotal: number;
  
  // Taxas ao vivo
  kgPerHour: number;    // Kg/hora calculado em tempo real
  rollsPerHour: number; // Rolos/hora calculado em tempo real
}
```

### Lógica do Hook

```typescript
function useTvIoTData(companyId: string): TvIoTData {
  // 1. Verificar se a empresa tem IoT
  const { data: devices } = useQuery({
    queryKey: ['iot-devices', companyId],
    queryFn: () => supabase
      .from('iot_devices')
      .select('machine_id')
      .eq('company_id', companyId)
      .eq('active', true),
  });
  
  const hasIoT = (devices?.length || 0) > 0;
  
  // 2. Se tem IoT, ativar Realtime
  const realtimeData = useTvRealtimeData(companyId); // do item 4
  
  // 3. Carregar dados iniciais (snapshot)
  // Buscar iot_shift_state, machine_readings mais recentes, etc.
  
  // 4. Mesclar com dados manuais (para máquinas sem IoT)
  const baseTvData = useTvData(); // Hook original do modotv.md
  
  // 5. Calcular alertas
  const alerts = calculateAlerts(realtimeData, machines);
  
  // 6. Calcular taxas ao vivo
  const rates = calculateLiveRates(realtimeData.shiftStates, articles);
  
  // 7. Retornar tudo combinado
  return {
    ...baseTvData,       // Dados base do Modo TV
    hasIoT,
    iotMachineIds: devices?.map(d => d.machine_id) || [],
    liveReadings: realtimeData.readings,
    shiftStates: realtimeData.shiftStates,
    rpmHistory: realtimeData.rpmHistory,
    activeDowntimes: realtimeData.downtimes,
    alerts,
    devicesOnline: realtimeData.onlineCount,
    devicesTotal: devices?.length || 0,
    kgPerHour: rates.kgPerHour,
    rollsPerHour: rates.rollsPerHour,
  };
}
```

---

## 8. Fluxo de Dados Completo

### Exemplo: Máquina TEAR 01, Tecelão João, Turno Manhã

```
05:00:00 — Turno inicia
           TV mostra: TEAR 01 | João (#101) | RPM: -- | Aguardando...

05:00:10 — ESP32 envia: { rpm: 24, total_rotations: 0, is_running: true }
           Edge Function: salva em machine_readings, atualiza iot_shift_state
           Realtime: evento INSERT em machine_readings
           TV atualiza: TEAR 01 | 🟢 | RPM: 24.0 | 0 rolos | 0 kg
           Sparkline: [24]

05:00:20 — ESP32 envia: { rpm: 23.8, total_rotations: 4 }
           TV atualiza: RPM: 23.8 | partial_turns: 4
           Sparkline: [24, 23.8]

... (a cada 10 segundos a TV atualiza) ...

08:30:00 — ESP32 envia: { rpm: 0, is_running: false }
           Edge Function: verifica status da máquina → status = 'ativa'
           → PARADA INESPERADA! Cria iot_downtime_event (type: 'inesperada')
           Realtime: evento em iot_downtime_events
           TV IMEDIATAMENTE:
             - Card TEAR 01 PULSA VERMELHO (parada inesperada)
             - Painel de Alertas: "🔴 TEAR 01 — PARADA INESPERADA! ⏱️ 0:00"
             - Timer VERMELHO começa a contar ao vivo
             - Eficiência RECALCULA (esta parada PENALIZA)

08:30:32 — Timer na TV: "🔴 Parada há 0:32"
08:31:00 — Timer na TV: "🔴 Parada há 1:00"
08:35:00 — Timer na TV: "🔴 Parada há 5:00 | Impacto: ~0.2 rolos | -1.2% eficiência"

08:35:10 — ESP32 envia: { rpm: 23, is_running: true }
           Edge Function: finaliza iot_downtime_event (duração: 5min10s)
           TV IMEDIATAMENTE:
             - Card TEAR 01 flash verde → volta ao normal
             - Alerta de parada removido
             - Timer para

────── CENÁRIO 2: MANUTENÇÃO JUSTIFICADA ──────

10:00:00 — Mecânico registra no app: TEAR 01 → Manutenção Preventiva
           machine_logs: novo registro { status: 'manutencao_preventiva' }
           machines: status atualizado
           Realtime: evento UPDATE em machines + INSERT em machine_logs
           TV IMEDIATAMENTE:
             - Card TEAR 01 muda para AMARELO ESTÁVEL (sem pulso!)
             - Status: "🔧 Manut. Preventiva"
             - Timer AMARELO inicia (cor diferente do vermelho!)
             - Painel de Alertas: "🔧 TEAR 01 — MANUTENÇÃO PREVENTIVA"
             - ℹ️ "Tempo descontado do turno (sem impacto na eficiência)"
             - Eficiência NÃO RECALCULA (esta parada NÃO penaliza)

10:00:10 — ESP32 envia: { rpm: 0, is_running: false }
           Edge Function: verifica status → status = 'manutencao_preventiva'
           → PARADA JUSTIFICADA! NÃO cria iot_downtime_event
           → Leitura registrada em machine_readings mas ignorada para eficiência
           TV: Nenhuma mudança visual (já mostra manutenção)

10:30:00 — Timer na TV: "🔧 Em manutenção há 30:00" (amarelo, sem pulso)
           Eficiência continua igual (tempo descontado do turno)

10:45:00 — Mecânico finaliza: TEAR 01 → Ativa
           machine_logs: ended_at preenchido
           machines: status volta para 'ativa'
           TV IMEDIATAMENTE:
             - Card TEAR 01 volta ao normal
             - Timer de manutenção para (duração final: 45min)
             - Eficiência recalcula com tempo_disponivel = tempo_turno - 45min

10:45:10 — ESP32 envia: { rpm: 24, is_running: true }
           Edge Function: status = 'ativa', tudo normal
           TV atualiza: RPM: 24.0 | 🟢 Ativa

────── CENÁRIO 3: INCONSISTÊNCIA ──────

11:00:00 — Admin marca TEAR 02 como "Troca de Artigo" no app
           MAS o tecelão esqueceu de parar a máquina
11:00:10 — ESP32 do TEAR 02 envia: { rpm: 22, is_running: true }
           Edge Function: status = 'troca_artigo' MAS rpm > 0
           → INCONSISTÊNCIA! Emite alerta
           TV IMEDIATAMENTE:
             - Card TEAR 02 PISCA AMARELO/LARANJA
             - Painel de Alertas: "⚠️ TEAR 02 — INCONSISTÊNCIA"
             - "Máquina produzindo (RPM: 22) mas status: Troca de Artigo"
             - "Verificar com mecânico/operador"

13:30:00 — TROCA DE TURNO
           Edge Function: finaliza turno de João
           → Calcula eficiência com tempo_disponivel (desconta 45min de manutenção)
           → Cria registro em productions (source: 'iot')
           Realtime: evento INSERT em productions + UPDATE em iot_shift_state
           TV atualiza:
             - Header: "TURNO: Tarde"
             - Ranking: reseta para novo turno
             - Totais: resetam (mostra comparativo com turno anterior)
             - Tecelões mudam (Maria #102 agora na TEAR 01)
```

---

## 9. Indicadores de Saúde dos Dispositivos

### No Header da TV (adição com IoT)

```
┌──────────────────────────────────────────────────────────────┐
│ [LOGO] MALHAGEST │ 🕐 14:32 │ TURNO: Tarde │ 📡 18/20 online│
└──────────────────────────────────────────────────────────────┘
                                                    ↑
                                            Indicador IoT
```

**Lógica:**
- `📡 18/20 online` → dispositivos responderam nos últimos 30s
- Cor do indicador:
  - 🟢 Todos online
  - 🟡 1-2 offline
  - 🔴 3+ offline ou >25% offline

### Detecção de Dispositivo Offline

```typescript
function isDeviceOnline(lastReading: MachineReading): boolean {
  const lastSeen = new Date(lastReading.created_at);
  const now = new Date();
  const diffSeconds = (now.getTime() - lastSeen.getTime()) / 1000;
  
  // Se não recebeu leitura em 30 segundos (3 envios perdidos), 
  // considerar offline
  return diffSeconds < 30;
}
```

---

## 10. Alertas Visuais Automáticos

### Regras de Alerta na TV (com Cruzamento IoT × Status)

| Regra | Condição (IoT × Status) | Ação Visual na TV | Penaliza Eficiência? |
|-------|------------------------|-------------------|---------------------|
| **Parada inesperada** | `RPM = 0` + status `ativa` por >30s | Card **PULSA VERMELHO** + alerta 🔴 | ✅ SIM |
| **Micro-parada** | `RPM = 0` + status `ativa` por <2min (conforme iot.md) | Registrada mas **sem destaque visual** (relatório) | ✅ SIM |
| **Parada longa >15min** | `RPM = 0` + status `ativa` por >15min (conforme iot.md) | Card PULSA VERMELHO + **sugestão de registrar manutenção** | ✅ SIM + alerta |
| **Manutenção justificada** | `RPM = 0` + status ≠ `ativa` e ≠ `inativa` | Card **AMARELO ESTÁVEL** (sem pulso) + alerta 🔧 | ❌ NÃO |
| **Inconsistência** | `RPM > 0` + status ≠ `ativa` (conforme iot.md) | Card **PISCA LARANJA** + alerta ⚠️ | — (alerta admin) |
| **RPM caindo** | RPM cai >30% em 60s + status `ativa` | Borda amarela no card | ✅ SIM (parcial) |
| **RPM baixo** | `rpm < 50% meta` + status `ativa` por >60s | Ícone ⚠️ no card + alerta 🟡 | ✅ SIM |
| **Rolo completo** | `completed_rolls` incrementa | Flash verde momentâneo + counter anima | — |
| **Dispositivo offline** | Sem leitura há >30s (3 envios — conforme iot.md envio a cada 10s) | Card cinza + ícone ❌ | — |
| **Wi-Fi fraco** | `wifi_rssi < -80 dBm` | Ícone 📶 vermelho | — |
| **Eficiência abaixo da meta** | Eficiência geral < meta (calculada com `tempo_disponível`) | Gauge muda para vermelho | — |
| **Novo recorde do turno** | Tecelão ultrapassa 1º lugar | Animação de troca no ranking | — |

> **Regra de ouro**: Apenas paradas com status `ativa` pulsam vermelho e penalizam eficiência.
> Manutenções registradas pelo mecânico têm visual calmo (amarelo/azul/roxo) e NÃO penalizam.

### Efeitos Sonoros (Opcional — futuro)

Se a TV tiver som habilitado:
- 🔔 Beep curto: rolo completo
- ⚠️ Alerta: máquina parada há >10min
- 🎉 Fanfarra: turno atinge meta de eficiência

> **Nota:** Som é opcional e configurável. Maioria das fábricas terá som desligado.

---

## 11. Configurações Específicas

### Adições à tabela `company_settings` (futuro)

| Campo | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `tv_iot_show_rpm` | boolean | true | Mostrar RPM ao vivo nos cards |
| `tv_iot_show_sparkline` | boolean | true | Mostrar mini gráficos |
| `tv_iot_show_kgh` | boolean | true | Mostrar Kg/h ao vivo |
| `tv_iot_alert_sound` | boolean | false | Alertas sonoros |
| `tv_iot_offline_threshold_s` | integer | 30 | Segundos sem sinal = offline |
| `tv_iot_low_rpm_threshold` | numeric | 0.5 | % do RPM meta para alerta |
| `tv_iot_show_wifi_signal` | boolean | false | Mostrar força do sinal Wi-Fi |

> **V1:** Hardcoded. **V2:** Configurável na página Settings.

---

## 12. Arquivos a Criar/Modificar

### Novos Arquivos

```
src/components/tv/TvIoTMonitor.tsx      # Painel 6: Monitor IoT (sparklines)
src/hooks/useTvIoTData.ts               # Hook de dados IoT + Realtime
src/components/tv/TvSparkline.tsx        # Componente sparkline SVG
src/components/tv/TvIoTDeviceStatus.tsx  # Indicador de saúde dos dispositivos
src/components/tv/TvLiveTimer.tsx        # Timer ao vivo para paradas
```

### Arquivos a Modificar

```
src/components/tv/TvHeader.tsx          # Adicionar indicador 📡 X/Y online
src/components/tv/TvShiftEfficiency.tsx  # RPM médio, uptime, tendência
src/components/tv/TvWeaverRanking.tsx    # RPM ao vivo por tecelão, tendência
src/components/tv/TvMachineGrid.tsx      # RPM ao vivo, kg/h, ícone fonte (📡/✍️)
src/components/tv/TvProductionTotals.tsx # Rolos fracionários, taxas ao vivo
src/components/tv/TvDowntimeAlerts.tsx   # Timer ao vivo, alertas IoT, offline
src/components/tv/TvCarousel.tsx         # Adicionar Painel 6 ao carrossel
src/hooks/useTvData.ts                  # Integrar com useTvIoTData
src/pages/TvMode.tsx                    # Detectar IoT e usar hook apropriado
```

### Migrações de Banco (pré-requisito — tabelas do `iot.md`)

```sql
-- Estas tabelas já estão documentadas em iot.md e devem ser criadas ANTES
-- da implementação do IoT no Modo TV:
-- iot_devices
-- machine_readings
-- iot_shift_state
-- iot_downtime_events
-- iot_machine_assignments

-- Habilitar Realtime nas tabelas IoT:
ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_readings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_shift_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iot_downtime_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.productions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_logs;
```

---

## 13. Checklist de Implementação

### Pré-requisitos (implementar primeiro)
- [ ] Todas as tabelas IoT criadas (`iot.md` — Fase 1)
- [ ] Edge Function `machine-webhook` funcionando (`iot.md` — Fase 1)
- [ ] Modo TV base implementado (`modotv.md` — Fase 1)
- [ ] Pelo menos 1 ESP32 enviando dados reais

### Fase 1 — IoT no Modo TV (MVP)
- [ ] Habilitar Realtime nas tabelas IoT
- [ ] Criar `useTvIoTData.ts` com subscriptions Realtime
- [ ] Modificar `TvMachineGrid` para mostrar RPM ao vivo
- [ ] Modificar `TvDowntimeAlerts` para paradas IoT com timer ao vivo
- [ ] Criar `TvLiveTimer.tsx` (contador de parada ao vivo)
- [ ] Adicionar indicador `📡 X/Y online` no `TvHeader`
- [ ] Detectar automaticamente se empresa tem IoT (`hasIoT`)
- [ ] Manter compatibilidade com empresas sem IoT (fallback para polling)

### Fase 2 — IoT TV Completo
- [ ] Criar `TvIoTMonitor.tsx` (Painel 6 com sparklines)
- [ ] Criar `TvSparkline.tsx` (componente SVG)
- [ ] Aprimorar `TvShiftEfficiency` com RPM médio e tendência
- [ ] Aprimorar `TvWeaverRanking` com RPM ao vivo e setas
- [ ] Aprimorar `TvProductionTotals` com rolos fracionários e taxas
- [ ] Implementar alertas de RPM baixo e dispositivo offline
- [ ] Animações de transição suaves nos números

### Fase 3 — Avançado
- [ ] Configurações de IoT TV na página Settings
- [ ] Alertas sonoros opcionais
- [ ] Modo dashboard (sem carrossel, todos painéis visíveis)
- [ ] Histórico de paradas do dia (timeline visual)
- [ ] Comparativo shift-over-shift em tempo real

---

## 📅 Histórico de Alterações

| Data | Alteração |
|------|-----------|
| 2026-03-29 | Documentação inicial criada — integração IoT + Modo TV |
| 2026-03-29 | Atualização: Cruzamento IoT × Status da Máquina (machine_logs) — paradas justificadas vs inesperadas, visual diferenciado, cálculo de eficiência com tempo_disponível, alertas de inconsistência |

---

> **Dependências:**
> - `iot.md` — Sistema IoT (hardware, firmware, Edge Function, tabelas)
> - `modotv.md` — Modo Tela base (layout, painéis, design system)
> - `mestre.md` — Arquitetura geral do sistema
