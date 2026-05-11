O usuário relatou um problema onde as páginas do sidebar às vezes aparecem sem dados após o carregamento inicial, sendo necessário recarregar a página.

Após análise técnica, identifiquei que a aplicação utiliza um contexto global (`CompanyDataProvider`) que carrega todos os dados da empresa via o hook `useCompanyData`. 

**Causas Prováveis:**
1. **Estado Inicial Vazio:** As páginas (como Reports e Dashboard) usam os "getters" do contexto (ex: `getProductions()`). Se a página for renderizada antes do carregamento inicial terminar, ela recebe um array vazio. Algumas páginas possuem `useEffect` que dependem desses dados, mas podem não estar reagindo corretamente quando os dados finalmente chegam ou quando há mudança de filtros.
2. **Dependências em useEffect:** No arquivo `Reports.tsx`, o `useEffect` que calcula os KPIs depende de `productions.length === 0` para retornar antecipadamente, o que bloqueia o cálculo quando os dados chegam via background.
3. **Cache de Filtros:** Estados locais de filtros podem estar inconsistentes entre navegações.

**Plano de Ação:**

1. **Correção no useCompanyData.ts:**
   - Garantir que o estado `loading` seja atualizado corretamente.
   - Verificar se as referências retornadas por `getProductions`, `getMachines`, etc., são estáveis para não causar loops ou falhas de atualização.

2. **Ajustes nas Páginas (Dashboard, Reports, Production):**
   - Melhorar a lógica de "early return" nos `useEffect`. Em vez de `if (productions.length === 0) return;`, usar uma verificação mais robusta que permita o recálculo assim que os dados forem carregados.
   - Adicionar estados de carregamento visual específicos onde necessário.

3. **Padronização do Carregamento:**
   - Garantir que todas as páginas importantes esperem pelo `dbCompanyId` e pelo fim do `loading` do contexto global antes de tentar processar dados locais.

**Detalhes Técnicos:**

- **src/hooks/useCompanyData.ts:** Refinar o `useCallback` dos getters para garantir reatividade.
- **src/pages/Reports.tsx:** Alterar a condição `if (!dbCompanyId || productions.length === 0) return;` para permitir que o cálculo ocorra assim que `productions` tiver dados.
- **src/pages/Dashboard.tsx:** Revisar o `fetchDashboardMetrics` e as dependências dos `useMemo` para garantir que KPIs locais e da RPC sincronizem corretamente.
- **src/components/AppLayout.tsx:** O layout já bloqueia a renderização com `LoadingScreen` se `companyLoading` for verdadeiro, mas páginas individuais podem precisar de defesas extras caso o carregamento ocorra em background (refresh).

Este plano visa garantir que, uma vez que os dados cheguem ao contexto, todas as páginas inscritas neles se atualizem automaticamente sem necessidade de refresh manual.
