/**
 * Brazilian number formatting utilities
 */

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatWeight(value: number): string {
  return `${formatNumber(value, 1)} kg`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 2)}%`;
}
