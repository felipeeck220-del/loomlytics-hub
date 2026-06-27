# Documentação do Banco de Dados — Por Seção do Menu

Cada arquivo descreve as **tabelas**, **colunas**, **foreign keys**, **políticas de RLS** e **funções RPC** usadas pela seção correspondente do menu.

## Seções

- [Dashboard](./01-dashboard.md) — `/:slug/dashboard`
- [Faturamento Total](./02-faturamento-total.md) — `/:slug/faturamento-total (somente admin)`
- [Máquinas](./03-maquinas.md) — `/:slug/machines`
- [Clientes & Artigos](./04-clientes-artigos.md) — `/:slug/clients`
- [Produção](./05-producao.md) — `/:slug/production`
- [Revisão (Defeitos)](./06-revisao.md) — `/:slug/revision`
- [Mecânica](./07-mecanica.md) — `/:slug/mecanica`
- [Terceirizado](./08-terceirizado.md) — `/:slug/outsource`
- [Tecelões](./09-teceloes.md) — `/:slug/weavers`
- [Relatórios](./10-relatorios.md) — `/:slug/reports`
- [Vendas de Resíduos](./11-vendas-residuos.md) — `/:slug/residue-sales`
- [Estoque de Malha](./12-estoque-malha.md) — `/:slug/stock-malha`
- [Ordem de Faturamento (OF)](./13-ordem-faturamento.md) — `/:slug/billing-orders`
- [Notas Fiscais (Trama)](./14-nf-trama.md) — `/:slug/invoices`
- [Notas Fiscais (Clientes)](./15-nf-clientes.md) — `/:slug/client-invoices`
- [Fechamento Mensal (Em teste)](./16-fechamento.md) — `/:slug/fechamento`
- [Configurações](./17-configuracoes.md) — `/:slug/settings`

## Visão geral das tabelas (todas)

| Tabela | Colunas | FKs | Políticas RLS |
|---|---|---|---|
| `accounts_payable` | 20 | 1 | 4 |
| `article_machine_turns` | 7 | 3 | 4 |
| `articles` | 12 | 3 | 4 |
| `audit_logs` | 9 | 0 | 2 |
| `billing_order_pallets` | 10 | 5 | 4 |
| `billing_orders` | 41 | 12 | 1 |
| `client_invoice_exit_links` | 7 | 2 | 4 |
| `client_invoice_items` | 7 | 4 | 1 |
| `client_invoices` | 14 | 3 | 1 |
| `clients` | 6 | 1 | 4 |
| `companies` | 8 | 0 | 4 |
| `company_backups` | 5 | 0 | 2 |
| `company_settings` | 21 | 1 | 3 |
| `cylinders` | 13 | 2 | 1 |
| `defect_records` | 16 | 4 | 4 |
| `email_history` | 6 | 0 | 2 |
| `invoice_items` | 15 | 4 | 4 |
| `invoices` | 17 | 2 | 4 |
| `iot_devices` | 9 | 2 | 5 |
| `iot_downtime_events` | 9 | 3 | 2 |
| `iot_machine_assignments` | 7 | 3 | 4 |
| `iot_shift_state` | 16 | 5 | 4 |
| `login_history` | 14 | 1 | 2 |
| `machine_logs` | 10 | 2 | 1 |
| `machine_maintenance_observations` | 6 | 0 | 3 |
| `machine_needle_refs` | 6 | 2 | 4 |
| `machine_readings` | 9 | 2 | 2 |
| `machine_sinker_refs` | 5 | 2 | 4 |
| `machines` | 25 | 5 | 4 |
| `needle_inventory` | 8 | 1 | 2 |
| `needle_transactions` | 11 | 4 | 2 |
| `outsource_companies` | 6 | 1 | 4 |
| `outsource_freights` | 13 | 2 | 4 |
| `outsource_productions` | 22 | 3 | 4 |
| `outsource_yarn_stock` | 9 | 3 | 4 |
| `payment_history` | 10 | 1 | 3 |
| `platform_admins` | 4 | 0 | 1 |
| `platform_settings` | 4 | 0 | 1 |
| `productions` | 18 | 4 | 4 |
| `profiles` | 10 | 2 | 3 |
| `residue_client_prices` | 6 | 3 | 4 |
| `residue_clients` | 4 | 1 | 4 |
| `residue_materials` | 6 | 1 | 4 |
| `residue_sales` | 16 | 3 | 4 |
| `sinker_inventory` | 8 | 1 | 1 |
| `sinker_transactions` | 11 | 2 | 1 |
| `stock_movements` | 13 | 6 | 2 |
| `tv_panels` | 8 | 1 | 5 |
| `user_active_company` | 2 | 1 | 1 |
| `weavers` | 10 | 1 | 4 |
| `yarn_stock_clients` | 5 | 0 | 1 |
| `yarn_stock_entries` | 12 | 0 | 1 |
| `yarn_stock_machine_current` | 11 | 2 | 1 |
| `yarn_stock_movements` | 13 | 2 | 1 |
| `yarn_stock_pallets` | 19 | 3 | 1 |
| `yarn_stock_types` | 5 | 0 | 1 |
| `yarn_types` | 7 | 1 | 4 |

## Funções públicas do banco (todas)

| Função | Argumentos | Retorna |
|---|---|---|
| `fetch_productions_page` | `p_company_id uuid, p_start_date text, p_end_date text, p_page integer DEFAULT 0, p_page_size integer DEFAULT 50, p_shift` | `TABLE(id uuid, company_id uuid, date date, shift text, machine_id uuid, machine_` |
| `generate_account_short_id` | `` | `trigger` |
| `get_dashboard_metrics` | `p_company_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_machine_id uuid DEFAULT N` | `json` |
| `get_defect_stats` | `p_company_id uuid, p_start_date date, p_end_date date, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL:` | `TABLE(total_records bigint, total_kg numeric, total_metros numeric)` |
| `get_faturamento_available_months` | `p_company_id uuid` | `TABLE(month_str text)` |
| `get_faturamento_total_metrics` | `p_company_id uuid, p_start_date date, p_end_date date, p_prev_start_date date, p_prev_end_date date` | `json` |
| `get_production_filter_articles` | `p_company_id uuid` | `TABLE(id uuid, name text)` |
| `get_production_filter_clients` | `p_company_id uuid` | `TABLE(id uuid, name text)` |
| `get_production_filter_machines` | `p_company_id uuid` | `TABLE(id uuid, name text)` |
| `get_production_filter_months` | `p_company_id uuid` | `TABLE(month_str text)` |
| `get_production_machine_stats` | `p_company_id uuid, p_start_date date, p_end_date date, p_article_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 5` | `TABLE(machine_id uuid, machine_name text, total_rolls bigint, total_weight numer` |
| `get_production_shift_stats` | `p_company_id uuid, p_start_date date, p_end_date date, p_article_id uuid DEFAULT NULL::uuid` | `TABLE(shift text, total_rolls bigint, total_weight numeric, total_revenue numeri` |
| `get_production_stats` | `p_company_id uuid, p_start_date text, p_end_date text, p_shift text DEFAULT 'all'::text, p_machine_id uuid DEFAULT NULL:` | `TABLE(total_weight numeric, total_revenue numeric, total_rolls bigint, avg_effic` |
| `get_production_trend_stats` | `p_company_id uuid, p_start_date date, p_end_date date, p_shift text DEFAULT 'all'::text, p_article_id uuid DEFAULT NULL:` | `TABLE(date text, total_rolls numeric, total_weight numeric, total_revenue numeri` |
| `get_report_by_article` | `p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::t` | `TABLE(article_id uuid, article_name text, rolos bigint, kg numeric, faturamento ` |
| `get_report_by_client` | `p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::t` | `TABLE(client_id uuid, client_name text, rolos bigint, kg numeric, faturamento nu` |
| `get_report_by_machine` | `p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::t` | `TABLE(machine_id uuid, machine_name text, rolos bigint, kg numeric, faturamento ` |
| `get_report_by_shift` | `p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_machine_id uuid DEFAULT NUL` | `TABLE(shift text, rolos bigint, kg numeric, faturamento numeric, eficiencia nume` |
| `get_report_data` | `p_company_id uuid, p_start_date date, p_end_date date, p_shift text DEFAULT 'all'::text, p_client_id uuid DEFAULT NULL::` | `json` |
| `get_report_evolution` | `p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::t` | `TABLE(date date, rolos bigint, faturamento numeric)` |
| `get_report_kpis` | `p_company_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_shift text DEFAULT 'all'::t` | `TABLE(total_rolls bigint, total_weight numeric, total_revenue numeric, avg_effic` |
| `get_user_companies` | `` | `TABLE(company_id uuid, company_name text, company_slug text, role text)` |
| `get_user_company_id` | `` | `uuid` |
| `handle_needle_transaction` | `` | `trigger` |
| `handle_needle_transaction_delete` | `` | `trigger` |
| `handle_needle_transaction_trigger` | `` | `trigger` |
| `handle_needle_transaction_update` | `` | `trigger` |
| `handle_updated_at` | `` | `trigger` |
| `is_platform_admin` | `_user_id uuid` | `boolean` |
| `prevent_profile_privilege_escalation` | `` | `trigger` |
| `set_active_company` | `_company_id uuid` | `void` |
| `sync_billing_order_from_pallets` | `` | `trigger` |
| `update_accounts_payable_updated_at` | `` | `trigger` |
| `update_billing_orders_updated_at` | `` | `trigger` |
| `update_sinker_inventory` | `` | `trigger` |
| `update_updated_at_column` | `` | `trigger` |