# Máquinas

**Rota:** `/:slug/machines`

Cadastro de teares (TEAR XX) com tipo (mono/dupla frontura), modelo, diâmetro, finura, agulhas/platinas em uso, status, IoT.

---

## 🗄️ Tabelas do banco


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


### `machine_needle_refs`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `machine_id` | uuid | NOT NULL | — |
| `needle_id` | uuid | NOT NULL | — |
| `position` | text | NOT NULL | `'mono'::text` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `machine_id` | `machines.id` | CASCADE |
| `needle_id` | `needle_inventory.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `tenant delete machine_needle_refs` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `tenant insert machine_needle_refs` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `tenant select machine_needle_refs` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `tenant update machine_needle_refs` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | `(company_id = get_user_company_id())` |


### `machine_sinker_refs`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `machine_id` | uuid | NOT NULL | — |
| `sinker_id` | uuid | NOT NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `machine_id` | `machines.id` | CASCADE |
| `sinker_id` | `sinker_inventory.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `tenant delete machine_sinker_refs` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `tenant insert machine_sinker_refs` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `tenant select machine_sinker_refs` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `tenant update machine_sinker_refs` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | `(company_id = get_user_company_id())` |


### `cylinders`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `brand` | text | NOT NULL | — |
| `model` | text | NULL | — |
| `diameter` | text | NULL | — |
| `fineness` | text | NULL | — |
| `needle_quantity` | integer | NULL | — |
| `feeder_quantity` | integer | NULL | — |
| `observations` | text | NULL | — |
| `machine_id` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |
| `sinker_quantity` | integer | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `machine_id` | `machines.id` | SET NULL |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage cylinders for their company` | ALL | {authenticated} | `(company_id = get_user_company_id())` | `(company_id = get_user_company_id())` |


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


### `machine_maintenance_observations`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `machine_log_id` | uuid | NOT NULL | — |
| `machine_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `observation` | text | NOT NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own maintenance observations` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own maintenance observations` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own maintenance observations` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |


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


### `iot_devices`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `machine_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `token` | text | NOT NULL | — |
| `name` | text | NULL | — |
| `active` | boolean | NOT NULL | `true` |
| `firmware_version` | text | NULL | — |
| `last_seen_at` | timestamp with time zone | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `machine_id` | `machines.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Anon can read iot_devices by token` | SELECT | {anon} | `(token IS NOT NULL)` | — |
| `Users can delete own iot_devices` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own iot_devices` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own iot_devices` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own iot_devices` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `iot_machine_assignments`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `machine_id` | uuid | NOT NULL | — |
| `weaver_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `shift` | text | NOT NULL | — |
| `active` | boolean | NOT NULL | `true` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `machine_id` | `machines.id` | CASCADE |
| `weaver_id` | `weavers.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own iot_machine_assignments` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own iot_machine_assignments` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own iot_machine_assignments` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own iot_machine_assignments` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


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


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
