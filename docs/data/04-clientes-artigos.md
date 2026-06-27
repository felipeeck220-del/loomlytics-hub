# Clientes & Artigos

**Rota:** `/:slug/clients`

Cadastro de clientes da facção e artigos vinculados (peso/rolo, valor/kg, voltas/rolo, eficiência alvo, fio padrão). Overrides de voltas por máquina.

---

## 🗄️ Tabelas do banco


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


### `article_machine_turns`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `article_id` | uuid | NOT NULL | — |
| `machine_id` | uuid | NOT NULL | — |
| `company_id` | uuid | NOT NULL | — |
| `turns_per_roll` | integer | NOT NULL | — |
| `observations` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `article_id` | `articles.id` | CASCADE |
| `company_id` | `companies.id` | NO ACTION |
| `machine_id` | `machines.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own article_machine_turns` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own article_machine_turns` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own article_machine_turns` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own article_machine_turns` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


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


---

## ⚙️ Funções RPC / Triggers


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
