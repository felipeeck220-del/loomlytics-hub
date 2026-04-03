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

/** Returns min/max date strings (yyyy-MM-dd) for ±5 years from now */
export function getDateLimits(): { minDate: string; maxDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const minDate = `${y - 5}-01-01`;
  const maxDate = `${y + 5}-12-31`;
  return { minDate, maxDate };
}

/** Validates that a date string is within ±5 years */
export function isDateValid(dateStr: string): boolean {
  if (!dateStr) return false;
  const { minDate, maxDate } = getDateLimits();
  return dateStr >= minDate && dateStr <= maxDate;
}