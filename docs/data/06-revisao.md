# Revisão (Defeitos)

**Rota:** `/:slug/revision`

Registro de defeitos por rolo (kg ou metros), responsável (tecelão), motivo. Badges por tecelão (Verde≤3, Amarelo 4-7, Vermelho≥8).

---

## 🗄️ Tabelas do banco


### `defect_records`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `machine_id` | uuid | NULL | — |
| `article_id` | uuid | NULL | — |
| `weaver_id` | uuid | NULL | — |
| `date` | text | NOT NULL | — |
| `shift` | text | NOT NULL | — |
| `measure_type` | text | NOT NULL | `'kg'::text` |
| `measure_value` | numeric | NOT NULL | `0` |
| `machine_name` | text | NULL | — |
| `article_name` | text | NULL | — |
| `weaver_name` | text | NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `created_by_name` | text | NULL | — |
| `created_by_code` | text | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | NO ACTION |
| `company_id` | `companies.id` | NO ACTION |
| `machine_id` | `machines.id` | NO ACTION |
| `weaver_id` | `weavers.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own defect_records` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own defect_records` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own defect_records` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own defect_records` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `weavers`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `code` | text | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `phone` | text | NULL | — |
| `shift_type` | text | NOT NULL | `'fixo'::text` |
| `fixed_shift` | text | NULL | — |
| `start_time` | text | NULL | — |
| `end_time` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own weavers` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own weavers` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own weavers` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own weavers` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


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


---

## ⚙️ Funções RPC / Triggers


#### `public.get_defect_stats(p_company_id uuid, p_start_date date, p_end_date date, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid, p_weaver_id uuid DEFAULT NULL::uuid, p_search_term text DEFAULT NULL::text)`

Retorna: `TABLE(total_records bigint, total_kg numeric, total_metros numeric)`
