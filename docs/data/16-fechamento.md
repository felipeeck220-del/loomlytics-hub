# Fechamento Mensal (Em teste)

**Rota:** `/:slug/fechamento`

Fechamento mensal consolidado (produção + faturamento + NFs + contas a pagar). Em fase de testes.

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


### `invoices`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `type` | text | NOT NULL | `'entrada'::text` |
| `invoice_number` | text | NOT NULL | — |
| `access_key` | text | NULL | — |
| `client_id` | uuid | NULL | — |
| `client_name` | text | NULL | — |
| `issue_date` | text | NOT NULL | — |
| `total_weight_kg` | numeric | NOT NULL | `0` |
| `total_value` | numeric | NULL | `0` |
| `status` | text | NOT NULL | `'pendente'::text` |
| `observations` | text | NULL | — |
| `created_by_name` | text | NULL | — |
| `created_by_code` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `buyer_name` | text | NULL | — |
| `destination_name` | text | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `client_id` | `clients.id` | NO ACTION |
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own invoices` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own invoices` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own invoices` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own invoices` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `invoice_items`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `invoice_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `yarn_type_id` | uuid | NULL | — |
| `yarn_type_name` | text | NULL | — |
| `article_id` | uuid | NULL | — |
| `article_name` | text | NULL | — |
| `weight_kg` | numeric | NOT NULL | `0` |
| `quantity_rolls` | numeric | NULL | `0` |
| `value_per_kg` | numeric | NULL | `0` |
| `subtotal` | numeric | NULL | `0` |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `quantity_boxes` | numeric | NULL | `0` |
| `brand` | text | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | NO ACTION |
| `company_id` | `companies.id` | CASCADE |
| `invoice_id` | `invoices.id` | CASCADE |
| `yarn_type_id` | `yarn_types.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own invoice_items` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own invoice_items` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own invoice_items` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own invoice_items` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


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
