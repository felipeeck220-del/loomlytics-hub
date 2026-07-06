# Guarda de Início Inteligente — OM / OC / OT

> **Status:** 🟡 Proposta — a implementar
> **Data de criação:** 06/07/2026
> **Módulos afetados:** Mecânica (`/:slug/mecanica/om`, `/:slug/mecanica/oc`, `/:slug/mecanica/ot`)
> **Arquivos-chave:** `src/pages/Mecanica.tsx`, `src/components/mecanica/MaintenanceOrdersTab.tsx`, `src/components/mecanica/ArticleChangeOrdersTab.tsx`

---

## 1. Contexto e Problema

No fluxo atual do módulo **Mecânica**, os mecânicos e líderes programam com antecedência **múltiplas ordens em aberto** para a mesma máquina:

- **OM** — Ordem de Manutenção Preventiva
- **OC** — Ordem de Manutenção Corretiva
- **OT** — Ordem de Troca de Artigo

Não é raro que uma mesma máquina (ex.: `TEAR 07`) tenha, ao mesmo tempo, **uma OT, uma OM e uma OC programadas** e aguardando execução.

### 🐛 Bug operacional observado

Operadores **pulam etapas** e iniciam a ordem errada:

- Iniciam a **OM** quando havia uma **OT** que deveria vir primeiro (a máquina precisava trocar de artigo antes da preventiva).
- Iniciam a **OT** ignorando uma **OC** urgente já programada.
- Iniciam a **OC** sem perceber que existia uma **OM** planejada para o mesmo horário.

### ⚠️ Regra atualmente existente (insuficiente)

O sistema **já bloqueia** o início de qualquer ordem quando há outra `em_curso` (status corrente) na mesma máquina — via checagem em `startOrder` / `startTrocaFio`.

Porém **não há nenhum aviso** quando existem múltiplas ordens em status `aberto` para a mesma máquina — o operador simplesmente clica em uma delas sem saber que existem outras esperando.

### 💥 Impacto

- Histórico bagunçado em `machine_logs` (sequência lógica quebrada).
- Produção parada por sequência errada (ex.: troca de agulheiro feita antes da troca de artigo que exigia agulhas novas específicas).
- Retrabalho e reprogramação constantes.
- Auditoria não consegue rastrear por que a sequência foi ignorada.

---

## 2. Regra de Negócio

| Situação | Ação do sistema |
|---|---|
| Máquina tem **1 ordem em curso** (qualquer tipo) | 🔒 Bloqueia início de qualquer nova ordem com toast (regra atual mantida) |
| Máquina tem **apenas a ordem clicada** em aberto | ✅ Inicia direto, sem modal |
| Máquina tem **2+ ordens em aberto** (OM + OC + OT em qualquer combinação) | 🟡 Abre `StartOrderConflictModal` antes de iniciar |

**Princípio:** o sistema **nunca decide** qual é a "ordem correta" — mostra as opções e o operador escolhe, com registro em auditoria de que ele foi avisado.

---

## 3. UX — Modal `StartOrderConflictModal`

### 3.1 Wireframe

```text
┌────────────────────────────────────────────────────────────┐
│  ⚠️  TEAR 07 tem 3 ordens em aberto                        │
│  Confirme qual você quer iniciar agora.                    │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  🟦  OT #012 · TROCA DE ARTIGO                             │
│      Piquet → Malha Fria                                   │
│      Criada 05/07/2026 14:22 por João #22                  │
│                              [ Iniciar esta OT ]           │
│                                                            │
│  🟨  OM #045 · MANUT. PREVENTIVA          ★ SELECIONADA    │
│      Prioritária · Revisar agulheiro                       │
│      Criada 04/07/2026 09:10 por Felipe #1                 │
│                          [ Iniciar mesmo assim ]  ← primary│
│                                                            │
│  🟥  OC #007 · MANUT. CORRETIVA                            │
│      Barulho no cilindro                                   │
│      Criada 06/07/2026 08:45 por Ana #14                   │
│                              [ Iniciar esta OC ]           │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                            [ Cancelar ]    │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Comportamento

- **Título dinâmico:** `"{NOME_MAQUINA} tem {N} ordens em aberto"`.
- **Ordenação:** cronológica ascendente por `created_at` (mais antiga primeiro) — sugere visualmente a sequência de programação sem impor.
- **Linha da ordem clicada:** badge `SELECIONADA`, botão em destaque `Iniciar mesmo assim` (variant `default`, cor primária).
- **Outras linhas:** botão secundário `Iniciar esta OM/OC/OT` (variant `outline`).
- **Cada linha exibe:**
  - Badge colorida do tipo (OM=warning, OC=destructive, OT=info — mesmas cores do calendário atual).
  - Número `#short_id`.
  - Título humano (`Manut. Preventiva`, `Manut. Corretiva`, `Troca de Artigo`).
  - Prioridade (apenas se `prioritaria`).
  - Descrição ou resumo (truncado com `line-clamp-2`).
  - Autoria no padrão `Criada dd/MM/yyyy HH:mm por Nome #Código`.
- **Rodapé:** apenas `Cancelar` (fecha o modal sem iniciar nada).
- **ESC desabilitado:** segue padrão de modais de registro (memória `constraints/deletion-safety`) — força o operador a clicar em ação explícita.
- **Tamanho:** `sm:max-w-[80vw] max-h-[80vh]` em desktop, `w-screen h-screen` em mobile (memória `style/modal-sizing`).

---

## 4. Arquitetura Técnica

### 4.1 Novos arquivos

#### `src/lib/mecanicaGuards.ts`

Utilitário puro que consulta o banco:

```ts
export type OpenOrder = {
  kind: 'OM' | 'OC' | 'OT';
  id: string;
  number: string;              // short_id formatado
  title: string;               // "Manut. Preventiva" | "Manut. Corretiva" | "Troca de Artigo"
  priority?: 'normal' | 'prioritaria';
  description?: string;
  createdAt: string;           // ISO
  createdByName?: string;
  createdByCode?: string;
};

export async function fetchOpenOrdersForMachine(
  companyId: string,
  machineId: string,
): Promise<OpenOrder[]>;
```

Executa **duas queries em paralelo** (`Promise.all`):

1. `maintenance_orders` → `select('*').eq('company_id',…).eq('machine_id',…).eq('status','aberto')`
   - Mapeia `type='preventiva'` → `kind='OM'`, `type='corretiva'` → `kind='OC'`.
2. `article_change_orders` → `select('*').eq('company_id',…).eq('machine_id',…).eq('status','aberto')`
   - Mapeia todas para `kind='OT'`.

Retorna array normalizado ordenado por `createdAt` ascendente.

#### `src/hooks/useStartOrderGuard.tsx`

Provider + hook + componente do modal:

```ts
type Starter = (id: string, meta?: { via_conflict_modal?: boolean;
                                     other_open_orders?: {kind:string;number:string}[] }) => Promise<void>;

interface GuardContext {
  registerStarter: (kind: 'OM'|'OC'|'OT', fn: Starter) => () => void;
  tryStart: (params: { kind:'OM'|'OC'|'OT'; id:string; machineId:string; machineName:string }) => Promise<void>;
}
```

Internamente:
- `startersRef` — `Record<kind, Starter | null>`.
- `pendingStartRef` — `{ kind, id, meta }` guardado quando precisa navegar cross-tab.
- `useEffect` observa `startersRef` e, ao detectar que o starter esperado foi registrado, dispara o `pendingStart`.
- Renderiza `<StartOrderConflictModal />` acoplado.

### 4.2 Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Mecanica.tsx` | Envolve `<TabsContent>` no `<StartOrderGuardProvider>`. |
| `src/components/mecanica/MaintenanceOrdersTab.tsx` | `startOrder(order)` deixa de ser chamado direto pelo botão — passa por `guard.tryStart({kind, id, machineId, machineName})`. Registra 2 starters no `useEffect`: `startOM` e `startOC` (mesma função interna, roteada por `type`). |
| `src/components/mecanica/ArticleChangeOrdersTab.tsx` | Apenas o primeiro botão (`Iniciar Troca de Fio`) passa pelo guard. Etapas seguintes (`Iniciar Regulagem`, `Iniciar Acompanhamento`, `Concluir OT`) **não** abrem modal — a OT já está `em_curso`. Registra 1 starter: `OT`. |

### 4.3 Fluxo do `tryStart`

```text
┌──────────────────────┐
│ Tab chama tryStart() │
└──────────┬───────────┘
           ▼
┌──────────────────────────────────────────┐
│ fetchOpenOrdersForMachine(company, mach) │
└──────────┬───────────────────────────────┘
           ▼
     ┌─────────────┐
     │ list.length │
     └──┬───────┬──┘
        │       │
     ≤ 1│       │≥ 2
        ▼       ▼
  ┌────────┐  ┌──────────────────────┐
  │ starter│  │ Abre modal com list, │
  │  direto│  │ id = SELECIONADA     │
  └────────┘  └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │ Usuário clica em uma │
              │ das ações da lista   │
              └──────────┬───────────┘
                         ▼
           ┌────────────────────────────┐
           │ kind == tab atual?         │
           └───────┬──────────────┬─────┘
                Sim│              │Não
                   ▼              ▼
          ┌────────────┐  ┌─────────────────────┐
          │ starter(id)│  │ navigate(/mec/{kind})│
          └────────────┘  │ pendingStart = {…}   │
                          │ dispara no mount     │
                          └─────────────────────┘
```

**Revalidação de segurança:** antes de disparar o starter final, o guard chama de novo `fetchOpenOrdersForMachine` — se algum item mudou para `em_curso` no meio-tempo (via realtime), aborta com toast `"Máquina passou a ter ordem em curso — recarregue e tente novamente."`.

---

## 5. Cross-tab: navegação e ativação

- Rota base: `/${slug}/mecanica/${kind.toLowerCase()}` (`om`, `oc`, `ot`).
- `useNavigate()` do react-router muda a URL — o `Tabs` do `Mecanica.tsx` já reage à rota.
- `pendingStartRef` guarda `{ kind, id, meta }`.
- `useEffect` do provider observa registro de novos starters:
  ```ts
  useEffect(() => {
    const pending = pendingStartRef.current;
    if (!pending) return;
    const starter = startersRef.current[pending.kind];
    if (starter) {
      pendingStartRef.current = null;
      starter(pending.id, pending.meta);
    }
  }, [registeredVersion]); // bump ao registrar/desregistrar
  ```
- **Timeout de 3 segundos:** se o starter alvo não montar, toast `"Abra a aba {kind} e clique iniciar novamente"` e limpa `pendingStart`.

---

## 6. Auditoria

O starter recebe `meta` opcional que é agregado ao `details` do `logAudit`:

```json
{
  "via_conflict_modal": true,
  "other_open_orders": [
    { "kind": "OT", "number": "012" },
    { "kind": "OC", "number": "007" }
  ]
}
```

Isso permite ao admin filtrar em `audit_logs`:

- Quantas vezes cada operador **ignorou** ordens mais antigas.
- Quais tipos de ordem são mais frequentemente puladas.
- Análise de compliance da sequência lógica de manutenção.

Se `via_conflict_modal` for `false` ou ausente, é um start "limpo" (só havia aquela ordem em aberto).

---

## 7. Casos de borda

| Caso | Comportamento |
|---|---|
| Máquina inexistente / removida | Aborta com toast `"Máquina não encontrada"`. |
| Perda de rede na query de checagem | Aborta o start, toast `"Falha ao verificar ordens abertas — tente novamente."` |
| Realtime altera status entre clique e confirmação (surge um `em_curso`) | Revalida antes do `update` final; se agora existe `em_curso`, bloqueia. |
| Duas ordens do mesmo tipo em aberto (ex.: 2 OMs) | Modal continua funcionando; cada linha tem botão próprio. |
| Usuário sem permissão para iniciar OT/OM/OC | Já barrado no tab origem; guard **não** escala privilégios. |
| Modal aberto e realtime remove uma ordem (foi deletada por outro user) | Ao clicar em `Iniciar esta`, revalidação detecta ausência e mostra toast `"Ordem não está mais disponível."` |
| Usuário fecha modal (Cancelar) | Nenhum start acontece, nenhum log de auditoria. |

---

## 8. Fora de escopo (não muda)

- ❌ Priorização automática — o sistema nunca decide qual ordem é a "correta".
- ❌ Impedir criação simultânea — regra existente segue igual (permitido criar múltiplas em `aberto`).
- ❌ Reordenar campo `priority` automaticamente.
- ❌ Alterações de schema, `GRANT`, RLS, triggers ou funções SQL.
- ❌ Mudança nas etapas intermediárias da OT (Regulagem, Acompanhamento, Concluir).

---

## 9. Plano de teste manual

| # | Cenário | Resultado esperado |
|---|---|---|
| A | 1 OM aberta na máquina → clicar iniciar | Inicia direto, sem modal. |
| B | 1 OM + 1 OT abertas → clicar iniciar OM → confirmar OM | Modal abre com 2 linhas; após confirmação, OM inicia e OT permanece aberta. `audit_logs.details.via_conflict_modal = true`. |
| C | Mesmo B, mas clicar `Iniciar esta OT` no modal | App navega para `/mecanica/ot`, dispara start da OT, OM permanece aberta. Audit da OT com `via_conflict_modal=true`. |
| D | 1 OC `em_curso` + 1 OM `aberto` → clicar iniciar OM | Bloqueio existente com toast `"Máquina tem OC em curso"`. Modal **não** abre. |
| E | OT com Troca de Fio iniciada (fase Regulagem) → clicar `Iniciar Regulagem` | Passa direto, sem guard. |
| F | Sem rede ao clicar iniciar | Toast de falha, nada muda no banco. |
| G | 3 OMs abertas na mesma máquina → clicar iniciar uma | Modal abre com 3 linhas do tipo OM, cada uma com botão próprio. |
| H | Modal aberto → outro usuário deleta a ordem selecionada → clicar `Iniciar mesmo assim` | Revalidação detecta ausência, toast `"Ordem não está mais disponível."` |
| I | Cross-tab: navegar para OT via modal, mas OT tab não monta em 3s | Toast `"Abra a aba OT e clique iniciar novamente"`. |

---

## 10. Documentação relacionada a atualizar depois

Após implementação:

- ✅ `docs/mestre.md` — adicionar entrada no histórico com data e resumo do patch.
- ✅ `docs/mecanica.md` — nova seção **"Guarda de conflitos ao iniciar"** descrevendo a UX.
- ✅ Memória `mem://features/mechanical-maintenance-module` — nota curta:
  > "Ao iniciar OM/OC/OT numa máquina com múltiplas ordens em aberto, exibe `StartOrderConflictModal` listando todas; usuário escolhe qual iniciar. Registra `via_conflict_modal` em audit_logs."

---

## 11. Checklist de implementação

- [ ] Criar `src/lib/mecanicaGuards.ts` com `fetchOpenOrdersForMachine`.
- [ ] Criar `src/hooks/useStartOrderGuard.tsx` (Provider + hook + `StartOrderConflictModal`).
- [ ] Envolver `Mecanica.tsx` no `<StartOrderGuardProvider>`.
- [ ] Refatorar `MaintenanceOrdersTab.tsx` para usar `guard.tryStart` e registrar starters OM/OC.
- [ ] Refatorar `ArticleChangeOrdersTab.tsx` para usar `guard.tryStart` **só** no `Iniciar Troca de Fio` e registrar starter OT.
- [ ] Adicionar `via_conflict_modal` e `other_open_orders` nos `logAudit` de start.
- [ ] Rodar cenários A–I do plano de teste manual.
- [ ] Atualizar `docs/mestre.md`, `docs/mecanica.md` e a memória citada.

---

*Documento gerado em 06/07/2026 — proposta de correção `intomocot`.*
