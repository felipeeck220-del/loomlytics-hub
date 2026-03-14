import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { LogOut, User, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMemo, useState, useEffect } from 'react';
import type { ShiftType } from '@/types';
import { Badge } from '@/components/ui/badge';

function getCurrentShift(): ShiftType {
  const now = new Date();
  const hours = now.getHours();
  if (hours >= 5 && hours < 13) return 'manha';
  if (hours >= 13 && hours < 22) return 'tarde';
  return 'noite';
}

const SHIFT_DISPLAY: Record<ShiftType, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const currentShift = useMemo(() => getCurrentShift(), [now]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
              <div className="h-4 w-px bg-border" />
              <span className="text-sm font-semibold text-foreground hidden sm:inline">
                Sistema de Gestão de Produção
              </span>
            </div>

            <div className="flex items-center gap-4">
              {/* User role */}
              <div className="hidden md:flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{user?.name}</span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-medium">
                  {user?.role === 'admin' ? 'Administrador' : user?.role}
                </Badge>
              </div>

              <div className="h-4 w-px bg-border hidden md:block" />

              {/* Current shift */}
              <div className="hidden sm:flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Turno Atual:</span>
                <span className="font-semibold text-foreground">{SHIFT_DISPLAY[currentShift]}</span>
              </div>

              <div className="h-4 w-px bg-border hidden sm:block" />

              {/* Date */}
              <span className="text-sm text-muted-foreground hidden sm:inline">{formatDate(now)}</span>

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 h-9 px-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.role}</p>
                    <p className="text-xs text-muted-foreground mt-1">{user?.company_name}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}