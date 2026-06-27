# Dashboard

**Rota:** `/:slug/dashboard`

Painel executivo com KPIs (rolos, peso, faturamento, eficiência), comparativo de período, produção por turno, top máquinas e tendência diária.

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


### `machine_logs`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `machine_id` | uuid | NOT NULL | — |
| `status` | USER-DEFINED | NOT NULL | — |
| `started_at` | timestamp with time zone | NOT NULL | `now()` |
| `ended_at` | timestamp with time zone | NULL | — |
| `started_by_name` | text | NULL | — |
| `started_by_code` | text | NULL | — |
| `ended_by_name` | text | NULL | — |
| `ended_by_code` | text | NULL | — |
| `company_id` | uuid | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | NO ACTION |
| `machine_id` | `machines.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage own machine_logs` | ALL | {authenticated} | `(machine_id IN ( SELECT machines.id` | — |


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


### `machine_readings`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `machine_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `total_rotations` | bigint | NOT NULL | — |
| `rpm` | numeric | NOT NULL | `0` |
| `is_running` | boolean | NOT NULL | `false` |
| `uptime_ms` | bigint | NULL | — |
| `wifi_rssi` | integer | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `machine_id` | `machines.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own machine_readings` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can read own machine_readings` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |


### `iot_downtime_events`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `machine_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `started_at` | timestamp with time zone | NOT NULL | — |
| `ended_at` | timestamp with time zone | NULL | — |
| `duration_seconds` | integer | NULL | — |
| `shift` | text | NOT NULL | — |
| `weaver_id` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `machine_id` | `machines.id` | CASCADE |
| `weaver_id` | `weavers.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own iot_downtime_events` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can read own iot_downtime_events` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


#### `public.get_dashboard_metrics(p_company_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_machine_id uuid DEFAULT NULL::uuid, p_shift text DEFAULT NULL::text)`

Retorna: `json`


#### `public.get_production_stats(p_company_id uuid, p_start_date text, p_end_date text, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL::uuid, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(total_weight numeric, total_revenue numeric, total_rolls bigint, avg_efficiency numeric, record_count bigint)`


#### `public.get_production_trend_stats(p_company_id uuid, p_start_date date, p_end_date date, p_shift text DEFAULT 'all'::text, p_article_id uuid DEFAULT NULL::uuid)`

Retorna: `TABLE(date text, total_rolls numeric, total_weight numeric, total_revenue numeric, avg_efficiency numeric)`
