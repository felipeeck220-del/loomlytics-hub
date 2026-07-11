import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationsBadge } from '@/hooks/useNotificationsBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

type NotificationRow = {
  id: string;
  source: 'OM' | 'OC' | 'OT' | 'OFR';
  ref_id: string | null;
  ref_number: string | null;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

const SOURCE_STYLES: Record<NotificationRow['source'], string> = {
  OM: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  OC: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  OT: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  OFR: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
};

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const { unreadCount } = useNotificationsBadge();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications-list', user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data } = await (supabase.from as any)('notifications')
        .select('id, source, ref_id, ref_number, title, body, url, read_at, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data || []) as NotificationRow[];
    },
    staleTime: 10_000,
  });

  const items = useMemo(() => data || [], [data]);

  const openItem = async (n: NotificationRow) => {
    setOpen(false);
    if (!n.read_at) {
      try {
        await (supabase.from as any)('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', n.id);
        qc.invalidateQueries({ queryKey: ['notifications-unread-count', user?.id] });
        qc.invalidateQueries({ queryKey: ['notifications-list', user?.id] });
      } catch { /* silencioso */ }
    }
    if (n.url) navigate(n.url);
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    try {
      await (supabase.from as any)('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);
      qc.invalidateQueries({ queryKey: ['notifications-unread-count', user.id] });
      qc.invalidateQueries({ queryKey: ['notifications-list', user.id] });
    } catch { /* silencioso */ }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-semibold">Notificações</div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="h-[420px]">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Sem notificações</div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-accent/40 transition-colors ${!n.read_at ? 'bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 shrink-0 ${SOURCE_STYLES[n.source]}`}>
                        {n.source}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate ${!n.read_at ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                            {n.title}
                          </p>
                          {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        </div>
                        {n.body && <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}