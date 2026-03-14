import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { LogOut, User, ChevronDown, Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMemo, useState, useEffect } from 'react';
import type { ShiftType } from '@/types';

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
          <header className="h-16 bg-card/60 backdrop-blur-md flex items-center justify-between px-6 shrink-0 sticky top-0 z-10 border-b border-border/40">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
              <span className="text-sm font-medium text-foreground hidden md:inline">
                Sistema de Gestão de Produção
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Shift + Date */}
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-medium text-xs px-3 py-1">
                  {SHIFT_DISPLAY[currentShift]}
                </Badge>
                <span className="text-muted-foreground text-xs">{formatDate(now)}</span>
              </div>

              <div className="h-5 w-px bg-border hidden sm:block" />

              {/* Notifications placeholder */}
              <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                <Bell className="h-4 w-4" />
              </Button>

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 h-9 px-2 hover:bg-muted/50">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-left hidden md:block">
                      <p className="text-xs font-medium text-foreground leading-tight">{user?.name}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight capitalize">{user?.role}</p>
                    </div>
                    <ChevronDown className="h-3 w-3 text-muted-foreground hidden md:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{user?.company_name}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-5 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
