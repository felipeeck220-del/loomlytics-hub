# Ordem de Faturamento (OF)

**Rota:** `/:slug/billing-orders`

Fluxo de OF: Aberto → Separando → Aguardando NF/ROM → Pronto p/ Coleta → Coletada. Suporta paletes, vínculo com NF, cancelamento com estorno de estoque.

---

## 🗄️ Tabelas do banco


### `billing_orders`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `of_number` | text | NOT NULL | — |
| `client_id` | uuid | NOT NULL | — |
| `article_id` | uuid | NOT NULL | — |
| `pieces_expected` | integer | NULL | — |
| `weight_expected` | numeric | NULL | — |
| `machine_id` | uuid | NULL | — |
| `dyehouse` | text | NOT NULL | — |
| `status` | USER-DEFINED | NOT NULL | `'open'::billing_order_status` |
| `pieces_real` | integer | NULL | — |
| `weight_real` | numeric | NULL | — |
| `weight_avg` | numeric | NULL | — |
| `created_by` | uuid | NOT NULL | — |
| `separated_by` | uuid | NULL | — |
| `collected_by` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `updated_at` | timestamp with time zone | NOT NULL | `now()` |
| `priority` | boolean | NULL | `false` |
| `priority_reason` | text | NULL | — |
| `priority_at` | timestamp with time zone | NULL | — |
| `priority_by` | uuid | NULL | — |
| `cancelled_by` | uuid | NULL | — |
| `cancelled_at` | timestamp with time zone | NULL | — |
| `cancellation_reason` | text | NULL | — |
| `order_type` | text | NOT NULL | `'pieces'::text` |
| `edit_note` | text | NULL | — |
| `last_edited_by` | uuid | NULL | — |
| `last_edited_at` | timestamp with time zone | NULL | — |
| `piece_weight_target` | numeric | NULL | — |
| `reverted_from` | text | NULL | — |
| `reversal_reason` | text | NULL | — |
| `reversed_by` | uuid | NULL | — |
| `reversed_at` | timestamp with time zone | NULL | — |
| `delivery_doc_type` | USER-DEFINED | NULL | — |
| `delivery_doc_number` | text | NULL | — |
| `delivery_doc_set_by` | uuid | NULL | — |
| `delivery_doc_set_at` | timestamp with time zone | NULL | — |
| `reversal_quality` | text | NULL | — |
| `link_group_id` | uuid | NULL | — |
| `collected_at` | timestamp with time zone | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | CASCADE |
| `cancelled_by` | `profiles.id` | NO ACTION |
| `client_id` | `clients.id` | CASCADE |
| `collected_by` | `profiles.id` | NO ACTION |
| `company_id` | `companies.id` | CASCADE |
| `created_by` | `profiles.id` | NO ACTION |
| `delivery_doc_set_by` | `profiles.id` | NO ACTION |
| `last_edited_by` | `profiles.id` | NO ACTION |
| `machine_id` | `machines.id` | SET NULL |
| `priority_by` | `profiles.id` | NO ACTION |
| `reversed_by` | `profiles.id` | SET NULL |
| `separated_by` | `profiles.id` | NO ACTION |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can manage their company's billing orders` | ALL | {authenticated} | `(company_id = ( SELECT user_active_company.company_id` | — |


### `billing_order_pallets`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `billing_order_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `pallet_number` | integer | NOT NULL | — |
| `pieces` | integer | NOT NULL | `0` |
| `weight_kg` | numeric | NOT NULL | `0` |
| `reserve_movement_id` | uuid | NULL | — |
| `created_by` | uuid | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |
| `machine_id` | uuid | NULL | — |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `billing_order_id` | `billing_orders.id` | CASCADE |
| `company_id` | `companies.id` | CASCADE |
| `created_by` | `profiles.id` | SET NULL |
| `machine_id` | `machines.id` | SET NULL |
| `reserve_movement_id` | `stock_movements.id` | SET NULL |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Tenant can delete pallets` | DELETE | {authenticated} | `(company_id IN ( SELECT profiles.company_id` | — |
| `Tenant can insert pallets` | INSERT | {authenticated} | — | `(company_id IN ( SELECT profiles.company_id` |
| `Tenant can update pallets` | UPDATE | {authenticated} | `(company_id IN ( SELECT profiles.company_id` | — |
| `Tenant can view pallets` | SELECT | {authenticated} | `(company_id IN ( SELECT profiles.company_id` | — |


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


### `outsource_companies`

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
| `Users can delete own outsource_companies` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own outsource_companies` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own outsource_companies` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own outsource_companies` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


#### `public.sync_billing_order_from_pallets()`

Retorna: `trigger`
