# Estoque de Malha

**Rota:** `/:slug/stock-malha`

Estoque de rolos produzidos (pré-faturamento). Vinculado às produções e movimentações para OFs.

---

## 🗄️ Tabelas do banco


### `stock_movements`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `article_id` | uuid | NOT NULL | — |
| `client_id` | uuid | NULL | — |
| `billing_order_id` | uuid | NULL | — |
| `type` | USER-DEFINED | NOT NULL | — |
| `pieces` | integer | NOT NULL | `0` |
| `weight_kg` | numeric | NOT NULL | `0` |
| `reason` | text | NULL | — |
| `created_by` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `is_second_quality` | boolean | NOT NULL | `false` |
| `machine_id` | uuid | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | RESTRICT |
| `billing_order_id` | `billing_orders.id` | SET NULL |
| `client_id` | `clients.id` | SET NULL |
| `company_id` | `companies.id` | CASCADE |
| `created_by` | `profiles.id` | SET NULL |
| `machine_id` | `machines.id` | SET NULL |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Tenant can insert stock movements` | INSERT | {authenticated} | — | `(company_id IN ( SELECT profiles.company_id` |
| `Tenant can view stock movements` | SELECT | {authenticated} | `(company_id IN ( SELECT profiles.company_id` | — |


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


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
