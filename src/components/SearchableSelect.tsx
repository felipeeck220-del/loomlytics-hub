import { useState, useRef, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
  /** Custom filter function. Defaults to case-insensitive label match. */
  filterFn?: (option: SearchableSelectOption, search: string) => boolean;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  className,
  triggerClassName,
  filterFn,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when popover opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure the popover is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearch('');
    }
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label;

  const defaultFilter = (option: SearchableSelectOption, s: string) => {
    const lower = s.toLowerCase().trim();
    if (!lower) return true;
    const normalized = lower.replace(/[.,\s]/g, '');
    return (
      option.label.toLowerCase().includes(lower) ||
      option.label.toLowerCase().replace(/[.,\s]/g, '').includes(normalized)
    );
  };

  const filter = filterFn || defaultFilter;
  const filtered = options.filter(o => filter(o, search));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-9 w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            triggerClassName
          )}
        >
          <span className="truncate text-left">
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-[--radix-popover-trigger-width] p-0', className)}
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center border-b px-2 py-1.5">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 border-0 p-0 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          <div className="p-1">
            {filtered.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Nenhum resultado</p>
            )}
            {filtered.map(option => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  value === option.value && 'bg-accent text-accent-foreground'
                )}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
              >
                {value === option.value && (
                  <Check className="absolute left-2 h-3.5 w-3.5" />
                )}
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
