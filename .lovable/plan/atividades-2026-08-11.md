---
title: Pente Fino e Estabilização das Ordens de Faturamento (OF)
description: Verificação de segurança, auditoria e bugs no módulo de OF segundo o mestre.md.
type: feature
---

## Atividades

- **Auditoria de 6 Argumentos:** Sincronizar todas as chamadas da função `public._of_audit` para garantir consistência com a assinatura atualizada (6 argumentos).
- **Consistência de Tipos:** Verificar se as RPCs de criação e edição de OF estão lidando corretamente com o enum `billing_order_type` e o status da ordem.
- **RLS e Grants:** Validar se todas as novas funções RPC possuem `SECURITY DEFINER` e `search_path = public` para evitar falhas de permissão no Lovable Cloud.
- **Cache de Frontend:** Reforçar a invalidação de cache no React Query após operações críticas (coleta, cancelamento) para evitar que a UI fique desatualizada.
- **Histórico mestre.md:** Registrar as correções realizadas no histórico do projeto.
