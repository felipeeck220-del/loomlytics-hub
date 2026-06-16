import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converte mensagens de erro do banco de dados em mensagens legíveis para o usuário.
 * Trata erros de foreign key constraint, RLS, e outros erros comuns.
 */
export function getFriendlyErrorMessage(errorMessage: unknown): string {
  // Coerce to a string safely — callers sometimes pass the raw error object.
  let msg: string;
  if (errorMessage == null) return 'Erro desconhecido.';
  if (typeof errorMessage === 'string') {
    msg = errorMessage;
  } else {
    const anyErr = errorMessage as any;
    msg = anyErr?.message || anyErr?.error_description || anyErr?.details || anyErr?.hint || String(errorMessage);
  }
  // Foreign key constraint violations
  if (msg.includes('violates foreign key constraint')) {
    // Insert/update failing because referenced row does not exist
    if (msg.includes('is not present in table')) {
      const tableMatch = msg.match(/is not present in table "([^"]+)"/);
      const tbl = tableMatch?.[1] ?? '';
      const map: Record<string, string> = {
        articles: 'Artigo selecionado não foi encontrado. Recarregue a página e tente novamente.',
        clients: 'Cliente selecionado não foi encontrado. Recarregue a página e tente novamente.',
        profiles: 'Seu perfil de usuário não foi localizado no sistema. Faça logout e entre novamente.',
        companies: 'Empresa não encontrada. Faça logout e entre novamente.',
        billing_orders: 'Ordem de fabricação vinculada não foi encontrada.',
      };
      return map[tbl] || `Registro vinculado não encontrado (${tbl || 'desconhecido'}). Recarregue a página e tente novamente.`;
    }
    // Extract table name from the error for context
    if (msg.includes('invoice_items')) {
      return 'Este item não pode ser excluído porque está sendo usado em Notas Fiscais. Remova primeiro os itens de NF que o utilizam.';
    }
    if (msg.includes('articles')) {
      return 'Este item não pode ser excluído porque está vinculado a Artigos cadastrados. Remova o vínculo nos artigos primeiro.';
    }
    if (msg.includes('productions')) {
      return 'Este item não pode ser excluído porque está vinculado a registros de Produção.';
    }
    if (msg.includes('outsource_productions')) {
      return 'Este item não pode ser excluído porque está vinculado a registros de Produção Terceirizada.';
    }
    if (msg.includes('outsource_yarn_stock')) {
      return 'Este item não pode ser excluído porque está vinculado ao Estoque de Fio em Terceiros.';
    }
    if (msg.includes('machines')) {
      return 'Este item não pode ser excluído porque está vinculado a Máquinas cadastradas.';
    }
    if (msg.includes('defect_records')) {
      return 'Este item não pode ser excluído porque está vinculado a registros de Defeitos.';
    }
    if (msg.includes('residue_sales')) {
      return 'Este item não pode ser excluído porque está vinculado a Vendas de Resíduos.';
    }
    // Generic FK message
    return 'Este item não pode ser excluído porque está sendo usado em outros registros do sistema. Remova os vínculos primeiro.';
  }

  // RLS violations
  if (msg.includes('row-level security') || msg.includes('new row violates')) {
    return 'Você não tem permissão para realizar esta ação.';
  }

  // Unique constraint
  if (msg.includes('unique constraint') || msg.includes('duplicate key')) {
    return 'Já existe um registro com esses dados. Verifique e tente novamente.';
  }

  // Not null violation
  if (msg.includes('not-null constraint') || msg.includes('null value in column')) {
    return 'Preencha todos os campos obrigatórios antes de salvar.';
  }

  // Default: return original message
  return msg;
}
