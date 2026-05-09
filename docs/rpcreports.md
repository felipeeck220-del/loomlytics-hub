# 📊 Documentação RPC: get_report_data (V2 - Eficiência Consolidada)

Esta documentação detalha a estratégia de migração do processamento de relatórios analíticos para o banco de dados (RPC), focando na consistência absoluta dos dados de eficiência.

---

## 📌 Premissa Fundamental
A inteligência do cálculo de eficiência reside no **momento do registro** da produção (seja via voltas ou rolos). Uma vez que esse dado é validado e salvo pelo tecelão/líder, ele se torna a "verdade" para o sistema.
Os relatórios não devem tentar reconstruir o cálculo (o que exigiria parâmetros complexos como RPM histórico e minutos de turno clipping), mas sim **consolidar as médias** dos registros já existentes.

---

## 🛠️ Especificação Técnica da RPC

### 1. Assinatura da Função
A função deve receber os filtros básicos de período e entidade:
- `p_company_id`: UUID
- `p_start_date`: DATE
- `p_end_date`: DATE
- `p_shift`: TEXT (default 'all')
- `p_client_id`: UUID (opcional)
- `p_article_id`: UUID (opcional)
- `p_machine_id`: UUID (opcional)

### 2. Lógica de Agregação de Eficiência
Em todos os agrupamentos (Máquina, Cliente, Artigo, Turno), o cálculo de eficiência seguirá esta regra SQL:
```sql
COALESCE(AVG(efficiency) FILTER (WHERE rolls_produced > 0), 0)
```
- **Por que filtrar `rolls_produced > 0`?** Para evitar que dias ou turnos sem produção (máquina parada sem registro de produção) puxem a média de eficiência para baixo indevidamente. A média deve refletir apenas o desempenho operacional real registrado.

### 3. Detalhamento dos Agrupamentos

#### A. Por Máquina
- **Foco:** Produtividade individual do tear.
- **Campos:** Nome da máquina, Total Rolos, Total Kg, Média de Eficiência, Total Faturamento (Admin), Percentual de Participação na Produção Total.
- **SQL Base:** `GROUP BY COALESCE(m.id, p.machine_id), p.machine_name`.

#### B. Por Cliente
- **Foco:** Rentabilidade e volume por parceiro.
- **Desafio:** A tabela `productions` não tem `client_id`.
- **Solução:** Join com a tabela `articles`.
- **SQL Base:** 
  ```sql
  FROM productions p
  JOIN articles a ON p.article_id = a.id
  LEFT JOIN clients c ON a.client_id = c.id
  GROUP BY COALESCE(c.id, a.client_id), COALESCE(c.name, a.client_name)
  ```
- **Métrica:** Média de eficiência dos artigos produzidos para aquele cliente no período.

#### C. Por Artigo
- **Foco:** Performance técnica de cada malha.
- **Campos:** Nome do artigo, Cliente, Total Kg, Total Rolos, Média de Eficiência.
- **SQL Base:** `GROUP BY p.article_id, p.article_name`.

#### D. Evolução (Tendência)
- **Foco:** Visão temporal (Gráficos).
- **Campos:** Data, Total Kg, Total Rolos, Média de Eficiência do dia.
- **Ordenação:** `ORDER BY p.date ASC`.

---

## 📄 Exportação para PDF e CSV

A RPC retornará um objeto JSON único contendo os arrays de cada aba (`by_shift`, `by_machine`, `by_client`, `by_article`, `evolution`).

### Impacto no PDF:
1. **Consistência:** O PDF usará exatamente os mesmos valores exibidos nos cards e tabelas da tela.
2. **Performance:** O frontend apenas "desenha" o PDF. Todo o `reduce` e `map` para chegar aos totais e médias já vem pronto do banco de dados.
3. **Totais de Rodapé:** Os totais de rodapé das tabelas no PDF (Soma de Kg, Média Geral de Eficiência) serão extraídos do nó `kpis` retornado pela RPC.

---

## 🚀 Benefícios da Abordagem
1. **Velocidade:** Processamento de milhares de linhas em milissegundos.
2. **Confiabilidade:** Elimina divergências entre o Dashboard e o módulo de Relatórios.
3. **Escalabilidade:** Suporta anos de histórico sem degradar a experiência do usuário.

---

*Documentação criada em: 09/05/2026 — Estratégia de Eficiência Consolidada.*
