# Notas Fiscais (Clientes)

**Rota:** `/:slug/client-invoices`

Controle de NFs de ENTRADA de fio enviadas pelos clientes (facção) e SAÍDAS de malha vinculadas. Saldo a enviar por NF e por cliente.

---

## 🗄️ Tabelas do banco


### `client_invoices`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `client_id` | uuid | NOT NULL | — |
| `type` | USER-DEFINED | NOT NULL | — |
| `invoice_number` | text | NOT NULL | — |
| `issue_date` | date | NOT NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |
| `created_by_name` | text | NULL | — |
| `created_by_code` | text | NULL | — |
| `parent_invoice_id` | uuid | NULL | — |
| `supplier_name` | text | NULL | — |
| `composition` | jsonb | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `client_id` | `clients.id` | CASCADE |
| `company_id` | `companies.id` | CASCADE |
| `parent_invoice_id` | `client_invoices.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage client_invoices of their company` | ALL | {authenticated} | `(company_id = get_user_company_id())` | `(company_id = get_user_company_id())` |


### `client_invoice_items`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `invoice_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `yarn_type_id` | uuid | NULL | — |
| `article_id` | uuid | NULL | — |
| `weight_kg` | numeric | NOT NULL | `0` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | SET NULL |
| `company_id` | `companies.id` | CASCADE |
| `invoice_id` | `client_invoices.id` | CASCADE |
| `yarn_type_id` | `yarn_types.id` | SET NULL |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage client_invoice_items of their company` | ALL | {authenticated} | `(company_id = get_user_company_id())` | `(company_id = get_user_company_id())` |


### `client_invoice_exit_links`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `exit_invoice_id` | uuid | NOT NULL | — |
| `entry_invoice_id` | uuid | NOT NULL | — |
| `yarn_type_id` | uuid | NULL | — |
| `deduct_kg` | numeric | NOT NULL | `0` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `entry_invoice_id` | `client_invoices.id` | CASCADE |
| `exit_invoice_id` | `client_invoices.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `tenant_delete` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `tenant_insert` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `tenant_select` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `tenant_update` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | `(company_id = get_user_company_id())` |


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


### `yarn_types`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `composition` | text | NULL | — |
| `color` | text | NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own yarn_types` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own yarn_types` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own yarn_types` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own yarn_types` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


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


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
