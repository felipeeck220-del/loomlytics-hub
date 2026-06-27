# Vendas de Resíduos

**Rota:** `/:slug/residue-sales`

Vendas de resíduos (sobras) com cadastro de clientes de resíduos, materiais e preços específicos por cliente.

---

## 🗄️ Tabelas do banco


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


### `residue_clients`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own residue_clients` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own residue_clients` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own residue_clients` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own residue_clients` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `residue_materials`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `unit` | text | NOT NULL | `'kg'::text` |
| `default_price` | numeric | NOT NULL | `0` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own residue_materials` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own residue_materials` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own residue_materials` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own residue_materials` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


### `residue_client_prices`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `client_id` | uuid | NOT NULL | — |
| `material_id` | uuid | NOT NULL | — |
| `unit_price` | numeric | NOT NULL | `0` |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `client_id` | `residue_clients.id` | CASCADE |
| `company_id` | `companies.id` | CASCADE |
| `material_id` | `residue_materials.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own residue_client_prices` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own residue_client_prices` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own residue_client_prices` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own residue_client_prices` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
