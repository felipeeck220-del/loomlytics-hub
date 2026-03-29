# 📡 IoT — Monitoramento Automático de Produção via ESP32

> Documentação completa para integração de sensores IoT com o sistema Loomlytics,
> permitindo monitoramento em tempo real de RPM, produção automática de peças,
> troca automática de turno e crédito proporcional por tecelão.

---

## 📋 Índice

1. [Visão Geral](#1-visão-geral)
2. [Hardware Necessário](#2-hardware-necessário)
3. [Arquitetura do Sistema](#3-arquitetura-do-sistema)
4. [Firmware ESP32](#4-firmware-esp32)
5. [Backend — Edge Function `machine-webhook`](#5-backend--edge-function-machine-webhook)
6. [Banco de Dados — Tabelas IoT](#6-banco-de-dados--tabelas-iot)
7. [Lógica de Contagem de Peças](#7-lógica-de-contagem-de-peças)
8. [Crédito Proporcional por Turno](#8-crédito-proporcional-por-turno)
9. [Troca Automática de Turno](#9-troca-automática-de-turno)
10. [Cálculos Automáticos](#10-cálculos-automáticos)
11. [Detecção de Paradas](#11-detecção-de-paradas)
12. [Associação Tecelão ↔ Máquina](#12-associação-tecelão--máquina)
13. [Fluxo Completo (Exemplo)](#13-fluxo-completo-exemplo)
14. [Compatibilidade com Máquinas](#14-compatibilidade-com-máquinas)
15. [Instalação Física](#15-instalação-física)
16. [Segurança e Confiabilidade](#16-segurança-e-confiabilidade)
17. [Estimativa de Custos](#17-estimativa-de-custos)

---

## 1. Visão Geral

O módulo IoT substitui o registro manual de produção por monitoramento automático via sensores. Um **sensor indutivo** detecta a rotação do eixo principal da máquina circular e envia pulsos para um **ESP32**, que transmite os dados via Wi-Fi para o servidor a cada **10 segundos**.

### Benefícios
- ✅ Precisão de 100% na contagem de rotações
- ✅ Registro automático de peças (rolos) produzidas
- ✅ Detecção automática de paradas (downtime)
- ✅ Troca automática de turno com crédito proporcional
- ✅ Cálculo em tempo real de eficiência, kg/h e faturamento
- ✅ Eliminação de erros humanos no registro

### Princípio de Funcionamento
```
[Eixo da Máquina] → [Sensor Indutivo] → [ESP32] → [Wi-Fi] → [Edge Function] → [Banco de Dados]
                                                                                       ↓
                                                                              [Dashboard em Tempo Real]
```

---

## 2. Hardware Necessário

### 2.1 Microcontrolador — ESP32

| Item | Especificação | Link de Compra |
|------|--------------|----------------|
| **ESP32 DevKit V1** | Wi-Fi + Bluetooth, 240MHz dual-core, 4MB flash | [Amazon BR — ESP32 DevKit](https://www.amazon.com.br/s?k=esp32+devkit) |
| **ESP32-WROOM-32** | Módulo compacto para produção | [AliExpress — ESP32-WROOM-32](https://pt.aliexpress.com/w/wholesale-esp32-wroom-32.html) |
| **ESP32-S3 DevKitC** | Versão mais recente, USB-C nativo | [Curto Circuito — ESP32-S3](https://www.curtocircuito.com.br/catalogsearch/result/?q=esp32-s3) |

> **Recomendação**: ESP32 DevKit V1 para prototipagem, ESP32-WROOM-32 para instalação definitiva.

**Preço médio**: R$ 35–60 (DevKit) / R$ 25–40 (módulo WROOM)

---

### 2.2 Sensor Indutivo de Proximidade

O sensor detecta cada rotação do eixo principal da máquina circular. É instalado próximo a uma peça metálica fixa no eixo (engrenagem, parafuso ou alvo magnético).

| Item | Especificação | Link de Compra |
|------|--------------|----------------|
| **LJ12A3-4-Z/BX** | NPN, NO, 4mm distância, 6-36V DC, M12 | [Amazon BR — LJ12A3](https://www.amazon.com.br/s?k=sensor+indutivo+LJ12A3) |
| **LJ18A3-8-Z/BX** | NPN, NO, 8mm distância, 6-36V DC, M18 | [AliExpress — LJ18A3](https://pt.aliexpress.com/w/wholesale-LJ18A3-8-Z-BX.html) |
| **SN04-N** | NPN, NO, 4mm, compacto, 10-30V DC | [Curto Circuito — SN04-N](https://www.curtocircuito.com.br/catalogsearch/result/?q=sensor+indutivo) |

> **Recomendação**: **LJ12A3-4-Z/BX** (mais comum, confiável, barato). Para máquinas com mais vibração ou maior distância do alvo, usar **LJ18A3-8-Z/BX** (8mm de detecção).

**Preço médio**: R$ 15–35

**Tipo do sensor**: NPN (Normally Open) — quando detecta metal, fecha o circuito para GND.

---

### 2.3 Fonte de Alimentação

| Item | Especificação | Link de Compra |
|------|--------------|----------------|
| **Fonte 12V 1A** | Entrada 110/220V, saída 12V DC (para sensor) | [Amazon BR — Fonte 12V](https://www.amazon.com.br/s?k=fonte+12v+1a) |
| **Regulador de tensão LM7805** | Converte 12V → 5V para alimentar o ESP32 | [Curto Circuito — LM7805](https://www.curtocircuito.com.br/catalogsearch/result/?q=lm7805) |
| **Módulo Step-Down LM2596** | Mais eficiente que LM7805, ajustável | [Amazon BR — LM2596](https://www.amazon.com.br/s?k=modulo+lm2596) |
| **Cabo USB-C / Micro-USB** | Alimentação direta do ESP32 via USB 5V | [Amazon BR](https://www.amazon.com.br/s?k=cabo+usb+micro+esp32) |

> **Recomendação**: Usar **Fonte 12V** (para o sensor) + **Módulo LM2596** (step-down para 5V do ESP32). Ou alimentar o ESP32 separadamente via USB 5V e usar a fonte 12V apenas para o sensor.

**Preço médio**: R$ 15–25 (fonte) + R$ 8–15 (step-down)

---

### 2.4 Componentes Auxiliares

| Item | Quantidade | Função | Link |
|------|-----------|--------|------|
| **Resistor 10kΩ** | 1 | Pull-up no pino do sensor | [Curto Circuito](https://www.curtocircuito.com.br/catalogsearch/result/?q=resistor+10k) |
| **Capacitor 100nF (104)** | 1 | Debounce de hardware | [Curto Circuito](https://www.curtocircuito.com.br/catalogsearch/result/?q=capacitor+100nf) |
| **Caixa hermética IP65** | 1 | Proteção contra poeira e umidade | [Amazon BR — Caixa IP65](https://www.amazon.com.br/s?k=caixa+hermetica+ip65+pequena) |
| **Conector GX12/GX16** | 1 par | Conexão sensor ↔ caixa (removível) | [AliExpress — GX12](https://pt.aliexpress.com/w/wholesale-conector-GX12.html) |
| **Fios 22 AWG** | 2m | Conexão sensor → ESP32 | Qualquer loja de eletrônica |
| **Suporte/Braçadeira M12** | 1 | Fixação do sensor na máquina | [Amazon BR — Suporte M12](https://www.amazon.com.br/s?k=suporte+sensor+indutivo+m12) |
| **Protoboard/PCB** | 1 | Montagem do circuito | [Curto Circuito](https://www.curtocircuito.com.br/catalogsearch/result/?q=protoboard) |

---

### 2.5 Infraestrutura de Rede

| Item | Especificação | Observação |
|------|--------------|-----------|
| **Roteador Wi-Fi 2.4GHz** | Qualquer roteador com 2.4GHz | ESP32 só conecta em 2.4GHz (não 5GHz) |
| **Repetidor Wi-Fi** | Opcional, para áreas grandes | Cobertura do setor de produção |
| **IP fixo no roteador** | Reservar IP por MAC do ESP32 | Facilita manutenção |

> ⚠️ O ESP32 opera **apenas em 2.4GHz**. Certifique-se de que a rede Wi-Fi do setor de produção suporte esta frequência.

---

## 3. Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SETOR DE PRODUÇÃO                            │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │ Máquina 1│    │ Máquina 2│    │ Máquina N│                      │
│  │          │    │          │    │          │                      │
│  │ [Sensor] │    │ [Sensor] │    │ [Sensor] │                      │
│  │    ↓     │    │    ↓     │    │    ↓     │                      │
│  │ [ESP32]  │    │ [ESP32]  │    │ [ESP32]  │                      │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘                      │
│       │               │               │                             │
│       └───────────────┼───────────────┘                             │
│                       │ Wi-Fi 2.4GHz                                │
│                  ┌────┴────┐                                        │
│                  │ Roteador│                                        │
│                  └────┬────┘                                        │
└───────────────────────┼─────────────────────────────────────────────┘
                        │ Internet
                        ▼
              ┌─────────────────┐
              │  Edge Function   │
              │ machine-webhook  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   Banco de Dados │
              │ machine_readings │
              │ iot_shift_state  │
              │  productions     │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   Dashboard      │
              │  Tempo Real      │
              └─────────────────┘
```

### Fluxo de Dados

1. **Sensor indutivo** detecta passagem de metal (1 pulso = 1 rotação)
2. **ESP32** conta pulsos via interrupção de hardware (100% preciso)
3. A cada **10 segundos**, ESP32 envia POST HTTP com:
   - `company_id` — UUID da empresa (identifica o tenant)
   - `machine_id` — UUID da máquina no sistema
   - `total_rotations` — contador acumulado desde o boot
   - `rpm` — RPM calculado localmente
   - `timestamp` — horário UTC do envio
4. **Edge Function** recebe, valida `company_id` + `machine_id` + `token` e salva em `machine_readings`
5. **Lógica do servidor** calcula peças, kg, eficiência e credita ao tecelão do turno

---

## 4. Firmware ESP32

### 4.1 Esquema de Ligação

```
                    ESP32 DevKit
                   ┌───────────┐
                   │           │
  Sensor (marrom)──┤ VIN (12V) │──── Fonte 12V (+)
                   │           │
  Sensor (azul) ───┤ GND       │──── Fonte 12V (-)
                   │           │
  Sensor (preto)───┤ GPIO 14   │──── Pino de leitura
                   │     │     │
                   │   [10kΩ]  │──── Pull-up para 3.3V
                   │     │     │
                   │   [100nF] │──── GND (debounce)
                   │           │
                   └───────────┘
```

> **Nota**: Se usar sensor NPN de 3 fios (marrom=VCC, azul=GND, preto=sinal), o sinal vai de HIGH para LOW quando detecta metal.

### 4.2 Código do Firmware

```cpp
// firmware_loomlytics.ino
// Firmware para ESP32 — Monitoramento de RPM via Sensor Indutivo
// Envia dados a cada 10 segundos para a Edge Function

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============ CONFIGURAÇÃO ============
const char* WIFI_SSID     = "REDE_PRODUCAO";
const char* WIFI_PASSWORD  = "senha_da_rede";

// URL da Edge Function (Supabase)
const char* WEBHOOK_URL = "https://etsaleegdpswwsprwyzv.supabase.co/functions/v1/machine-webhook";

// Token de autenticação (API key do dispositivo)
const char* DEVICE_TOKEN = "TOKEN_UNICO_POR_MAQUINA";

// UUID da empresa no sistema Loomlytics (multi-tenant)
const char* COMPANY_ID = "uuid-da-empresa-aqui";

// UUID da máquina no sistema Loomlytics
const char* MACHINE_ID = "uuid-da-maquina-aqui";

// Pino do sensor indutivo
const int SENSOR_PIN = 14;

// Intervalo de envio (milissegundos)
const unsigned long SEND_INTERVAL = 10000; // 10 segundos
// ======================================

// Variáveis globais (volatile para uso em ISR)
volatile unsigned long pulseCount = 0;       // Pulsos desde o boot
volatile unsigned long lastPulseTime = 0;    // Último pulso (micros)
volatile unsigned long pulseInterval = 0;    // Intervalo entre pulsos

// Variáveis de controle
unsigned long totalRotations = 0;
unsigned long lastSendTime = 0;
unsigned long lastPulseCountForRPM = 0;
unsigned long lastRPMCalcTime = 0;
float currentRPM = 0;
bool machineRunning = false;

// Interrupção de hardware — conta cada pulso do sensor
void IRAM_ATTR onSensorPulse() {
  unsigned long now = micros();
  unsigned long interval = now - lastPulseTime;
  
  // Debounce: ignorar pulsos com menos de 5ms de intervalo
  // (para 30 RPM = 500ms/rotação, 5ms é seguro)
  if (interval > 5000) {  // 5000 micros = 5ms
    pulseCount++;
    pulseInterval = interval;
    lastPulseTime = now;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("Loomlytics IoT — Iniciando...");
  
  // Configurar pino do sensor com pull-up interno
  pinMode(SENSOR_PIN, INPUT_PULLUP);
  
  // Attachar interrupção na borda de descida (sensor NPN)
  attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), onSensorPulse, FALLING);
  
  // Conectar Wi-Fi
  connectWiFi();
  
  lastSendTime = millis();
  lastRPMCalcTime = millis();
  
  Serial.println("Sistema pronto. Aguardando pulsos do sensor...");
}

void loop() {
  // Reconectar Wi-Fi se necessário
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  
  unsigned long now = millis();
  
  // Calcular RPM a cada segundo
  if (now - lastRPMCalcTime >= 1000) {
    noInterrupts();
    unsigned long currentPulses = pulseCount;
    unsigned long currentInterval = pulseInterval;
    unsigned long lastPulse = lastPulseTime;
    interrupts();
    
    unsigned long deltaPulses = currentPulses - lastPulseCountForRPM;
    float elapsed = (now - lastRPMCalcTime) / 1000.0;
    
    if (deltaPulses > 0 && elapsed > 0) {
      currentRPM = (deltaPulses / elapsed) * 60.0;
      machineRunning = true;
    } else {
      // Se não houve pulsos nos últimos 3 segundos, máquina parada
      unsigned long timeSinceLastPulse = micros() - lastPulse;
      if (timeSinceLastPulse > 3000000) { // 3 segundos
        currentRPM = 0;
        machineRunning = false;
      }
    }
    
    lastPulseCountForRPM = currentPulses;
    lastRPMCalcTime = now;
  }
  
  // Enviar dados a cada SEND_INTERVAL (10s)
  if (now - lastSendTime >= SEND_INTERVAL) {
    noInterrupts();
    totalRotations = pulseCount;
    interrupts();
    
    sendData(totalRotations, currentRPM, machineRunning);
    lastSendTime = now;
  }
  
  delay(10); // Pequeno delay para não sobrecarregar o loop
}

void sendData(unsigned long rotations, float rpm, bool running) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  http.begin(WEBHOOK_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.setTimeout(5000); // 5s timeout
  
  // Montar JSON
  StaticJsonDocument<256> doc;
  doc["company_id"] = COMPANY_ID;
  doc["machine_id"] = MACHINE_ID;
  doc["total_rotations"] = rotations;
  doc["rpm"] = round(rpm * 10) / 10.0;  // 1 casa decimal
  doc["is_running"] = running;
  doc["uptime_ms"] = millis();
  doc["wifi_rssi"] = WiFi.RSSI();
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  int httpCode = http.POST(jsonStr);
  
  if (httpCode == 200) {
    Serial.printf("[OK] Rotações: %lu | RPM: %.1f | Running: %s\n", 
      rotations, rpm, running ? "SIM" : "NÃO");
  } else {
    Serial.printf("[ERRO] HTTP %d — tentando novamente em 10s\n", httpCode);
  }
  
  http.end();
}

void connectWiFi() {
  Serial.printf("Conectando a %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  WiFi.setAutoReconnect(true);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConectado! IP: %s | RSSI: %d dBm\n", 
      WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("\nFalha na conexão. Tentando novamente em 5s...");
    delay(5000);
  }
}
```

### 4.3 Por que Envio a Cada 10 Segundos?

| Intervalo | Prós | Contras |
|-----------|------|---------|
| 1s | Máxima precisão de downtime | Alto volume de dados, sobrecarga rede |
| **10s** ✅ | **Boa precisão, baixo tráfego** | **Máx. 10s de imprecisão no downtime** |
| 30s | Mínimo tráfego | Perde até 30s de downtime |
| 60s | Ultra baixo tráfego | Imprecisão inaceitável |

> **10 segundos** é o equilíbrio ideal: detecta paradas com no máximo 10s de erro (desprezível em turnos de 7-8h) e gera apenas ~6 requests/minuto por máquina.

### 4.4 Precisão — Por que é 100%?

A contagem de pulsos é feita via **interrupção de hardware** (`attachInterrupt`), não por polling. Isso significa:

- ✅ **Cada rotação gera 1 pulso** → contado instantaneamente pelo hardware
- ✅ **Não perde pulsos** — a interrupção tem prioridade sobre qualquer código
- ✅ O envio a cada 10s transmite o **total acumulado** (`total_rotations`), não uma amostra
- ✅ Se o HTTP falhar, o contador não zera — o próximo envio terá o total correto
- ✅ O servidor calcula `delta = total_atual - total_anterior` para saber quantas rotações ocorreram

**A precisão do envio não afeta a precisão da contagem.** O ESP32 conta 100% dos pulsos localmente; o envio é apenas a transmissão do total acumulado.

---

## 5. Backend — Edge Function `machine-webhook`

### 5.1 Endpoint

```
POST /functions/v1/machine-webhook
```

### 5.2 Headers

```
Content-Type: application/json
Authorization: Bearer <DEVICE_TOKEN>
```

### 5.3 Body (JSON)

```json
{
  "company_id": "uuid-da-empresa",
  "machine_id": "uuid-da-maquina",
  "total_rotations": 158432,
  "rpm": 22.5,
  "is_running": true,
  "uptime_ms": 3600000,
  "wifi_rssi": -45
}
```

### 5.4 Lógica da Edge Function

```typescript
// supabase/functions/machine-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Validar token do dispositivo
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json();
  const { company_id, machine_id, total_rotations, rpm, is_running, uptime_ms, wifi_rssi } = body;

  if (!company_id || !machine_id) {
    return new Response("Missing company_id or machine_id", { status: 400 });
  }

  // Verificar se o token pertence a um dispositivo registrado E pertence à empresa informada
  const { data: device } = await supabase
    .from("iot_devices")
    .select("machine_id, company_id")
    .eq("token", token)
    .eq("machine_id", machine_id)
    .eq("company_id", company_id)
    .eq("active", true)
    .single();

  if (!device) {
    return new Response("Unauthorized — token/company/machine mismatch", { status: 401 });
  }

  // 1. Salvar leitura bruta
  await supabase.from("machine_readings").insert({
    machine_id: device.machine_id,
    company_id: device.company_id,
    total_rotations,
    rpm: rpm || 0,
    is_running: is_running ?? (rpm > 0),
    uptime_ms,
    wifi_rssi,
  });

  // 2. Buscar última leitura para calcular delta
  const { data: lastReading } = await supabase
    .from("machine_readings")
    .select("total_rotations, created_at")
    .eq("machine_id", device.machine_id)
    .order("created_at", { ascending: false })
    .range(1, 1)  // segunda mais recente (a primeira é a que acabamos de inserir)
    .single();

  if (lastReading) {
    const deltaRotations = total_rotations - lastReading.total_rotations;
    
    if (deltaRotations > 0) {
      // 3. Atualizar estado do turno (acumular voltas parciais)
      await updateShiftState(supabase, device, deltaRotations, rpm);
    }
  }

  // 4. Verificar se é hora de trocar de turno
  await checkShiftChange(supabase, device);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function updateShiftState(supabase, device, deltaRotations, rpm) {
  const { machine_id, company_id } = device;
  
  // Buscar estado atual do turno
  const { data: state } = await supabase
    .from("iot_shift_state")
    .select("*")
    .eq("machine_id", machine_id)
    .single();

  if (!state) return;

  // Buscar artigo da máquina e suas voltas por rolo
  const { data: machine } = await supabase
    .from("machines")
    .select("article_id, rpm as target_rpm")
    .eq("id", machine_id)
    .single();

  if (!machine?.article_id) return;

  // Buscar voltas por rolo (específica da máquina ou padrão do artigo)
  const { data: amt } = await supabase
    .from("article_machine_turns")
    .select("turns_per_roll")
    .eq("article_id", machine.article_id)
    .eq("machine_id", machine_id)
    .single();

  const { data: article } = await supabase
    .from("articles")
    .select("turns_per_roll, weight_per_roll, value_per_kg")
    .eq("id", machine.article_id)
    .single();

  const turnsPerRoll = amt?.turns_per_roll || article?.turns_per_roll || 0;
  if (turnsPerRoll === 0) return;

  // Acumular voltas parciais
  const newPartialTurns = (state.partial_turns || 0) + deltaRotations;
  const completedRolls = Math.floor(newPartialTurns / turnsPerRoll);
  const remainingTurns = newPartialTurns % turnsPerRoll;

  // Atualizar estado
  await supabase
    .from("iot_shift_state")
    .update({
      partial_turns: remainingTurns,
      total_turns: (state.total_turns || 0) + deltaRotations,
      completed_rolls: (state.completed_rolls || 0) + completedRolls,
      last_rpm: rpm,
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id);
}

async function checkShiftChange(supabase, device) {
  // Buscar horários de turno da empresa
  const { data: settings } = await supabase
    .from("company_settings")
    .select("shift_manha_start, shift_manha_end, shift_tarde_start, shift_tarde_end, shift_noite_start, shift_noite_end")
    .eq("company_id", device.company_id)
    .single();

  if (!settings) return;

  const now = new Date();
  const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"
  
  // Determinar turno atual
  const currentShift = determineShift(currentTimeStr, settings);
  
  // Buscar estado atual
  const { data: state } = await supabase
    .from("iot_shift_state")
    .select("*")
    .eq("machine_id", device.machine_id)
    .single();

  if (!state) return;

  // Se o turno mudou, finalizar o anterior e iniciar o novo
  if (state.current_shift !== currentShift) {
    await finalizeShift(supabase, device, state);
    await startNewShift(supabase, device, currentShift, state.partial_turns);
  }
}
```

---

## 6. Banco de Dados — Tabelas IoT

### 6.1 `iot_devices` — Registro de dispositivos ESP32

```sql
CREATE TABLE public.iot_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,          -- Token único de autenticação
  name TEXT,                           -- Ex: "ESP32-TEAR01"
  active BOOLEAN NOT NULL DEFAULT true,
  firmware_version TEXT,               -- Ex: "1.0.0"
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 6.2 `machine_readings` — Leituras brutas do sensor

```sql
CREATE TABLE public.machine_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  total_rotations BIGINT NOT NULL,     -- Contador acumulado desde o boot
  rpm NUMERIC NOT NULL DEFAULT 0,      -- RPM calculado pelo ESP32
  is_running BOOLEAN NOT NULL DEFAULT false,
  uptime_ms BIGINT,                    -- Tempo desde o boot do ESP32
  wifi_rssi INTEGER,                   -- Força do sinal Wi-Fi
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para consultas rápidas por máquina e data
CREATE INDEX idx_readings_machine_time 
  ON machine_readings (machine_id, created_at DESC);

-- Particionamento por mês (recomendado para alto volume)
-- A cada ~6 leituras/min × 60min × 24h × 30dias = ~259.200 registros/máquina/mês
```

### 6.3 `iot_shift_state` — Estado do turno em andamento

```sql
CREATE TABLE public.iot_shift_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  current_shift TEXT NOT NULL,              -- 'manha', 'tarde', 'noite'
  weaver_id UUID REFERENCES weavers(id),   -- Tecelão ativo
  article_id UUID REFERENCES articles(id), -- Artigo em produção
  partial_turns BIGINT NOT NULL DEFAULT 0,  -- Voltas parciais (não completaram 1 rolo)
  total_turns BIGINT NOT NULL DEFAULT 0,    -- Total de voltas no turno
  completed_rolls INTEGER NOT NULL DEFAULT 0,-- Rolos completos no turno
  last_rpm NUMERIC DEFAULT 0,
  shift_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (machine_id)                       -- Apenas 1 estado por máquina
);
```

### 6.4 `iot_downtime_events` — Registro de paradas

```sql
CREATE TABLE public.iot_downtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,                -- Calculado ao finalizar
  shift TEXT NOT NULL,
  weaver_id UUID REFERENCES weavers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. Lógica de Contagem de Peças

### Princípio

O ESP32 envia o **total_rotations** acumulado. O servidor calcula o **delta** (diferença):

```
delta = total_rotations_atual - total_rotations_anterior
```

Esse delta é somado às **voltas parciais** (`partial_turns`) do turno:

```
novas_parciais = partial_turns + delta
rolos_completos = FLOOR(novas_parciais / voltas_por_rolo)
partial_turns = novas_parciais % voltas_por_rolo
```

### Exemplo

- Artigo: 2000 voltas/rolo, 20kg/rolo, R$ 15/kg
- Leitura anterior: `total_rotations = 50000`
- Leitura atual: `total_rotations = 50150`
- Delta: `150 rotações`
- Parciais anteriores: `1900`
- Novas parciais: `1900 + 150 = 2050`
- Rolos completos: `FLOOR(2050 / 2000) = 1` ✅
- Sobra: `2050 % 2000 = 50 voltas` (parcial para próximo rolo)

---

## 8. Crédito Proporcional por Turno

### ⚠️ O Problema

Se contássemos apenas **peças inteiras**, o tecelão que faz 1900 de 2000 voltas de um rolo **não receberia crédito algum** — e o próximo tecelão que faz apenas 100 voltas levaria o crédito de 1 rolo inteiro (20kg).

### ✅ A Solução: Crédito Proporcional

Ao final de cada turno, o sistema calcula a **produção fracionária** com base nas voltas realizadas:

```
fração_do_rolo = voltas_no_turno / voltas_por_rolo
kg_proporcional = fração_do_rolo × peso_por_rolo
faturamento_proporcional = kg_proporcional × valor_por_kg
```

### Exemplo Detalhado

**Artigo**: 2000 voltas/rolo, 20kg/rolo, R$ 15/kg

#### Tecelão A — Turno da Manhã (05:00 – 13:30)
- Produziu: **4.500 voltas** no turno
- Rolos completos: `FLOOR(4500 / 2000) = 2 rolos`
- Voltas parciais: `4500 % 2000 = 500 voltas`
- **Crédito**:
  - Rolos inteiros: 2 × 20kg = 40kg
  - Parcial: `(500 / 2000) × 20 = 5kg`
  - **Total: 45kg** → R$ 675,00
  - Eficiência calculada sobre o tempo do turno dele

#### Tecelão B — Turno da Tarde (13:30 – 22:00)
- Herda: **500 voltas** parciais (do rolo em andamento)
- Produziu mais: **3.800 voltas** no turno
- Total do rolo em andamento: `500 (herdadas) + 1500 (para completar) = 2000` → 1 rolo
- Mas o crédito dele é apenas sobre suas **3.800 voltas**:
  - Rolos creditados: `FLOOR(3800 / 2000) = 1 rolo` (+ parcial)
  - Parcial: `3800 % 2000 = 1800 voltas` → `(1800/2000) × 20 = 18kg`
  - **Total: 20 + 18 = 38kg** → R$ 570,00

> **Resultado**: Tecelão A recebe crédito por 45kg (incluindo as 500 voltas parciais que fez), e Tecelão B recebe crédito por 38kg (incluindo suas voltas parciais). **Ninguém perde produção.**

### Como Funciona na Prática

1. **Snapshot na troca de turno**: O sistema captura `partial_turns` e `total_turns` no momento exato da troca
2. **Registro proporcional**: Cria um registro em `productions` com `rolls_produced` fracionário (ex: `2.25`)
3. **Herança de voltas**: As `partial_turns` são transferidas para o novo turno, mas o crédito delas já foi dado ao tecelão anterior
4. **O novo tecelão começa do zero**: Seu crédito é calculado apenas pelas voltas que ELE produzir

### Campos no Registro de Produção

```json
{
  "machine_id": "uuid",
  "weaver_id": "uuid-tecelao-A",
  "date": "2025-03-29",
  "shift": "manha",
  "rolls_produced": 2.25,           // ← Fracionário (crédito proporcional)
  "weight_kg": 45.0,                // ← 2.25 × 20kg
  "revenue": 675.0,                 // ← 45 × R$15
  "efficiency": 85.3,               // ← Calculada sobre o turno
  "source": "iot",                  // ← Diferencia do registro manual
  "partial_turns_at_end": 500       // ← Voltas parciais ao encerrar
}
```

---

## 9. Troca Automática de Turno

### Fluxo

```
13:29:50 → Último envio do ESP32 no turno manhã
13:30:00 → TROCA DE TURNO detectada pelo servidor
           │
           ├── 1. Captura partial_turns e total_turns
           ├── 2. Calcula produção proporcional do Tecelão A
           ├── 3. Insere registro em productions (source: 'iot')
           ├── 4. Registra downtime acumulado do turno
           ├── 5. Inicia novo estado para turno tarde
           │      ├── partial_turns = 0 (crédito já dado)
           │      ├── total_turns = 0
           │      ├── completed_rolls = 0
           │      └── weaver_id = tecelão do turno tarde
           └── 6. Próximo envio do ESP32 acumula para o novo turno
```

### Determinação do Tecelão

O sistema identifica qual tecelão está na máquina de duas formas:

1. **Escala fixa**: Tecelão com `shift_type = 'fixo'` e `fixed_shift = 'manha'` é automaticamente associado
2. **Check-in**: Tecelão faz login na máquina via app/terminal (para escalas variáveis)

### Transferência de Voltas Parciais

> **IMPORTANTE**: As voltas parciais são creditadas proporcionalmente ao tecelão que as produziu. O novo turno inicia com `partial_turns = 0` no que diz respeito a crédito, mas a **posição real do rolo** (quantas voltas já foram feitas no rolo físico em andamento) é mantida internamente para saber quando o rolo efetivamente completa.

Para isso, o `iot_shift_state` mantém dois campos:
- `partial_turns`: voltas do tecelão atual (zerado na troca)
- `roll_position`: posição real no rolo físico (nunca zera até completar o rolo)

```sql
-- Adição ao iot_shift_state
ALTER TABLE iot_shift_state ADD COLUMN roll_position BIGINT NOT NULL DEFAULT 0;
-- roll_position = voltas feitas no rolo atual (não zera na troca de turno)
-- partial_turns = voltas feitas pelo tecelão atual (zera na troca de turno)
```

---

## 10. Cálculos Automáticos

### Por Turno (ao finalizar)

| Métrica | Fórmula |
|---------|---------|
| **Rolos (fracionário)** | `total_turns / voltas_por_rolo` |
| **Kg produzidos** | `rolos × peso_por_rolo` |
| **Faturamento** | `kg × valor_por_kg` |
| **Tempo em manutenção justificada** | Soma dos períodos com status ≠ `ativa` no turno (via `machine_logs`) |
| **Tempo disponível** | `tempo_turno - tempo_em_manutenção_justificada` |
| **Tempo ativo (uptime)** | `tempo_disponível - soma_downtimes_injustificados` |
| **Eficiência** | `(uptime / tempo_disponível) × (rpm_médio / rpm_meta) × 100` |
| **Kg/hora** | `kg / (uptime / 3600)` |

> ⚠️ **Importante**: A eficiência é calculada sobre o `tempo_disponível` (não o tempo total do turno), garantindo que manutenções justificadas não penalizem o tecelão.

### Cruzamento IoT × Status da Máquina (machine_logs)

O cálculo de eficiência **cruza obrigatoriamente** o sinal IoT com o status da máquina no sistema (`machine_logs`). Isso garante justiça no cálculo:

| Sinal IoT (RPM) | Status no Sistema | Desconta Eficiência? | Motivo |
|------------------|-------------------|----------------------|--------|
| RPM = 0 | **Ativa** | ✅ **SIM** | Parada inesperada — penaliza eficiência |
| RPM = 0 | **Manutenção Preventiva** | ❌ **NÃO** | Parada planejada — tempo descontado do turno |
| RPM = 0 | **Manutenção Corretiva** | ❌ **NÃO** | Parada justificada — tempo descontado do turno |
| RPM = 0 | **Troca de Artigo** | ❌ **NÃO** | Operação planejada — tempo descontado do turno |
| RPM = 0 | **Troca de Agulhas** | ❌ **NÃO** | Operação planejada — tempo descontado do turno |
| RPM = 0 | **Inativa** | ❌ **NÃO** | Máquina fora de operação — não entra no cálculo |
| RPM > 0 | **Ativa** | — | Produzindo normalmente |
| RPM > 0 | **Manutenção/Inativa** | ⚠️ **ALERTA** | Inconsistência — máquina produzindo mas marcada como parada |

#### Lógica de Cálculo Detalhada

```
# 1. Buscar períodos de manutenção no turno (machine_logs com status ≠ 'ativa')
manutencoes_no_turno = SELECT * FROM machine_logs 
  WHERE machine_id = $1 
  AND status != 'ativa'
  AND (started_at, COALESCE(ended_at, now())) OVERLAPS ($shift_start, $shift_end)

# 2. Calcular tempo total em manutenção justificada (clampado ao turno)
tempo_manutencao = 0
PARA CADA manutenção:
  inicio = MAX(manutencao.started_at, shift_start)
  fim = MIN(COALESCE(manutencao.ended_at, now()), shift_end)
  tempo_manutencao += (fim - inicio)

# 3. Tempo disponível = tempo do turno menos manutenções justificadas
tempo_disponivel = tempo_turno - tempo_manutencao

# 4. Downtimes injustificados = paradas IoT ENQUANTO máquina estava como 'ativa'
downtimes_injustificados = SELECT * FROM iot_downtime_events
  WHERE machine_id = $1
  AND started_at BETWEEN $shift_start AND $shift_end
  AND NOT EXISTS (
    -- Excluir downtimes que caem dentro de um período de manutenção
    SELECT 1 FROM machine_logs ml
    WHERE ml.machine_id = iot_downtime_events.machine_id
    AND ml.status != 'ativa'
    AND ml.started_at <= iot_downtime_events.started_at
    AND (ml.ended_at IS NULL OR ml.ended_at >= iot_downtime_events.ended_at)
  )

# 5. Uptime = tempo disponível menos paradas injustificadas
uptime = tempo_disponivel - soma(downtimes_injustificados.duracao)

# 6. Eficiência final
eficiencia = (uptime / tempo_disponivel) × (rpm_medio / rpm_meta) × 100
```

#### Exemplo Prático

```
Turno: Manhã (05:00 - 13:30) = 510 minutos
Máquina: TEAR 01, RPM meta = 25

Timeline do turno:
  05:00 - 07:30  → Produzindo (RPM ~24)         = 150 min ✅
  07:30 - 08:00  → RPM = 0, status = ATIVA       = 30 min ❌ (downtime injustificado)
  08:00 - 09:00  → Manutenção Preventiva          = 60 min (justificado, desconta do turno)
  09:00 - 13:00  → Produzindo (RPM ~25)          = 240 min ✅
  13:00 - 13:30  → RPM = 0, status = ATIVA       = 30 min ❌ (downtime injustificado)

Cálculo:
  tempo_turno = 510 min
  tempo_manutencao = 60 min (preventiva das 08:00-09:00)
  tempo_disponivel = 510 - 60 = 450 min
  downtimes_injustificados = 30 + 30 = 60 min
  uptime = 450 - 60 = 390 min
  rpm_medio (quando rodando) = 24.5
  
  eficiencia = (390 / 450) × (24.5 / 25) × 100
            = 0.8667 × 0.98 × 100
            = 84.9%
  
  SEM esse cruzamento (fórmula antiga errada):
  eficiencia = (390 / 510) × (24.5 / 25) × 100
            = 0.7647 × 0.98 × 100  
            = 74.9%  ← INJUSTO! Penaliza o tecelão pela manutenção
```

#### Detecção de Inconsistências

O sistema deve emitir **alertas automáticos** quando detectar inconsistências entre IoT e status:

```typescript
// Alerta: máquina marcada como manutenção mas ESP32 detecta RPM > 0
if (rpm > 0 && machineStatus !== 'ativa') {
  await insertAlert({
    type: 'inconsistency',
    machine_id,
    message: `TEAR ${machine.number} está com RPM=${rpm} mas status="${machineStatus}"`,
    severity: 'warning',
  });
}

// Alerta: máquina como ativa mas parada por mais de 15 minutos
if (downtimeMinutes > 15 && machineStatus === 'ativa') {
  await insertAlert({
    type: 'long_unplanned_stop',
    machine_id,
    message: `TEAR ${machine.number} parada há ${downtimeMinutes}min sem manutenção registrada`,
    severity: 'info',
  });
}
```

### RPM Médio

Calculado a partir dos registros em `machine_readings` durante o turno, considerando **apenas períodos com `is_running = true`**:

```sql
SELECT AVG(rpm) 
FROM machine_readings 
WHERE machine_id = $1 
  AND is_running = true
  AND created_at BETWEEN $shift_start AND $shift_end;
```

---

## 11. Detecção de Paradas

### Como Funciona

O ESP32 envia `is_running: false` quando não detecta pulsos por **3 segundos**. O servidor registra:

1. **Início da parada**: Primeiro envio com `is_running = false` após período ativo
2. **Fim da parada**: Primeiro envio com `is_running = true` após período parado
3. **Duração**: `ended_at - started_at`

### Precisão

Com envio a cada **10 segundos**, a detecção de parada tem precisão de ±10s:

| Cenário | Imprecisão |
|---------|-----------|
| Máquina para no segundo 0 | Detectada no segundo 10 → +10s de atraso |
| Máquina para no segundo 9 | Detectada no segundo 10 → +1s de atraso |
| **Média** | **~5 segundos de atraso** |

> Em um turno de 8h (28.800s), 5s de imprecisão = **0,017%** — completamente desprezível.

### Parada vs. Manutenção — Classificação Inteligente

O sistema classifica automaticamente cada parada cruzando o sinal IoT com o status da máquina em `machine_logs`:

| Tipo de Parada | Condição | Ação no Sistema |
|----------------|----------|-----------------|
| **Downtime injustificado** | RPM = 0 + status `ativa` | Registra em `iot_downtime_events`, **penaliza eficiência** |
| **Manutenção justificada** | RPM = 0 + status ≠ `ativa` | **NÃO registra** como downtime IoT — o tempo é descontado do turno via `machine_logs` |
| **Parada curta (<2min)** | RPM = 0 por < 2min + status `ativa` | Registra como micro-parada, pode ser agrupada em relatórios |
| **Parada longa (>15min)** | RPM = 0 por > 15min + status `ativa` | Registra + emite **alerta** sugerindo registrar manutenção |
| **Inconsistência** | RPM > 0 + status ≠ `ativa` | Emite **alerta de inconsistência** para o admin |

#### Fluxo de Decisão na Edge Function

```
ESP32 envia dados → machine-webhook recebe

1. Verificar status atual da máquina em machine_logs:
   SELECT status FROM machines WHERE id = $machine_id
   
2. SE is_running = false:
   a. SE status = 'ativa':
      → Registrar/atualizar downtime em iot_downtime_events
      → Este tempo VAI penalizar eficiência
      
   b. SE status IN ('manutencao_preventiva', 'manutencao_corretiva', 
                     'troca_artigo', 'troca_agulhas'):
      → NÃO registrar downtime IoT
      → O tempo já está sendo rastreado em machine_logs
      → A Edge Function ignora a parada para fins de eficiência
      
   c. SE status = 'inativa':
      → Ignorar completamente (máquina fora de operação)
      → Não registrar leituras nem downtimes

3. SE is_running = true E status != 'ativa':
   → Emitir alerta de inconsistência
   → Registrar leitura normalmente (dados não se perdem)
```

> **Resumo**: O mecânico para a máquina e registra manutenção no app → o IoT detecta RPM = 0 mas **não penaliza** eficiência porque o status justifica a parada. Se a máquina para e ninguém registra manutenção, o downtime **penaliza** eficiência como parada inesperada.

---

## 12. Associação Tecelão ↔ Máquina

### Opção 1: Escala Fixa (Recomendado para início)

Usa os dados existentes do sistema:
- Tabela `weavers` com `shift_type = 'fixo'` e `fixed_shift = 'manha'|'tarde'|'noite'`
- O administrador configura qual tecelão opera qual máquina em cada turno

**Nova tabela necessária**:

```sql
CREATE TABLE public.iot_machine_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  weaver_id UUID NOT NULL REFERENCES weavers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift TEXT NOT NULL,                    -- 'manha', 'tarde', 'noite'
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (machine_id, shift, active)     -- 1 tecelão por máquina por turno
);
```

### Opção 2: Check-in via App/Terminal

O tecelão se identifica ao começar o turno:
- Via **código do tecelão** (#100-#999) em um terminal no setor
- Via **app mobile** com QR code da máquina
- Via **teclado numérico** conectado ao ESP32 (hardware adicional)

### Opção 3: Check-in via ESP32 + Display (Hardware Adicional)

| Item | Especificação | Link |
|------|--------------|------|
| **Display OLED 0.96" SSD1306** | I2C, 128x64 pixels | [Amazon BR — OLED SSD1306](https://www.amazon.com.br/s?k=display+oled+0.96+ssd1306) |
| **Teclado Matricial 4x4** | Membrana, 16 teclas | [Amazon BR — Teclado 4x4](https://www.amazon.com.br/s?k=teclado+matricial+4x4+arduino) |

Com esses componentes, o tecelão digita seu código (#XXX) no teclado do ESP32 e o display confirma. Preço adicional: ~R$ 25-40.

---

## 13. Fluxo Completo (Exemplo)

### Cenário
- **Máquina**: TEAR 01, RPM meta: 25
- **Artigo**: Malha Jersey, 2000 voltas/rolo, 20kg/rolo, R$ 15/kg
- **Tecelão Manhã**: João (#101), turno 05:00–13:30
- **Tecelão Tarde**: Maria (#102), turno 13:30–22:00

### Timeline

```
05:00 - Turno manhã inicia. Sistema detecta João (#101) na TEAR 01.
         Estado: partial_turns=0, roll_position=0, completed_rolls=0
         
05:00:10 - ESP32 envia: total_rotations=0, rpm=24, is_running=true
05:00:20 - ESP32 envia: total_rotations=4, rpm=24
           delta=4, roll_position=4, partial_turns=4

... (produção contínua) ...

08:30:00 - ESP32 envia: total_rotations=12600, rpm=0, is_running=false
           → Máquina parou! Início de downtime registrado.
08:35:10 - ESP32 envia: total_rotations=12600, rpm=23, is_running=true
           → Parada de ~5min registrada como downtime.

... (produção contínua) ...

13:30:00 - TROCA DE TURNO!
           Estado final de João:
           - total_turns = 4500 voltas
           - roll_position = 500 (dentro do rolo atual)
           - completed_rolls = 2 rolos inteiros
           
           CRÉDITO PROPORCIONAL (João):
           - Rolos inteiros: 2 × 20kg = 40kg
           - Parcial: (500/2000) × 20 = 5kg
           - Total: 45kg → R$ 675,00
           - Uptime: 490min de 510min → 96%
           - Eficiência: 96% × (24/25) = 92.2%
           
           → Registro salvo em productions (source: 'iot')
           
           NOVO TURNO (Maria):
           - partial_turns = 0 (crédito de João já foi dado)
           - roll_position = 500 (posição real no rolo físico)
           - completed_rolls = 0

13:30:10 - ESP32 envia: delta=4 rotações
           Maria: partial_turns=4, roll_position=504

... (Maria produz 1500 voltas, completando o rolo que João iniciou) ...

14:xx:xx - roll_position atinge 2000 → ROLO COMPLETO!
           Mas o crédito de Maria é apenas suas voltas:
           partial_turns = 1500, roll_position reseta para 0
           completed_rolls = 0 (o rolo "completo" não conta inteiro para ela)
           
           No fim do turno, Maria recebe crédito pelas SUAS voltas.

22:00:00 - TROCA DE TURNO!
           Estado final de Maria:
           - total_turns = 3800 voltas
           - Crédito: (3800/2000) × 20 = 38kg → R$ 570,00
```

---

## 14. Compatibilidade com Máquinas

### Máquinas Circulares Compatíveis

O sensor indutivo funciona com **qualquer máquina circular** que tenha um eixo rotativo acessível:

| Fabricante | Modelos | Observação |
|-----------|---------|-----------|
| **Orizio** | Série MJ, Série JE, Série MV | Eixo principal acessível |
| **Fukuhara** | Série VX, Série VXC, Série LX | Engrenagem externa visível |
| **Mayer** | OVJA, OUJA, MGOJ | Eixo com roda dentada |
| **Pai Lung** | Série PL | Eixo principal acessível |
| **Terrot** | Série S, Série UP | Engrenagem inferior |
| **Jiunn Long** | Série JL | Similar a Orizio |
| **Unitex** | Série UM | Eixo acessível |

> O sensor é **universal** — funciona com qualquer máquina que tenha uma parte metálica girando. A instalação é adaptada para cada modelo.

### Alvo para o Sensor

Se a máquina não tiver uma engrenagem/parafuso visível no eixo, instalar um **alvo metálico**:
- Parafuso M6 ou M8 fixado no eixo
- Chapa metálica pequena soldada/aparafusada
- O sensor detecta a passagem do alvo 1× por rotação

---

## 15. Instalação Física

### Passo a Passo

1. **Identificar ponto de detecção**: Localizar engrenagem, parafuso ou instalar alvo metálico no eixo principal
2. **Fixar sensor**: Usar suporte M12, ajustar distância (2-4mm do alvo)
3. **Montar caixa**: ESP32 + fonte dentro da caixa IP65, longe de calor/vibração
4. **Cabeamento**: Sensor → caixa via conector GX12 (fácil manutenção)
5. **Configurar firmware**: Definir SSID, token, company_id, machine_id
6. **Testar**: Girar eixo manualmente e verificar contagem no Serial Monitor
7. **Calibrar**: Comparar contagem do ESP32 com contagem manual por 10 minutos
8. **Ativar**: Registrar dispositivo no sistema e iniciar monitoramento

### Cuidados

- ⚠️ Manter sensor longe de fontes de calor intenso
- ⚠️ Usar caixa IP65 para proteção contra poeira/fibras
- ⚠️ Cabeamento protegido com conduíte flexível
- ⚠️ Distância máxima do roteador Wi-Fi: ~30m (em ambiente industrial)
- ⚠️ Alimentação estável — usar fonte com filtro EMI se possível

---

## 16. Segurança e Confiabilidade

### Autenticação Multi-Tenant
- Cada ESP32 tem um **token único** (`DEVICE_TOKEN`) + **company_id** + **machine_id**
- Edge Function valida a tripla `token + company_id + machine_id` contra a tabela `iot_devices`
- Isso garante que um dispositivo não pode enviar dados para outra empresa
- Tokens podem ser revogados individualmente por empresa

### Resiliência a Falhas

| Cenário | Comportamento |
|---------|--------------|
| Wi-Fi cai | ESP32 continua contando pulsos localmente; ao reconectar, envia o total correto |
| Edge Function fora | ESP32 tenta a cada 10s; contador local não perde dados |
| ESP32 reinicia | `total_rotations` reseta para 0; servidor detecta e ajusta |
| Falta de energia | Dados até o último envio estão salvos; turno é finalizado com os dados disponíveis |

### Detecção de Reset do ESP32

Quando `total_rotations` atual < anterior, o servidor entende que houve reinício:

```typescript
if (total_rotations < lastReading.total_rotations) {
  // ESP32 reiniciou — tratar total_rotations como novo delta
  deltaRotations = total_rotations; // Total desde o boot = delta real
}
```

### Validação de Dados

- RPM máximo aceito: **50 RPM** (acima disso, descarta como ruído)
- Delta máximo por intervalo: `RPM_MAX × intervalo_segundos` (proteção contra dados corrompidos)
- Timestamp do servidor (não do ESP32) para evitar manipulação

---

## 17. Estimativa de Custos

### Por Máquina

| Componente | Preço (R$) |
|-----------|-----------|
| ESP32 DevKit V1 | 35–60 |
| Sensor Indutivo LJ12A3-4-Z/BX | 15–35 |
| Fonte 12V 1A | 15–25 |
| Módulo Step-Down LM2596 | 8–15 |
| Caixa Hermética IP65 | 15–30 |
| Conector GX12 (par) | 10–20 |
| Resistor + Capacitor + Fios | 5–10 |
| Suporte/Braçadeira M12 | 8–15 |
| **TOTAL por máquina** | **~R$ 110–210** |

### Para uma Fábrica (exemplo: 20 máquinas)

| Item | Custo |
|------|-------|
| 20 kits completos | R$ 2.200 – R$ 4.200 |
| Roteador Wi-Fi industrial | R$ 200 – R$ 500 |
| Repetidor (se necessário) | R$ 100 – R$ 300 |
| Instalação e calibração | R$ 500 – R$ 1.500 (DIY ou terceirizado) |
| **TOTAL estimado** | **R$ 3.000 – R$ 6.500** |

### Opcionais (por máquina)

| Item | Preço (R$) | Função |
|------|-----------|--------|
| Display OLED 0.96" | 15–25 | Mostrar RPM/status no local |
| Teclado matricial 4x4 | 10–15 | Check-in do tecelão |
| Buzzer | 3–5 | Alerta sonoro de parada |

---

## 📝 Notas de Implementação

### Fase 1 — MVP
- [ ] Criar tabelas IoT no banco de dados
- [ ] Criar Edge Function `machine-webhook`
- [ ] Montar 1 protótipo ESP32 + sensor
- [ ] Testar com 1 máquina por 1 semana
- [ ] Validar contagem vs. registro manual

### Fase 2 — Produção
- [ ] Implementar crédito proporcional no backend
- [ ] Implementar troca automática de turno
- [ ] Implementar detecção de paradas
- [ ] Dashboard de monitoramento em tempo real
- [ ] Escalar para todas as máquinas

### Fase 3 — Avançado
- [ ] Check-in do tecelão via display + teclado
- [ ] Alertas via WhatsApp para paradas longas
- [ ] OTA (Over-The-Air) update do firmware
- [ ] Integração com Modo TV (exibir dados IoT na tela)
- [ ] Relatórios de eficiência IoT vs. manual

---

## 🔗 Links Úteis

- [Documentação ESP32 (Espressif)](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/)
- [Arduino IDE para ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html)
- [ArduinoJson Library](https://arduinojson.org/)
- [Sensor Indutivo — Datasheet LJ12A3](https://www.alldatasheet.com/datasheet-pdf/pdf/1285064/ETC/LJ12A3-4-Z/BX.html)
- [PlatformIO (alternativa ao Arduino IDE)](https://platformio.org/)

---

> **Última atualização**: Março 2026
> **Status**: Planejamento — aguardando implementação
