# Central de Notificações + Badge do PWA

Objetivo: sempre que uma OM, OC, OT ou OFR for criada, o(s) usuário(s) alvo (responsável designado + admins da empresa) recebem uma push notification e o ícone do PWA passa a exibir o contador de não-lidas. Ao abrir a origem (rota da OM/OC/OT/OFR), a notificação é marcada como lida, o badge decrementa e some quando zera.

## Suporte por plataforma (importante para o usuário)

- **Android / Windows / macOS (PWA instalado + permissão concedida):** push + badge no ícone funcionam.
- **iOS / iPadOS 16.4+ (PWA adicionado à Tela de Início + permissão):** push funciona; o badge do ícone aparece via campo `badge` no payload da push (Safari não suporta `navigator.setAppBadge()` diretamente).
- **Navegador comum (sem instalar):** nada aparece — o usuário precisa instalar o PWA.

Vou avisar isso no `docs/mestre.md` e mostrar um aviso curto na tela de perfil quando as permissões estiverem negadas.

## O que muda no banco

Nova tabela `notifications` (multi-tenant, RLS por usuário):

```
notifications
├─ id uuid pk
├─ company_id uuid          → isolamento
├─ user_id uuid             → destinatário
├─ source text              → 'OM' | 'OC' | 'OT' | 'OFR'
├─ ref_id uuid              → id da ordem
├─ ref_number int/text      → 'OM #123', 'OFR #45'...
├─ title text
├─ body text
├─ url text                 → deep link ex.: /trama-certa/mecanica/om
├─ read_at timestamptz
├─ created_at, updated_at
```

RLS: cada usuário vê/atualiza só as próprias linhas; `service_role` insere via edge function. Grants para `authenticated` (select/update) e `service_role` (all). Realtime habilitado na tabela.

## Fluxo de disparo (fan-out)

A edge function `send-push-notification` já existe. Vou:

1. Estender payload aceito com `source`, `ref_id`, `ref_number`, `url`, `badge_count` opcional.
2. Antes de enviar Web Push, resolver destinatários (`responsible_user_id` + todos com role `admin` da company) e **inserir uma linha em `notifications` por destinatário** com `read_at = null`.
3. Para cada destinatário, calcular `unread_count` atual (após insert) e enviar Web Push com payload:
   ```
   { title, body, url, source, ref_id, badge: unread_count, tag: `${source}-${ref_id}` }
   ```
   O `tag` evita notificações duplicadas na bandeja se o mesmo evento chegar duas vezes.

Callsites a adicionar/ajustar:
- OM: já dispara push — passar `source: 'OM'`, `url: /{slug}/mecanica/om`, gravar notificação.
- OC: idem, `source: 'OC'`, `url: /{slug}/mecanica/oc`.
- OT: idem (Nova OT + Aguardando Regulagem já disparam) — apenas passar os campos novos.
- OFR (novo): em `useFreightOrders.createFreightOrder`, chamar `send-push-notification` com `source: 'OFR'`, `url: /{slug}/ofr`, notificar admins + freteiro vinculado (via `freighters.user_id`).

## Service worker (push + badge)

Já existe SW dedicado para Web Push. Ajustes:

1. No handler `push`:
   - `self.registration.showNotification(title, { body, tag, data: { url, source, ref_id } })`.
   - Se `navigator.setAppBadge` existir: `await navigator.setAppBadge(payload.badge)`.
   - Em iOS, o badge do payload é lido pelo próprio sistema — nenhuma ação extra.
2. No handler `notificationclick`:
   - `event.notification.close()`, abre/foca `data.url`.
3. Não mexer no kill-switch/PWA existente; este SW de mensageria é separado (conforme regra da skill/pwa).

## Sincronização do badge com o app

Novo hook `useNotificationsBadge`:
- Query `count` de `notifications` do usuário logado com `read_at IS NULL`.
- Assina realtime da tabela (insert/update do próprio user_id).
- A cada mudança: `navigator.setAppBadge(count)` ou `navigator.clearAppBadge()` (quando 0). No-op em navegadores sem suporte (`typeof navigator.setAppBadge === 'function'`).
- Registrado uma vez no `AppShell` ou no `AuthProvider` para valer em todas as telas.

## Marcar como lida ao abrir a origem

Novo hook `useMarkSourceAsRead(source, refId?)` chamado em cada aba:
- `/{slug}/mecanica/om` → `update notifications set read_at=now() where user_id=me and source='OM' and read_at is null`.
- Idem para `oc`, `ot`, `ofr`. Se `refId` estiver na URL, marca só aquele; se estiver na listagem, marca todos daquela `source`.
- Após update, realtime propaga → badge recalcula automaticamente.

## Sino in-app no header

Novo componente `NotificationsBell.tsx` no `AppHeader`:
- Ícone `Bell` + badge com `unreadCount` (cap "9+").
- Popover com as **últimas 20** (`order by created_at desc`), separando "Não lidas" e "Lidas".
- Cada item: badge da source (OM/OC/OT/OFR) colorida, título, body, tempo relativo ("há 3 min").
- Clique no item → navega para `url` e marca como lida.
- Rodapé: "Marcar todas como lidas".

## Perfil do usuário — habilitação

Já existe UI para permitir/negar notificações via `usePushNotifications`. Vou:
- Mostrar estado da permissão (concedida/negada/pendente) e um botão "Ativar notificações".
- Se o navegador for iOS Safari sem PWA instalado, mostrar dica: "Para receber notificações no iPhone, adicione o app à Tela de Início pelo menu Compartilhar do Safari".

## Escopo desta entrega (confirmado)

- Sources: **OM, OC, OT, OFR**.
- Destinatários por evento de criação: **Responsável designado + Admins da empresa**.
- Sino in-app: **sim**, com dropdown.

## Documentação

Nova entrada em `docs/mestre.md` descrevendo tabela `notifications`, edge function estendida, hook de badge, sino e limites por plataforma.

## Detalhes técnicos

- Migration única: cria `notifications` + grants + RLS + índice `(user_id, read_at)` + `alter publication supabase_realtime add table notifications`.
- Edge function `send-push-notification`: aceita novo payload; resolve alvos; usa `service_role` para inserir em `notifications`; envia Web Push com `badge`.
- Cliente:
  - `useNotificationsBadge()` global (query + realtime + setAppBadge/clearAppBadge).
  - `useMarkSourceAsRead(source, refId?)` nas telas OM/OC/OT/OFR.
  - `NotificationsBell.tsx` no `AppHeader`.
  - `NewOFRModal`/`useFreightOrders`: chamar `supabase.functions.invoke('send-push-notification', {...})` no create.
- SW de push: adicionar `setAppBadge(payload.badge)` no `push` handler; `notificationclick` foca/abre `data.url`.
- Sem quebra do kill-switch/PWA principal.

Após implementar, o usuário precisa: (1) instalar o PWA na Tela de Início, (2) conceder permissão de notificações no Perfil. Se ele confirmar o plano, eu executo tudo em sequência.
