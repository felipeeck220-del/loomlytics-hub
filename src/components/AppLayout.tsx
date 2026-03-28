import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { LogOut, User, ChevronDown, Bell, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/components/ThemeProvider';
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
  const { theme, toggleTheme } = useTheme();
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
          <header className="h-14 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
            </div>

            <div className="flex items-center gap-2">
              {/* Shift + Date */}
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-medium text-xs px-2.5 py-0.5">
                  {SHIFT_DISPLAY[currentShift]}
                </Badge>
                <span className="text-muted-foreground text-xs">{formatDate(now)}</span>
              </div>

              <div className="h-5 w-px bg-border hidden sm:block" />

              {/* Theme Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                <Bell className="h-4 w-4" />
              </Button>

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 h-9 px-2 hover:bg-accent/50">
                    <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-primary" />
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
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
