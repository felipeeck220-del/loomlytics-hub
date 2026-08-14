# Plano de Estabilização do Módulo de Faturamento (OF)

O objetivo desta refatoração foi eliminar definitivamente os erros de transição de status (como falha ao iniciar separação ou persistência visual de OFs coletadas) através do reforço das RPCs no banco de dados e sincronização no frontend.

## Ações Técnicas Realizadas

### 1. Refatoração de Banco de Dados (RPCs)
Refatoramos as funções críticas para serem mais resilientes e autossuficientes:
*   **`_of_audit`**: Agora busca automaticamente os dados do autor (nome/código) no perfil do usuário se não forem fornecidos pelo frontend, garantindo que o log de auditoria nunca falhe.
*   **`start_billing_order_separation`**: Implementada trava pessimista (`FOR UPDATE`) e fallback de identificação de tenant, garantindo que a transição de status ocorra sem conflitos mesmo em conexões instáveis.
*   **`collect_billing_order`**: Reforçada a validação de status. Agora a OF só pode ser coletada se estiver em "Pronto para Coleta", e o timestamp de coleta é garantido de forma atômica.
*   **`launch_billing_order_ready`**: Estabilizada a consolidação de pesos e peças dos paletes, garantindo que o cabeçalho da OF esteja sempre sincronizado.

### 2. Ajustes de Fluxo no Frontend
*   **`BillingOrders.tsx`**: Ajustada a visibilidade do botão "Iniciar Separação" para cobrir todos os casos de prioridade e estados iniciais.
*   **`useBillingOrders.ts`**: Mantida a estratégia de remoção otimista para que a OF desapareça instantaneamente da aba ao ser coletada, eliminando o "efeito fantasma".

## Verificação Sugerida
*   **Aberto/Prioritário**: Tente iniciar a separação; o botão deve responder instantaneamente e mover a OF para "Separando".
*   **Pronto para Coleta**: Ao marcar a coleta, a OF deve sumir imediatamente da lista e aparecer em "Coletadas".
