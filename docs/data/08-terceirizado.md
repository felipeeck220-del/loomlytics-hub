# Terceirizado

**Rota:** `/:slug/outsource`

Produção terceirizada (malharia externa) com cálculo de lucro (receita - custo do fio - frete). Controle de estoque de fio terceirizado.

---

## 🗄️ Tabelas do banco


### `outsource_companies`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `contact` | text | NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own outsource_companies` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own outsource_companies` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own outsource_companies` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own outsource_companies` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


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


### `outsource_freights`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `outsource_company_id` | uuid | NULL | — |
| `date` | date | NOT NULL | `CURRENT_DATE` |
| `nf_rom` | text | NULL | — |
| `weight_kg` | numeric | NOT NULL | `0` |
| `freight_per_kg` | numeric | NOT NULL | `0` |
| `total_freight` | numeric | NOT NULL | `0` |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NULL | `now()` |
| `created_by_name` | text | NULL | — |
| `created_by_code` | text | NULL | — |
| `freteiro` | text | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `outsource_company_id` | `outsource_companies.id` | SET NULL |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete freights from their company` | DELETE | {public} | `(company_id = get_user_company_id())` | — |
| `Users can insert freights to their company` | INSERT | {public} | — | `(company_id = get_user_company_id())` |
| `Users can update freights from their company` | UPDATE | {public} | `(company_id = get_user_company_id())` | — |
| `Users can view freights from their company` | SELECT | {public} | `(company_id = get_user_company_id())` | — |


### `outsource_yarn_stock`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `outsource_company_id` | uuid | NOT NULL | — |
| `yarn_type_id` | uuid | NOT NULL | — |
| `quantity_kg` | numeric | NOT NULL | `0` |
| `reference_month` | text | NOT NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `outsource_company_id` | `outsource_companies.id` | CASCADE |
| `yarn_type_id` | `yarn_types.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own outsource_yarn_stock` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own outsource_yarn_stock` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own outsource_yarn_stock` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own outsource_yarn_stock` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
