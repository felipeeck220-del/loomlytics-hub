# Tecelões

**Rota:** `/:slug/weavers`

Cadastro de tecelões com turno fixo ou específico (horários).

---

## 🗄️ Tabelas do banco


### `weavers`

**Colunas**

| Coluna | Tipo | Null | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `company_id` | uuid | NOT NULL | — |
| `code` | text | NOT NULL | — |
| `name` | text | NOT NULL | — |
| `phone` | text | NULL | — |
| `shift_type` | text | NOT NULL | `'fixo'::text` |
| `fixed_shift` | text | NULL | — |
| `start_time` | text | NULL | — |
| `end_time` | text | NULL | — |
| `created_at` | timestamp with time zone | NOT NULL | `now()` |


**Foreign Keys**

| Coluna | Referência | ON DELETE |
|---|---|---|
| `company_id` | `companies.id` | CASCADE |


**Row-Level Security (políticas)**

| Política | Comando | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `Users can delete own weavers` | DELETE | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can insert own weavers` | INSERT | {authenticated} | — | `(company_id = get_user_company_id())` |
| `Users can read own weavers` | SELECT | {authenticated} | `(company_id = get_user_company_id())` | — |
| `Users can update own weavers` | UPDATE | {authenticated} | `(company_id = get_user_company_id())` | — |


---

## ⚙️ Funções RPC / Triggers


_Sem RPCs dedicadas — todas as operações desta seção usam consultas diretas via PostgREST com filtros por `company_id` (RLS)._
