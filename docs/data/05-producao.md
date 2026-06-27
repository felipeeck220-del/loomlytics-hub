# Produção

**Rota:** `/:slug/production`

Lançamento de produção (modo rolos, modo voltas ou IoT) por tear/turno/artigo/tecelão. Gera receita e eficiência.

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


### `article_machine_turns`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `article_id` | uuid | NOT NULL | — |
| `machine_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `turns_per_roll` | integer | NOT NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | CASCADE |
| `company_id` | `companies.id` | NO ACTION |
| `machine_id` | `machines.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own article_machine_turns` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own article_machine_turns` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own article_machine_turns` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own article_machine_turns` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `iot_shift_state`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `machine_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `current_shift` | text | NOT NULL | — |
| `weaver_id` | uuid | NULL | — |
| `article_id` | uuid | NULL | — |
| `partial_turns` | bigint | NOT NULL | `0` |
| `total_turns` | bigint | NOT NULL | `0` |
| `completed_rolls` | integer | NOT NULL | `0` |
| `roll_position` | bigint | NOT NULL | `0` |
| `last_rpm` | numeric | NULL | `0` |
| `shift_started_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |
| `rpm_sum` | numeric | NOT NULL | `0` |
| `rpm_count` | integer | NOT NULL | `0` |
| `production_id` | uuid | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | NO ACTION |
| `company_id` | `companies.id` | CASCADE |
| `machine_id` | `machines.id` | CASCADE |
| `production_id` | `productions.id` | SET NULL |
| `weaver_id` | `weavers.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own iot_shift_state` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own iot_shift_state` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own iot_shift_state` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own iot_shift_state` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


#### `public.get_production_stats(p_company_id uuid, p_start_date text, p_end_date text, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(total_weight numeric, total_revenue numeric, total_rolls bigint, avg_efficiency numeric, record_count bigint)`


#### `public.get_production_trend_stats(p_company_id uuid, p_start_date date, p_end_date date, p_shift text DEFAULT 'all'::text, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(date text, total_rolls numeric, total_weight numeric, total_revenue numeric, avg_efficiency numeric)`


#### `public.fetch_productions_page(p_company_id uuid, p_start_date text, p_end_date text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(id uuid, company_id uuid, date date, shift text, machine_id uuid, machine_name text, weaver_id uuid, weaver_name text, article_id uuid, article_name text, rpm numeric, rolls_produced numeric, weight_kg numeric, revenue numeric, efficiency numeric, created_at timestamp with time zone, created_by_name text, created_by_code text, total_count bigint)`
