# 01 — Testes Automatizados das Funções Críticas

**Prioridade:** 🔴 Alta · **Esforço:** ~4h · **Risco se não fizer:** Bug silencioso em cálculo financeiro

---

## Diagnóstico

O projeto já tem infraestrutura de testes pronta:
- `vitest.config.ts` configurado com jsdom
- `src/test/setup.ts` com mock de `matchMedia`
- `@testing-library/react` e `@testing-library/jest-dom` instalados

Porém, o único teste existente é um placeholder:

```ts
// src/test/example.test.ts
describe("example", () => {
  it("should pass", () => {
    expect(true).toBe(true);
  });
});
```

**Funções críticas sem cobertura nenhuma:**
- `src/lib/formatters.ts` — formatação de moeda BR, peso, percentual
- `src/lib/downtimeUtils.ts` — cálculo de tempo parado, agrupamento de eventos
- Cálculo de eficiência de produção (espalhado em `Production.tsx`, `Dashboard.tsx`)
- Cálculo de faturamento de terceirizados: `valor_cliente − valor_terceirizado − frete`
- Normalização de turno (`normalizeShift` em `useCompanyData.ts`)
- Determinação do turno vigente baseado em `shift_settings`

## Risco

Um erro de 1 centavo na fórmula `total_profit` no módulo de Terceirizados, multiplicado por milhares de kg/mês, gera divergência financeira real para o cliente. Hoje, qualquer refatoração nessas funções é feita "no escuro".

## Solução Proposta

### Passo 1 — Extrair funções puras para `src/lib/`

Algumas lógicas estão embutidas em componentes. Mover para `lib/` para tornar testáveis sem renderizar React:

- Criar `src/lib/calculations/efficiency.ts` com `calculateEfficiency(rolls, rpm, durationMin, turnsPerRoll)`
- Criar `src/lib/calculations/outsourcing.ts` com `calculateOutsourceProfit({ clientValuePerKg, outsourceValuePerKg, freightPerKg, weightKg })`
- Criar `src/lib/calculations/shift.ts` com `getCurrentShift(now, shiftSettings)` e `normalizeShift(raw)`

### Passo 2 — Escrever suítes de teste

Criar arquivos `*.test.ts` ao lado de cada função:

```
src/lib/
├── formatters.ts
├── formatters.test.ts          ← NOVO
├── downtimeUtils.ts
├── downtimeUtils.test.ts       ← NOVO
└── calculations/
    ├── efficiency.ts
    ├── efficiency.test.ts      ← NOVO
    ├── outsourcing.ts
    ├── outsourcing.test.ts     ← NOVO
    ├── shift.ts
    └── shift.test.ts           ← NOVO
```

### Passo 3 — Casos de teste mínimos por função

**`formatters.test.ts`**
- `formatCurrencyBR(0)` → `"R$ 0,00"`
- `formatCurrencyBR(1234.5)` → `"R$ 1.234,50"`
- `formatCurrencyBR(-100)` → `"-R$ 100,00"`
- `formatWeight(1234.567)` → `"1.234,567 kg"`
- `formatPercent(76.9)` → `"76,90%"` (regra: 2 casas — ver `mem://logic/localization`)

**`outsourcing.test.ts`**
- Lucro positivo padrão
- Lucro zero (cliente paga = custo + frete)
- Lucro negativo (prejuízo) — caso real do módulo "Prejuízos de Terceiros"
- Frete zero
- Peso zero (deve retornar 0, não NaN)

**`efficiency.test.ts`**
- Eficiência exata de 100%
- Eficiência > 100% (pode ocorrer)
- RPM zero (não pode dar divisão por zero)
- Duração zero
- Modo `rolos`, `voltas`, `kg`

**`shift.test.ts`**
- `normalizeShift("Manhã")` → `"manha"`
- `normalizeShift("MANHÃ")` → `"manha"`
- `normalizeShift("noite")` → `"noite"`
- `normalizeShift("")` → `"manha"` (default)
- `getCurrentShift` em horários de borda (06:00, 14:00, 22:00)
- `getCurrentShift` no turno noite que cruza meia-noite

**`downtimeUtils.test.ts`**
- Evento aberto (sem `ended_at`) calcula até `now`
- Múltiplos eventos no mesmo turno
- Evento que cruza turnos

### Passo 4 — Adicionar script ao `package.json`

Já existe `bunx vitest`. Verificar que `npm test` ou `bun test` rodam tudo.

### Passo 5 — CI (opcional, futuro)

Documentar comando: `bun run test --run` para execução não-watch.

## Arquivos Afetados

**Novos:**
- `src/lib/calculations/efficiency.ts`
- `src/lib/calculations/efficiency.test.ts`
- `src/lib/calculations/outsourcing.ts`
- `src/lib/calculations/outsourcing.test.ts`
- `src/lib/calculations/shift.ts`
- `src/lib/calculations/shift.test.ts`
- `src/lib/formatters.test.ts`
- `src/lib/downtimeUtils.test.ts`

**Modificados (refatorar para usar funções extraídas):**
- `src/pages/Production.tsx` — importar `calculateEfficiency`
- `src/pages/Outsource.tsx` — importar `calculateOutsourceProfit`
- `src/hooks/useCompanyData.ts` — importar `normalizeShift`
- `src/components/AppLayout.tsx` (ou onde está o turno vigente do header) — importar `getCurrentShift`

**Remover:**
- `src/test/example.test.ts` (placeholder)

## Critérios de Aceite

- [ ] `bun test` executa ≥ 30 asserções com 100% de aprovação
- [ ] Cobertura mínima de 90% em `src/lib/calculations/` e `src/lib/formatters.ts`
- [ ] Nenhuma regressão visual nos módulos Production/Outsource/Dashboard
- [ ] Função `normalizeShift` continua produzindo os mesmos valores normalizados (`manha`/`tarde`/`noite`) — proteger regra de `mem://logic/data-normalization`

## Rollback

Reverter os imports nos componentes para o cálculo inline original. Manter os arquivos de teste — não causam dano.
