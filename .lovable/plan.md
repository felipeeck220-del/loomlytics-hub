text
The goal is to implement numerical pagination (1, 2, 3...) in the production listing within `src/pages/Production.tsx`, limiting the display to 10 records per page, similar to the logic used in the outsourced production module.

### Proposed Changes

#### 1. State and Logic in `Production.tsx`
- Add `currentPage` state initialized to 1.
- Define `pageSize = 10`.
- Implement a `useMemo` for `paginatedProductionGroups` that slices `shiftProductionGroups` based on `currentPage` and `pageSize`.
- Add a `useEffect` to reset `currentPage` to 1 whenever the `activeShift`, `filterDate`, `filterMachine`, `filterArticle`, or `searchQuery` changes, ensuring users start from the first page when their search criteria change.

#### 2. UI Implementation
- Replace the direct mapping of `shiftProductionGroups` with `paginatedProductionGroups`.
- Add a pagination control section below the list, including:
    - "Anterior" (Previous) button.
    - Numerical buttons (1, 2, 3...) for each page.
    - "Próximo" (Next) button.
- Apply consistent styling using shadcn/ui buttons.

#### 3. Documentation
- Update `docs/mestre.md` to reflect the implementation of numerical pagination in the production module.

### Technical Details
- **File:** `src/pages/Production.tsx`
- **Hook:** `useMemo` for slicing data.
- **State:** `useState` for `currentPage`.
- **Constraint:** Pagination must be per shift (since the list is inside shift tabs).
