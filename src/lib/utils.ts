import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converte mensagens de erro do banco de dados em mensagens legíveis para o usuário.
 * Trata erros de foreign key constraint, RLS, e outros erros comuns.
 */
export function getFriendlyErrorMessage(errorMessage: string): string {
  // Foreign key constraint violations
  if (errorMessage.includes('violates foreign key constraint')) {
    // Extract table name from the error for context
    if (errorMessage.includes('invoice_items')) {
      return 'Este item não pode ser excluído porque está sendo usado em Notas Fiscais. Remova primeiro os itens de NF que o utilizam.';
    }
    if (errorMessage.includes('articles')) {
      return 'Este item não pode ser excluído porque está vinculado a Artigos cadastrados. Remova o vínculo nos artigos primeiro.';
    }
    if (errorMessage.includes('productions')) {
      return 'Este item não pode ser excluído porque está vinculado a registros de Produção.';
    }
    if (errorMessage.includes('outsource_productions')) {
      return 'Este item não pode ser excluído porque está vinculado a registros de Produção Terceirizada.';
    }
    if (errorMessage.includes('outsource_yarn_stock')) {
      return 'Este item não pode ser excluído porque está vinculado ao Estoque de Fio em Terceiros.';
    }
    if (errorMessage.includes('machines')) {
      return 'Este item não pode ser excluído porque está vinculado a Máquinas cadastradas.';
    }
    if (errorMessage.includes('defect_records')) {
      return 'Este item não pode ser excluído porque está vinculado a registros de Defeitos.';
    }
    if (errorMessage.includes('residue_sales')) {
      return 'Este item não pode ser excluído porque está vinculado a Vendas de Resíduos.';
    }
    // Generic FK message
    return 'Este item não pode ser excluído porque está sendo usado em outros registros do sistema. Remova os vínculos primeiro.';
  }

  // RLS violations
  if (errorMessage.includes('row-level security') || errorMessage.includes('new row violates')) {
    return 'Você não tem permissão para realizar esta ação.';
  }

  // Unique constraint
  if (errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
    return 'Já existe um registro com esses dados. Verifique e tente novamente.';
  }

  // Not null violation
  if (errorMessage.includes('not-null constraint') || errorMessage.includes('null value in column')) {
    return 'Preencha todos os campos obrigatórios antes de salvar.';
  }

  // Default: return original message
  return errorMessage;
}
