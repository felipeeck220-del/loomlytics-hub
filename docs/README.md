# 📚 Documentação MalhaGest — Índice Geral

> Esta pasta contém toda a documentação técnica e funcional do projeto MalhaGest.
> A **fonte de verdade** sobre o estado do sistema é o arquivo [`mestre.md`](./mestre.md).

---

## 🎯 Como usar

- **Para a IA (Lovable):** sempre leia [`mestre.md`](./mestre.md) **antes** de qualquer alteração e atualize seu histórico **após** entregar.
- **Para humanos:** comece pelo [`mestre.md`](./mestre.md) (visão geral, arquitetura, padrões globais) e depois consulte o doc específico do módulo que vai mexer.
- **Roadmap / planejamento:** ver pasta [`roadmap/`](./roadmap/) — funcionalidades projetadas mas ainda não implementadas.

---

## 🏷️ Legenda de Status

| Selo | Significado |
|------|-------------|
| ✅ **Produção** | Implementado, em uso real, estável |
| 🚧 **Em teste** | Implementado mas em validação (badge âmbar no sidebar) |
| 🔒 **Em breve** | Funcionalidade exibida no sidebar com cadeado, ainda bloqueada para o usuário final |
| 📋 **Planejado** | Apenas documentação — sem código no projeto ainda |
| 📐 **Padrão / Referência** | Doc de regras, padrões ou referência técnica (não é módulo) |

---

## 📖 Documentos por categoria

### 🌐 Documento mestre (sempre primeiro)

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`mestre.md`](./mestre.md) | 📐 Referência | **Fonte de verdade.** Arquitetura, modelo de dados, padrões globais, dependências entre módulos e histórico completo de alterações |

### 🎨 Padrões e referências transversais

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`design.md`](./design.md) | 📐 Referência | Tokens CSS, paleta de cores, tipografia, padrões de layout |
| [`auditoria.md`](./auditoria.md) | ✅ Produção | Sistema `audit_logs` + `useAuditLog`, regras obrigatórias para CRUD |
| [`botaorefresh.md`](./botaorefresh.md) | ✅ Produção | Botão refresh do header e indicador de conexão |
| [`edge-functions.md`](./edge-functions.md) | 📐 Referência | Visão geral das Edge Functions (Supabase/Deno) |
| [`ultramsg.md`](./ultramsg.md) | ✅ Produção | Engine de notificações WhatsApp (boas-vindas, vencimentos, Pix) |
| [`setup-novo-cliente.md`](./setup-novo-cliente.md) | 📐 Referência | Onboarding técnico de uma nova empresa-tenant |

### 🏭 Módulos operacionais — Produção e qualidade

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`dashboard.md`](./dashboard.md) | ✅ Produção | KPIs principais, gráficos, monitoramento de paradas |
| [`maquinas.md`](./maquinas.md) | ✅ Produção | Cadastro e gestão de teares, status, modos de produção |
| [`producao.md`](./producao.md) | ✅ Produção | Registro de produção por turno, modal sequencial inteligente |
| [`teceloes.md`](./teceloes.md) | ✅ Produção | Cadastro de tecelões, ranking, performance individual |
| [`falhas.md`](./falhas.md) | ✅ Produção | Aba "Falhas" no módulo de Tecelões — análise e exportação |
| [`weavers.md`](./weavers.md) | ✅ Produção | Visão completa do módulo Tecelões (cards, métricas, abas) |
| [`revisao.md`](./revisao.md) | ✅ Produção | Registro de defeitos, edição, filtros |
| [`mecanica.md`](./mecanica.md) | ✅ Produção | Manutenções preventivas, troca de agulheiro |
| [`relatorios.md`](./relatorios.md) | ✅ Produção | Relatórios analíticos e exportação PDF |
| [`reports.md`](./reports.md) | ✅ Produção | Detalhamento técnico do `Reports.tsx` |

### 👥 Cadastros e relacionamento

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`clientesartigos.md`](./clientesartigos.md) | ✅ Produção | CRUD de clientes e artigos (tecidos), vínculo com fios |
| [`terceirizado.md`](./terceirizado.md) | ✅ Produção | Gestão de malharias terceirizadas, produção externa, lucro |

### 💰 Financeiro

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`faturamentototal.md`](./faturamentototal.md) | ✅ Produção | Módulo `Faturamento Total` (admin only) — consolida receitas |
| [`fechamentomensal.md`](./fechamentomensal.md) | 🚧 Em teste | Relatório de fechamento mensal em PDF multi-página |
| [`ContasPagar.md`](./ContasPagar.md) | 🔒 Em breve | Contas a pagar com notificação WhatsApp (cadeado no sidebar) |
| [`Recycle.md`](./Recycle.md) | ✅ Produção | Vendas de resíduos centradas no cliente |

### 📄 Notas Fiscais e estoque

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`nf.md`](./nf.md) | ✅ Produção | Módulo Notas Fiscais — Entrada de Fio, Venda de Fio, Saída Malha |
| [`nftrama.md`](./nftrama.md) | 📐 Referência | Especificações específicas para a empresa Trama Certa |
| [`nfv2.md`](./nfv2.md) | 📋 Planejado | Próxima versão do módulo NF (refatoração) |
| [`saldofios.md`](./saldofios.md) | ✅ Produção | Saldo de fios por cliente |
| [`saldofiosglobal.md`](./saldofiosglobal.md) | ✅ Produção | Saldo global de fios consolidado |
| [`estoquemalhas.md`](./estoquemalhas.md) | ✅ Produção | Estoque de malha (Produzido − Entregue) |
| [`estoquefioterceiro.md`](./estoquefioterceiro.md) | ✅ Produção | Estoque de fio em malharias terceirizadas |

### 📡 IoT, TV e Hardware

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`iot.md`](./iot.md) | 🔒 Em breve | Hardware ESP32, firmware, esquema elétrico, custos (cadeado no sidebar) |
| [`iotTV.md`](./iotTV.md) | 📋 Planejado | Integração IoT × Modo TV |
| [`modotv.md`](./modotv.md) | ✅ Produção | Modo TV (`/tela`) — exibição industrial via código de pareamento |

### ⚙️ Configurações e administração

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`configuracoes.md`](./configuracoes.md) | ✅ Produção | Página de Configurações (perfil, usuários, empresa, planos) |
| [`settings.md`](./settings.md) | ✅ Produção | Detalhamento técnico do `Settings.tsx` |
| [`not.md`](./not.md) | ✅ Produção | Notificações de assinatura e ciclo de vida |

### 🚧 Roadmap (não implementado)

| Doc | Status | Descrição |
|-----|--------|-----------|
| [`roadmap/nuvemfiscal.md`](./roadmap/nuvemfiscal.md) | 📋 Planejado | Integração com a API Nuvem Fiscal para consulta automática de NF-e |

---

## 🔄 Convenções de manutenção

1. **Toda nova entrega** deve ser registrada no histórico do [`mestre.md`](./mestre.md) com data/hora em fuso Brasília.
2. **Toda nova funcionalidade significativa** deve ter seu próprio doc em `docs/` com selo de status no topo.
3. **Funcionalidades planejadas** (sem código) devem ficar em `docs/roadmap/` para evitar confusão com o que está live.
4. **Mudança de status** (ex: 🔒 Em breve → ✅ Produção): atualizar o selo no topo do doc **e** a linha correspondente neste índice.

---

*Última atualização do índice: 19/04/2026 (Brasília)*
