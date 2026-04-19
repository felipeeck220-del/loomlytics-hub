# ⚙️ Settings.tsx — Detalhamento Técnico

> **Status:** ✅ **Em Produção**
>
> Documento técnico do arquivo `src/pages/Settings.tsx`. Para visão funcional, ver [`configuracoes.md`](./configuracoes.md).

---

## 📌 Visão Geral

`Settings.tsx` é a página `/:slug/settings` — centraliza a gestão da empresa, perfil, usuários, planos e dispositivos IoT.

Acesso: **apenas admins** (verificado por `usePermissions`).

---

## 🧱 Estrutura em abas

| Aba | Conteúdo | Restrições |
|-----|----------|------------|
| **Meu Perfil** | Nome, email, senha do usuário logado | Apenas o admin **#1** pode alterar nome/email; demais admins só alteram a senha |
| **Usuários** | Lista de usuários da empresa, criar, editar, desativar, excluir | Botões de ação (editar, senha, desativar, excluir, permissões) **somente** para o admin **#1** |
| **Empresa** | Dados, logo, configurações de turno, dispositivos IoT, telas TV | Admin only |
| **Planos** | Status da assinatura, valor mensal, geração de Pix, histórico de pagamentos | Admin only |
| **Telas** | Pareamento de TVs (modo industrial) | 🔒 Em breve (badge no sidebar) |

---

## 🔐 Regras de segurança críticas

1. **Admin #1 é intocável:** Outros admins não podem editar, alterar senha, desativar ou excluir o admin principal. Verificação **client-side** (botões ocultos) **e server-side** (Edge Function `manage-users`).
2. **Verificação global de email para novos admins:** Antes de criar admin, edge function checa em **todas** as empresas + `auth.users` (action `check_email`, debounce 600ms no UI).
3. **Códigos de admin sequenciais:** Admins recebem códigos #2, #3, ..., #50 (próximo após o maior existente). Não-admins recebem códigos aleatórios #100-#999.
4. **Bloqueio de mudança de função para admins:** Após criação, role de admin não pode ser alterada.
5. **Ações de password restritas ao #1:** A action `change_password` da edge function valida server-side se o chamador é o admin #1.

---

## 🔄 Bloqueio em tempo real (Realtime)

Quando o admin desativa um usuário (`status = 'inactive'`), o usuário desativado vê **imediatamente** uma tela bloqueada (overlay cinza + cadeado), sem precisar recarregar.

- **Mecanismo:** Supabase Realtime na tabela `profiles`
- **Implementação:** `AuthContext` escuta mudanças de `status` do próprio perfil

---

## 💳 Aba Planos — Bloqueio progressivo

Quando a assinatura está em status **`suspended`** ou expirada:

- Sidebar fica **trancada** (todas as opções com cadeado, exceto "Configurações")
- Em Settings, **apenas a aba "Planos"** fica acessível — Perfil/Usuários/Empresa ficam desabilitadas
- `AppLayout` redireciona admin para `/settings` se tentar acessar outra rota
- Badge "Conta Suspensa" no header

---

## 🔗 Dependências críticas

- **Edge Functions:** `manage-users` (CRUD), `check-subscription`, `create-pix-checkout`, `check-pix-payment`
- **Contexts:** `AuthContext`, `SubscriptionContext`, `CompanyDataContext`
- **Hooks:** `usePermissions`, `useAuditLog`
- **Storage:** bucket `company-logos`
- **Pixel:** `fbTrack('InitiateCheckout')` na geração de Pix, `fbTrack('Purchase')` na confirmação

---

## 🐛 Bugs históricos resolvidos

- ✅ `editingUser.id` (profile row) era enviado ao invés de `editingUser.user_id` (auth uid)
- ✅ Botão Desativar enviava `p.id` em vez de `p.user_id`
- ✅ TabsList mobile quebrado (`grid-cols-5` → `flex flex-wrap`)
- ✅ `useEffect` para forçar tab "Planos" quando `sidebarLocked` muda de false→true
- ✅ Verificação `change_password` adicionada server-side (faltava — qualquer admin podia)

---

*Para auditoria completa de ações de usuário, ver [`auditoria.md`](./auditoria.md).*
