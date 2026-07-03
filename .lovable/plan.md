
# OT — Ordem de Troca de Artigo

Nova aba independente no módulo Mecânica, ao lado de OM e OC, com numeração própria (`OT #NNN`) e fluxo em 4 etapas.

---

## 1. Papéis e permissões

| Ação | Admin | Líder | Mecânico | Líder Mecânica |
|---|---|---|---|---|
| Criar OT | ✅ | ❌ | ❌ | ❌ |
| Iniciar troca de fio | ❌ | ✅ | ❌ | ❌ |
| Finalizar troca de fio | ❌ | ✅ | ❌ | ❌ |
| Iniciar regulagem | ❌ | ❌ | ✅ | ✅ |
| Finalizar regulagem (→ acompanhamento) | ❌ | ❌ | ✅ | ✅ |
| Registrar voltas / revisar peça / finalizar OT | ❌ | ✅ | ✅ | ✅ |
| Cancelar / Excluir | ✅ | ❌ | ❌ | ❌ |

**Visibilidade da aba OT:**
- Sidebar (desktop): admin, líder, líder_mecanica.
- Footer (mobile): mesma regra de OM/OC (adicionar `mecanica-ot`).
- **Mecânico**: a aba OT só aparece quando existe **pelo menos 1 OT no status `aguardando_regulagem` ou `em_regulagem`** da sua empresa. Caso contrário, oculta.

---

## 2. Fluxo de estados

```text
aberto (criada pelo admin)
   │  [Líder: Iniciar troca de fio]
   ▼
troca_fio_em_curso
   │  [Líder: Finalizar troca de fio]
   ▼
aguardando_regulagem  ← nesta fase a aba OT passa a aparecer p/ mecânico
   │  [Mecânico: Iniciar regulagem]
   ▼
em_regulagem
   │  [Mecânico: Finalizar regulagem]
   ▼
em_acompanhamento     ← contador de voltas + revisão de peça obrigatórios
   │  [Registrar revisão da peça (furos/falhas) + relatório final]
   ▼
concluida
```

Cancelamento (admin) permitido em qualquer estado antes de `concluida`.

---

## 3. Modelo de dados

Aproveitar as estruturas de OM/OC quando fizer sentido, mas OT tem campos próprios que não cabem em `maintenance_orders`. Criar tabelas dedicadas.

### 3.1 `article_change_orders` (a OT em si)

Campos de domínio:
- `ot_number` (int, sequência por empresa via trigger, igual ao padrão OM/OC)
- `machine_id`
- `current_article_id` (artigo saindo)
- `next_article_id` (artigo entrando)
- `status` (enum: `aberto`, `troca_fio_em_curso`, `aguardando_regulagem`, `em_regulagem`, `em_acompanhamento`, `concluida`, `cancelada`)
- `observations` (livre, opcional na criação)
- Timestamps de cada transição: `yarn_change_started_at`, `yarn_change_ended_at`, `adjustment_started_at`, `adjustment_ended_at`, `monitoring_started_at`, `concluded_at`, `cancelled_at`
- Autoria por transição: `created_by_*`, `yarn_change_by_*`, `adjustment_by_*`, `concluded_by_*` (name/code)
- Acompanhamento: `monitoring_turns` (int, opcional), `piece_defects_holes` (int), `piece_defects_flaws` (int), `final_report` (text)

### 3.2 `article_change_yarns` (fitas da OT)

Uma máquina roda até 4 fitas de fios + 1 fita de elastano. O admin define, por OT, quais fitas serão usadas e o que vai em cada uma.

- `order_id` (FK OT)
- `feeder_type` (enum: `fio`, `elastano`)
- `feeder_position` (int 1–4 quando `fio`; 1 quando `elastano`)
- `yarn_type_id` (FK `yarn_types`) — o tipo de fio nessa fita
- `lfa` (numeric) — LFA daquela fita
- `stretch` (numeric) — estiragem daquela fita
- `observation` (text opcional)

Único `(order_id, feeder_type, feeder_position)`.

### 3.3 Auditoria e realtime
- Publicar as duas tabelas em `supabase_realtime`.
- Logar cada transição em `audit_logs` com `ot_*` (`ot_create`, `ot_start_yarn`, `ot_finish_yarn`, `ot_start_adjustment`, `ot_finish_adjustment`, `ot_conclude`, `ot_cancel`, `ot_delete`).

### 3.4 Segurança
- RLS por `company_id` (padrão da app).
- GRANT para `authenticated` e `service_role`.
- Trigger de numeração `assign_ot_number` inspirado no `assign_om_number`.

---

## 4. UI

### 4.1 Navegação
- Nova entrada `mecanica-ot` em `AppSidebar.tsx` e `MobileBottomNav.tsx` com ícone (ex.: `Repeat` ou `ArrowLeftRight`) e badge de OT em aberto.
- Nova rota `/:slug/mecanica/ot` em `App.tsx` (`routeKey="mecanica-ot"`).
- Herdar toggle da empresa `mecanica` (mesma regra de OM/OC).
- Regra especial p/ mecânico: mesmo com o item habilitado, esconder quando não houver OT em `aguardando_regulagem` / `em_regulagem`.

### 4.2 Componente `ArticleChangeOrdersTab.tsx`
Espelha o layout de `MaintenanceOrdersTab.tsx`:
- Abas internas: **Aberto**, **Em curso** (agrupa troca_fio + regulagem + acompanhamento), **Concluídas**.
- Cards com:
  - Cabeçalho `OT #NNN — MÁQUINA`
  - Artigo atual → próximo artigo
  - Lista de fitas configuradas (posição, tipo de fio, LFA, estiragem)
  - Timers apropriados por estado (aguardando início / troca fio em curso / aguardando regulagem / regulagem em curso / acompanhamento)
  - Botão de ação principal muda por status e role (Iniciar troca, Finalizar troca, Iniciar regulagem, Finalizar regulagem, Registrar revisão)

### 4.3 Modal “Nova OT” (admin)
Campos:
- Máquina (SearchableSelect)
- Artigo atual (default = artigo da máquina)
- Próximo artigo (SearchableSelect)
- Bloco de **Fitas** — até 4 slots “Fita 1/2/3/4” + 1 slot fixo “Elastano”. Cada slot:
  - Ativar/desativar
  - Tipo de fio (SearchableSelect em `yarn_types`)
  - LFA (numeric)
  - Estiragem (numeric)
  - Observação (opcional)
- Observação geral

### 4.4 Modal “Finalizar Regulagem → Acompanhamento” (mecânico)
Apenas confirma passagem para `em_acompanhamento` + observação do mecânico.

### 4.5 Modal “Revisão de peça + Finalizar OT”
- Campo **Voltas acompanhadas** (numeric)
- **Furos** (numeric)
- **Falhas** (numeric)
- **Relatório final** (textarea obrigatório)
- Botão “Finalizar OT” → status `concluida`.

### 4.6 Reaproveitamentos
- `SearchableSelect`, `BrazilianWeightInput` (não se aplica), formatação padrão, `getFriendlyErrorMessage`, `useAuditLog`, `MOBILE_FOOTER_KEYS` etc.

---

## 5. Arquivos afetados

**Novos**
- Migration Supabase (tabelas + enum + trigger + RLS + realtime).
- `src/components/mecanica/ArticleChangeOrdersTab.tsx`
- `src/components/mecanica/NewArticleChangeOrderModal.tsx`
- `src/components/mecanica/ArticleChangeFinalizeModal.tsx`

**Editados**
- `src/App.tsx` — rota `/mecanica/ot`.
- `src/components/AppSidebar.tsx` — item `mecanica-ot`, badge, herança do toggle.
- `src/components/MobileBottomNav.tsx` — item `mecanica-ot`, badge, visibilidade condicional p/ mecânico.
- `src/hooks/usePermissions.ts` — incluir `mecanica-ot` nos `ROLE_ALLOWED_KEYS` dos roles corretos e nas defaults quando aplicável.
- `src/pages/Mecanica.tsx` — nova aba (topo) para admin; renderizar `ArticleChangeOrdersTab` também via rota direta.
- `docs/mestre.md` — bloco de história descrevendo o módulo OT.

Nenhuma alteração em OM/OC.

---

## 6. Notas técnicas

- Enum novo `article_change_status`.
- Trigger `assign_ot_number` — mesmo padrão do `assign_om_number`, mas usa `MAX(ot_number)+1` por `company_id`.
- Regra p/ mecânico ver a aba OT: query leve `SELECT count(*) FROM article_change_orders WHERE company_id=? AND status IN ('aguardando_regulagem','em_regulagem')` + subscription realtime; se `0`, item some do footer/sidebar do mecânico.
- Badge de OT em aberto no sidebar/footer: `status = 'aberto'` (mesma lógica dos existentes), cor secundária (ex.: âmbar) para distinguir de OM (azul) e OC (vermelho).
- Push notifications: reaproveitar `send-push-notification` (opcional nesta fase — enviar quando cair em `aguardando_regulagem` para mecânico/lider_mecânica). **Fora do escopo desta primeira entrega** salvo indicação contrária.

---

## 7. Perguntas antes de eu ir codar

1. **Fitas**: confirmo que a máquina tem **exatamente 4 fitas de fio + 1 fita de elastano**? A fita de elastano é sempre obrigatória ou opcional na OT?
2. **Iniciar troca de fio**: só o **Líder (role `lider`)** pode iniciar/finalizar essa etapa, correto? (o role `lider_mecanica` fica apenas na regulagem?)
3. **Revisão de peça (última etapa)**: quem finaliza — mecânico, líder, ou qualquer um dos dois? Você mencionou “acompanhamento” sem citar o papel.
4. **Voltas**: é um número único informado no fim ou preciso permitir apontamentos parciais ao longo do acompanhamento?

Se qualquer resposta mudar o plano, eu ajusto antes de tocar em código.
