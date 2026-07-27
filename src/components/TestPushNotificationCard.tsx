import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Bell } from 'lucide-react';
import { toast } from 'sonner';

type Source = 'OM' | 'OC' | 'OE' | 'OT';
type EventKind = 'created' | 'started' | 'finished' | 'cancelled' | 'escalated';
type Audience = 'self' | 'admins' | 'mecanicos' | 'eletricistas' | 'lideres' | 'todos_mecanica';

const SOURCE_LABEL: Record<Source, string> = {
  OM: 'OM — Ordem de Manutenção',
  OC: 'OC — Ordem Corretiva',
  OE: 'OE — Ordem Elétrica',
  OT: 'OT — Troca de Artigo',
};

const EVENT_LABEL: Record<EventKind, string> = {
  created: 'Nova ordem aberta',
  started: 'Ordem iniciada',
  finished: 'Ordem finalizada',
  cancelled: 'Ordem cancelada',
  escalated: 'OC escalonada para OE',
};

const AUDIENCE_LABEL: Record<Audience, string> = {
  self: 'Somente eu',
  admins: 'Administradores',
  mecanicos: 'Mecânicos',
  eletricistas: 'Eletricistas',
  lideres: 'Líderes (produção + noite + mecânica)',
  todos_mecanica: 'Todos da mecânica + admins',
};

function rolesFor(a: Audience): { roles: string[]; include_admins: boolean } {
  switch (a) {
    case 'admins': return { roles: [], include_admins: true };
    case 'mecanicos': return { roles: ['mecanico', 'lider_mecanica'], include_admins: false };
    case 'eletricistas': return { roles: ['eletricista'], include_admins: false };
    case 'lideres': return { roles: ['lider', 'lider_noite', 'lider_mecanica'], include_admins: false };
    case 'todos_mecanica': return { roles: ['mecanico', 'lider_mecanica', 'eletricista'], include_admins: true };
    case 'self':
    default: return { roles: [], include_admins: false };
  }
}

function defaultMessageFor(source: Source, event: EventKind): string {
  const base = SOURCE_LABEL[source].split(' — ')[0];
  const machine = 'TEAR 07';
  const author = 'João Silva #12';
  switch (event) {
    case 'created':
      return `Aberta por ${author} • ${machine} • Motivo: teste de disparo`;
    case 'started':
      return `Iniciada por ${author} • ${machine}`;
    case 'finished':
      return `Finalizada por ${author} • Duração 00:34:12 • 2 itens • ${machine}`;
    case 'cancelled':
      return `Cancelada por ${author} • ${machine} • Motivo: teste`;
    case 'escalated':
      return `Problema elétrico detectado • ${base} escalonada • ${machine}`;
    default:
      return 'Notificação de teste';
  }
}

function defaultTitleFor(source: Source, event: EventKind): string {
  const num = String(Math.floor(Math.random() * 899) + 100).padStart(3, '0');
  switch (event) {
    case 'created': return `[TESTE] Nova ${source} #${num} — TEAR 07`;
    case 'started': return `[TESTE] ${source} #${num} iniciada — TEAR 07`;
    case 'finished': return `[TESTE] ${source} #${num} finalizada — TEAR 07`;
    case 'cancelled': return `[TESTE] ${source} #${num} cancelada — TEAR 07`;
    case 'escalated': return `[TESTE] OC → OE #${num} escalonada`;
  }
}

export default function TestPushNotificationCard() {
  const { user } = useAuth();
  const [source, setSource] = useState<Source>('OM');
  const [event, setEvent] = useState<EventKind>('finished');
  const [audience, setAudience] = useState<Audience>('self');
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!user?.company_id) { toast.error('Sem empresa ativa'); return; }
    if (sending) return;
    setSending(true);
    try {
      const title = customTitle.trim() || defaultTitleFor(source, event);
      const message = customBody.trim() || defaultMessageFor(source, event);
      const audienceConf = rolesFor(audience);
      const body: Record<string, any> = {
        company_id: user.company_id,
        title,
        message,
        url: `/${(typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : '') || ''}`,
        source,
        ref_id: null,
        ref_number: `${source} #TESTE`,
        ...audienceConf,
      };
      if (audience === 'self') {
        body.target_user_ids = [user.id];
        body.allow_self = true;
      }
      const { data, error } = await supabase.functions.invoke('send-push-notification', { body });
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      const recipients = (data as any)?.recipients ?? 0;
      toast.success(`Enviado — ${sent} push(es) para ${recipients} usuário(s)`);
    } catch (err: any) {
      console.error('[test-push] failed', err);
      toast.error(`Falha ao enviar: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card-glass p-5 border-primary/10 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notificações de Teste</p>
      </div>
      <p className="text-sm text-muted-foreground -mt-1">
        Dispare uma notificação de teste para validar o Web Push (app instalado ou navegador). Use "Somente eu" para verificar seu próprio dispositivo antes de acionar toda a equipe.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de Ordem</Label>
          <Select value={source} onValueChange={(v) => setSource(v as Source)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SOURCE_LABEL) as Source[]).map(k => (
                <SelectItem key={k} value={k}>{SOURCE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de Notificação</Label>
          <Select value={event} onValueChange={(v) => setEvent(v as EventKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(EVENT_LABEL) as EventKind[])
                .filter(k => !(source !== 'OC' && k === 'escalated'))
                .map(k => (
                  <SelectItem key={k} value={k}>{EVENT_LABEL[k]}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Destinatários</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map(k => (
                <SelectItem key={k} value={k}>{AUDIENCE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Título (opcional — deixe vazio para usar padrão)</Label>
          <Input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={defaultTitleFor(source, event)}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Mensagem (opcional)</Label>
          <Textarea
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
            placeholder={defaultMessageFor(source, event)}
            rows={2}
            maxLength={240}
          />
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-primary font-semibold">Pré-visualização</p>
        <p className="text-sm font-semibold text-foreground">{customTitle.trim() || defaultTitleFor(source, event)}</p>
        <p className="text-xs text-muted-foreground">{customBody.trim() || defaultMessageFor(source, event)}</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={send} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
          Enviar teste
        </Button>
      </div>
    </div>
  );
}