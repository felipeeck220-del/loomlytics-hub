# Notas Fiscais (Trama)

**Rota:** `/:slug/invoices`

Cadastro de NFs emitidas (saída) com itens (artigos/peso/valor). Usado para fechamento e relatórios financeiros.

---

## 🗄️ Tabelas do banco


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


---

## ⚙️ Funções RPC / Triggers


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
