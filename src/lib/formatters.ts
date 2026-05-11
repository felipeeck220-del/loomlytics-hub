/**
 * Brazilian number formatting utilities
 */

 export function formatNumber(value: number | undefined | null, decimals = 0): string {
   if (value === undefined || value === null || isNaN(value)) return '0';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

 export function formatCurrency(value: number | undefined | null): string {
   if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

 export function formatWeight(value: number | undefined | null): string {
  return `${formatNumber(value, 2)} kg`;
}

 export function formatPercent(value: number | undefined | null): string {
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