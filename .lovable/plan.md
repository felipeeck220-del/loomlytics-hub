## Objetivo

Criar o arquivo `docs/correcoes/intomocot.md` documentando 100% detalhadamente a correção "Guarda de Início Inteligente para OM/OC/OT" (modal de conflito antes de iniciar quando a mesma máquina tem múltiplas ordens em aberto). Documento apenas — sem alterações de código nesta etapa.

## Estrutura do arquivo `docs/correcoes/intomocot.md`

### 1. Cabeçalho
- Título: "Guarda de Início Inteligente — OM / OC / OT"
- Status: Proposta / A implementar
- Data de criação
- Módulos afetados: Mecânica (`/:slug/mecanica/om|oc|ot`)

### 2. Contexto e Problema
- Descrição do fluxo atual: mecânicos programam OM, OC e OT em aberto para a mesma máquina.
- Bug operacional: operadores pulam etapas — iniciam OM quando havia uma OT anterior a ser feita, e vice-versa.
- Regra atual que já existe: bloqueio apenas quando há algo `em_curso` (status corrente). Não há aviso quando há múltiplas ordens em `aberto`.
- Impacto: histórico bagunçado, `machine_logs` incoerente, produção parada por sequência errada.

### 3. Regra de Negócio
- Nenhuma ordem pode iniciar se a máquina tem outra `em_curso` (mantém regra existente).
- Se há apenas 1 ordem em aberto para a máquina → inicia direto, sem modal.
- Se há 2+ ordens em aberto (somando OM + OC + OT) → abre modal listando todas antes de iniciar.
- Sistema não escolhe a "ordem correta" — mostra as opções e o operador decide, com registro em auditoria.

### 4. UX — Modal `StartOrderConflictModal`
- Wireframe ASCII do modal
- Comportamento:
  - Título dinâmico: "TEAR XX tem N ordens em aberto"
  - Cada linha = uma ordem com badge (OM/OC/OT), número #short_id, tipo humano, descrição/prioridade, autoria "Nome #Código", data de criação.
  - Ordem cronológica ascendente por `created_at`.
  - Linha da ordem clicada originalmente com badge "SELECIONADA" e botão primário `Iniciar mesmo assim`.
  - Outras linhas com botão secundário `Iniciar esta OM/OC/OT`.
  - Rodapé: apenas `Cancelar`.
  - Sem ESC (segue padrão de modais de registro — memória `constraints/deletion-safety`).

### 5. Arquitetura Técnica

#### 5.1. Novos arquivos
- `src/lib/mecanicaGuards.ts` — função `fetchOpenOrdersForMachine(companyId, machineId)` que cruza `maintenance_orders` e `article_change_orders` filtrando `status='aberto'` e retorna array normalizado.
- `src/hooks/useStartOrderGuard.tsx` — Provider + hook + componente do modal. Cada tab registra seu starter por tipo (`registerStarter('OM'|'OC'|'OT', fn)`).

#### 5.2. Contrato do item normalizado
```ts
type OpenOrder = {
  kind: 'OM' | 'OC' | 'OT';
  id: string;
  number: string;        // short_id
  title: string;         // ex.: "Manut. Preventiva", "Troca de Artigo"
  priority?: 'normal' | 'prioritaria';
  description?: string;
  createdAt: string;
  createdByName?: string;
  createdByCode?: string;
};
```

#### 5.3. Arquivos alterados
- `src/pages/Mecanica.tsx` — envolve tabs no `StartOrderGuardProvider`. Rota-mãe da guarda.
- `src/components/mecanica/MaintenanceOrdersTab.tsx` — `startOrder(order)` passa por `guard.tryStart(order)`. Registra `starter('OM', startOM)` e `starter('OC', startOC)` no mount.
- `src/components/mecanica/ArticleChangeOrdersTab.tsx` — só a primeira etapa (`Iniciar Troca de Fio`) passa pelo guard. Registra `starter('OT', startTrocaFio)`. Etapas seguintes (Regulagem, Acompanhamento, Concluir) não abrem o modal — a OT já é a `em_curso`.

#### 5.4. Fluxo do `tryStart`
1. `tryStart({ kind, id })` chamado pelo tab.
2. Guard consulta `fetchOpenOrdersForMachine(companyId, machineId)`.
3. Se `list.length <= 1` → chama `starter[kind](id)` direto e retorna.
4. Se `list.length >= 2` → abre modal com `list`, marcando a `id` como selecionada.
5. Usuário confirma:
   - "Iniciar mesmo assim" (mesma ordem) → `starter[kind](id)`.
   - "Iniciar esta" (outra ordem) → se `kind` diferente da aba atual, `navigate('/:slug/mecanica/{kind}')` e depois `starter[kind](otherId)`. Toast opcional "Aberto na aba correspondente".
6. Bloqueio duro mantido: se algum item da lista já estiver `em_curso` (não deveria acontecer pois `tryStart` só é chamado quando algo era `aberto`, mas há revalidação), aborta com toast.

### 6. Cross-tab: navegação e ativação
- Para iniciar ordem de outro tipo diretamente pelo modal, o guard usa `useNavigate()` com a rota `/${slug}/mecanica/${kind.toLowerCase()}`.
- Uma `pendingStart` (guardada em ref do provider) dispara o starter após o novo tab montar-se e registrar seu starter — via `useEffect` observando `registeredStarters`.
- Se o starter alvo não montar em 3s, mostra toast "Abra a aba OT e clique iniciar novamente" e limpa `pendingStart`.

### 7. Auditoria
- Ao iniciar via modal, o starter recebe metadata extra: `{ via_conflict_modal: true, other_open_orders: [{ kind, number }] }`.
- Cada `logAudit` de start (já existente) recebe `details` extras. Permite ao admin filtrar em `audit_logs` quantos operadores estão pulando sequências.

### 8. Casos de borda
- Máquina inexistente / removida: aborta com toast.
- Perda de rede na query: aborta o start e mostra toast "Falha ao verificar ordens abertas — tente novamente."
- Realtime altera status entre o clique e a resposta: revalida antes de enviar `update`; se agora existe `em_curso`, bloqueia.
- Duas ordens do mesmo tipo em aberto (ex.: 2 OMs) — modal continua funcionando; cada linha tem botão próprio.
- Usuário sem permissão para iniciar OT/OM/OC: já barrado pelo tab; o guard não escala privilégios.

### 9. Fora de escopo
- Priorização automática (o sistema nunca decide qual é "a correta").
- Impedir criação simultânea (regra existente segue igual).
- Reordenar `priority` das ordens.
- Alterações de schema, RLS, triggers ou funções SQL.

### 10. Plano de teste manual
- Cenário A: 1 OM em aberto → clicar iniciar → inicia direto (sem modal).
- Cenário B: 1 OM + 1 OT em aberto na mesma máquina → clicar iniciar OM → modal abre com 2 linhas → confirmar OM → OM inicia, OT permanece aberta.
- Cenário C: mesmo B, escolher "Iniciar esta OT" pelo modal → app navega para `/mecanica/ot`, dispara start da OT, OM permanece aberta.
- Cenário D: 1 OC `em_curso` + 1 OM `aberto` → clicar iniciar OM → bloqueio existente com toast "Máquina tem OC em curso" (modal não abre).
- Cenário E: OT com Troca de Fio já iniciada (em Regulagem) → botão "Iniciar Regulagem" não passa pelo guard.
- Cenário F: sem rede → toast de falha, nada muda.

### 11. Documentação relacionada a atualizar depois
- `docs/mestre.md` — histórico do patch quando implementado.
- `docs/mecanica.md` — nova seção "Guarda de conflitos ao iniciar".
- Memória `mem://features/mechanical-maintenance-module` — nota curta sobre a regra.

## Entregável desta rodada
- Apenas o arquivo `docs/correcoes/intomocot.md` com todo o conteúdo acima em Markdown formatado (headings, tabelas, blocos ASCII e code fences). Nenhum outro arquivo é criado ou modificado.
