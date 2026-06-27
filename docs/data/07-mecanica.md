# Mecânica

**Rota:** `/:slug/mecanica`

Manutenções preventivas e corretivas. Calendário de programação (intervalo dias + meta kg). Estoque de agulhas e platinas com transações.

---

## 🗄️ Tabelas do banco


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


### `needle_inventory`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `provider` | text | NOT NULL | — |
| `brand` | text | NOT NULL | — |
| `reference_code` | text | NOT NULL | — |
| `current_quantity` | integer | NOT NULL | `0` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage needles of their company` | ALL | {public} | `(auth.uid() IN ( SELECT profiles.user_id` | — |
| `Users can view needles of their company` | SELECT | {public} | `(auth.uid() IN ( SELECT profiles.user_id` | — |


### `needle_transactions`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `needle_id` | uuid | NOT NULL | — |
| `type` | USER-DEFINED | NOT NULL | — |
| `exit_mode` | USER-DEFINED | NULL | — |
| `quantity` | integer | NOT NULL | — |
| `date` | date | NOT NULL | `CURRENT_DATE` |
| `machine_id` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `created_by_id` | uuid | NULL | — |
| `created_by_name` | text | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `created_by_id` | `auth.users.id` | NO ACTION |
| `machine_id` | `machines.id` | NO ACTION |
| `needle_id` | `needle_inventory.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage needle transactions of their company` | ALL | {public} | `(auth.uid() IN ( SELECT profiles.user_id` | — |
| `Users can view needle transactions of their company` | SELECT | {public} | `(auth.uid() IN ( SELECT profiles.user_id` | — |


### `sinker_inventory`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `provider` | text | NOT NULL | — |
| `brand` | text | NOT NULL | — |
| `reference_code` | text | NOT NULL | — |
| `current_quantity` | integer | NOT NULL | `0` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `auth.users.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage sinker inventory for their company` | ALL | {public} | `true` | — |


### `sinker_transactions`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `sinker_id` | uuid | NOT NULL | — |
| `type` | text | NOT NULL | — |
| `exit_mode` | text | NULL | — |
| `quantity` | integer | NOT NULL | — |
| `date` | date | NOT NULL | — |
| `machine_id` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `created_by_id` | uuid | NULL | — |
| `created_by_name` | text | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `machine_id` | `machines.id` | SET NULL |
| `sinker_id` | `sinker_inventory.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage sinker transactions for their company` | ALL | {public} | `true` | — |


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


---

## ⚙️ Funções RPC / Triggers


#### `public.handle_needle_transaction()`

Retorna: `trigger`


#### `public.handle_needle_transaction_trigger()`

Retorna: `trigger`


#### `public.handle_needle_transaction_update()`

Retorna: `trigger`


#### `public.handle_needle_transaction_delete()`

Retorna: `trigger`
