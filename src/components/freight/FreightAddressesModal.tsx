import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, MapPin, Search, Loader2, Pencil, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { FreightAddress } from '@/hooks/useFreightOrders';

interface GeocodeResult {
  lat: number;
  lon: number;
  display_name: string;
}

async function geocode(query: string): Promise<GeocodeResult | null> {
  if (!query.trim()) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon), display_name: arr[0].display_name };
  } catch {
    return null;
  }
}

function mapEmbedUrl(lat: number, lon: number): string {
  const d = 0.005;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

interface AddressFormState {
  id?: string;
  name: string;
  full_address: string;
  latitude: number | null;
  longitude: number | null;
}

const emptyForm: AddressFormState = { name: '', full_address: '', latitude: null, longitude: null };

export function FreightAddressesModal({
  open, onOpenChange, addresses,
  onCreate, onUpdate, onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  addresses: FreightAddress[];
  onCreate: (p: { name: string; full_address: string; latitude?: number | null; longitude?: number | null }) => void;
  onUpdate: (p: { id: string; name?: string; full_address?: string; latitude?: number | null; longitude?: number | null; active?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState<AddressFormState>(emptyForm);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const { toast } = useToast();

  useEffect(() => { if (open) { setForm(emptyForm); setMode('create'); } }, [open]);

  const doSearch = async () => {
    if (!form.full_address.trim()) {
      toast({ title: 'Digite o endereço antes de buscar no mapa', variant: 'destructive' });
      return;
    }
    setSearching(true);
    const r = await geocode(form.full_address);
    setSearching(false);
    if (!r) {
      toast({ title: 'Endereço não encontrado no mapa', description: 'Tente ser mais específico (rua, nº, cidade).', variant: 'destructive' });
      return;
    }
    setForm(f => ({ ...f, latitude: r.lat, longitude: r.lon, full_address: r.display_name }));
  };

  const startEdit = (a: FreightAddress) => {
    setMode('edit');
    setForm({ id: a.id, name: a.name, full_address: a.full_address, latitude: a.latitude ?? null, longitude: a.longitude ?? null });
  };

  const cancelEdit = () => { setMode('create'); setForm(emptyForm); };

  const submit = () => {
    if (!form.name.trim()) { toast({ title: 'Informe o nome (ex: SANTEX)', variant: 'destructive' }); return; }
    if (!form.full_address.trim()) { toast({ title: 'Informe o endereço', variant: 'destructive' }); return; }
    if (form.latitude == null || form.longitude == null) {
      toast({ title: 'Confirme no mapa', description: 'Clique em "Buscar no mapa" para localizar o endereço antes de salvar.', variant: 'destructive' });
      return;
    }
    if (mode === 'edit' && form.id) {
      onUpdate({ id: form.id, name: form.name.trim(), full_address: form.full_address.trim(), latitude: form.latitude, longitude: form.longitude });
    } else {
      onCreate({ name: form.name.trim(), full_address: form.full_address.trim(), latitude: form.latitude, longitude: form.longitude });
    }
    setForm(emptyForm); setMode('create');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Endereços de Frete</DialogTitle></DialogHeader>

        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{mode === 'edit' ? 'Editar endereço' : 'Novo endereço'}</p>
            {mode === 'edit' && (
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancelar edição
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Apelido / Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: SANTEX" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Endereço completo *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.full_address}
                  onChange={e => setForm(f => ({ ...f, full_address: e.target.value, latitude: null, longitude: null }))}
                  placeholder="Rua, número, cidade, UF"
                />
                <Button type="button" variant="outline" size="sm" onClick={doSearch} disabled={searching}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-1 hidden sm:inline">Buscar no mapa</span>
                </Button>
              </div>
            </div>
          </div>

          {form.latitude != null && form.longitude != null ? (
            <div className="rounded-md border overflow-hidden">
              <iframe
                key={`${form.latitude}-${form.longitude}`}
                title="mapa"
                src={mapEmbedUrl(form.latitude, form.longitude)}
                className="w-full h-56 border-0"
                loading="lazy"
              />
              <div className="px-2 py-1 text-[11px] text-muted-foreground bg-muted/40 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Confirmado — {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              Digite o endereço e clique em <b>Buscar no mapa</b> para confirmar a localização.
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={submit}>
              <Plus className="h-4 w-4 mr-1.5" /> {mode === 'edit' ? 'Salvar alterações' : 'Adicionar endereço'}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {addresses.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum endereço cadastrado.</p>}
          {addresses.map(a => (
            <div key={a.id} className="flex items-start justify-between border rounded-lg p-2 gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">
                  {a.name}{!a.active && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}
                </p>
                <p className="text-xs text-muted-foreground break-words">{a.full_address}</p>
                {a.latitude != null && a.longitude != null && (
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{a.latitude.toFixed(5)}, {a.longitude.toFixed(5)}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => startEdit(a)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onUpdate({ id: a.id, active: !a.active })}>{a.active ? 'Desativar' : 'Ativar'}</Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Builds a Google Maps directions URL that Android/iOS open in the default map/GPS app (Google Maps, Waze fallback available via geo:). */
export function buildDirectionsUrl(
  pickup: { lat?: number | null; lon?: number | null; text?: string | null } | null,
  delivery: { lat?: number | null; lon?: number | null; text?: string | null } | null,
): string {
  const orig = pickup?.lat != null && pickup?.lon != null
    ? `${pickup.lat},${pickup.lon}`
    : (pickup?.text || '');
  const dest = delivery?.lat != null && delivery?.lon != null
    ? `${delivery.lat},${delivery.lon}`
    : (delivery?.text || '');
  const params = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (orig) params.set('origin', orig);
  if (dest) params.set('destination', dest);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}