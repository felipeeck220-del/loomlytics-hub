import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface PaginatedTableProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  loading?: boolean;
  children: ReactNode;
}

export function PaginatedTable({
  page,
  total,
  pageSize,
  onPageChange,
  loading,
  children,
}: PaginatedTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[1px] rounded-lg">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        {children}
      </div>

      <div className="flex items-center justify-between px-2 py-4 border-t">
        <p className="text-sm text-muted-foreground">
          Mostrando {Math.min(total, page * pageSize + 1)} a{" "}
          {Math.min(total, (page + 1) * pageSize)} de {total} registros
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0 || loading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <div className="flex items-center gap-1 text-sm font-medium">
            <span className="px-2 py-1 bg-primary text-primary-foreground rounded-md">
              {page + 1}
            </span>
            <span className="text-muted-foreground">/</span>
            <span>{totalPages}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={(page + 1) >= totalPages || loading}
          >
            Próxima <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}