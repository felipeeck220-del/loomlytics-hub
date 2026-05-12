 # 🛡️ Padrão de Auditoria em Listagens
 
 Para manter a rastreabilidade em todo o sistema, sempre que houver uma coluna de **Data** em tabelas de listagem, deve-se adotar o seguinte modelo de auditoria visual:
 
 ## 📌 Regra Geral
 Abaixo da data de registro do item, exibir em tamanho reduzido as informações de quem realizou o cadastro.
 
 ## 🛠️ Implementação (Frontend)
 - **Data principal:** Formato `dd/mm/aaaa`.
 - **Audit Log:** Exibir o nome do usuário, o ID do registro (hash curto), a data e a hora exata do registro logo abaixo da data de competência.
 - **Estilo:** Utilizar texto menor (`text-[10px]` ou `text-xs`) e cor secundária (`text-muted-foreground`).
 
 ## 📋 Exemplo de Estrutura:
 ```tsx
 <TableCell className="py-2">
   <div className="flex flex-col">
     <span className="text-sm font-medium">{formatDate(item.date)}</span>
      <span className="text-[10px] text-muted-foreground leading-tight">
        {item.created_by_name} #{item.id.substring(0, 4)} - {formatDateTime(item.created_at)}
      </span>
   </div>
 </TableCell>
 ```
 
 Esta regra deve ser aplicada por padrão em todos os novos módulos que envolvam registros financeiros ou operacionais.