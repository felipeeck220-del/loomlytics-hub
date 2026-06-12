# 📄 Documentação Técnica: Módulo Ordem de Faturamento (OF)

Este documento detalha a implementação do sistema de criação e gestão de Ordens de Faturamento (OF), integrando o setor Administrativo e a Expedição (Malha).

---

## 🛠️ Arquitetura do Banco de Dados

### Tabela: `billing_orders` (Ordens de Faturamento)
Armazena os dados principais da OF e seu estado atual.

| Coluna | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `UUID` | Identificador único (Primary Key). |
| `company_id` | `UUID` | FK para a empresa (Multi-tenancy). |
| `of_number` | `TEXT` | Número da OF (ex: "600"). |
| `client_id` | `UUID` | FK para a tabela de clientes. |
| `article_id` | `UUID` | FK para a tabela de artigos (Malha). |
| `pieces_expected` | `INTEGER` | Quantidade de peças planejada. |
| `weight_expected` | `DECIMAL` | Peso estimado (opcional). |
| `machine_id` | `UUID` | FK para a tabela de máquinas (opcional). |
| `dyehouse` | `TEXT` | Tinturaria (ex: "LITORAL"). |
| `status` | `ENUM` | `open` (Aberto), `separating` (Em Separação), `ready` (Separada), `collected` (Coletada). |
| `pieces_real` | `INTEGER` | Quantidade de peças conferidas pela expedição. |
| `weight_real` | `DECIMAL` | Peso real em KG lançado pela expedição. |
| `weight_avg` | `DECIMAL` | Média calculada: `weight_real / pieces_real`. |
| `created_by` | `UUID` | FK para o perfil que criou (Auditoria). |
| `separated_by` | `UUID` | FK para o perfil que separou (Auditoria). |
| `collected_by` | `UUID` | FK para o perfil que marcou como coletada (Auditoria). |
| `created_at` | `TIMESTAMPTZ` | Data de criação. |
| `updated_at` | `TIMESTAMPTZ` | Data da última alteração. |

---

## 👮 Gestão de Perfis e Permissões

### Novo Perfil: `expedicao` (Expedição Malha)
Este perfil será criado para limitar o acesso dos usuários do setor de expedição.

1.  **Alteração em `usePermissions.ts`**:
    *   Adicionar `'expedicao'` ao tipo `AppRole`.
    *   Definir `ROLE_ALLOWED_KEYS` para expedição: `['of-open', 'of-ready', 'of-collected']`.
    *   Mapear rotas em `ROUTE_KEY_MAP`.

2.  **Visibilidade no Sidebar**:
    *   **Admin**: Vê a seção "Ordem de Faturamento (OF)" com todas as abas.
    *   **Expedição**: Vê apenas as abas relacionadas ao seu fluxo de trabalho.

---

## 💻 Interface e Fluxo (Frontend)

### Aba 1: Em Aberto (`open`)
*   **Admin**: Visualiza lista com fundo **vermelho claro** (`bg-red-50`). Botão para editar ou cancelar.
*   **Expedição**: Visualiza lista com botão **"Iniciar Separação"**. Ao clicar, o status muda para `separating`.

### Aba 2: Em Separação / Separada (`separating` / `ready`)
*   **Status `separating`**: Fundo **amarelo claro** (`bg-yellow-50`) para o Admin.
*   **Lançamento (Expedição)**: Botão "Lançar Dados" abre um modal para inserir:
    *   Quantidade Real de Peças.
    *   Peso Real (kg).
    *   Exibição em tempo real da Média (kg/peça).
*   **Envio**: Ao salvar, o status muda para `ready`.

### Aba 3: Coletada (`collected`)
*   Lista histórica de todas as OFs que já saíram da fábrica.
*   Botão "Marcar como Coletada" na aba de Separadas move o item para cá.

---

## 📋 Regras de Auditoria (Conforme `auditoria.md`)
Cada linha da tabela de listagem exibirá:
*   **Criação**: Nome do Admin #ID - Data/Hora.
*   **Separação**: Nome do Expedidor #ID - Data/Hora.
*   **Coleta**: Nome do Expedidor #ID - Data/Hora.

---

## 🔄 Ponto de Reversão (Caso de Erro)
Se a implementação apresentar bugs críticos ou instabilidade:

1.  **Banco de Dados**:
    ```sql
    DROP TABLE public.billing_orders;
    -- Remover o tipo enum se criado separadamente
    DROP TYPE billing_order_status;
    ```
2.  **Frontend**:
    *   Reverter `src/hooks/usePermissions.ts` para remover o perfil `expedicao`.
    *   Remover o arquivo `src/pages/BillingOrders.tsx`.
    *   Remover a rota em `src/App.tsx`.
3.  **Auditoria**:
    *   Verificar logs de sistema para garantir que nenhum registro órfão permaneça.

---

## 🚀 Próximos Passos
1. Criar a migração SQL para a nova tabela e permissões RLS.
2. Atualizar o sistema de tipos (`src/types/`).
3. Desenvolver a página `BillingOrders.tsx` com o sistema de abas e componentes `shadcn/ui`.
4. Integrar o Realtime do Supabase para atualizações instantâneas entre Admin e Expedição.
