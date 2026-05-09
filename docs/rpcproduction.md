 # 🏭 Documentação RPC: get_production_data
 
 Documentação detalhada da Função de Banco de Dados (RPC) para o módulo de Produção (/production).
 
 ---
 
 ## 📌 Objetivo
 Otimizar a listagem e o gerenciamento de registros na tela de Produção. Atualmente, a página carrega todos os registros históricos e processa filtros e agrupamentos no navegador, o que causa lentidão. A RPC centralizará a filtragem e a paginação no servidor.
 
 ---
 
 ## 🛠️ Definição da RPC (PostgreSQL/Supabase)
 
 ```sql
 CREATE OR REPLACE FUNCTION public.get_production_data(
   p_company_id UUID,
   p_date DATE DEFAULT NULL,
   p_machine_id UUID DEFAULT NULL,
   p_article_id UUID DEFAULT NULL,
   p_search TEXT DEFAULT NULL
 )
 RETURNS JSON
 LANGUAGE plpgsql
 SECURITY DEFINER
 AS $$
 DECLARE
   v_result JSON;
 BEGIN
   -- 1. Buscar registros com filtros aplicados
   SELECT json_agg(t) INTO v_result FROM (
     SELECT 
       p.*,
       m.name as machine_name,
       w.name as weaver_name,
       a.name as article_name,
       c.name as client_name
     FROM public.productions p
     LEFT JOIN public.machines m ON p.machine_id = m.id
     LEFT JOIN public.weavers w ON p.weaver_id = w.id
     LEFT JOIN public.articles a ON p.article_id = a.id
     LEFT JOIN public.clients c ON a.client_id = c.id
     WHERE p.company_id = p_company_id
       AND (p_date IS NULL OR p.date = p_date)
       AND (p_machine_id IS NULL OR p.machine_id = p_machine_id)
       AND (p_article_id IS NULL OR p.article_id = p_article_id)
       AND (p_search IS NULL OR 
            p.machine_name ILIKE '%' || p_search || '%' OR 
            p.article_name ILIKE '%' || p_search || '%' OR
            p.weaver_name ILIKE '%' || p_search || '%')
     ORDER BY p.date DESC, p.shift ASC, m.number ASC
   ) t;
 
   RETURN COALESCE(v_result, '[]'::JSON);
 END;
 $$;
 ```
 
 ---
 
 ## 🔍 Lógica de Negócio e Agrupamento
 
 ### 1. Agrupamento por Turno (Frontend)
 A RPC retornará os registros "flat" (planos). O frontend continuará agrupando por máquina/turno para exibição em cartões, mas apenas sobre o conjunto de dados já filtrado pelo banco.
 
 ### 2. Cálculo de Eficiência
 A RPC deve retornar o campo `efficiency` já gravado na tabela. 
 - **Importante:** A lógica de cálculo em tempo real (Preview) durante o cadastro continuará no Javascript para garantir interatividade imediata antes de salvar.
 
 ### 3. Filtros
 - **Data:** Filtro exato por dia (padrão da tela de produção).
 - **Máquina/Artigo:** Filtro por ID.
 - **Busca:** Pesquisa textual em nomes de máquina, artigo e tecelão.
 
 ---
 
 ## 🚀 Benefícios Esperados
 1. **Velocidade:** Carregamento instantâneo mesmo com anos de histórico.
 2. **Menos Memória:** O navegador não precisará manter milhares de objetos em memória.
 3. **Consistência:** Os nomes de máquinas e artigos serão resolvidos via JOIN no banco, evitando inconsistências de dados legados (cache).
 
 ---
 
 ## 📄 Fluxo de Migração
 1. Criar a RPC no banco de dados.
 2. Atualizar o `useSharedCompanyData` para expor uma função de fetch baseada em RPC.
 3. Refatorar `src/pages/Production.tsx` para usar o novo método de busca em vez de filtrar o array global `productions`.
 
 ---
 
 *Planejamento inicial: 09/05/2026 — Documentação de arquitetura para o módulo de Produção.*
