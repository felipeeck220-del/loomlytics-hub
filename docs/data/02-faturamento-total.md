# Faturamento Total

**Rota:** `/:slug/faturamento-total (somente admin)`

Consolida 3 fontes de receita (Malhas, Terceirizado, Resíduos) em KPIs com comparativo temporal e gráfico empilhado.

---

## 🗄️ Tabelas do banco


### `productions`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `date` | text | NOT NULL | — |
| `shift` | text | NOT NULL | — |
| `machine_id` | uuid | NULL | — |
| `machine_name` | text | NULL | — |
| `weaver_id` | uuid | NULL | — |
| `weaver_name` | text | NULL | — |
| `article_id` | uuid | NULL | — |
| `article_name` | text | NULL | — |
| `rpm` | integer | NOT NULL | `0` |
| `rolls_produced` | numeric | NOT NULL | `0` |
| `weight_kg` | numeric | NOT NULL | `0` |
| `revenue` | numeric | NOT NULL | `0` |
| `efficiency` | numeric | NOT NULL | `0` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `created_by_name` | text | NULL | — |
| `created_by_code` | text | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | SET NULL |
| `company_id` | `companies.id` | CASCADE |
| `machine_id` | `machines.id` | SET NULL |
| `weaver_id` | `weavers.id` | SET NULL |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own productions` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own productions` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own productions` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own productions` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `outsource_productions`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `outsource_company_id` | uuid | NOT NULL | — |
| `article_id` | uuid | NOT NULL | — |
| `article_name` | text | NULL | — |
| `outsource_company_name` | text | NULL | — |
| `client_name` | text | NULL | — |
| `date` | text | NOT NULL | — |
| `weight_kg` | numeric | NOT NULL | `0` |
| `rolls` | integer | NOT NULL | `0` |
| `client_value_per_kg` | numeric | NOT NULL | `0` |
| `outsource_value_per_kg` | numeric | NOT NULL | `0` |
| `profit_per_kg` | numeric | NOT NULL | `0` |
| `total_revenue` | numeric | NOT NULL | `0` |
| `total_cost` | numeric | NOT NULL | `0` |
| `total_profit` | numeric | NOT NULL | `0` |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `nf_rom` | text | NULL | — |
| `created_by_name` | text | NULL | — |
| `created_by_code` | text | NULL | — |
| `freight_per_kg` | numeric | NOT NULL | `0` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | CASCADE |
| `company_id` | `companies.id` | CASCADE |
| `outsource_company_id` | `outsource_companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own outsource_productions` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own outsource_productions` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own outsource_productions` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own outsource_productions` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `residue_sales`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `material_id` | uuid | NOT NULL | — |
| `material_name` | text | NULL | — |
| `client_name` | text | NOT NULL | — |
| `date` | text | NOT NULL | — |
| `quantity` | numeric | NOT NULL | `0` |
| `unit` | text | NOT NULL | `'kg'::text` |
| `unit_price` | numeric | NOT NULL | `0` |
| `total` | numeric | NOT NULL | `0` |
| `romaneio` | text | NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `created_by_name` | text | NULL | — |
| `created_by_code` | text | NULL | — |
| `client_id` | uuid | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `client_id` | `residue_clients.id` | SET NULL |
| `company_id` | `companies.id` | CASCADE |
| `material_id` | `residue_materials.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own residue_sales` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own residue_sales` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own residue_sales` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own residue_sales` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


#### `public.get_faturamento_total_metrics(p_company_id uuid, p_start_date date, p_end_date date, p_prev_start_date date, p_prev_end_date date)`

Retorna: `json`
