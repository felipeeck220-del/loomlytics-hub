# 🧩 rpcsettings.md — Plano de Migração RPC para `src/pages/Settings.tsx`

> **Status:** 📐 **Planejamento** — nenhuma migração implementada.
> **Alvo:** `src/pages/Settings.tsx` (~1.895 linhas) + Edge Function `manage-users`.
> **Referências de padrão consolidado:** `docs/rpcfechamentomensal.md`, `docs/rpcresiduesales.md`, `docs/rpcrevision.md`, `docs/rpcInvoices.md`, `docs/rpcclientInvoices.md`, `docs/rpcstockMalha.md`, `docs/rpcBillingOrders.md`, `docs/rpcFreightOrders.md`, `docs/rpcproduction.md`, `docs/correcoes/rpcfaturamentototal.md`.
> **Escopo:** consolidar leituras dispersas (4+ selects + edge `check-subscription` + `payment_history`) em RPCs SECURITY DEFINER com `v_caller := get_user_company_id()`; envolver mutações que hoje disparam UPDATE direto (nome empresa, logo, cancelar assinatura, `company_settings`) em RPCs atômicas com auditoria embutida; manter `manage-users` como Edge Function (auth admin API do Supabase não é acessível via SQL), mas migrar suas etapas puramente de banco (geração de `code`, `update_permissions`, `update` de perfil, `delete` do `profiles`) para RPCs reutilizáveis chamadas pela própria função.
> **Última revisão:** 19/07/2026 (Brasília).

---

## 0. Regras imutáveis

1. **Comportamento visível preservado 100%** — 5 abas, textos, badges, ordenação, dialogs, matriz `ROLE_PERMISSIONS`, fluxo Pix, `sidebarLocked`, admin `#1` intocável.
2. **Schema intocado nesta fase** — `profiles`, `companies`, `company_settings`, `platform_settings`, `payment_history`, `email_history`, `audit_logs` não mudam colunas nem constraints. `code` continua `text`, `role` continua `text`, `permission_overrides` continua `text[]`.
3. **Admin `#1` (`profile.code = '1'`)** — dupla camada mantida: client (UI) + server (RPC/Edge). RPCs de escrita rejeitam alvos `#1` para caller `!= #1`.
4. **`auth.users`** — nunca acessado por SQL puro; qualquer operação (create/update password/update email/delete) permanece em `manage-users` / `update-user-email` porque exige `auth.admin.*`. RPCs cuidam apenas do lado `public.*`.
5. **Multi-tenant** — `v_caller := get_user_company_id()` no início de toda RPC; `RAISE EXCEPTION 'Acesso negado'` em escritas quando caller não é admin ou alvo pertence a outra empresa. Em leituras, retornar payload vazio.
6. **SECURITY DEFINER + `SET search_path = public`** em todas as RPCs. `GRANT EXECUTE ... TO anon, authenticated, service_role`.
7. **Timezone `America/Sao_Paulo`** apenas em campos derivados exibidos; armazenamento continua `timestamptz`.
8. **Contrato de retorno** padronizado `{ok, already, id, action, conflict?}` idêntico ao restante do sistema.
9. **Retro-compatibilidade** — RPCs novas coexistem com fetches antigos durante rollout; remoção só após validação em staging.

---

## 1. Diagnóstico do estado atual

### 1.1. Leituras dispersas hoje no cliente

| # | Chamada | Origem | Payload |
|---|---------|--------|---------|
| 1 | `supabase.from('profiles').select('*').order('created_at')` | `refreshProfiles` | lista completa (sem paginação) |
| 2 | `supabase.from('companies').select('*').eq('id',company_id).single()` | `useEffect` inicial | 1 linha |
| 3 | `supabase.from('platform_settings').select('key,value')` | `useEffect` inicial | ~1–3 linhas |
| 4 | `supabase.from('company_settings').select('monthly_plan_value')` | `useEffect` inicial | 1 linha |
| 5 | `supabase.functions.invoke('check-subscription')` | `useEffect` inicial | JSON status (integração externa) |
| 6 | `supabase.from('payment_history').select('*').order('created_at' desc).limit(20)` | `fetchPaymentHistory` | até 20 |
| 7 | Debounce `check_email` (edge `manage-users`) | `checkAdminEmail` | boolean + reason |

> **Problema:** 6 requisições em paralelo no mount, mais 1 por mutação (`refreshProfiles` refetch total após cada save).

### 1.2. Escritas dispersas hoje no cliente (bypass edge)

| # | Ação | Chamada | Risco |
|---|------|---------|-------|
| A | Nome da empresa | `UPDATE companies SET name` | Sem auditoria embutida. |
| B | Logo | `storage.upload/remove` + `UPDATE companies SET logo_url` | Órfãos por extensão diferente. |
| C | Cancelar assinatura | `UPDATE company_settings SET subscription_status,grace_period_end` | Cálculo de `grace_period_end` no cliente. |
| D | Salvar `shiftForm` | `saveShiftSettings` (`useCompanyData`) | Já centralizado; ok. |
| E | Modo de produção | `saveMachines` | Já centralizado; ok. |
| F | Auditoria | `logAction` no cliente | Duplicação com edge. |

### 1.3. Escritas centralizadas hoje na Edge `manage-users`

| Etapa | Hoje | Proposta |
|-------|------|----------|
| Gerar `code` sequencial/aleatório | JS + selects múltiplos | RPC `generate_profile_code(p_role)` com `FOR UPDATE` |
| `check_email` global (`auth.users`) | Query admin | permanece Edge (precisa admin API) |
| `update_permissions` | `UPDATE profiles` | RPC `update_profile_permissions` |
| `update` (name/status) | `UPDATE profiles` | RPC `update_profile_fields` |
| `delete` | `DELETE FROM profiles` + `auth.admin.deleteUser` | RPC `delete_profile` cobre lado `public.*`; Edge segue chamando admin API |

---

## 2. Fase 1 — Bootstrap consolidado (leitura)

### 2.1. `get_settings_bootstrap()`

Consolida em **um único payload JSONB** tudo o que o `useEffect` inicial busca hoje.

```sql
CREATE OR REPLACE FUNCTION public.get_settings_bootstrap()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := get_user_company_id();
  v_payload jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('company', NULL, 'profiles', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'company', (SELECT to_jsonb(c) FROM companies c WHERE c.id = v_caller),
    'company_settings', (SELECT to_jsonb(cs) FROM company_settings cs WHERE cs.company_id = v_caller),
    'platform_settings', (SELECT jsonb_object_agg(key, value) FROM platform_settings),
    'profiles', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at ASC), '[]'::jsonb)
      FROM profiles p WHERE p.company_id = v_caller
    ),
    'payment_history', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ph) ORDER BY ph.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM payment_history WHERE company_id = v_caller
            ORDER BY created_at DESC LIMIT 50) ph
    ),
    'meta', jsonb_build_object(
      'admin_count', (SELECT count(*) FROM profiles WHERE company_id = v_caller AND role='admin'),
      'admin_limit', 50,
      'generated_at', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS')
    )
  ) INTO v_payload;

  RETURN v_payload;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_settings_bootstrap() TO anon, authenticated, service_role;
```

**Ganhos:** 4 selects + 1 count → 1 RPC. `payment_history` sobe de 20→50 sem custo extra.

### 2.2. `get_settings_subscription()`

Espelho leve para reidratações rápidas (após evento `subscription-updated`) sem re-consultar o gateway externo:

```sql
CREATE OR REPLACE FUNCTION public.get_settings_subscription()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := get_user_company_id();
  v_cs company_settings%ROWTYPE;
  v_last payment_history%ROWTYPE;
BEGIN
  SELECT * INTO v_cs FROM company_settings WHERE company_id = v_caller;
  SELECT * INTO v_last FROM payment_history
    WHERE company_id = v_caller AND status='paid' AND next_billing_date IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'status', COALESCE(v_cs.subscription_status, 'free'),
    'grace_period_end', v_cs.grace_period_end,
    'next_billing_date', v_last.next_billing_date,
    'last_paid_at', v_last.created_at,
    'monthly_plan_value', v_cs.monthly_plan_value
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_settings_subscription() TO anon, authenticated, service_role;
```

> **Nota:** a Edge `check-subscription` continua sendo a fonte canônica após pagamento (recebe webhook). A RPC serve apenas para leitura local rápida.

---

## 3. Fase 2 — Escritas atômicas

Todas retornam `{ok, already, id, action, conflict?}`.

### 3.1. `save_company_identity(p_name text, p_logo_url text)`

- Só admin.
- Valida `length(p_name) BETWEEN 2 AND 120`.
- `UPDATE companies SET name=p_name, logo_url=COALESCE(p_logo_url, logo_url) WHERE id=v_caller`.
- Insere `audit_logs (action='company_identity_update')`.

### 3.2. `save_company_shift_settings(p_shift jsonb)`

- Valida chaves `manha_start, manha_end, tarde_start, tarde_end, noite_start, noite_end` formato `HH24:MI`.
- `UPSERT` em `company_settings ON CONFLICT (company_id)`.
- Auditoria `shift_settings_update`.

### 3.3. `cancel_subscription()`

Encapsula o cálculo hoje feito no cliente (`handleCancelSubscription`).

```sql
CREATE OR REPLACE FUNCTION public.cancel_subscription()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := get_user_company_id();
  v_role text;
  v_next timestamptz;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT role INTO v_role FROM profiles WHERE user_id=auth.uid() AND company_id=v_caller;
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'Somente admin pode cancelar'; END IF;

  SELECT next_billing_date INTO v_next
    FROM payment_history
   WHERE company_id=v_caller AND status='paid' AND next_billing_date IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_next IS NULL THEN v_next := now() + interval '30 days'; END IF;

  UPDATE company_settings
     SET subscription_status='cancelling',
         grace_period_end=v_next,
         updated_at=now()
   WHERE company_id=v_caller;

  INSERT INTO audit_logs(company_id,user_id,action,details)
  VALUES(v_caller, auth.uid(), 'subscription_cancel',
         jsonb_build_object('grace_period_end', v_next));

  RETURN jsonb_build_object('ok',true,'grace_period_end',v_next);
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_subscription() TO authenticated, service_role;
```

### 3.4. `update_profile_permissions(p_user_id uuid, p_perms text[])`

- Só admin `#1`. `p_perms <@ ARRAY['financial','dashboard','production','reports','outsource']`.
- Alvo deve pertencer à mesma empresa e não ser `#1`.
- Auditoria `user_permissions_update`.

### 3.5. `update_profile_fields(p_user_id uuid, p_payload jsonb)`

- Whitelist: apenas `name`, `status`. **Rejeita** `role`, `code`, `company_id`, `permission_overrides`.
- Caller admin; alvo `#1` só editável pelo próprio `#1`.
- Auditoria `user_update` / `user_deactivate` / `user_reactivate` conforme diff.

### 3.6. `generate_profile_code(p_role text) RETURNS text`

```sql
CREATE OR REPLACE FUNCTION public.generate_profile_code(p_role text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := get_user_company_id();
  v_code text;
  v_max int;
  v_att int := 0;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF p_role = 'admin' THEN
    PERFORM 1 FROM companies WHERE id = v_caller FOR UPDATE;
    SELECT COALESCE(MAX((code)::int), 0) INTO v_max
      FROM profiles
     WHERE company_id = v_caller AND role='admin'
       AND code ~ '^[0-9]+$' AND (code)::int BETWEEN 1 AND 50;
    IF v_max >= 50 THEN RAISE EXCEPTION 'Limite de 50 admins atingido'; END IF;
    RETURN (v_max + 1)::text;
  END IF;

  LOOP
    v_att := v_att + 1;
    v_code := (100 + floor(random()*900))::int::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM profiles WHERE company_id=v_caller AND code=v_code
      UNION
      SELECT 1 FROM weavers WHERE company_id=v_caller AND code=v_code
    );
    IF v_att > 50 THEN RAISE EXCEPTION 'Falha ao gerar code único'; END IF;
  END LOOP;
  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_profile_code(text) TO service_role;
```

Chamada pela Edge `manage-users` via `supabase.rpc('generate_profile_code',{p_role})`.

### 3.7. `delete_profile(p_user_id uuid)`

- Caller admin `#1`. Alvo não pode ser `#1`.
- `DELETE FROM profiles WHERE user_id=p_user_id AND company_id=v_caller RETURNING to_jsonb(profiles.*) AS snapshot`.
- Auditoria `user_delete` com snapshot.
- Edge continua chamando `auth.admin.deleteUser` **após** o retorno.

---

## 4. Fase 3 — Refactor do cliente

### 4.1. Bootstrap

```ts
const { data: boot } = useQuery({
  queryKey: ['settings_bootstrap', user.company_id],
  queryFn: async () => {
    const { data, error } = await supabase.rpc('get_settings_bootstrap');
    if (error) throw error;
    return data as SettingsBootstrap;
  },
  staleTime: 30_000,
  enabled: !!user?.company_id,
});
```

- Elimina os 4 selects paralelos do `useEffect` inicial.
- `checkSubscription()` continua para status remoto, mas ganha fallback via `get_settings_subscription`.
- `refreshProfiles` vira `queryClient.invalidateQueries(['settings_bootstrap'])`.

### 4.2. Mutações

| Ação hoje | Vira |
|-----------|------|
| `UPDATE companies SET name` | `supabase.rpc('save_company_identity',{p_name})` |
| Upload logo + `UPDATE companies` | Upload continua no cliente; após URL: `save_company_identity({p_logo_url})` |
| `saveShiftSettings(shiftForm)` | passa a chamar `save_company_shift_settings(p_shift)` |
| `handleCancelSubscription` | `supabase.rpc('cancel_subscription')` |
| Edge `update_permissions` | delega para `update_profile_permissions` |
| Edge `update` (name/status) | delega para `update_profile_fields` |
| Edge `create` (geração de code) | delega para `generate_profile_code` |
| Edge `delete` | `delete_profile` + `auth.admin.deleteUser` |

### 4.3. Invalidação padronizada

`src/lib/queries/settingsQueries.ts`:

```ts
export const invalidateSettings = (qc: QueryClient) => {
  qc.invalidateQueries({ queryKey: ['settings_bootstrap'] });
  qc.invalidateQueries({ queryKey: ['settings_subscription'] });
};
```

Chamada em toda mutação (perfil, empresa, planos). Realtime de `profiles` no `AuthContext` dispara também.

### 4.4. Remoção de duplicidades

Após validação em staging:

- Remover `logAction` client-side para ações auditadas server-side (`company_identity_update`, `subscription_cancel`, `user_permissions_update`, `user_update`, `user_delete`) — evita registros duplicados.
- Reduzir `~35 useState` para blocos derivados do bootstrap; blocos de UI puro (dialogs, forms) permanecem.

---

## 5. Fase 4 — Opcional: histórico enriquecido & export

### 5.1. `get_settings_payment_history_export()`

Retorna `rows` já formatados com `date_br` (`to_char(created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')`) e `status_label` traduzido, permitindo exportação futura (PDF/CSV) do histórico completo sem processamento client-side.

### 5.2. `get_settings_audit_page(p_page int, p_page_size int, p_action text default null)`

Alimenta `AuditHistoryModal` server-side com paginação, filtro por ação e busca em `user_name/user_code`. Substitui fetch atual que traz tudo.

---

## 6. Contratos das novas funções

| Função | Volatilidade | Autor | Retorno |
|--------|--------------|-------|---------|
| `get_settings_bootstrap()` | STABLE | qualquer autenticado | `jsonb` payload consolidado |
| `get_settings_subscription()` | STABLE | qualquer autenticado | `jsonb` status resumido |
| `save_company_identity(text,text)` | VOLATILE | admin | `{ok,id,action}` |
| `save_company_shift_settings(jsonb)` | VOLATILE | admin | `{ok}` |
| `cancel_subscription()` | VOLATILE | admin | `{ok,grace_period_end}` |
| `update_profile_permissions(uuid,text[])` | VOLATILE | admin `#1` | `{ok,id,action}` |
| `update_profile_fields(uuid,jsonb)` | VOLATILE | admin | `{ok,id,action,changed[]}` |
| `generate_profile_code(text)` | VOLATILE | service_role (Edge) | `text` |
| `delete_profile(uuid)` | VOLATILE | admin `#1` | `{ok,id,action,snapshot}` |
| `get_settings_payment_history_export()` (opc.) | STABLE | admin | `jsonb` rows |
| `get_settings_audit_page(int,int,text)` (opc.) | STABLE | admin `#1` | `{rows,total_count,page}` |

Todas `SECURITY DEFINER`, `SET search_path=public`, `GRANT EXECUTE` conforme role.

---

## 7. Ordem sugerida de rollout

1. **Fase 1.1/1.2** publica `get_settings_bootstrap` + `get_settings_subscription`; cliente segue com fetches antigos.
2. **Fase 3.1** cliente adota `useQuery(['settings_bootstrap'])`, remove 4 selects + `refreshProfiles`.
3. **Fase 2.3** `cancel_subscription` → refactor `handleCancelSubscription` (isolado, baixo risco).
4. **Fase 2.1/2.2** `save_company_identity` + `save_company_shift_settings`.
5. **Fase 2.6** `generate_profile_code` adotado dentro de `manage-users`.
6. **Fase 2.4/2.5/2.7** `update_profile_permissions` / `update_profile_fields` / `delete_profile` — Edge delega.
7. **Fase 3.3** publicar `invalidateSettings` e plugar em mutações.
8. **Fase 3.4** remover `logAction` duplicado por ação.
9. **Fase 4** (opcional) histórico paginado + export.

---

## 8. Riscos & mitigações

| # | Risco | Mitigação |
|---|-------|-----------|
| 1 | Payload do bootstrap crescer em empresas com muitos perfis | Medir p95; se >500 perfis, migrar para `get_settings_profiles_page(p_page)`. |
| 2 | Corrida na geração de `code` admin | `FOR UPDATE` na linha da company + hard limit 50. |
| 3 | Auditoria dupla durante transição | Manter `logAction` no cliente até RPC ativa; remover num único commit por ação. |
| 4 | `cancel_subscription` divergir do cálculo antigo | RPC replica `?? now()+30d` exato; diff em staging 1 semana. |
| 5 | `subscription_status` fora de sincronia com provedor | RPC não altera lógica remota; `check-subscription` continua canonical após webhook. |
| 6 | RLS de `profiles` bloquear leitura da lista | Bootstrap usa `SECURITY DEFINER` + filtro por `company_id=v_caller`. |
| 7 | `role` alterado indevidamente via `update_profile_fields` | Whitelist estrita rejeita `role`; testes cobrem tentativa. |
| 8 | Admin `#1` alvo por outro admin | RPC checa `code='1'` e rejeita se caller ≠ `#1`. |
| 9 | Bucket `company-logos` com órfãos | Fora do escopo (documentado em `docs/settings.md`). |
| 10 | Edge `manage-users` chamar RPC com role errado | `generate_profile_code` só `EXECUTE` a `service_role`. |
| 11 | `payment_history` >50 | Fase 4 introduz paginação; até lá modal mostra 50 mais recentes. |
| 12 | Realtime disparar refetch excessivo | `invalidateSettings` usa `queryKey` prefixado; único fetch é o bootstrap. |
| 13 | `SubscriptionContext` offline | `get_settings_subscription` serve fallback rápido. |
| 14 | `logAction` removido antes da RPC deployada | Ordem de rollout força RPC ativa antes de remover cliente. |

---

## 9. Checklist de aderência (22 pontos)

- [ ] `get_settings_bootstrap` devolve `company`, `company_settings`, `platform_settings`, `profiles`, `payment_history`, `meta.admin_count/limit`.
- [ ] Payload do bootstrap < 250 KB para 50 usuários / 50 pagamentos.
- [ ] `get_settings_subscription` retorna `status`, `grace_period_end`, `next_billing_date`, `last_paid_at`, `monthly_plan_value`.
- [ ] `save_company_identity` valida `p_name` (2–120) e aceita `p_logo_url` opcional.
- [ ] `save_company_shift_settings` valida 6 chaves `HH24:MI`.
- [ ] `cancel_subscription` reproduz exatamente `next_billing_date ?? now()+30d`.
- [ ] `update_profile_permissions` restrito a admin `#1`, whitelist de 5 chaves.
- [ ] `update_profile_fields` recusa `role`, `code`, `company_id`, `permission_overrides`.
- [ ] `generate_profile_code('admin')` respeita limite 50 e usa `FOR UPDATE`.
- [ ] `generate_profile_code(outros)` evita colisão com `weavers.code`.
- [ ] `delete_profile` retorna snapshot antes do `DELETE`.
- [ ] Escritas gravam `audit_logs` server-side com `auth.uid()` e `code` do caller.
- [ ] Cliente remove `logAction` duplicado após RPC ativa.
- [ ] `useQuery(['settings_bootstrap'])` substitui `Promise.all` do mount.
- [ ] `invalidateSettings(qc)` publicado em `src/lib/queries/settingsQueries.ts`.
- [ ] Realtime de `profiles` continua funcional.
- [ ] `sidebarLocked` continua forçando `tab='plans'`.
- [ ] Admin `#1` mantém exclusividade de Editar/Alterar Senha/Desativar/Excluir/Permissões/Histórico.
- [ ] Fluxo Pix (`create-pix-checkout` + polling 5s + `fbTrack`) inalterado.
- [ ] RLS ativa em `profiles`, `companies`, `company_settings`, `payment_history`, `platform_settings` não alterada.
- [ ] Diff numérico do bootstrap vs fetches antigos idêntico em staging por 1 semana.
- [ ] Rollback via `REVOKE EXECUTE` sem quebrar cliente (fallback ativo até Fase 3.4).

---

## 10. Fora do escopo

- Substituir Edge `manage-users` inteira por SQL (auth admin API obrigatória).
- Substituir `check-subscription` por RPC (integração com provedor de pagamento).
- Substituir `create-pix-checkout` / `check-pix-payment` / `update-user-email` por RPC.
- Refatorar bucket `company-logos` para eliminar órfãos.
- Introduzir `monthly_plan_value` editável por admin da empresa.
- Habilitar aba **Telas** (permanece "Em breve").
- Migrar `code` de `text` para `int`.
- Persistir snapshot de `payment_history` fora do provedor.

---

*Plano `docs/rpcsettings.md` — 100% planejamento, nada implementado. Base: `docs/settings.md` (19/07/2026) + padrão consolidado das RPCs em produção.*
