# Plano de Alteração em Terceirizado (/outsource)

Vou reorganizar a funcionalidade de frete na página de Terceirizados para melhorar a gestão, conforme solicitado.

## Alterações Propostas

### 1. Banco de Dados (Concluído)
- Criação da tabela `outsource_freights` para armazenar registros de frete de forma independente.
- Migração automática dos dados de frete existentes em `outsource_productions` para a nova tabela.
- Manutenção da coluna `freight_per_kg` em `outsource_productions` para garantir que os cálculos de lucro histórico permaneçam corretos.

### 2. Interface (src/pages/Outsource.tsx)
- **Aba de Produções**:
    - Remoção do campo "Frete" no modal de cadastro/edição de produções.
    - Remoção da coluna "Frete/kg" na tabela de produções para simplificar a visualização.
- **Nova Aba "Frete"**:
    - Criação de uma nova aba após "Produções".
    - Tabela listando todos os fretes com: Data, Malharia, Romaneio, Peso (kg), Frete/kg e Frete Total.
    - Modal de "Registrar Frete" solicitando: Data, Malharia, Romaneio, Peso (kg) e Frete/kg.
- **Cards de Resumo (KPIs)**:
    - O card "Frete Total" continuará exibindo a soma de todos os fretes registrados (agora vindo da nova tabela).
    - O card "Lucro" continuará descontando o valor total de frete da receita bruta para refletir o lucro real.

## Detalhes Técnicos
- Utilização de `useQuery` para carregar os fretes da nova tabela.
- Implementação de `useMutation` para criação, edição e exclusão de fretes.
- Ajuste nos cálculos de `totals` no componente principal para somar fretes de `outsource_freights` em vez de extraí-los de `productions`.
- Garantia de que as produções terceirizadas existentes continuem contribuindo para o lucro, mas o frete passará a ser gerido centralizadamente na nova aba.

Vou prosseguir com a atualização do código.
