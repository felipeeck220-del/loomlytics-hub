# 05 — Restringir CORS nas Edge Functions

**Prioridade:** 🔴 Alta · **Esforço:** ~1h · **Risco se não fizer:** Qualquer site pode chamar suas funções

---

## Diagnóstico

Todas as Edge Functions usam CORS aberto:

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

**Funções afetadas (22 no total):**
- `admin-api`, `check-pix-expiry`, `check-pix-payment`, `check-subscription`
- `create-checkout`, `create-company-profile`, `create-pix-checkout`, `customer-portal`
- `daily-backup`, `machine-webhook`, `manage-users`, `notify-accounts-due`
- `notify-subscription-status`, `restore-backup`, `setup-admin`, `syncpay-webhook`
- `test-webhook`, `tv-panel-data`, `update-user-email`, `validate-tv-code`

## Risco

- Sites maliciosos podem fazer requisições autenticadas (com `apikey` pública)
- Endpoints de listagem (ex: `tv-panel-data`) podem ser scrapeados de qualquer origem
- CSRF amplificado: usuário logado em malhagest.site visita site malicioso → site malicioso chama edge function em nome dele
- Endpoints de webhook (`machine-webhook`, `syncpay-webhook`) **devem** aceitar qualquer origem (são chamados por servidores externos) — manter `*` neles

## Solução Proposta

### Passo 1 — Definir lista de origens permitidas

Domínios legítimos que precisam acessar as funções:

```ts
const ALLOWED_ORIGINS = [
  'https://malhagest.site',
  'https://www.malhagest.site',
  'https://loomlytics-hub.lovable.app',  // domínio publicado
  'https://id-preview--590152f9-e65a-4ec4-8e79-b699ba32eb6f.lovable.app', // preview
  'http://localhost:8080',  // dev local Vite
  'http://localhost:5173',  // dev local Vite (porta padrão)
];
```

Considerar também previews dinâmicos do Lovable: o pattern `*.lovable.app` precisaria de regex.

### Passo 2 — Helper compartilhado

Criar `supabase/functions/_shared/cors.ts`:

```ts
const ALLOWED_ORIGINS = [
  'https://malhagest.site',
  'https://www.malhagest.site',
  'https://loomlytics-hub.lovable.app',
  'http://localhost:8080',
  'http://localhost:5173',
];

const ALLOWED_PATTERNS = [
  /^https:\/\/.*\.lovable\.app$/,        // todos os previews/published Lovable
  /^https:\/\/.*\.lovableproject\.com$/, // sandbox
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    ALLOWED_PATTERNS.some((re) => re.test(origin));

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

// Para webhooks externos (SyncPay, IoT) — manter aberto
export const PUBLIC_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

### Passo 3 — Atualizar cada função

**Antes:**
```ts
const corsHeaders = { 'Access-Control-Allow-Origin': '*', /* ... */ };

if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}
```

**Depois (funções chamadas pelo frontend):**
```ts
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ... resto da função, usando corsHeaders em todas as respostas (incluindo erros)
});
```

**Funções que devem manter aberto** (chamadas por servidores externos):
- `machine-webhook` — chamada por dispositivos IoT (qualquer IP)
- `syncpay-webhook` — chamada pelo gateway SyncPay
- `test-webhook` — utilitário de debug

Para essas, importar `PUBLIC_CORS_HEADERS`.

### Passo 4 — Classificação de cada função

| Função | Quem chama | CORS |
|--------|-----------|------|
| `admin-api` | Frontend (admin) | Restrito |
| `check-pix-expiry` | Frontend | Restrito |
| `check-pix-payment` | Frontend | Restrito |
| `check-subscription` | Frontend | Restrito |
| `create-checkout` | Frontend | Restrito |
| `create-company-profile` | Frontend | Restrito |
| `create-pix-checkout` | Frontend | Restrito |
| `customer-portal` | Frontend | Restrito |
| `daily-backup` | pg_cron | N/A (server-only) |
| `machine-webhook` | IoT externo | **Aberto** |
| `manage-users` | Frontend (admin) | Restrito |
| `notify-accounts-due` | pg_cron | N/A |
| `notify-subscription-status` | pg_cron | N/A |
| `restore-backup` | Frontend (admin) | Restrito |
| `setup-admin` | Setup inicial | Restrito |
| `syncpay-webhook` | SyncPay externo | **Aberto** |
| `test-webhook` | Debug | **Aberto** |
| `tv-panel-data` | TV externa (sem auth completa) | Restrito + pattern para Lovable |
| `update-user-email` | Frontend | Restrito |
| `validate-tv-code` | Frontend | Restrito |

### Passo 5 — Testar pós-deploy

Para cada função:
1. Testar do frontend em produção (malhagest.site) → deve funcionar
2. Testar do preview Lovable → deve funcionar
3. Testar via curl com `Origin: https://evil.com` → deve responder mas browser bloqueia
4. Webhooks externos (`machine-webhook`, `syncpay-webhook`) continuam funcionando

## Arquivos Afetados

**Novos:**
- `supabase/functions/_shared/cors.ts`

**Modificados (todas as 22 edge functions):**
- `supabase/functions/admin-api/index.ts`
- `supabase/functions/check-pix-expiry/index.ts`
- `supabase/functions/check-pix-payment/index.ts`
- `supabase/functions/check-subscription/index.ts`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/create-company-profile/index.ts`
- `supabase/functions/create-pix-checkout/index.ts`
- `supabase/functions/customer-portal/index.ts`
- `supabase/functions/daily-backup/index.ts`
- `supabase/functions/machine-webhook/index.ts` (PUBLIC)
- `supabase/functions/manage-users/index.ts`
- `supabase/functions/notify-accounts-due/index.ts`
- `supabase/functions/notify-subscription-status/index.ts`
- `supabase/functions/restore-backup/index.ts`
- `supabase/functions/setup-admin/index.ts`
- `supabase/functions/syncpay-webhook/index.ts` (PUBLIC)
- `supabase/functions/test-webhook/index.ts` (PUBLIC)
- `supabase/functions/tv-panel-data/index.ts`
- `supabase/functions/update-user-email/index.ts`
- `supabase/functions/validate-tv-code/index.ts`

## Critérios de Aceite

- [ ] Frontend em malhagest.site continua funcionando 100%
- [ ] Frontend em preview Lovable continua funcionando 100%
- [ ] Webhooks externos (IoT, SyncPay) continuam funcionando
- [ ] Requisição de origem desconhecida recebe `Access-Control-Allow-Origin` da lista (browser bloqueia)
- [ ] Header `Vary: Origin` presente para evitar cache CDN incorreto
- [ ] Todas as respostas (sucesso E erro) incluem CORS headers

## Rollback

Reverter `_shared/cors.ts` para sempre retornar `*`. Cada função volta a aceitar qualquer origem instantaneamente.

## Notas Importantes

- **NUNCA** mudar CORS de webhooks externos sem coordenação — quebra integração imediatamente
- O Lovable usa subdomínios dinâmicos para preview — o regex `*.lovable.app` cobre todos
- Considerar mover lista de origens para uma variável de ambiente no futuro
