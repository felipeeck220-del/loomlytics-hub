# 🔄 Botão Refresh + 📶 Indicador de Conexão — Documentação Completa

> **Data de implementação:** 09/04/2026  
> **Arquivos criados:** `src/hooks/useNetworkStatus.ts`, `src/components/NetworkStatusIcon.tsx`  
> **Arquivos modificados:** `src/hooks/useCompanyData.ts`, `src/components/AppLayout.tsx`, `src/contexts/CompanyDataContext.tsx`

---

## 📌 Visão Geral

Duas funcionalidades adicionadas ao **header fixo** (`AppLayout.tsx`) do sistema:

1. **Indicador de Conexão (📶)** — Ícone de barras de sinal que mostra a qualidade da conexão de internet em tempo real
2. **Botão Refresh (🔄)** — Botão que recarrega **apenas os dados do banco de dados**, sem recarregar a página inteira (diferente de F5)

Ambos ficam posicionados no header entre o separador vertical e o botão de tema (sol/lua), visíveis em todas as páginas autenticadas.

---

## 📶 Indicador de Conexão

### Arquitetura

```
useNetworkStatus (hook) → NetworkStatusIcon (componente) → AppLayout (header)
```

### Hook: `src/hooks/useNetworkStatus.ts`

**Tipo exportado:**
```typescript
export type ConnectionQuality = 'good' | 'medium' | 'poor' | 'offline';
```

**Retorno:**
```typescript
interface NetworkStatus {
  quality: ConnectionQuality;  // Estado atual da conexão
  label: string;               // Texto em pt-BR para tooltip
}
```

**Lógica de detecção:**

| Qualidade | Condição | Label |
|-----------|----------|-------|
| `offline` | `navigator.onLine === false` | "Sem conexão" |
| `poor` | `effectiveType` = `slow-2g`/`2g` **OU** `downlink < 0.5 Mbps` **OU** `rtt > 800ms` | "Conexão fraca" |
| `medium` | `effectiveType` = `3g` **OU** `downlink < 2 Mbps` **OU** `rtt > 400ms` | "Conexão média" |
| `good` | Todos os demais casos (4g+, downlink ≥ 2, rtt ≤ 400) | "Conexão boa" |

**APIs utilizadas:**
- `navigator.onLine` — Suportado em todos os browsers
- `navigator.connection` (Network Information API) — Suportado em Chrome, Edge, Opera, Android WebView. **Não suportado** no Safari/iOS/Firefox
- Fallback: Se `navigator.connection` não existir e `navigator.onLine === true`, assume `good`

**Mecanismos de atualização:**
1. `window.addEventListener('online', update)` — Dispara ao reconectar
2. `window.addEventListener('offline', update)` — Dispara ao desconectar
3. `navigator.connection.addEventListener('change', update)` — Dispara ao mudar qualidade (Chrome/Edge)
4. `setInterval(update, 10000)` — Polling a cada 10 segundos como fallback universal

**Cleanup:** Todos os listeners e o interval são removidos no cleanup do `useEffect`.

### Componente: `src/components/NetworkStatusIcon.tsx`

**Visual:**

| Qualidade | Ícone | Cor |
|-----------|-------|-----|
| `good` | 4 barras preenchidas | Verde (`bg-success`) |
| `medium` | 2 barras preenchidas | Amarelo (`bg-warning`) |
| `poor` | 1 barra preenchida | Vermelho (`bg-destructive`) |
| `offline` | Ícone X (Lucide) | Vermelho (`text-destructive`) |

- Barras não ativas: `bg-muted-foreground/25` (cinza transparente)
- Barras têm alturas progressivas: 6px, 9px, 12px, 16px
- Largura de cada barra: 3px com `rounded-sm`
- Tooltip (via shadcn `Tooltip`): exibe o label textual ao passar o mouse

**Tokens de design utilizados:**
- `text-success` / `bg-success` — Verde (definido em `index.css`)
- `text-warning` / `bg-warning` — Amarelo
- `text-destructive` / `bg-destructive` — Vermelho
- `bg-muted-foreground` — Cinza para barras inativas

---

## 🔄 Botão Refresh Inteligente

### O que faz

Ao clicar no botão:
1. O ícone `RefreshCw` entra em animação de **spin** (`animate-spin`)
2. O botão fica **desabilitado** (evita cliques múltiplos)
3. A função `refreshData()` é chamada — recarrega **9 tabelas** do banco em paralelo via `Promise.all`
4. Ao concluir com sucesso: toast verde "Dados atualizados"
5. Em caso de erro: toast vermelho "Erro ao atualizar" com orientação para verificar conexão
6. O ícone para de girar e o botão é reabilitado

### Diferença do F5

| Ação | F5 / `window.location.reload()` | Botão Refresh |
|------|----------------------------------|---------------|
| Recarrega HTML/JS/CSS | ✅ Sim | ❌ Não |
| Recarrega estado React | ✅ Sim (perde tudo) | ❌ Mantém |
| Recarrega dados do banco | ✅ Sim (via remontagem) | ✅ Sim (via `refreshData`) |
| Tempo de execução | ~2-5 segundos | ~0.5-1 segundo |
| Mantém scroll/posição | ❌ Não | ✅ Sim |
| Mantém filtros/modais | ❌ Não | ✅ Sim |
| Re-autentica sessão | ✅ Sim | ❌ Não necessário |

### Arquitetura

```
AppLayout (botão) 
  → useSharedCompanyData().refreshData() 
    → useCompanyData.loadAllData() 
      → Promise.all(9 queries paralelas)
        → setMachines, setClients, setArticles, setWeavers, 
           setProductions, setMachineLogs, setArticleMachineTurns,
           setDefectRecords, setShiftSettings
```

### Refatoração do `useCompanyData.ts`

**Antes:**
- A lógica de carregamento era uma IIFE anônima dentro do `useEffect`
- Não era possível chamar o carregamento externamente
- Mappers ficavam depois do `loadAllData` (ordem incorreta para closures)

**Depois:**
- Mappers movidos para **antes** da definição de `loadAllData`
- `loadAllData` extraído como `useCallback` com dependência `[companyId]`
- `try/catch/finally` adicionado para tratamento de erros
- `loadAllData` exposto no retorno do hook como `refreshData`
- `useEffect` simplificado: apenas chama `loadAllData()`

**Tabelas recarregadas (9 queries paralelas):**

| # | Tabela | Filtro | Ordenação |
|---|--------|--------|-----------|
| 1 | `machines` | `company_id` | `number` ASC |
| 2 | `clients` | `company_id` | `name` ASC |
| 3 | `articles` | `company_id` | `name` ASC |
| 4 | `weavers` | `company_id` | `code` ASC |
| 5 | `productions` | `company_id` | `date` DESC |
| 6 | `machine_logs` | nenhum (RLS) | `started_at` DESC |
| 7 | `article_machine_turns` | `company_id` | `created_at` ASC |
| 8 | `company_settings` | `company_id` | `.maybeSingle()` |
| 9 | `defect_records` | `company_id` | `date` DESC |

Todas usam `fetchAll` com paginação recursiva (PAGE_SIZE 1000) exceto `company_settings` que usa `.maybeSingle()`.

### Tratamento de Erros

```typescript
const loadAllData = useCallback(async () => {
  if (!companyId) { setLoading(false); return; }
  setLoading(true);
  try {
    // ... 9 queries paralelas + setters
  } catch (err) {
    console.error('Failed to load company data:', err);
  } finally {
    setLoading(false);  // SEMPRE executado — evita UI travada em loading
  }
}, [companyId]);
```

**Cenários de erro tratados:**
1. **Rede offline** — `Promise.all` falha, catch captura, `setLoading(false)` é chamado, toast vermelho no AppLayout
2. **Sessão expirada** — Supabase retorna 401, catch captura, UI não trava
3. **Timeout de rede** — Mesmo tratamento via catch
4. **Query individual falha** — `Promise.all` rejeita no primeiro erro, dados parciais não são aplicados (mantém estado anterior)

### Fluxo no `AppLayout.tsx`

```typescript
// Imports
import { useSharedCompanyData } from '@/contexts/CompanyDataContext';
import { useToast } from '@/hooks/use-toast';

// Dentro do componente
const { refreshData } = useSharedCompanyData();
const [isRefreshing, setIsRefreshing] = useState(false);
const { toast } = useToast();

// Botão
<Button
  variant="ghost"
  size="icon"
  onClick={async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
      toast({ title: 'Dados atualizados', description: 'Todos os dados foram recarregados com sucesso.' });
    } catch {
      toast({ title: 'Erro ao atualizar', description: 'Não foi possível recarregar os dados. Verifique sua conexão.', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  }}
  disabled={isRefreshing}
  className="h-8 w-8 text-muted-foreground hover:text-foreground"
  title="Atualizar dados"
>
  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
</Button>
```

---

## 🔍 Bugs Encontrados e Corrigidos

### Bug 1: Loading infinito em caso de erro (CRÍTICO)
- **Problema:** `loadAllData` não tinha `try/catch`. Se qualquer query falhasse, `setLoading(false)` nunca era chamado, deixando a UI em estado de loading permanente.
- **Correção:** Adicionado `try/catch/finally` com `setLoading(false)` no `finally`.

### Bug 2: Sem feedback visual ao usuário
- **Problema:** O botão girava mas não informava se o refresh teve sucesso ou falha.
- **Correção:** Adicionado toast de sucesso e toast de erro (`variant: 'destructive'`).

### Bug 3: Mappers definidos após loadAllData
- **Problema:** Os mappers (`mapMachine`, `mapClient`, etc.) eram definidos **depois** do `useCallback` de `loadAllData`, o que poderia causar problemas com closures stale em certos cenários de re-render.
- **Correção:** Mappers movidos para **antes** da definição de `loadAllData`.

---

## 📍 Posição no Header

```
[SidebarTrigger] ............ [Turno Badge] [Data] [Assinatura Badge] | [📶 Sinal] [🔄 Refresh] [🌙 Tema] [🔔 Notif] [👤 Usuário]
```

Ordem dos ícones (esquerda → direita, após o separador):
1. Indicador de conexão (📶)
2. Botão refresh (🔄)
3. Toggle de tema (🌙/☀️)
4. Notificações (🔔)
5. Menu do usuário (👤)

---

## ⚠️ Limitações Conhecidas

1. **Safari/iOS:** `navigator.connection` não é suportado — indicador simplifica para apenas online (verde) ou offline (X vermelho), sem detecção de qualidade intermediária
2. **Firefox:** Mesma limitação do Safari — sem Network Information API
3. **Páginas fora do CompanyRoute:** O botão refresh só funciona em páginas dentro do `CompanyDataProvider` (todas as rotas `/:slug/*`). Páginas como `/admin`, `/vendas`, `/login` não têm o botão
4. **Dados locais de página:** O refresh recarrega os dados do `useCompanyData` (9 tabelas principais). Dados carregados localmente em cada página (ex: `invoices`, `residue_sales`, `accounts_payable`, `outsource_productions`) **não são afetados** — esses módulos fazem suas próprias queries e precisariam de refresh individual

---

## 📂 Dependências

| Arquivo | Depende de |
|---------|-----------|
| `useNetworkStatus.ts` | Nenhum (API nativa do browser) |
| `NetworkStatusIcon.tsx` | `useNetworkStatus`, shadcn `Tooltip`, Lucide `X` |
| `AppLayout.tsx` | `useSharedCompanyData` (para `refreshData`), `useToast`, `NetworkStatusIcon` |
| `useCompanyData.ts` | Supabase client, tipos do projeto |
| `CompanyDataContext.tsx` | `useCompanyData` (já exportava o retorno completo, `refreshData` veio automaticamente) |

---

*Última atualização: 09/04/2026 21:00 (Brasília)*
