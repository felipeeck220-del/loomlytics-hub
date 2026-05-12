 # 🛡️ Padrão de Auditoria em Listagens
 
 Para manter a rastreabilidade em todo o sistema, sempre que houver uma coluna de **Data** em tabelas de listagem, deve-se adotar o seguinte modelo de auditoria visual:
 
 ## 📌 Regra Geral
 Abaixo da data de registro do item, exibir em tamanho reduzido as informações de quem realizou o cadastro.
 
 ## 🛠️ Implementação (Frontend)
 - **Data principal:** Formato `dd/mm/aaaa`.
 - **Audit Log:** Exibir `created_by_name` e `created_by_code` logo abaixo da data.
 - **Estilo:** Utilizar texto menor (`text-[10px]` ou `text-xs`) e cor secundária (`text-muted-foreground`).
 
 ## 📋 Exemplo de Estrutura:
 ```tsx
 <TableCell className="py-2">
   <div className="flex flex-col">
     <span className="text-sm font-medium">{formatDate(item.date)}</span>
     <span className="text-[10px] text-muted-foreground leading-tight">
       {item.created_by_name} (Cód: {item.created_by_code})
     </span>
   </div>
 </TableCell>
 ```
 
 Esta regra deve ser aplicada por padrão em todos os novos módulos que envolvam registros financeiros ou operacionais.