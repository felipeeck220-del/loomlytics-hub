import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Formats a raw numeric string (using dot as decimal separator) into Brazilian format.
 * e.g. "1234.5" → "1.234,5"   |   "1234" → "1.234"   |   "" → ""
 */
export function formatBrazilianNumber(raw: string): string {
  if (!raw) return '';

  // Split on the decimal point
  const parts = raw.split('.');
  let intPart = parts[0] || '';
  const decPart = parts.length > 1 ? parts[1] : null;

  // Add thousand separators (dots) to integer part
  if (intPart.length > 3) {
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  if (decPart !== null) {
    return `${intPart},${decPart}`;
  }
  return intPart;
}

/**
 * Parses a Brazilian-formatted string back to a raw numeric string with dot as decimal.
 * e.g. "1.234,5" → "1234.5"   |   "1.234" → "1234"   |   "," → "0."
 */
export function parseBrazilianNumber(formatted: string): string {
  if (!formatted) return '';
  // Remove thousand separators (dots)
  let raw = formatted.replace(/\./g, '');
  // Replace decimal comma with dot
  raw = raw.replace(',', '.');
  return raw;
}

interface BrazilianWeightInputProps {
  /** Raw numeric value with dot as decimal separator (e.g. "1234.5") */
  value: string;
  /** Called with raw numeric value (dot as decimal separator) */
  onChange: (rawValue: string) => void;
  className?: string;
  placeholder?: string;
}

export function BrazilianWeightInput({ value, onChange, className, placeholder = '0' }: BrazilianWeightInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatBrazilianNumber(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const isInternalChange = useRef(false);

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!isInternalChange.current) {
      setDisplayValue(formatBrazilianNumber(value));
    }
    isInternalChange.current = false;
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    let text = input.value;

    // Allow only digits, comma (decimal), and dots (thousands - will be re-formatted)
    text = text.replace(/[^\d.,]/g, '');

    // Ensure only one comma
    const commaIdx = text.indexOf(',');
    if (commaIdx !== -1) {
      const before = text.slice(0, commaIdx + 1);
      const after = text.slice(commaIdx + 1).replace(/,/g, '');
      // Limit decimal digits to 2
      text = before + after.slice(0, 2);
    }

    // Remove existing dots (thousands separators) to get clean number
    const withoutDots = text.replace(/\./g, '');

    // Split on comma
    const parts = withoutDots.split(',');
    let intPart = parts[0] || '';
    const decPart = parts.length > 1 ? parts[1] : null;

    // Remove leading zeros (but keep at least one digit)
    if (intPart.length > 1) {
      intPart = intPart.replace(/^0+/, '') || '0';
    }

    // Format integer part with thousand separators
    let formattedInt = intPart;
    if (intPart.length > 3) {
      formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    const formatted = decPart !== null ? `${formattedInt},${decPart}` : formattedInt;

    setDisplayValue(formatted);

    // Convert to raw numeric value with dot as decimal
    const rawValue = decPart !== null ? `${intPart}.${decPart}` : intPart;
    isInternalChange.current = true;
    onChange(rawValue);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Block invalid keys
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault();
    }
  }, []);

  return (
    <Input
      ref={inputRef}
      className={cn('h-8 text-xs', className)}
      inputMode="decimal"
      type="text"
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
    />
  );
}
