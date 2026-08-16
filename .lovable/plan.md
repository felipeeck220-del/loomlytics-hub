# Plano de Implementação: Estoque Malha (Manual) com Design Idêntico

Refatorar o módulo **Estoque Malha (Manual)** para que seu design seja 100% idêntico ao do **Estoque de Malha** principal (`src/pages/StockMalha.tsx`), mantendo a independência funcional (sem vínculo com faturamento ou produção).

## Alterações Propostas

### Backend (Banco de Dados)
- Criar ou atualizar a RPC `get_manual_stock_estoque_independent` para retornar campos adicionais esperados pelo design de `StockMalha.tsx`, como KPIs de entrada e saída.

### Frontend (UI/UX)
- **src/pages/StockMalhaManual.tsx**:
    - Substituir o código atual por uma versão baseada em `src/pages/StockMalha.tsx`.
    - Manter apenas as abas e colunas relevantes para o estoque manual.
    - Remover todas as referências a `reservedKg`, `OFs`, e faturamento.
    - Adaptar os filtros (Cliente, Artigo, Mês) para usarem os dados da tabela `manual_stock_movements`.
    - Garantir que os KPIs reflitam: Produzido (Entrada Manual), Saída (Saída Manual) e Disponível.
    - Implementar a listagem colapsável por Cliente > Artigo > Máquina com o mesmo estilo visual.
- **src/components/ManualStockEntryModal.tsx**:
    - Ajustar para suportar os campos necessários e garantir a limpeza correta do formulário.

## Detalhes Técnicos
- Utilizar `useQuery` para buscar dados através da RPC `get_manual_stock_estoque_independent`.
- Manter a unidade primária como Peças (pç) e Quilos (kg).
- Adicionar o banner informativo destacando a independência do estoque.

## Checklist de Validação
- [ ] O design é visualmente indistinguível de `StockMalha.tsx` (exceto pelas funcionalidades removidas).
- [ ] Entradas e saídas manuais atualizam os saldos corretamente.
- [ ] Não há interferência de Ordens de Faturamento (OF) nos saldos.
- [ ] O mobile segue o padrão de colunas/cards definido para o projeto.
