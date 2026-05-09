 ## 7. Ponto de Reversão: Funcionamento Atual (Maio/2026)
 
 Caso a implementação via RPC apresente erros ou discrepâncias de valores, este é o guia para restaurar o comportamento original.
 
 ### Mecanismo de Dados Atual:
 1. **Carregamento:** O `useCompanyData.ts` utiliza uma função `fetchAll` que busca **todos** os registros da tabela `productions` em lotes de 1.000 (sem limite total) e os armazena em um array `productions` no Contexto Global.
 2. **Filtros (Client-Side):** No `Dashboard.tsx`, o `useMemo` chamado `filtered` percorre todo o array de produções e aplica os filtros de Data, Turno, Cliente e Artigo usando JavaScript puro (`.filter()`).
 3. **Comparativos:** Um segundo `useMemo` chamado `prevFiltered` faz exatamente a mesma coisa para o intervalo de tempo anterior, gerando dois arrays distintos em memória.
 
 ### Lógica de Cálculos (Frontend):
 - **KPIs Principais:** São calculados via `reduce` ou `forEach` somando `weight_kg`, `revenue` e `rolls_produced` dos arrays filtrados.
 - **Eficiência Média:** Calculada somando a coluna `efficiency` e dividindo pelo número de registros que possuem produção (`rolls_produced > 0`).
 - **Gráfico de Tendência:** Utiliza um objeto `byDate` (Record<string, {...}>) para agrupar e somar os valores dia a dia antes de converter para o formato do Recharts.
 
 ### Como Reverter:
 1. No `Dashboard.tsx`, restaure a dependência do `useSharedCompanyData().getProductions()`.
 2. Remova a chamada ao `supabase.rpc('get_dashboard_metrics')`.
 3. Reative os `useMemo` de filtragem local (`filtered` e `prevFiltered`).
 
 ---
 *Última atualização: 09/05/2026 14:45 (Brasília)*
 # Estratégia de Otimização: Dashboard via RPC (Agregação Server-Side)
 
 **Objetivo:** Migrar o processamento de indicadores e comparativos do Dashboard do navegador (Client-Side) para o Banco de Dados (Server-Side), garantindo performance instantânea mesmo com milhões de registros.
 
 ---
 
 ## 1. O Problema Atual
 Atualmente, o Dashboard baixa todos os registros de produção do período selecionado (e do período anterior para comparação). Se um usuário filtra 30 dias e a empresa tem 200 registros/dia, o sistema baixa e processa ~12.000 objetos em memória, o que causa lentidão e consumo excessivo de dados.
 
 ## 2. A Solução: RPC (Remote Procedure Call)
 Criar uma função no PostgreSQL que recebe os filtros e devolve apenas os números finais necessários para os cards e gráficos.
 
 ### Parâmetros da Função:
 - `p_company_id`: ID da empresa.
 - `p_start_date`: Data inicial do período.
 - `p_end_date`: Data final do período.
 - `p_machine_id`: Filtro opcional de máquina.
 - `p_shift`: Filtro opcional de turno.
 
 ## 3. Estrutura de Retorno (JSON)
 A função deve retornar um único objeto estruturado:
 
 ```json
 {
   "current_period": {
     "total_weight": 5420.5,
     "total_revenue": 125000.0,
     "total_rolls": 450,
     "avg_efficiency": 88.5,
     "kg_per_hour": 12.4,
     "revenue_per_hour": 285.0
   },
   "previous_period": {
     "total_weight": 5100.0,
     "total_revenue": 118000.0,
     "total_rolls": 420,
     "avg_efficiency": 85.0
   },
   "charts": {
     "production_by_shift": [ {"shift": "day", "weight": 2000}, ... ],
     "top_machines": [ {"name": "M01", "weight": 1500}, ... ]
   }
 }
 ```
 
 ## 4. Vantagens Técnicas
 1. **Economia de Banda:** Tráfego de dados reduzido em 99%.
 2. **Velocidade:** Cálculos matemáticos em SQL são ordens de grandeza mais rápidos que em JavaScript.
 3. **Consistência:** A lógica de cálculo (Kg/Hr, etc) fica centralizada no banco, facilitando manutenções futuras em múltiplos dispositivos (Web/Mobile).
 4. **Comparativos Automáticos:** A própria função calcula o "período anterior" com base no intervalo de dias passado, eliminando a necessidade de duas buscas separadas no frontend.
 
 ## 5. Passo a Passo para Implementação Futura
 
 ### Passo A: Banco de Dados
 Criar a função `get_dashboard_metrics` via SQL no Supabase. Esta função deve usar `JOINs` entre as tabelas `productions` e `machines` para calcular as horas trabalhadas e converter pesos.
 
 ### Passo B: Hook de Dados
 Atualizar o `useCompanyData` ou criar um novo `useDashboardMetrics` que chama:
 ```ts
 const { data } = await supabase.rpc('get_dashboard_metrics', { ...filtros });
 ```
 
 ### Passo C: Refatoração do Frontend
 No arquivo `Dashboard.tsx`, remover os `useEffect` que filtram e somam arrays. Substituir os estados locais (`totalWeight`, `revenue`, etc.) diretamente pelos valores retornados pela RPC.
 
 ## 6. Quando implementar?
 Assim que o tempo de carregamento do Dashboard (o "loading" inicial) passar de 3 segundos para usuários com volume real de dados.
 
 ---
 *Documento criado em: 09/05/2026*