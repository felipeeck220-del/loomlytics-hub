# 02 — Refatoração de Páginas Monolíticas

**Prioridade:** 🟡 Média · **Esforço:** ~12h (4h por página) · **Risco se não fizer:** Manutenção lenta e arriscada

---

## Diagnóstico

Três páginas concentram complexidade excessiva em arquivo único:

| Arquivo | Linhas | Responsabilidades misturadas |
|---------|--------|------------------------------|
| `src/pages/Production.tsx` | 1.234 | Listagem, filtros, modal de cadastro, edição inline, busca, exportação |
| `src/pages/AccountsPayable.tsx` | 1.033 | CRUD, modal de pagamento, upload de comprovante, notificação WhatsApp, filtros |
| `src/pages/Fechamento.tsx` | 1.005 | Agregação multi-fonte, geração de PDF, filtros mensais, seções condicionais |

Todas misturam: estado local, chamadas ao banco (`useSharedCompanyData`), lógica de negócio, e JSX.

## Risco

- Qualquer mudança trivial exige scroll por 1.000+ linhas
- Difícil isolar bugs (efeitos colaterais entre seções)
- Impossível testar componentes isoladamente
- Re-renders desnecessários (toda mudança de estado re-renderiza a página inteira)

## Solução Proposta

### Estratégia: refatoração incremental, **NÃO** big-bang

Refatorar **uma página por vez**, **somente quando** for mexer numa funcionalidade dela. Isso evita o risco de quebrar tudo de uma vez.

### Padrão de quebra (aplicar a cada página)

**Antes:** `Production.tsx` (1.234 linhas)

**Depois:**
```
src/pages/Production/
├── index.tsx                          (~150 linhas — só layout/orquestração)
├── hooks/
│   ├── useProductionFilters.ts        (estado dos filtros + URL sync)
│   ├── useProductionStats.ts          (cálculos derivados memoizados)
│   └── useProductionMutations.ts      (add/update/delete encapsulados)
├── components/
│   ├── ProductionHeader.tsx           (título, botões de ação)
│   ├── ProductionFiltersBar.tsx       (filtros de mês/dia/turno/máquina)
│   ├── ProductionStatsCards.tsx       (cards executivos)
│   ├── ProductionList.tsx             (tabela/lista de registros)
│   ├── ProductionRow.tsx              (linha individual)
│   ├── ProductionEntryModal.tsx       (modal de cadastro rápido)
│   └── ProductionEditDialog.tsx       (edição inline)
└── utils/
    └── exportProduction.ts            (exportação CSV/PDF)
```

**Regra de tamanho:** nenhum arquivo novo deve passar de 250 linhas.

### Plano detalhado por página

#### A) Production.tsx (faça primeiro — mais alta rotação de mudanças)

1. Mover `src/pages/Production.tsx` → `src/pages/Production/index.tsx`
2. Atualizar import em `App.tsx`
3. Extrair filtros (estado + lógica de URL) para `useProductionFilters`
4. Extrair `ProductionEntryModal` (~300 linhas hoje embutidas) — manter UX intacta (ver `mem://features/rapid-entry-modal`)
5. Extrair lista para `ProductionList` + `ProductionRow`
6. Extrair stats cards (manter visual idêntico ao Faturamento Total — `mem://features/dashboard-layout`)

#### B) AccountsPayable.tsx

1. Mesma estrutura: `src/pages/AccountsPayable/`
2. Componentes prováveis: `AccountsList`, `AccountFormModal`, `PaymentDialog`, `ReceiptUploader`, `WhatsAppStatusBadge`
3. Atenção: preservar fluxo de notificação automática e o `short_id`

#### C) Fechamento.tsx

1. `src/pages/Fechamento/`
2. Cada **seção do PDF** vira um componente isolado:
   - `SectionEstoqueMalha.tsx` (filtra Sul Brasil — ver implementação recente)
   - `SectionReceitasProprias.tsx`
   - `SectionReceitasTerceiros.tsx`
   - `SectionPrejuizosTerceiros.tsx`
   - `SectionResiduos.tsx`
3. `useFechamentoData(month)` — hook que agrega todas as fontes
4. `generateFechamentoPDF.ts` — função pura que recebe os dados e produz PDF

## Arquivos Afetados

**Modificados:**
- `src/App.tsx` (atualizar 3 imports)

**Renomeados/Movidos:**
- `src/pages/Production.tsx` → `src/pages/Production/index.tsx`
- `src/pages/AccountsPayable.tsx` → `src/pages/AccountsPayable/index.tsx`
- `src/pages/Fechamento.tsx` → `src/pages/Fechamento/index.tsx`

**Novos (estimativa):** ~25 arquivos pequenos e focados

## Critérios de Aceite

- [ ] Nenhum arquivo novo > 250 linhas
- [ ] Comportamento idêntico ao usuário final (validar com QA visual)
- [ ] Testes da página continuam passando (quando existirem)
- [ ] Memórias de UX preservadas: `mem://features/rapid-entry-modal`, `mem://style/modal-sizing`, `mem://features/monthly-closing-report`
- [ ] Imports atualizados sem quebrar lazy loading

## Rollback

Cada página é independente. Se a refatoração de Production quebrar algo, basta reverter `src/pages/Production/` para o arquivo único anterior. Não tocar nas outras.

## Notas

- **NÃO** refatorar tudo numa só PR/sessão
- Validar cada página em produção antes de iniciar a próxima
- Usar `git diff` mental: se a página tem 1.000 linhas e você só vai mudar 50, não refatore as outras 950 nessa sessão
