# Configurações

**Rota:** `/:slug/settings`

Configurações da empresa: dados gerais, logo, módulos habilitados (enabled_nav_items), usuários (profiles), TV, IoT, backup, plano.

---

## 🗄️ Tabelas do banco


### `companies`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `name` | text | NOT NULL | — |
| `admin_name` | text | NOT NULL | — |
| `admin_email` | text | NOT NULL | — |
| `whatsapp` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `logo_url` | text | NULL | — |
| `slug` | text | NOT NULL | — |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Anyone can read company basic info` | SELECT | {anon,authenticated} | `true` | — |
| `Authenticated users can insert company` | INSERT | {authenticated} | — | `true` |
| `Users can read own company` | SELECT | {authenticated} | `(id = get_user_company_id())` | — |
| `Users can update own company` | UPDATE | {authenticated} | `(id = get_user_company_id())` | — |


### `company_settings`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `monthly_plan_value` | numeric | NOT NULL | `0` |
| `platform_active` | boolean | NOT NULL | `true` |
| `enabled_nav_items` | jsonb | NOT NULL | `'["dashboard", "faturamento-total", "machines", "clients-articles", "production", "outsource", "weavers", "reports", "settings", "revision", "mecanica", "contas-pagar", "residuos", "invoices", "fechamento"]'::jsonb` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |
| `shift_manha_start` | text | NOT NULL | `'05:00'::text` |
| `shift_manha_end` | text | NOT NULL | `'13:30'::text` |
| `shift_tarde_start` | text | NOT NULL | `'13:30'::text` |
| `shift_tarde_end` | text | NOT NULL | `'22:00'::text` |
| `shift_noite_start` | text | NOT NULL | `'22:00'::text` |
| `shift_noite_end` | text | NOT NULL | `'05:00'::text` |
| `trial_end_date` | timestamp with time zone | NULL | — |
| `subscription_status` | text | NOT NULL | `'trial'::text` |
| `subscription_plan` | text | NULL | — |
| `subscription_paid_at` | timestamp with time zone | NULL | — |
| `stripe_customer_id` | text | NULL | — |
| `grace_period_end` | timestamp with time zone | NULL | — |
| `tv_code` | text | NULL | — |
| `stock_cutoff_date` | date | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Anon can read company by tv_code` | SELECT | {anon} | `(tv_code IS NOT NULL)` | — |
| `Users can read own company_settings` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own company_settings` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | `(company_id = get_user_company_id())` |


### `company_backups`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `backup_date` | date | NOT NULL | — |
| `data` | jsonb | NOT NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Platform admins can delete backups` | DELETE | {authenticated} | `is_platform_admin(auth.uid())` | — |
| `Platform admins can read backups` | SELECT | {authenticated} | `is_platform_admin(auth.uid())` | — |


### `profiles`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `user_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `email` | text | NOT NULL | — |
| `role` | text | NOT NULL | `'admin'::text` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `status` | text | NOT NULL | `'active'::text` |
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `code` | text | NULL | — |
| `permission_overrides` | jsonb | NOT NULL | `'[]'::jsonb` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |
| `user_id` | `auth.users.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can insert profile` | INSERT | {authenticated} | — | `(user_id = auth.uid())` |
| `Users can read company profiles` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own profile` | UPDATE | {authenticated} | `((user_id = auth.uid()) AND (company_id = get_user_company_id()))` | `((user_id = auth.uid()) AND (company_id = get_user_company_id()))` |


### `user_active_company`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `user_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users manage own active company` | ALL | {authenticated} | `(user_id = auth.uid())` | `(user_id = auth.uid())` |


### `platform_admins`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL | — |
| `email` | text | NOT NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can check own platform admin status` | SELECT | {authenticated} | `(user_id = auth.uid())` | — |


### `platform_settings`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `key` | text | NOT NULL | — |
| `value` | text | NOT NULL | — |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Anyone can read platform_settings` | SELECT | {anon,authenticated} | `true` | — |


### `tv_panels`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `code` | text | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `panel_type` | text | NOT NULL | `'machine_grid'::text` |
| `enabled_machines` | jsonb | NOT NULL | `'[]'::jsonb` |
| `is_connected` | boolean | NOT NULL | `false` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Anon can read tv_panels by code` | SELECT | {anon} | `(code IS NOT NULL)` | — |
| `Users can delete own tv_panels` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own tv_panels` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own tv_panels` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own tv_panels` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


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


### `email_history`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `old_email` | text | NOT NULL | — |
| `new_email` | text | NOT NULL | — |
| `changed_by` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Platform admins can read email_history` | SELECT | {authenticated} | `true` | — |
| `Service role can insert email_history` | INSERT | {authenticated} | — | `true` |


### `login_history`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `user_id` | uuid | NOT NULL | — |
| `user_name` | text | NULL | — |
| `user_code` | text | NULL | — |
| `user_role` | text | NULL | — |
| `ip_address` | text | NULL | — |
| `user_agent` | text | NULL | — |
| `device_type` | text | NULL | — |
| `browser` | text | NULL | — |
| `os` | text | NULL | — |
| `location_country` | text | NULL | — |
| `location_city` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can insert own login_history` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own login_history` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |


### `payment_history`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `plan` | text | NOT NULL | `'monthly'::text` |
| `amount` | numeric | NOT NULL | `0` |
| `status` | text | NOT NULL | `'pending'::text` |
| `pix_code` | text | NULL | — |
| `transaction_id` | text | NULL | — |
| `paid_at` | timestamp with time zone | NULL | — |
| `next_billing_date` | timestamp with time zone | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Service can insert payment_history` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Service can update payment_history` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can read own payment_history` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |


### `audit_logs`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `user_id` | uuid | NULL | — |
| `user_name` | text | NULL | — |
| `user_role` | text | NULL | — |
| `user_code` | text | NULL | — |
| `action` | text | NOT NULL | — |
| `details` | jsonb | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can insert own audit_logs` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own audit_logs` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |


### `accounts_payable`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `supplier_name` | text | NOT NULL | — |
| `description` | text | NOT NULL | — |
| `category` | text | NULL | — |
| `amount` | numeric | NOT NULL | `0` |
| `due_date` | date | NOT NULL | — |
| `whatsapp_number` | text | NOT NULL | — |
| `status` | text | NOT NULL | `'pendente'::text` |
| `paid_at` | timestamp with time zone | NULL | — |
| `notification_sent` | boolean | NOT NULL | `false` |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |
| `notification_status` | text | NOT NULL | `'pendente'::text` |
| `notification_error` | text | NULL | — |
| `receipt_url` | text | NULL | — |
| `receipt_change_count` | integer | NOT NULL | `0` |
| `short_id` | text | NULL | — |
| `paid_amount` | numeric | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own accounts_payable` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own accounts_payable` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own accounts_payable` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own accounts_payable` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


#### `public.is_platform_admin(_user_id uuid)`

Retorna: `boolean`


#### `public.get_user_company_id()`

Retorna: `uuid`


#### `public.prevent_profile_privilege_escalation()`

Retorna: `trigger`


#### `public.generate_account_short_id()`

Retorna: `trigger`
