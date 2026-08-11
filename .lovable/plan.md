# Pente Fino e Estabilização - Fev 2026

## Objetivos
1.  **Integridade do Mestre**: Validar se todas as últimas atualizações de OF (Múltiplos, Atraso na Coleta, Auditoria) estão 100% funcionais e registradas.
2.  **Segurança e Performance**: Garantir que as RPCs operacionais utilizem `SECURITY DEFINER` e `FOR UPDATE` para evitar condições de corrida.
3.  **Correção de UI**: Ajustar o vazamento de layout mobile em `FreightsTab.tsx` e garantir skeletons em todos os carregamentos pesados de Mecânica.
4.  **Notificações**: Verificar a idempotência das notificações push para evitar duplicidade.

## Plano de Ações

### 1. Banco de Dados (RPCs e Triggers)
- Revisar a RPC `cancel_billing_order` para garantir que o estorno de estoque em 2ª qualidade (is_second_quality) está sendo aplicado corretamente em todos os cenários (com e sem paletes).
- Validar a RPC `collect_billing_order` para assegurar que a limpeza de reservas (`release`) não deixa saldos órfãos em `stock_movements`.
- Assegurar que `_of_audit` é chamada consistentemente com 6 argumentos em todas as mutações de OF.

### 2. Frontend (UI/UX)
- **Mecânica**: Adicionar skeletons de carregamento em todas as listagens paginadas (Agulhas, Platinas, Cilindros) para melhorar a percepção de velocidade.
- **Terceirizado**: Corrigir o vazamento lateral na aba de Fretes no mobile, aplicando `overflow-x-hidden` no container principal e ajustando o grid de cards.
- **OF**: Garantir que o destaque de "Múltiplos" seja visível no card de expedição.

### 3. Notificações e Auditoria
- Validar no `usePushNotifications.ts` se a trava de `lastNotificationId` está cobrindo todos os eventos disparados via Realtime.
- Confirmar se a auditoria de "Separação Iniciada/Finalizada" está sendo salva corretamente com o perfil do usuário (`v_pid`).

## Ordem de Implementação
1.  **Migration**: Ajustes finos de auditoria e segurança nas RPCs de OF.
2.  **Mecânica**: Otimização de UI com skeletons.
3.  **Outsource**: Ajuste de responsividade na `FreightsTab`.
4.  **Audit**: Registro no `docs/mestre.md`.
