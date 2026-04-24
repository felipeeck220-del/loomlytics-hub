 # 🪡 Sistema de Controle de Agulhas e Dados Técnicos
 
 Este documento detalha a implementação do sistema de gestão de estoque de agulhas e a expansão dos dados técnicos das máquinas no sistema MalhaGest.
 
 ## 1. Estrutura de Dados (Backend)
 
 ### 1.1 Tabelas Criadas
 - **`needle_inventory`**: Armazena o catálogo de agulhas da empresa.
   - `provider` (texto): Nome do fornecedor.
   - `brand` (texto): Marca da agulha.
   - `reference_code` (texto): Código de referência único.
   - `current_quantity` (inteiro): Saldo atual em estoque.
 - **`needle_transactions`**: Registro de toda movimentação (entrada/saída).
   - `type` (enum): 'entry' (entrada) ou 'exit' (saída).
   - `exit_mode` (enum): 'troca_agulheiro' (troca completa/parcial) ou 'reposicao' (quebra).
   - `machine_id` (FK): Vínculo com a máquina (obrigatório em saídas).
   - `quantity` (inteiro): Quantidade movimentada.
 - **`machines` (Expansão)**:
   - `model`, `diameter`, `fineness`, `needle_quantity`, `feeder_quantity`, `serial_number`.
   - `last_needle_change_at`: Data da última troca completa de agulheiro.
 
 ### 1.2 Automações (Triggers)
 - **`tr_handle_needle_transaction`**: Ao inserir uma transação:
   1. Atualiza o saldo em `needle_inventory`.
   2. Se for `exit` + `troca_agulheiro`, atualiza automaticamente `machines.last_needle_change_at`.
   3. Registra um log detalhado na tabela `audit_logs` para rastreabilidade total.
 
 ## 2. Interface do Usuário (Frontend)
 
 ### 2.1 Módulo Mecânica (Aba Agulhas)
 - **Visualização de Estoque**: Cards ou Tabela listando agulhas cadastradas com saldo crítico destacado.
 - **Pesquisa**: Campo de busca global que filtra por fornecedor, marca ou código.
 
 ### 2.2 Modais de Operação
 - **Modal: Cadastrar Nova Agulha**: Formulário simples para inserir novos tipos no catálogo.
  - **Modal: Entrada de Agulha**: 
    - Seleção da agulha com busca integrada dentro do componente.
    - Campo de quantidade e data.
  - **Modal: Baixa de Agulha**:
    - Seleção de Modo: Troca de Agulheiro (Geralmente 50% ou 100% da máquina) ou Reposição (Quebra).
    - Seleção da Máquina: Lista de máquinas cadastradas.
    - Seleção da Agulha com busca integrada dentro do componente.
 
 ### 2.3 Auditoria e Histórico
 - **Histórico Detalhado**: Lista cronológica de todas as ações.
 - **Auditoria por Máquina**: Dentro dos detalhes de cada máquina, será possível ver quantas agulhas de "reposição" ela consumiu desde a última "troca de agulheiro".
 
 ## 3. Regras de Negócio e Cálculos
 
 - **Cálculo de Eficiência pós-Troca**: No componente de Detalhes da Máquina, utilizaremos a data `last_needle_change_at` para calcular:
   - Dias desde a troca.
   - Produção total (kg) realizada desde essa data (cruzamento com a tabela `productions`).
 - **Formatação**: Toda comparação de strings (ex: busca por nome) será feita em `toLowerCase()` para evitar erros de case-sensitivity.
 
  ---
  *Última atualização: 2026-04-24 14:40 (Brasília)*