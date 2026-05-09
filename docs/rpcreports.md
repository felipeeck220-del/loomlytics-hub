 ## 📥 Configurações de Exportação
 
 ### Modos de Visualização
 - **Admin:** Visão completa, incluindo valores financeiros (R$), faturamento e lucro.
 - **Equipe:** Visão operacional, ocultando valores monetários, focando em Kg, Rolos e Eficiência.
 
 ### Formatos Suportados
 - **PDF:** Documento estilizado com cabeçalho da empresa, tabelas zebradas e gráficos (opcional).
 - **CSV:** Planilha bruta formatada com separador `;` para Excel (pt-BR).
 
 ### Opções de Exportação
 - **Exportação Geral (Relatório Completo):** Consolida todas as abas (Turno, Máquina, Cliente, Artigo, Tendência) em um único documento PDF ou CSV.
 - **Exportações Específicas:**
   - **Por Artigo:** Foco em Rolos, Kg e Valor produzido por tipo de malha.
   - **Por Máquina:** Performance individual detalhada e ranking de produtividade.
   - **Por Turno:** Análise comparativa de produtividade entre os períodos de trabalho.
   - **Por Cliente:** Detalhamento da produção (Rolos/Kg) destinada a cada cliente parceiro.
 
 ## 🔍 Detalhamento dos Filtros (100% Funcional)
 
 Para garantir que a implementação da RPC respeite a lógica de negócio atual, os filtros devem seguir rigorosamente estas regras:
 
 ### 1. Filtro de Período (Data)
 A prioridade de aplicação das datas na consulta SQL deve ser:
 1.  **De / Até (Custom Range):** Se `p_start_date` e `p_end_date` forem fornecidos, ignora qualquer outra seleção.
 2.  **Mês Específico:** Filtra registros onde `date` inicia com `YYYY-MM`.
 3.  **Dia Específico:** Filtra registros onde `date` é exatamente `YYYY-MM-DD`.
 4.  **Intervalo Rápido (7, 15, 30 dias):** Calcula retroativamente a partir de hoje.
 5.  **Todo Período:** Busca o `MIN(date)` e `MAX(date)` da empresa para definir o intervalo.
 
 ### 2. Filtro de Turno (`p_shift`)
 - **Valores:** `manha`, `tarde`, `noite` ou `all`.
 - **Comportamento:** Quando `all`, a query não deve aplicar o filtro `WHERE shift = ...`.
 - **Impacto:** Afeta o cálculo de `v_calendar_hours` (8h se turno único, 24h se `all`).
 
 ### 3. Filtro de Cliente (`p_client_id`)
 - **Desafio:** A tabela `productions` não possui `client_id` direto, apenas `article_id`.
 - **Lógica:** Deve buscar todas as produções cujo `article_id` pertença ao cliente selecionado.
 - **SQL:** `AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))`.
 
 ### 4. Filtro de Artigo (`p_article_id`)
 - **Comportamento:** Filtro direto na coluna `article_id` da tabela `productions`.
 - **Fallback:** Deve suportar dados legados onde o vínculo era apenas pelo nome, se necessário (porém a RPC foca no ID para precisão).
 
 ### 5. Filtro de Máquina (`p_machine_id`)
 - **Comportamento:** Filtro direto na coluna `machine_id`.
 - **Fallback:** Em registros antigos onde `machine_id` é nulo, a busca deve considerar o `machine_name`.
 
 ### 6. Busca Textual (Client-side)
 - A RPC retorna o dataset completo filtrado pelos IDs acima. A barra de busca na interface (ex: buscar nome de máquina ou cliente) filtrará os resultados já agregados retornados pela RPC para garantir interatividade instantânea.
 
 ---
 
 # 📊 Documentação RPC: get_report_data
 
 Documentação detalhada da Função de Banco de Dados (RPC) para o módulo de Relatórios Analíticos.
 
 ---
 
 ## 📌 Objetivo
 Centralizar todos os cálculos pesados de agregação e métricas (eficiência, percentuais de participação, evolução) no banco de dados para melhorar a performance e consistência dos relatórios, especialmente para grandes volumes de dados.
 
 ---
 
 ## 🛠️ Definição da RPC (PostgreSQL/Supabase)
 
 ```sql
 CREATE OR REPLACE FUNCTION public.get_report_data(
   p_company_id UUID,
   p_start_date DATE,
   p_end_date DATE,
   p_shift TEXT DEFAULT 'all',
   p_client_id UUID DEFAULT NULL,
   p_article_id UUID DEFAULT NULL,
   p_machine_id UUID DEFAULT NULL
 )
 RETURNS JSON
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
 DECLARE
   v_total_rolls NUMERIC := 0;
   v_total_kg NUMERIC := 0;
   v_total_revenue NUMERIC := 0;
   v_result JSON;
 BEGIN
   -- 1. Calcular Totais Gerais para o período e filtros (para cálculo de %)
   SELECT 
     COALESCE(SUM(rolls_produced), 0),
     COALESCE(SUM(weight_kg), 0),
     COALESCE(SUM(revenue), 0)
   INTO v_total_rolls, v_total_kg, v_total_revenue
   FROM public.productions p
   WHERE p.company_id = p_company_id
     AND p.date >= p_start_date
     AND p.date <= p_end_date
     AND (p_shift = 'all' OR p.shift = p_shift)
     AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
     AND (p_article_id IS NULL OR p.article_id = p_article_id)
     AND (p_client_id IS NULL OR EXISTS (
         SELECT 1 FROM public.articles a 
         WHERE a.id = p.article_id AND a.client_id = p_client_id
     ));
 
   -- 2. Montar o JSON de resposta com todas as agregações
   SELECT json_build_object(
     'kpis', (
       SELECT json_build_object(
         'total_rolls', v_total_rolls,
         'total_kg', v_total_kg,
         'total_revenue', v_total_revenue,
         'avg_efficiency', COALESCE(AVG(efficiency), 0)
       )
       FROM public.productions p
       WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
         AND (p_shift = 'all' OR p.shift = p_shift)
         AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
         AND (p_article_id IS NULL OR p.article_id = p_article_id)
         AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
         AND rolls_produced > 0
     ),
     
     -- Agregação POR TURNO
     'by_shift', (
       SELECT json_agg(t) FROM (
         SELECT 
           shift as name,
           SUM(rolls_produced) as rolls,
           SUM(weight_kg) as kg,
           SUM(revenue) as revenue,
           AVG(efficiency) FILTER (WHERE rolls_produced > 0) as efficiency,
           CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
           CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
           CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
         FROM public.productions p
         WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
         AND (p_shift = 'all' OR p.shift = p_shift)
         AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
         AND (p_article_id IS NULL OR p.article_id = p_article_id)
         AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
         GROUP BY shift
       ) t
     ),
 
     -- Agregação POR MÁQUINA
     'by_machine', (
       SELECT json_agg(t) FROM (
         SELECT 
           COALESCE(m.name, p.machine_name) as name,
           SUM(rolls_produced) as rolls,
           SUM(weight_kg) as kg,
           SUM(revenue) as revenue,
           AVG(efficiency) FILTER (WHERE rolls_produced > 0) as efficiency,
           COUNT(*) as records,
           CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
           CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
           CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
         FROM public.productions p
         LEFT JOIN public.machines m ON p.machine_id = m.id
         WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
         AND (p_shift = 'all' OR p.shift = p_shift)
         AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
         AND (p_article_id IS NULL OR p.article_id = p_article_id)
         AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
         GROUP BY COALESCE(m.name, p.machine_name)
         ORDER BY rolls DESC
       ) t
     ),
 
     -- Agregação POR CLIENTE
     'by_client', (
       SELECT json_agg(t) FROM (
         SELECT 
           COALESCE(c.name, a.client_name, 'Sem Cliente') as name,
           SUM(rolls_produced) as rolls,
           SUM(weight_kg) as kg,
           SUM(revenue) as revenue,
           CASE WHEN v_total_rolls > 0 THEN (SUM(rolls_produced) / v_total_rolls) * 100 ELSE 0 END as pct_rolls,
           CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
           CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
         FROM public.productions p
         JOIN public.articles a ON p.article_id = a.id
         LEFT JOIN public.clients c ON a.client_id = c.id
         WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
         AND (p_shift = 'all' OR p.shift = p_shift)
         AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
         AND (p_article_id IS NULL OR p.article_id = p_article_id)
         AND (p_client_id IS NULL OR c.id = p_client_id)
         GROUP BY COALESCE(c.name, a.client_name, 'Sem Cliente')
         ORDER BY revenue DESC
       ) t
     ),
 
     -- Agregação POR ARTIGO
     'by_article', (
       SELECT json_agg(t) FROM (
         SELECT 
           COALESCE(a.name, p.article_name) as name,
           COALESCE(c.name, a.client_name, '—') as client_name,
           SUM(rolls_produced) as rolls,
           SUM(weight_kg) as kg,
           SUM(revenue) as revenue,
           AVG(efficiency) FILTER (WHERE rolls_produced > 0) as efficiency,
           CASE WHEN v_total_kg > 0 THEN (SUM(weight_kg) / v_total_kg) * 100 ELSE 0 END as pct_kg,
           CASE WHEN v_total_revenue > 0 THEN (SUM(revenue) / v_total_revenue) * 100 ELSE 0 END as pct_revenue
         FROM public.productions p
         LEFT JOIN public.articles a ON p.article_id = a.id
         LEFT JOIN public.clients c ON a.client_id = c.id
         WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
         AND (p_shift = 'all' OR p.shift = p_shift)
         AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
         AND (p_article_id IS NULL OR p.article_id = p_article_id)
         AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a2 WHERE a2.id = p.article_id AND a2.client_id = p_client_id))
         GROUP BY COALESCE(a.name, p.article_name), COALESCE(c.name, a.client_name, '—')
         ORDER BY kg DESC
       ) t
     ),
 
     -- EVOLUÇÃO (TENDÊNCIA)
     'evolution', (
       SELECT json_agg(t) FROM (
         SELECT 
           date,
           SUM(rolls_produced) as rolls,
           SUM(weight_kg) as kg,
           SUM(revenue) as revenue,
           AVG(efficiency) FILTER (WHERE rolls_produced > 0) as efficiency
         FROM public.productions p
         WHERE p.company_id = p_company_id AND p.date BETWEEN p_start_date AND p_end_date
         AND (p_shift = 'all' OR p.shift = p_shift)
         AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
         AND (p_article_id IS NULL OR p.article_id = p_article_id)
         AND (p_client_id IS NULL OR EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.client_id = p_client_id))
         GROUP BY date
         ORDER BY date ASC
       ) t
     )
   ) INTO v_result;
 
   RETURN v_result;
 END;
 $$;
 ```
 
 ---
 
 ## 📐 Fórmulas e Cálculos Detalhados
 
 ### 1. Eficiência (% de Produção)
 **Fórmula:** `(SUM(efficiency) FILTER (rolls > 0)) / COUNT(records with rolls > 0)`
 - Ignora registros onde a máquina estava parada ou não produziu nada.
 
 ### 2. Participação (%)
 Os percentuais solicitados são calculados dividindo a métrica do grupo pelo total geral do período filtrado:
 - **% da Produção (Peso):** `(kg_do_grupo / total_kg_geral) * 100`
 - **% do Faturamento:** `(faturamento_do_grupo / total_faturamento_geral) * 100`
 - **% das Peças (Rolos):** `(rolos_do_grupo / total_rolos_geral) * 100`
 
 ### 3. Evolução
 - Agrupamento diário garantindo ordenação cronológica para o gráfico de linha/área.
 
 ---
 
 ## 📄 Exportação (CSV e PDF)
 
 A RPC fornece os dados estruturados. A lógica de exportação no frontend (`Reports.tsx`) deve:
 1. **CSV:** Mapear os arrays `by_shift`, `by_machine`, etc., para linhas formatadas com separador `;`.
 2. **PDF:** Utilizar os dados da RPC para preencher as tabelas do relatório, removendo a necessidade de processamento pesado no navegador.
 
 ---
 
 ## ⏪ Ponto de Reversão
 
 **Estado Anterior:**
 - Relatórios processados 100% no client-side em `src/pages/Reports.tsx`.
 - Filtragem usando `.filter()` e `.reduce()` em arrays Javascript de até milhares de registros.
 - Lentidão perceptível ao trocar filtros ou carregar grandes períodos (ex: "Todo período").
 - Risco de inconsistência se a lógica de cálculo no Dashboard divergir do Reports.
 
 **Como Reverter:**
 1. Apagar a função RPC `get_report_data` via SQL.
 2. Restaurar a version anterior de `src/pages/Reports.tsx` que utilizava o hook `useSharedCompanyData()` e fazia os cálculos localmente (useMemo).
 
 ---
 
 *Última atualização: 09/05/2026 — Criado planejamento para RPC Reports.*
