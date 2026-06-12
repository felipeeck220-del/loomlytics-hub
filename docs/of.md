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
    *   Definir `ROLE_ALLOWED_KEYS` para expedição: `['billing-orders']`.
    *   Mapear rotas em `ROUTE_KEY_MAP`.

2.  **Visibilidade no Sidebar**:
    *   **Admin**: Vê a seção "Ordem de Faturamento (OF)" com todas as abas.
    *   **Expedição**: Vê apenas as abas relacionadas ao seu fluxo de trabalho.

---

## 💻 Interface e Fluxo (Frontend)

### Aba 1: Aberto (`open`)
*   **Admin**: Visualiza lista com fundo **vermelho suave** (`bg-red-500/10`). Botão para editar ou cancelar.
*   **Expedição**: Visualiza lista com botão **"Iniciar Separação"**. Ao clicar, o status muda para `separating`.

### Aba 2: Separando (`separating`)
*   Fundo **amarelo suave** (`bg-yellow-500/20`).
*   **Lançamento (Expedição/Admin)**: Botão "Lançar Dados" abre um modal para inserir:
    *   Quantidade Real de Peças.
    *   Peso Real (kg).
    *   Exibição em tempo real da Média (kg/peça).
*   **Envio**: Ao salvar, o status muda para `ready`.

### Aba 3: Pronto (`ready`)
*   Fundo **verde suave** (`bg-green-500/20`).
*   Botão **"Marcar Coletada"**: Move a OF para o histórico de coletadas.

### Aba 4: Coletadas (`collected`)
*   Lista histórica com fundo **cinza suave** (`bg-slate-500/10`).
*   Exibe histórico completo de quem criou, separou e coletou.

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

## ✅ Status da Implementação (12/06/2026)
1. Tabela `billing_orders` criada e configurada com RLS.
2. Hook `useBillingOrders` implementado com dados reais do Supabase.
3. Página `BillingOrders.tsx` 100% funcional com fluxos de Admin e Expedição.
4. Perfil `expedicao` (Expedição Malha) adicionado às configurações de usuários e permissões.
5. Visibilidade do sidebar configurada para todos os perfis.
6. Sistema de auditoria (quem criou, separou e coletou) funcionando com base nos perfis reais.
