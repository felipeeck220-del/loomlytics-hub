# Plano de Recriação do Estoque Malha (Manual) Independente

Recriar o módulo de Estoque Malha (Manual) como uma ferramenta de controle logístico 100% independente, sem qualquer gatilho, reserva ou vínculo automático com o módulo de Ordem de Faturamento (OF) ou Produção.

## Ações Realizadas
- [x] Leitura do `mestre.md` e verificação do histórico.
- [x] Análise da estrutura atual de navegação e permissões.
- [x] Identificação de componentes remanescentes (`ManualStockEntryModal`, `OwnStockManualModal`).

## Próximas Etapas

### 1. Banco de Dados (Backend)
- Criar a tabela `manual_stock_movements` (se não existir após a limpeza anterior) focada apenas em lançamentos manuais.
- Implementar RPCs `get_manual_stock_estoque`, `get_manual_stock_movements` e `save_manual_stock_movement` sem referências a `billing_orders`.
- **Importante**: Não adicionar triggers que espelhem dados de OF ou Produção. Todo o saldo será derivado apenas de `manual_stock_movements`.

### 2. Interface (Frontend)
- Recriar a página `src/pages/StockMalhaManual.tsx` (ou similar) com o design espelhado em "Estoque Clientes".
- Adicionar o item "Estoque Malha (Manual)" no `AppSidebar.tsx` logo abaixo de "Vendas de Resíduos".
- Atualizar `usePermissions.ts` para incluir a nova chave de navegação `estoque-malha-manual`.
- Ajustar os modais `ManualStockEntryModal` e `OwnStockManualModal` para operarem de forma simplificada.

### 3. Ajustes de Usabilidade Mobile
- Garantir que a listagem de estoque e movimentações use cards no mobile (seguindo o padrão de padronização recente).
- Modais em tela cheia no mobile (100vw/vh) e inputs numéricos apropriados para iOS.

## Detalhes Técnicos
- Tabela: `public.manual_stock_movements`
- Colunas: `id`, `company_id`, `article_id`, `client_id`, `type` (in/out/adjust), `pieces`, `weight_kg`, `reason`, `created_by`, `created_at`.
- A lógica de "Disponível" será simplesmente: `SUM(in) - SUM(out)`.
- Sem FKs ou lógica de `billing_order_id` para evitar acoplamento.

---
*Nota: Como o usuário solicitou expressamente que seja "independente", qualquer código anterior que tentava automatizar saídas via OF será ignorado.*