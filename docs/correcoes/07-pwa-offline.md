# 07 — PWA com Suporte Offline para Chão de Fábrica

**Prioridade:** 🟢 Baixa (depende de uso real) · **Esforço:** ~8h · **Risco se não fizer:** Perda de dados em áreas sem Wi-Fi

---

## Diagnóstico

O Service Worker atual (`public/sw.js`) é um stub mínimo apenas para satisfazer critérios de instalação PWA:

```js
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => { return; });  // ← não faz nada
```

Não há:
- Cache de assets estáticos
- Cache de respostas de API
- Fila de mutations offline
- Indicador de modo offline na UI
- Sync automático ao voltar online

A memória `mem://features/connectivity-and-refresh` mostra que existe um indicador de status de rede no header, mas isso é só visual — não há lógica de fila offline.

## Risco / Oportunidade

**Cenário típico de fábrica têxtil:**
- Tecelão registra produção pelo celular ao lado da máquina
- Wi-Fi da fábrica tem zonas mortas (estrutura metálica, máquinas grandes)
- Sem offline: registro falha silenciosamente ou usuário precisa anotar e refazer depois
- Com offline: registro vai para fila local, sincroniza quando voltar conexão

**Avaliar antes de investir:** os tecelões realmente registram pelo celular no chão de fábrica, ou um líder/admin registra depois no escritório? Se for o segundo caso, esforço não compensa.

## Solução Proposta

### Estratégia: Workbox via vite-plugin-pwa

Instalar `vite-plugin-pwa` que abstrai Workbox. Já testado, mantém Lovable funcionando, suporta auto-update.

### Passo 1 — Instalar plugin

```bash
npm install vite-plugin-pwa workbox-window -D
```

### Passo 2 — Configurar `vite.config.ts`

```ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,  // mantém public/manifest.json existente
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          // Assets do Supabase Storage (logos, etc) — cache longo
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          // Queries de leitura — stale-while-revalidate (mostra cache, atualiza em background)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
        // Skip waiting para atualizar imediatamente
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false }, // não roda em dev (incompatível com Lovable preview)
    }),
  ],
});
```

### Passo 3 — Fila offline para mutations

Criar `src/lib/offlineQueue.ts`:

```ts
import { openDB, IDBPDatabase } from 'idb';

interface QueuedMutation {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  payload: unknown;
  createdAt: string;
  retryCount: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB('malhagest-offline', 1, {
      upgrade(db) {
        db.createObjectStore('mutations', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function enqueueMutation(m: Omit<QueuedMutation, 'id' | 'createdAt' | 'retryCount'>) {
  const db = await getDb();
  await db.put('mutations', {
    ...m,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    retryCount: 0,
  });
}

export async function processQueue() {
  const db = await getDb();
  const all = await db.getAll('mutations');

  for (const item of all) {
    try {
      // executar mutation no Supabase conforme item.operation/table
      await executeQueuedMutation(item);
      await db.delete('mutations', item.id);
    } catch (err) {
      item.retryCount++;
      if (item.retryCount > 5) {
        // marcar como falha permanente, alertar usuário
        await db.delete('mutations', item.id);
        notifyPermanentFailure(item);
      } else {
        await db.put('mutations', item);
      }
    }
  }
}

// Disparar processamento ao voltar online
window.addEventListener('online', () => { processQueue(); });
```

### Passo 4 — Wrapper de mutation com fallback offline

```ts
// src/lib/syncedMutation.ts
import { enqueueMutation } from './offlineQueue';

export async function syncedInsert<T>(table: string, payload: T) {
  if (navigator.onLine) {
    try {
      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;
      return { synced: true };
    } catch (err) {
      // Falha de rede → fila
      if (isNetworkError(err)) {
        await enqueueMutation({ table, operation: 'insert', payload });
        return { synced: false, queued: true };
      }
      throw err;  // erros não-rede sobem
    }
  } else {
    await enqueueMutation({ table, operation: 'insert', payload });
    return { synced: false, queued: true };
  }
}
```

### Passo 5 — UI de estado offline

Estender o componente `NetworkStatusIcon.tsx` existente:
- Verde: online, sem fila
- Amarelo: online, sincronizando fila
- Vermelho/laranja: offline, X items na fila
- Toast ao voltar online: "X registros sincronizados com sucesso"

### Passo 6 — Decidir o que NÃO precisa offline

**Não vale a pena cachear/enfileirar:**
- Fechamento mensal (operação de admin, faz com internet)
- Configurações
- Cadastros (clientes, artigos) — admin faz no escritório
- Pagamentos (PIX, Stripe) — exige conexão por natureza

**Vale a pena offline:**
- Registro de Produção (uso intenso no chão)
- Registro de Falhas/Defeitos (idem)
- Visualização de dashboard recente (consulta rápida)

## Arquivos Afetados

**Novos:**
- `src/lib/offlineQueue.ts`
- `src/lib/syncedMutation.ts`

**Modificados:**
- `vite.config.ts` — adicionar VitePWA
- `package.json` — novas devDependencies
- `src/main.tsx` — remover registro manual de SW (plugin assume)
- `public/sw.js` — DELETAR (gerado pelo Workbox)
- `src/components/NetworkStatusIcon.tsx` — mostrar contador da fila
- `src/pages/Production.tsx` — usar `syncedInsert` para registros
- `src/hooks/useCompanyData.ts` — `addProductions`/`addDefectRecords` usam wrapper

**Deletados:**
- `public/sw.js` (substituído pelo gerado)

## Critérios de Aceite

- [ ] App funciona offline para visualização (cache de 24h)
- [ ] Lançar produção offline coloca em fila, mostra toast "Salvo localmente, sincronizará"
- [ ] Voltar online dispara sync automático em ≤ 5s
- [ ] Falha permanente após 5 retries notifica usuário com opção de recriar manualmente
- [ ] Lighthouse PWA score ≥ 90
- [ ] Não interfere com preview Lovable (devOptions.enabled = false)

## Rollback

Remover plugin VitePWA do `vite.config.ts`, restaurar `public/sw.js` mínimo. Componentes voltam a usar `supabase.from(...).insert()` direto se ignorarem o wrapper.

## Quando atacar

**Apenas se houver demanda real.** Perguntar aos clientes:
- "Os tecelões registram pelo celular no chão da fábrica?"
- "Vocês perdem registros por causa de internet ruim?"

Se respostas forem "não" → priorizar outras melhorias.
