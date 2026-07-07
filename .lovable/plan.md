# Ordem de Frete (OFR)

Novo módulo no sidebar logo abaixo de **Ordem de Faturamento (OF)**, com fluxo próprio para coletas realizadas por freteiros terceirizados. **Independente da OF** (sem vínculo em banco). Segue o mesmo visual/UX do módulo OF.

## Fluxo

`Aberto` → `Coleta em Curso` → `Entrega em Curso` → `Finalizado`

- **Aberto**: admin cria a OFR selecionando o freteiro responsável. Aparece só para aquele freteiro (e admin).
- **Coleta em curso**: freteiro clica "Iniciar Coleta". Mostra cronômetro (dd/mm HH:MM:SS) desde o início.
- **Entrega em curso**: freteiro clica "Iniciar Entrega". Cronômetro reinicia. Para finalizar, é obrigatório anexar **até 2 fotos** da entrega (com descrição opcional).
- **Finalizado**: exibe botão **Baixar Relatório** (PDF).

## Estrutura no admin (Nova OFR)

- Nº da OFR (auto-incremental por empresa, mesma lógica do of_number)
- Freteiro (select dos cadastrados na empresa)
- Local de coleta (texto)
- Local de entrega (texto)
- Observações
- **Itens** (repetidor, N artigos por ordem):
  - Artigo (select dos artigos da empresa)
  - Quantidade (peças)
  - Peso estimado (kg) — usa `BrazilianWeightInput`

## Perfil "Freteiro"

Nova role `freteiro`:
- Vê apenas a página **Ordem de Frete** (chave `freight-orders`).
- Nas abas Aberto/Em Curso/Entrega, só enxerga OFRs onde `freighter_id = seu próprio id`.
- Não pode criar/editar/excluir OFRs. Só pode avançar status das próprias.
- Login: mesma tela `/:slug/login`; após entrar cai direto em `/:slug/freight-orders`.

Admin/Líder continuam vendo tudo.

## Banco (migration)

```sql
-- Freteiros cadastrados por empresa (link opcional com profiles p/ login)
CREATE TABLE public.freighters (
  id uuid PK,
  company_id uuid NOT NULL,
  profile_id uuid NULL REFERENCES profiles(id),  -- vinculado ao usuário freteiro
  name text NOT NULL,
  phone text NULL,
  vehicle text NULL,
  active boolean DEFAULT true,
  created_at, updated_at
);

CREATE TYPE freight_order_status AS ENUM
  ('open','pickup_in_progress','delivery_in_progress','completed','cancelled');

CREATE TABLE public.freight_orders (
  id uuid PK,
  company_id uuid NOT NULL,
  ofr_number text NOT NULL,           -- UNIQUE(company_id, ofr_number)
  freighter_id uuid NOT NULL REFERENCES freighters(id),
  pickup_location text NOT NULL,
  delivery_location text NOT NULL,
  observations text NULL,
  status freight_order_status NOT NULL DEFAULT 'open',
  created_by uuid,
  pickup_started_at, pickup_started_by,
  delivery_started_at, delivery_started_by,
  completed_at, completed_by,
  cancelled_at, cancelled_by, cancellation_reason,
  created_at, updated_at
);

CREATE TABLE public.freight_order_items (
  id uuid PK,
  freight_order_id uuid REFERENCES freight_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  article_id uuid REFERENCES articles(id),
  pieces integer NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0,
  created_at
);

CREATE TABLE public.freight_order_photos (
  id uuid PK,
  freight_order_id uuid REFERENCES freight_orders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  storage_path text NOT NULL,   -- {company_id}/{freight_order_id}/{uuid}.jpg
  description text NULL,
  uploaded_by uuid,
  created_at
);
```

- GRANTs padrão (authenticated + service_role) em todas.
- RLS: tenant isolation por `company_id = get_user_company_id()`, com política extra em `freight_orders`, `freight_order_items` e `freight_order_photos` restringindo `SELECT/UPDATE` ao freteiro cujo `profile_id = auth.uid()` quando role = `freteiro`.
- Bucket privado `freight-photos` com RLS por pasta `{company_id}/{freight_order_id}/`.

## Frontend

Arquivos novos:

- `src/hooks/useFreightOrders.ts` — CRUD + realtime + mutations de status.
- `src/pages/FreightOrders.tsx` — página com abas Aberto / Coleta em curso / Entrega em curso / Finalizados (+ Cancelados). Modais:
  - **Nova OFR** (admin) com repetidor de itens.
  - **Iniciar Coleta / Iniciar Entrega** (freteiro).
  - **Finalizar Entrega** com upload de até 2 fotos + descrição.
  - **Detalhes da OFR** (todos os campos + itens + fotos).
- `src/lib/freightOrderPdf.ts` — PDF do relatório final (header empresa, dados da OFR, tabela de itens, durações de coleta/entrega, freteiro, fotos anexadas, auditoria).

Arquivos alterados:

- `supabase/migrations/*.sql` — nova migration.
- `src/App.tsx` — rota `freight-orders`.
- `src/components/AppSidebar.tsx` — item "Ordem de Frete" logo abaixo de OF, com ícone Truck.
- `src/hooks/usePermissions.ts` — adiciona role `freteiro`, chave `freight-orders`, mapeamento de rota.
- `src/pages/Settings.tsx` (tab Usuários) — adiciona `freteiro` na lista de roles + cadastro de freteiros (tabela `freighters`).
- `docs/mestre.md` — entrada de histórico.

## Regras adicionais

- Cronômetro em tempo real (setInterval de 1s) na aba correspondente ao status.
- Cores das abas: Aberto (vermelho suave), Coleta em curso (amarelo), Entrega em curso (azul), Finalizado (verde), Cancelado (cinza) — padrão OF.
- Auditoria: registros em `audit_logs` para create/start_pickup/start_delivery/complete/cancel/photo_add.
- Formatador BR (kg 2 casas, data dd/MM/yyyy HH:mm) — usa helpers existentes.
- Sem `alert/confirm` nativos; usa modais e toasts do projeto.

## Reversão

- `DROP TABLE freight_order_photos, freight_order_items, freight_orders, freighters CASCADE;`
- `DROP TYPE freight_order_status;`
- Remover bucket `freight-photos`.
- Reverter arquivos citados.
