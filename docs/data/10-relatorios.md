# Relatórios

**Rota:** `/:slug/reports`

Relatórios consolidados de produção com agrupamento por turno, máquina, cliente, artigo e evolução temporal. Exporta PDF.

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


### `machines`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `number` | integer | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `rpm` | integer | NOT NULL | `0` |
| `status` | USER-DEFINED | NOT NULL | `'ativa'::machine_status` |
| `article_id` | uuid | NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `production_mode` | text | NOT NULL | `'rolos'::text` |
| `model` | text | NULL | — |
| `diameter` | text | NULL | — |
| `fineness` | text | NULL | — |
| `needle_quantity` | integer | NULL | — |
| `feeder_quantity` | integer | NULL | — |
| `serial_number` | text | NULL | — |
| `last_needle_change_at` | timestamp with time zone | NULL | — |
| `last_sinker_change_at` | timestamp with time zone | NULL | — |
| `cylinder_id` | uuid | NULL | — |
| `machine_type` | text | NULL | — |
| `current_needle_id` | uuid | NULL | — |
| `current_sinker_id` | uuid | NULL | — |
| `year` | integer | NULL | — |
| `maintenance_interval_days` | integer | NULL | — |
| `maintenance_kg_target` | numeric | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | SET NULL |
| `company_id` | `companies.id` | CASCADE |
| `current_needle_id` | `needle_inventory.id` | SET NULL |
| `current_sinker_id` | `sinker_inventory.id` | SET NULL |
| `cylinder_id` | `cylinders.id` | SET NULL |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own machines` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own machines` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own machines` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own machines` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `articles`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `client_id` | uuid | NULL | — |
| `client_name` | text | NULL | — |
| `weight_per_roll` | numeric | NOT NULL | `0` |
| `value_per_kg` | numeric | NOT NULL | `0` |
| `turns_per_roll` | integer | NOT NULL | `0` |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `target_efficiency` | numeric | NOT NULL | `80` |
| `yarn_type_id` | uuid | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `client_id` | `clients.id` | SET NULL |
| `company_id` | `companies.id` | CASCADE |
| `yarn_type_id` | `yarn_types.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own articles` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own articles` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own articles` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own articles` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `clients`

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
| `Users can delete own clients` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own clients` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own clients` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own clients` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


#### `public.get_report_data(p_company_id uuid, p_start_date date, p_end_date date, p_shift text DEFAULT 'all'::text, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid, p_machine_id uuid DEFAULT NULL::uuid)`

Retorna: `json`


#### `public.get_report_kpis(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(total_rolls bigint, total_weight numeric, total_revenue numeric, avg_efficiency numeric, active_days bigint)`


#### `public.get_report_by_shift(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_machine_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(shift text, rolos bigint, kg numeric, faturamento numeric, eficiencia numeric)`


#### `public.get_report_by_machine(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::text, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(machine_id uuid, machine_name text, rolos bigint, kg numeric, faturamento numeric, eficiencia numeric)`


#### `public.get_report_by_article(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(article_id uuid, article_name text, rolos bigint, kg numeric, faturamento numeric, eficiencia numeric)`


#### `public.get_report_evolution(p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(date date, rolos bigint, faturamento numeric)`
