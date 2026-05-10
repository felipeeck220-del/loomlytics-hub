 # 🚀 Diretrizes de RPC em Produção
 
 ## 📌 Uso de RPC para Filtros
 O uso de RPC (Remote Procedure Call) no banco de dados para o módulo de produção e relatórios deve ser restrito **APENAS ao carregamento de filtros**.
 
 - **Objetivo:** Evitar o carregamento de todos os registros de uma vez no navegador, melhorando a performance ao lidar com grandes volumes de dados.
 - **Implementação:** Use RPC para buscar listas de valores únicos (máquinas, artigos, clientes, meses) para alimentar os componentes de `Select` e `Filter`.
 
 ## ⚠️ REGRAS CRÍTICAS (NÃO VIOLAR)
 
 1. **CÁLCULOS NO FRONTEND:** Os cálculos de eficiência, produtividade e faturamento devem ser mantidos no **frontend (Javascript/Typescript)** para garantir a reatividade e consistência com a lógica de negócio já validada.
 2. **MODAL DE REGISTRO DE PRODUÇÃO:**
    - **EM HIPÓTESE ALGUMA** altere ou mexa no código de cálculo de eficiência localizado no modal de registro de produção (atualmente em `src/pages/Production.tsx`).
    - Este código é o "core" da precisão do sistema e qualquer mudança pode impactar o fechamento de produção da empresa.
 3. **ESTABILIDADE:** Se houver necessidade de otimização via banco de dados, ela deve ser feita em paralelo, sem substituir a lógica atual até que seja exaustivamente testada em ambiente de homologação.
 
 ## 🔄 Ponto de Reversão
 Consulte o arquivo `reversion_point_production_logic.md` para recuperar os códigos de cálculo originais caso ocorra algum erro em futuras implementações.