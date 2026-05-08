Standardize the display of registration metadata ("Registered by") across all modules to follow the pattern: `Registrado por: [Nome] Em: [Data] [Hora]`.

### Technical Details
- **Pattern:** `Registrado por: {name}{code ? ' #' + code : ''} Em: {format(date, 'dd/MM/yyyy HH:mm')}`
- **Files to modify:**
    - `src/pages/Revision.tsx`: Standardize the "Registrado por" table column.
    - `src/pages/ResidueSales.tsx`: Update the registration info in the "Data" column of the sales table.
    - `src/pages/Invoices.tsx`: Update the "Registrado por" column in the invoices table and the detail modal footer.
    - `src/pages/Production.tsx`: Update the registration info in the production list items and the detail card.
    - `src/pages/Outsource.tsx`: Standardize the registration metadata in the "Data" column of the productions table.
    - `docs/auditoria.md`: Update the "Regra de Exibição Obrigatória" section with the new standardized format.
    - `docs/mestre.md`: Update the change history.

### User Impact
- Consistency across all system modules regarding who registered a record and when.
- Inclusion of the "Em:" label with capital "E" as requested.
- Ensuring date and time are always visible where applicable.
