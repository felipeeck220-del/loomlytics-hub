# Plano de Correção: Início de Separação (OF)

O problema identificado é que o botão "Iniciar Separação" estava restrito a ordens com status `open` e enviava um `expectedStatus` fixo como `open`. Isso impedia que ordens com status `priority` fossem iniciadas, pois a RPC de banco de dados validava o status atual contra o esperado.

## Ações realizadas

1.  **Movimentação Manual**: A OF #624 foi movida manualmente para o status `separating` via comando SQL, garantindo a continuidade do trabalho imediato.
2.  **Ajuste de Fluxo no Frontend**: O componente `BillingOrders.tsx` foi atualizado para:
    *   Exibir o botão "Iniciar Separação" tanto para ordens `open` quanto para `priority`.
    *   Enviar dinamicamente o `expectedStatus` correto (`open` ou `priority`) para a RPC `start_billing_order_separation`, garantindo que a validação de concorrência funcione para ambos os casos.

## Detalhes técnicos

*   Arquivo alterado: `src/pages/BillingOrders.tsx`
*   Status afetados: `open`, `priority` -> `separating`
*   OF Manual: #624 (ID: `31c655b4-910c-490d-bfbb-5999ff85649e`)
