# 📋 Plano de Correções e Melhorias Técnicas

Este diretório contém o plano detalhado para resolução dos 8 pontos de melhoria identificados na auditoria técnica do projeto Malhagest.

## Índice

| # | Documento | Prioridade | Esforço | Impacto |
|---|-----------|------------|---------|---------|
| 1 | [01-testes-automatizados.md](./01-testes-automatizados.md) | 🔴 Alta | 4h | Proteção financeira |
| 2 | [02-paginas-monoliticas.md](./02-paginas-monoliticas.md) | 🟡 Média | 12h | Manutenibilidade |
| 3 | [03-tipagem-supabase.md](./03-tipagem-supabase.md) | 🟡 Média | 3h | Qualidade de código |
| 4 | [04-react-query-cache.md](./04-react-query-cache.md) | 🟢 Baixa | 16h | Performance |
| 5 | [05-cors-edge-functions.md](./05-cors-edge-functions.md) | 🔴 Alta | 1h | Segurança |
| 6 | [06-tratamento-erros.md](./06-tratamento-erros.md) | 🔴 Alta | 3h | Confiabilidade |
| 7 | [07-pwa-offline.md](./07-pwa-offline.md) | 🟢 Baixa | 8h | UX em campo |
| 8 | [08-paginacao-server-side.md](./08-paginacao-server-side.md) | 🟢 Baixa | 10h | Escalabilidade |

## Ordem de Execução Recomendada

### Sprint 1 — Segurança e Confiabilidade (1 dia)
1. CORS restrito (#5)
2. ErrorBoundary + logging (#6)
3. Tipagem do Supabase (#3)

### Sprint 2 — Proteção de Dados (meio dia)
4. Testes das funções financeiras (#1)

### Sprint 3 — Refatoração Incremental (sob demanda)
5. Quebrar páginas monolíticas (#2) — fazer ao mexer em cada página

### Backlog (avaliar necessidade real)
6. PWA offline (#7) — só se houver demanda real do chão de fábrica
7. React Query (#4) — só se aparecer dor de performance
8. Paginação server-side (#8) — só quando volume passar de 50k registros

## Convenções

Cada documento segue a estrutura:
- **Diagnóstico**: o problema atual e onde está
- **Risco**: o que pode dar errado
- **Solução proposta**: passo-a-passo técnico
- **Arquivos afetados**: lista exaustiva
- **Critérios de aceite**: como saber que terminou
- **Rollback**: como desfazer se der ruim
