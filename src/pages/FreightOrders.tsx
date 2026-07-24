import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSharedCompanyData } from "@/contexts/CompanyDataContext";
import {
  useFreightOrders,
  type FreightOrderStatus,
  type FreightOrder,
  type FreightOrderItem,
  type FreightAddress,
} from "@/hooks/useFreightOrders";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { generateFreightOrderPdf } from "@/lib/freightOrderPdf";
import { FreightReportsTab } from "@/components/freight/FreightReportsTab";
import { useMarkSourceAsRead } from "@/hooks/useMarkSourceAsRead";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { BrazilianWeightInput } from "@/components/BrazilianWeightInput";
import {
  Plus,
  Play,
  Truck,
  CheckCircle2,
  Download,
  Ban,
  X,
  Camera,
  Eye,
  Trash2,
  Users,
  Search,
  FileText,
  Building2,
  BarChart3,
  MapPin,
  ArrowRight,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  Pencil,
  AlertTriangle,
  Flame,
  Navigation,
  Map as MapIcon,
  PencilRuler,
  ShieldCheck,
  History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TabKey = "priority" | "open" | "in_progress" | "edit" | "completed" | "cancelled" | "reports";

const PRIORITY_REASONS = ["Coleta urgente", "Cliente aguardando", "Entrega urgente hoje"];

const STATUS_LABEL: Record<FreightOrderStatus, string> = {
  open: "Aberto",
  pickup_in_progress: "Frete em curso",
  delivery_in_progress: "Frete em curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

const getStatusStyle = (status: FreightOrderStatus) => {
  if (status === "open")
    return {
      stripe: "bg-sky-500",
      badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
      label: "ABERTO",
    };
  if (status === "pickup_in_progress" || status === "delivery_in_progress")
    return {
      stripe: "bg-amber-500",
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
      label: "FRETE EM CURSO",
    };
  if (status === "completed")
    return {
      stripe: "bg-emerald-600",
      badgeClass: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/40",
      label: "FINALIZADO",
    };
  return {
    stripe: "bg-zinc-500",
    badgeClass: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/40",
    label: "CANCELADO",
  };
};

const tabOfStatus = (s: FreightOrderStatus): TabKey => {
  if (s === "pickup_in_progress" || s === "delivery_in_progress") return "in_progress";
  if (s === "open") return "open";
  if (s === "completed") return "completed";
  return "cancelled";
};

function fmt(dt?: string | null): string {
  if (!dt) return "—";
  const d = new Date(dt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function elapsed(fromIso?: string | null): string {
  if (!fromIso) return "—";
  const ms = Date.now() - new Date(fromIso).getTime();
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function fmtMoney(n: number | null | undefined): string {
  return `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FreightOrders() {
  const { user } = useAuth();
  useMarkSourceAsRead("OFR");
  const { role } = usePermissions();
  const { getArticles, getYarnTypes } = useSharedCompanyData();
  const articles = getArticles();
  const yarnTypes = getYarnTypes();
  const { toast } = useToast();
  const {
    orders,
    isLoading,
    freighters,
    costCompanies,
    createOrder,
    updateOrder,
    startPickup,
    completeOrder,
    cancelOrder,
    setPriority,
    createFreighter,
    updateFreighter,
    deleteFreighter,
    createCostCompany,
    updateCostCompany,
    deleteCostCompany,
    addresses,
    createAddress,
    updateAddress,
    deleteAddress,
    getPhotoSignedUrl,
    authorizeEdit,
    revokeEditAuthorization,
    saveFreighterEdit,
  } = useFreightOrders();

  const hasFullAccess = role === "admin" || role === "lider_frete";
  const isFreteiro = role === "freteiro";
  const [tab, setTab] = useState<TabKey>("priority");
  const [searchTerm, setSearchTerm] = useState("");
  const [completedPage, setCompletedPage] = useState(0);
  const COMPLETED_PAGE_SIZE = 15;
  const [newOpen, setNewOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<FreightOrder | null>(null);
  const [freightersOpen, setFreightersOpen] = useState(false);
  const [costCompaniesOpen, setCostCompaniesOpen] = useState(false);
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [orderAddressesView, setOrderAddressesView] = useState<FreightOrder | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<FreightOrder | null>(null);
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [priorityOrder, setPriorityOrder] = useState<FreightOrder | null>(null);
  const [priorityReason, setPriorityReason] = useState<string>("");
  const [priorityCustom, setPriorityCustom] = useState<string>("");
  const [priorityObs, setPriorityObs] = useState<string>("");
  const [removePriorityOrder, setRemovePriorityOrder] = useState<FreightOrder | null>(null);
  const [authorizeEditOrder, setAuthorizeEditOrder] = useState<FreightOrder | null>(null);
  const [freighterEditOrder, setFreighterEditOrder] = useState<FreightOrder | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  useTicker(tab === "in_progress");

  useEffect(() => {
    if (!user?.company_id) return;
    (supabase.from as any)("companies")
      .select("name, logo_url")
      .eq("id", user.company_id)
      .maybeSingle()
      .then(({ data }: any) => {
        setCompanyName(data?.name || "");
        setCompanyLogo(data?.logo_url || null);
      });
  }, [user?.company_id]);

  // Freteiro só enxerga prioridade das próprias OFRs; admin/líder vê todas.
  const isPriorityVisibleFor = (o: FreightOrder) => {
    if (!o.priority || o.status !== "open") return false;
    if (hasFullAccess) return true;
    if (isFreteiro && o.freighter?.user_id && user?.id && o.freighter.user_id === user.id) return true;
    return false;
  };

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      priority: 0,
      open: 0,
      in_progress: 0,
      edit: 0,
      completed: 0,
      cancelled: 0,
      reports: 0,
    };
    for (const o of orders) {
      if (isPriorityVisibleFor(o)) {
        c.priority += 1;
        continue;
      }
      c[tabOfStatus(o.status)] += 1;
    }
    c.reports = orders.filter((o) => o.status === "completed").length;
    c.edit = orders.filter((o) => {
      if (!o.edit_authorized || o.status !== "completed") return false;
      if (hasFullAccess) return true;
      if (isFreteiro && o.freighter?.user_id && user?.id && o.freighter.user_id === user.id) return true;
      return false;
    }).length;
    return c;
  }, [orders, hasFullAccess, isFreteiro, user?.id]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      if (tab === "priority") {
        if (!isPriorityVisibleFor(o)) return false;
      } else if (tab === "open") {
        if (o.status !== "open") return false;
        if (isPriorityVisibleFor(o)) return false;
      } else if (tab === "edit") {
        if (o.status !== "completed" || !o.edit_authorized) return false;
        if (isFreteiro && !(o.freighter?.user_id && user?.id && o.freighter.user_id === user.id)) return false;
      } else if (tabOfStatus(o.status) !== tab) return false;
      if (!term) return true;
      const matches =
        o.ofr_number?.toLowerCase().includes(term) ||
        o.freighter?.name?.toLowerCase().includes(term) ||
        (o.cost_company_name || o.cost_company?.name || "").toLowerCase().includes(term) ||
        o.pickup_location?.toLowerCase().includes(term) ||
        o.delivery_location?.toLowerCase().includes(term) ||
        (o.delivery_doc_number || "").toLowerCase().includes(term) ||
        (o.items || []).some(
          (i) =>
            (i.article?.name || i.article_name || "").toLowerCase().includes(term) ||
            (i.yarn_type_name || "").toLowerCase().includes(term),
        );
      return matches;
    });
  }, [orders, tab, searchTerm, hasFullAccess, isFreteiro, user?.id]);

  useEffect(() => {
    setCompletedPage(0);
  }, [searchTerm, tab]);

  // Se a aba Prioritário ficar vazia e estivermos nela, voltar para "Aberto".
  useEffect(() => {
    if (tab === "priority" && !isLoading && counts.priority === 0) {
      setTab("open");
    }
  }, [tab, isLoading, counts.priority]);

  const completedTotal = tab === "completed" ? filtered.length : 0;
  const completedTotalPages = Math.max(1, Math.ceil(completedTotal / COMPLETED_PAGE_SIZE));
  const completedPageSafe = Math.min(completedPage, completedTotalPages - 1);
  const paginated = useMemo(() => {
    if (tab !== "completed") return filtered;
    const start = completedPageSafe * COMPLETED_PAGE_SIZE;
    return filtered.slice(start, start + COMPLETED_PAGE_SIZE);
  }, [tab, filtered, completedPageSafe]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ordem de Frete (OFR)</h1>
          <p className="text-muted-foreground text-sm">Coletas e entregas realizadas por freteiros</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasFullAccess && (
            <>
              <Button variant="outline" onClick={() => setFreightersOpen(true)} className="gap-2">
                <Users className="h-4 w-4" /> Freteiros
              </Button>
              <Button variant="outline" onClick={() => setCostCompaniesOpen(true)} className="gap-2">
                <Building2 className="h-4 w-4" /> Empresas
              </Button>
              <Button variant="outline" onClick={() => setAddressesOpen(true)} className="gap-2">
                <MapPin className="h-4 w-4" /> Endereços
              </Button>
              <Button onClick={() => setNewOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Nova OFR
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 bg-card p-3 rounded-lg border shadow-sm">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por OFR, freteiro, coleta, entrega, artigo, fio ou NF/ROM..."
          className="border-none shadow-none focus-visible:ring-0"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
        <TabsList className="flex flex-wrap h-auto p-1 bg-muted/50 gap-1 w-full lg:w-fit">
          <TabsTrigger
            value="priority"
            className={cn(
              "gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial",
              counts.priority > 0 && "data-[state=active]:bg-red-600 data-[state=active]:text-white text-red-600",
            )}
          >
            <Flame className="h-3.5 w-3.5" /> Aberto Prioritário
            {counts.priority > 0 && (
              <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">
                {counts.priority}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="open" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Aberto{" "}
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">
              {counts.open}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="in_progress"
            className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-amber-500 data-[state=active]:text-white"
          >
            Frete em curso{" "}
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">
              {counts.in_progress}
            </Badge>
          </TabsTrigger>
          {(counts.edit > 0 || tab === "edit") && (
            <TabsTrigger
              value="edit"
              className={cn(
                "gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial",
                counts.edit > 0 &&
                  "data-[state=active]:bg-amber-600 data-[state=active]:text-white text-amber-700 dark:text-amber-400",
              )}
            >
              <PencilRuler className="h-3.5 w-3.5" /> Editar
              {counts.edit > 0 && (
                <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">
                  {counts.edit}
                </Badge>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger
            value="completed"
            className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Finalizados
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial">
            Cancelados{" "}
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1 h-4">
              {counts.cancelled}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="reports"
            className="gap-1 py-2 text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
          >
            <BarChart3 className="h-3.5 w-3.5" /> Relatórios
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 space-y-3">
          {tab === "reports" ? (
            <FreightReportsTab
              orders={orders}
              hasFullAccess={hasFullAccess}
              isFreteiro={isFreteiro}
              companyName={companyName}
              companyLogoUrl={companyLogo}
              onOpenDetails={(o) => setDetailsOrder(o)}
            />
          ) : (
            <>
              {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
              {!isLoading && filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma OFR encontrada.</div>
              )}
              {paginated.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  hasFullAccess={hasFullAccess}
                  isFreteiro={isFreteiro}
                  onStartPickup={() => startPickup.mutate(order.id)}
                  onComplete={() => setCompleteOrderId(order.id)}
                  onCancel={() => setCancelOrderId(order.id)}
                  onEdit={() => setEditOrder(order)}
                  onDetails={() => setDetailsOrder(order)}
                  onDownload={() => generateFreightOrderPdf(order, companyName, companyLogo)}
                  onSetPriority={() => {
                    setPriorityReason("");
                    setPriorityCustom("");
                    setPriorityObs("");
                    setPriorityOrder(order);
                  }}
                  onRemovePriority={() => setRemovePriorityOrder(order)}
                  onOpenAddresses={() => setOrderAddressesView(order)}
                  onAuthorizeEdit={() => setAuthorizeEditOrder(order)}
                  onRevokeEditAuthorization={() => revokeEditAuthorization.mutate(order.id)}
                  onFreighterEdit={() => setFreighterEditOrder(order)}
                  currentUserId={user?.id}
                />
              ))}
              {tab === "completed" && completedTotal > COMPLETED_PAGE_SIZE && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground text-center sm:text-left">
                    Mostrando {completedPageSafe * COMPLETED_PAGE_SIZE + 1}–
                    {Math.min(completedTotal, (completedPageSafe + 1) * COMPLETED_PAGE_SIZE)} de {completedTotal}
                  </p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCompletedPage((p) => Math.max(0, p - 1))}
                      disabled={completedPageSafe === 0}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                    </Button>
                    <span className="text-xs font-medium">
                      <span className="px-2 py-1 bg-primary text-primary-foreground rounded-md">
                        {completedPageSafe + 1}
                      </span>
                      <span className="text-muted-foreground mx-1">/</span>
                      {completedTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCompletedPage((p) => Math.min(completedTotalPages - 1, p + 1))}
                      disabled={completedPageSafe >= completedTotalPages - 1}
                    >
                      Próxima <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Tabs>

      {hasFullAccess && (
        <NewOFRModal
          open={newOpen}
          onOpenChange={setNewOpen}
          freighters={freighters}
          costCompanies={costCompanies}
          addresses={addresses}
          articles={articles as any}
          yarnTypes={yarnTypes as any}
          onSubmit={(payload) => createOrder.mutate(payload, { onSuccess: () => setNewOpen(false) })}
          submitting={createOrder.isPending}
        />
      )}

      {hasFullAccess && (
        <NewOFRModal
          open={!!editOrder}
          onOpenChange={(o) => !o && setEditOrder(null)}
          freighters={freighters}
          costCompanies={costCompanies}
          addresses={addresses}
          articles={articles as any}
          yarnTypes={yarnTypes as any}
          mode="edit"
          initial={
            editOrder
              ? {
                  freighter_id: editOrder.freighter_id,
                  cost_company_id: editOrder.cost_company_id || "",
                  pickup_location: editOrder.pickup_location,
                  delivery_location: editOrder.delivery_location,
                  observations: editOrder.observations || "",
                  delivery_doc_type: editOrder.delivery_doc_type || null,
                  delivery_doc_number: editOrder.delivery_doc_number || "",
                  items: (editOrder.items || []).map((it) => ({
                    item_type: (it.item_type || "malha") as "malha" | "fio",
                    article_id: it.article_id || "",
                    yarn_type_id: it.yarn_type_id || "",
                    boxes: it.boxes != null ? String(it.boxes) : "",
                    pieces: Number(it.pieces || 0),
                    weight_kg: it.weight_kg != null ? String(it.weight_kg).replace(".", ",") : "",
                  })),
                }
              : undefined
          }
          onSubmit={(payload) => {
            if (!editOrder) return;
            updateOrder.mutate({ id: editOrder.id, ...payload }, { onSuccess: () => setEditOrder(null) });
          }}
          submitting={updateOrder.isPending}
        />
      )}

      {hasFullAccess && (
        <FreightersModal
          open={freightersOpen}
          onOpenChange={setFreightersOpen}
          freighters={freighters}
          onCreate={(p) => createFreighter.mutate(p)}
          onUpdate={(p) => updateFreighter.mutate(p)}
          onDelete={(id) => deleteFreighter.mutate(id)}
        />
      )}

      {hasFullAccess && (
        <CostCompaniesModal
          open={costCompaniesOpen}
          onOpenChange={setCostCompaniesOpen}
          costCompanies={costCompanies}
          onCreate={(p) => createCostCompany.mutate(p)}
          onUpdate={(p) => updateCostCompany.mutate(p)}
          onDelete={(id) => deleteCostCompany.mutate(id)}
        />
      )}

      {hasFullAccess && (
        <AddressesModal
          open={addressesOpen}
          onOpenChange={setAddressesOpen}
          addresses={addresses}
          onCreate={(p) => createAddress.mutate(p)}
          onUpdate={(p) => updateAddress.mutate(p)}
          onDelete={(id) => deleteAddress.mutate(id)}
        />
      )}

      <OrderAddressesModal order={orderAddressesView} onOpenChange={(o) => !o && setOrderAddressesView(null)} />

      <CompleteModal
        open={!!completeOrderId}
        order={orders.find((o) => o.id === completeOrderId) || null}
        onOpenChange={(o) => !o && setCompleteOrderId(null)}
        onSubmit={(payload) => {
          if (!completeOrderId) return;
          completeOrder.mutate(
            { id: completeOrderId, ...payload },
            {
              onSuccess: () => setCompleteOrderId(null),
            },
          );
        }}
        submitting={completeOrder.isPending}
      />

      <CancelModal
        open={!!cancelOrderId}
        onOpenChange={(o) => !o && setCancelOrderId(null)}
        onSubmit={(reason) => {
          if (!cancelOrderId) return;
          cancelOrder.mutate(
            { id: cancelOrderId, reason },
            {
              onSuccess: () => setCancelOrderId(null),
            },
          );
        }}
      />

      <DetailsModal
        order={detailsOrder}
        onOpenChange={(o) => !o && setDetailsOrder(null)}
        getPhotoSignedUrl={getPhotoSignedUrl}
      />

      {/* Modal Adicionar Prioridade */}
      <Dialog
        open={!!priorityOrder}
        onOpenChange={(o) => {
          if (!o) {
            setPriorityOrder(null);
            setPriorityReason("");
            setPriorityCustom("");
            setPriorityObs("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Adicionar Prioridade
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {priorityOrder && (
              <p className="text-sm text-muted-foreground">
                OFR <strong>#{priorityOrder.ofr_number}</strong> — {priorityOrder.freighter?.name || "Freteiro"}
              </p>
            )}
            <div className="space-y-2">
              <Label>Motivo da Prioridade</Label>
              <div className="grid grid-cols-1 gap-2">
                {PRIORITY_REASONS.map((r) => (
                  <Button
                    key={r}
                    variant={priorityReason === r ? "default" : "outline"}
                    className="justify-start font-normal"
                    onClick={() => {
                      setPriorityReason(r);
                      setPriorityCustom("");
                    }}
                  >
                    {r}
                  </Button>
                ))}
                <Button
                  variant={priorityReason === "custom" ? "default" : "outline"}
                  className="justify-start font-normal"
                  onClick={() => setPriorityReason("custom")}
                >
                  Outro motivo...
                </Button>
              </div>
            </div>
            {priorityReason === "custom" && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                <Label htmlFor="ofr-custom-reason">Especifique o motivo</Label>
                <Input
                  id="ofr-custom-reason"
                  placeholder="Digite o motivo personalizado..."
                  value={priorityCustom}
                  onChange={(e) => setPriorityCustom(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="ofr-priority-obs" className="text-red-600 font-semibold">
                Observação para o freteiro (opcional)
              </Label>
              <Textarea
                id="ofr-priority-obs"
                rows={3}
                placeholder="Ex: Cliente aguardando na portaria a partir das 8h..."
                value={priorityObs}
                onChange={(e) => setPriorityObs(e.target.value)}
                className="border-red-300 focus-visible:ring-red-500"
              />
              <p className="text-[11px] text-muted-foreground">
                Esta observação aparecerá em destaque para o freteiro no app e no celular.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPriorityOrder(null);
                setPriorityObs("");
              }}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={
                setPriority.isPending || !priorityReason || (priorityReason === "custom" && !priorityCustom.trim())
              }
              onClick={() => {
                if (!priorityOrder) return;
                const baseReason = priorityReason === "custom" ? priorityCustom.trim() : priorityReason;
                const obs = priorityObs.trim();
                const reason = obs ? `${baseReason}\n📝 Obs: ${obs}` : baseReason;
                setPriority.mutate(
                  { id: priorityOrder.id, priority: true, reason },
                  {
                    onSuccess: () => {
                      setPriorityOrder(null);
                      setPriorityObs("");
                      setTab("priority");
                    },
                  },
                );
              }}
            >
              Confirmar Prioridade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Remover Prioridade */}
      <Dialog open={!!removePriorityOrder} onOpenChange={(o) => !o && setRemovePriorityOrder(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <X className="h-5 w-5" /> Remover Prioridade
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Confirmar remoção da prioridade da OFR <strong>#{removePriorityOrder?.ofr_number}</strong>?
            {removePriorityOrder?.priority_reason && (
              <>
                {" "}
                <br />
                <span className="text-xs">Motivo atual: {removePriorityOrder.priority_reason}</span>
              </>
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovePriorityOrder(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={setPriority.isPending}
              onClick={() => {
                if (!removePriorityOrder) return;
                setPriority.mutate(
                  { id: removePriorityOrder.id, priority: false },
                  { onSuccess: () => setRemovePriorityOrder(null) },
                );
              }}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Autorizar edição */}
      <AuthorizeEditModal
        order={authorizeEditOrder}
        onOpenChange={(o) => !o && setAuthorizeEditOrder(null)}
        submitting={authorizeEdit.isPending}
        onSubmit={(reason) => {
          if (!authorizeEditOrder) return;
          authorizeEdit.mutate({ id: authorizeEditOrder.id, reason }, { onSuccess: () => setAuthorizeEditOrder(null) });
        }}
      />

      {/* Modal Edição do Freteiro */}
      <FreighterEditModal
        order={freighterEditOrder}
        onOpenChange={(o) => !o && setFreighterEditOrder(null)}
        submitting={saveFreighterEdit.isPending}
        getPhotoSignedUrl={getPhotoSignedUrl}
        onSubmit={(payload) => {
          if (!freighterEditOrder) return;
          saveFreighterEdit.mutate(
            { id: freighterEditOrder.id, ...payload },
            { onSuccess: () => setFreighterEditOrder(null) },
          );
        }}
      />
    </div>
  );
}

/* ---------------- Cards ---------------- */

function OrderCard({
  order,
  hasFullAccess,
  isFreteiro,
  onStartPickup,
  onComplete,
  onCancel,
  onEdit,
  onDetails,
  onDownload,
  onSetPriority,
  onRemovePriority,
  onOpenAddresses,
  onAuthorizeEdit,
  onRevokeEditAuthorization,
  onFreighterEdit,
  currentUserId,
}: {
  order: FreightOrder;
  hasFullAccess: boolean;
  isFreteiro: boolean;
  onStartPickup: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDetails: () => void;
  onDownload: () => void;
  onSetPriority?: () => void;
  onRemovePriority?: () => void;
  onOpenAddresses?: () => void;
  onAuthorizeEdit?: () => void;
  onRevokeEditAuthorization?: () => void;
  onFreighterEdit?: () => void;
  currentUserId?: string;
}) {
  const totalPieces = (order.items || []).reduce((s, i) => s + Number(i.pieces || 0), 0);
  const totalKg = (order.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
  const totalBoxes = (order.items || []).reduce((s, i) => s + Number(i.boxes || 0), 0);
  const hasFio = (order.items || []).some((i) => i.item_type === "fio");
  const hasMalha = (order.items || []).some((i) => i.item_type !== "fio");

  const timer =
    order.status === "pickup_in_progress" || order.status === "delivery_in_progress"
      ? elapsed(order.pickup_started_at || order.delivery_started_at)
      : null;

  const style = getStatusStyle(order.status);
  const isPriority = !!order.priority && order.status === "open";
  const isEditAuthorized = !!order.edit_authorized && order.status === "completed";
  const wasEdited = !!order.edited_at;
  const isOwnerFreighter =
    isFreteiro && !!order.freighter?.user_id && !!currentUserId && order.freighter.user_id === currentUserId;

  return (
    <Card
      className={cn(
        "relative overflow-hidden border bg-card hover:shadow-md transition-shadow",
        isPriority &&
          "border-red-500/70 shadow-[0_0_0_1px_rgb(239,68,68,0.35)] bg-gradient-to-br from-red-500/5 to-transparent",
      )}
    >
      <div className={cn("absolute left-0 top-0 bottom-0 w-2", isPriority ? "bg-red-600" : style.stripe)} />
      <CardContent className="p-3 pl-4 sm:p-4 sm:pl-5">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-xl sm:text-lg text-foreground tracking-tight">
                OFR #{order.ofr_number}
              </span>
              {timer && (
                <span className="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 font-mono text-xs sm:text-sm font-semibold text-primary tabular-nums">
                  ⏱ {timer}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {isPriority && (
                <Badge className="bg-red-600 text-white border-red-700 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 gap-1 animate-pulse">
                  <Flame className="h-3 w-3" /> PRIORIDADE
                </Badge>
              )}
              {isEditAuthorized && (
                <Badge className="bg-amber-600 text-white border-amber-700 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 gap-1">
                  <PencilRuler className="h-3 w-3" /> EDIÇÃO LIBERADA
                </Badge>
              )}
              {wasEdited && (
                <Badge
                  className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/60 font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 gap-1"
                  title={`Editada em ${fmt(order.edited_at)}${order.editor ? ` por ${order.editor.name} #${order.editor.code}` : ""}`}
                >
                  <History className="h-3 w-3" /> EDITADA
                </Badge>
              )}
              <Badge className={`${style.badgeClass} font-bold text-[10px] tracking-wide uppercase px-2 py-0.5 border`}>
                {style.label}
              </Badge>
              <Badge
                variant="outline"
                className="font-semibold uppercase text-[10px] border-foreground/20 text-foreground max-w-[60vw] truncate"
              >
                {order.freighter?.name || "—"}
              </Badge>
              {hasFio && (
                <Badge variant="outline" className="text-[10px] border-violet-500 text-violet-700 dark:text-violet-400">
                  CONTÉM FIO
                </Badge>
              )}
              {hasMalha && (
                <Badge variant="outline" className="text-[10px] border-sky-500 text-sky-700 dark:text-sky-400">
                  CONTÉM MALHA
                </Badge>
              )}
              {(order.cost_company_name || order.cost_company?.name) && (
                <Badge className="text-[10px] bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border border-indigo-600/40 gap-1 py-0 px-2 h-5 uppercase font-bold max-w-[60vw] truncate">
                  <Building2 className="h-3 w-3" />
                  Rateio: {order.cost_company_name || order.cost_company?.name}
                </Badge>
              )}
              {order.delivery_doc_number && (
                <Badge className="text-[10px] bg-emerald-600 text-white border-emerald-700 gap-1 py-0 px-2 h-5">
                  <FileText className="h-3 w-3" />
                  {order.delivery_doc_type === "rom" ? "ROM" : "NF"} {order.delivery_doc_number}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm rounded-md bg-muted/40 border border-border/60 p-2.5">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Coleta</div>
                <div className="font-semibold text-foreground break-words">{order.pickup_location}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Entrega</div>
                <div className="font-semibold text-foreground break-words">{order.delivery_location}</div>
              </div>
            </div>

            {isPriority && order.priority_reason && (
              <div className="rounded-md border-2 border-red-500/70 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200 whitespace-pre-wrap break-words">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300 mb-0.5">
                  <Flame className="h-3 w-3" /> Motivo da Prioridade
                </div>
                {order.priority_reason}
              </div>
            )}

            <div className="rounded-md border border-border/60 bg-muted/30 overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1 bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{(order.items || []).length} item(ns)</span>
                {totalPieces > 0 && <span>· {totalPieces} peça(s)</span>}
                {totalBoxes > 0 && <span>· {totalBoxes} caixa(s)</span>}
                <span>
                  · {totalKg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                </span>
                {order.freight_total != null && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    · Frete {fmtMoney(order.freight_total)}
                  </span>
                )}
              </div>
              {(order.items || []).length > 0 && (
                <ul className="divide-y divide-border/50">
                  {(order.items || []).slice(0, 4).map((it) => {
                    const isFio = it.item_type === "fio";
                    const name = isFio ? it.yarn_type_name || "Fio" : it.article?.name || it.article_name || "Artigo";
                    const kg = Number(it.weight_kg || 0).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });
                    return (
                      <li key={it.id} className="flex items-center gap-2 px-2.5 py-1 text-xs">
                        <span
                          className={cn(
                            "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                            isFio ? "bg-violet-500" : "bg-sky-500",
                          )}
                        />
                        <span className="font-medium text-foreground truncate">{name}</span>
                        <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                          {isFio ? `${it.boxes || 0} cx · ${kg} kg` : `${it.pieces} pçs · ${kg} kg`}
                        </span>
                      </li>
                    );
                  })}
                  {(order.items || []).length > 4 && (
                    <li className="px-2.5 py-1 text-[11px] text-muted-foreground italic">
                      + {(order.items || []).length - 4} outro(s) item(ns) — ver Detalhes
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-2 border-t border-border/50">
            {order.status === "open" && (isFreteiro || hasFullAccess) && (
              <Button
                onClick={onStartPickup}
                className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm font-semibold shadow-sm"
              >
                <Play className="h-5 w-5 sm:h-4 sm:w-4 mr-2 sm:mr-1.5" /> Iniciar Frete
              </Button>
            )}
            {(order.status === "pickup_in_progress" || order.status === "delivery_in_progress") &&
              (isFreteiro || hasFullAccess) && (
                <Button
                  onClick={onComplete}
                  className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm font-semibold shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4 mr-2 sm:mr-1.5" /> Finalizar Entrega
                </Button>
              )}
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <Button variant="outline" size="sm" onClick={onDetails} className="h-10">
                <Eye className="h-4 w-4 mr-1.5" /> Detalhes
              </Button>
              {onOpenAddresses && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenAddresses}
                  className="h-10 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Navigation className="h-4 w-4 mr-1.5" /> Endereços
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onDownload} className="h-10">
                <Download className="h-4 w-4 mr-1.5" /> PDF
              </Button>
              {order.status === "open" && hasFullAccess && (
                <Button variant="outline" size="sm" onClick={onEdit} className="h-10">
                  <Pencil className="h-4 w-4 mr-1.5" /> Editar
                </Button>
              )}
              {(order.status === "pickup_in_progress" || order.status === "delivery_in_progress") && hasFullAccess && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="h-10 border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                  title="Editar OFR — retorna para Aberto"
                >
                  <Pencil className="h-4 w-4 mr-1.5" /> Editar
                </Button>
              )}
              {order.status === "open" && hasFullAccess && !isPriority && onSetPriority && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSetPriority}
                  className="h-10 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Flame className="h-4 w-4 mr-1.5" /> Prioridade
                </Button>
              )}
              {order.status === "open" && hasFullAccess && isPriority && onRemovePriority && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRemovePriority}
                  className="h-10 border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <X className="h-4 w-4 mr-1.5" /> Remover Prioridade
                </Button>
              )}
              {order.status === "completed" && hasFullAccess && !isEditAuthorized && onAuthorizeEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAuthorizeEdit}
                  className="h-10 border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                >
                  <ShieldCheck className="h-4 w-4 mr-1.5" /> Aut. edição
                </Button>
              )}
              {order.status === "completed" && hasFullAccess && isEditAuthorized && onRevokeEditAuthorization && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRevokeEditAuthorization}
                  className="h-10 border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                >
                  <X className="h-4 w-4 mr-1.5" /> Revogar autorização
                </Button>
              )}
              {order.status === "completed" &&
                isEditAuthorized &&
                (isOwnerFreighter || hasFullAccess) &&
                onFreighterEdit && (
                  <Button
                    onClick={onFreighterEdit}
                    className="w-full sm:w-auto h-12 sm:h-10 text-base sm:text-sm font-semibold shadow-sm bg-amber-600 hover:bg-amber-700 text-white col-span-2 sm:col-span-1"
                  >
                    <PencilRuler className="h-5 w-5 sm:h-4 sm:w-4 mr-2 sm:mr-1.5" /> Editar OFR
                  </Button>
                )}
              {hasFullAccess && order.status !== "completed" && order.status !== "cancelled" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  className="h-10 text-destructive col-span-2 sm:ml-auto"
                >
                  <Ban className="h-4 w-4 mr-1.5" /> Cancelar
                </Button>
              )}
            </div>
          </div>
        </div>

        {order.status === "cancelled" && order.cancellation_reason && (
          <p className="text-xs text-destructive mt-2">Motivo do cancelamento: {order.cancellation_reason}</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Modals ---------------- */

function NewOFRModal({
  open,
  onOpenChange,
  freighters,
  costCompanies,
  addresses,
  articles,
  yarnTypes,
  onSubmit,
  submitting,
  mode = "create",
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  freighters: Array<{ id: string; name: string; active: boolean }>;
  costCompanies: Array<{ id: string; name: string; active: boolean }>;
  addresses: Array<{ id: string; name: string; full_address: string; active: boolean }>;
  articles: Array<{ id: string; name: string; client_name?: string }>;
  yarnTypes: Array<{ id: string; name: string }>;
  onSubmit: (p: {
    freighter_id: string;
    cost_company_id: string;
    pickup_location: string;
    delivery_location: string;
    observations?: string;
    delivery_doc_type?: "nf" | "rom" | null;
    delivery_doc_number?: string | null;
    items: Array<{
      item_type: "malha" | "fio";
      article_id?: string | null;
      article_name?: string | null;
      yarn_type_id?: string | null;
      yarn_type_name?: string | null;
      boxes?: number | null;
      pieces: number;
      weight_kg: number;
    }>;
  }) => void;
  submitting: boolean;
  mode?: "create" | "edit";
  initial?: {
    freighter_id: string;
    cost_company_id: string;
    pickup_location: string;
    delivery_location: string;
    observations?: string | null;
    delivery_doc_type?: "nf" | "rom" | null;
    delivery_doc_number?: string | null;
    items: Array<{
      item_type: "malha" | "fio";
      article_id: string;
      yarn_type_id: string;
      boxes: string;
      pieces: number;
      weight_kg: string;
    }>;
  };
}) {
  const [freighterId, setFreighterId] = useState("");
  const [costCompanyId, setCostCompanyId] = useState("");
  const [pickup, setPickup] = useState("");
  const [delivery, setDelivery] = useState("");
  const [obs, setObs] = useState("");
  const [docType, setDocType] = useState<"nf" | "rom" | "">("");
  const [docNumber, setDocNumber] = useState("");
  const [items, setItems] = useState<
    Array<{
      item_type: "malha" | "fio";
      article_id: string;
      yarn_type_id: string;
      boxes: string;
      pieces: number;
      weight_kg: string;
    }>
  >([{ item_type: "malha", article_id: "", yarn_type_id: "", boxes: "", pieces: 0, weight_kg: "" }]);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      if (mode === "edit" && initial) {
        setFreighterId(initial.freighter_id || "");
        setCostCompanyId(initial.cost_company_id || "");
        setPickup(initial.pickup_location || "");
        setDelivery(initial.delivery_location || "");
        setObs(initial.observations || "");
        setDocType((initial.delivery_doc_type as any) || "");
        setDocNumber(initial.delivery_doc_number || "");
        setItems(
          initial.items?.length
            ? initial.items.map((i) => ({ ...i }))
            : [{ item_type: "malha", article_id: "", yarn_type_id: "", boxes: "", pieces: 0, weight_kg: "" }],
        );
      } else {
        setFreighterId("");
        setCostCompanyId("");
        setPickup("");
        setDelivery("");
        setObs("");
        setDocType("");
        setDocNumber("");
        setItems([{ item_type: "malha", article_id: "", yarn_type_id: "", boxes: "", pieces: 0, weight_kg: "" }]);
      }
    }
  }, [open, mode, initial]);

  const submit = () => {
    if (!freighterId) return toast({ title: "Selecione o freteiro", variant: "destructive" });
    if (!costCompanyId) return toast({ title: "Selecione a empresa (Rateio de custo)", variant: "destructive" });
    if (!pickup.trim() || !delivery.trim())
      return toast({ title: "Preencha coleta e entrega", variant: "destructive" });
    const cleaned = items
      .map((i) => ({
        ...i,
        weight_num: parseFloat((i.weight_kg || "0").toString().replace(",", ".")) || 0,
        boxes_num: parseInt(i.boxes || "0", 10) || 0,
      }))
      .filter((i) => {
        if (i.item_type === "fio") return i.yarn_type_id && (i.boxes_num > 0 || i.weight_num > 0);
        return i.article_id && (i.pieces > 0 || i.weight_num > 0);
      });
    if (!cleaned.length) return toast({ title: "Adicione pelo menos 1 artigo", variant: "destructive" });
    onSubmit({
      freighter_id: freighterId,
      cost_company_id: costCompanyId,
      pickup_location: pickup.trim(),
      delivery_location: delivery.trim(),
      observations: obs.trim() || undefined,
      delivery_doc_type: docType || null,
      delivery_doc_number: docNumber.trim() || null,
      items: cleaned.map((i) => {
        if (i.item_type === "fio") {
          const yt = yarnTypes.find((y) => y.id === i.yarn_type_id);
          return {
            item_type: "fio" as const,
            yarn_type_id: i.yarn_type_id,
            yarn_type_name: yt?.name || null,
            boxes: i.boxes_num,
            pieces: 0,
            weight_kg: i.weight_num,
          };
        }
        const art = articles.find((a) => a.id === i.article_id);
        return {
          item_type: "malha" as const,
          article_id: i.article_id,
          article_name: art?.name || null,
          pieces: i.pieces,
          weight_kg: i.weight_num,
        };
      }),
    });
  };

  const artOptions = articles.map((a) => ({
    value: a.id,
    label: `${a.name}${(a as any).client_name ? ` (${(a as any).client_name})` : ""}`,
  }));
  const yarnOptions = yarnTypes.map((y) => ({ value: y.id, label: y.name }));
  const freighterOptions = freighters.filter((f) => f.active).map((f) => ({ value: f.id, label: f.name }));
  const costCompanyOptions = costCompanies.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Editar Ordem de Frete" : "Nova Ordem de Frete"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Freteiro *</Label>
              <SearchableSelect
                value={freighterId}
                onValueChange={setFreighterId}
                options={freighterOptions}
                placeholder="Selecione o freteiro"
              />
            </div>
            <div>
              <Label>Empresa (Rateio de custo) *</Label>
              <SearchableSelect
                value={costCompanyId}
                onValueChange={setCostCompanyId}
                options={costCompanyOptions}
                placeholder={costCompanyOptions.length === 0 ? "Cadastre em Empresas" : "Selecione a empresa"}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Local de coleta *</Label>
              {addresses.filter((a) => a.active).length > 0 && (
                <SearchableSelect
                  value=""
                  onValueChange={(id) => {
                    const a = addresses.find((x) => x.id === id);
                    if (a) setPickup(`${a.name} — ${a.full_address}`);
                  }}
                  options={addresses
                    .filter((a) => a.active)
                    .map((a) => ({ value: a.id, label: `${a.name} — ${a.full_address}` }))}
                  placeholder="Selecionar endereço cadastrado..."
                />
              )}
              <Input
                className="mt-2"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                placeholder="Ou digite manualmente"
              />
            </div>
            <div>
              <Label>Local de entrega *</Label>
              {addresses.filter((a) => a.active).length > 0 && (
                <SearchableSelect
                  value=""
                  onValueChange={(id) => {
                    const a = addresses.find((x) => x.id === id);
                    if (a) setDelivery(`${a.name} — ${a.full_address}`);
                  }}
                  options={addresses
                    .filter((a) => a.active)
                    .map((a) => ({ value: a.id, label: `${a.name} — ${a.full_address}` }))}
                  placeholder="Selecionar endereço cadastrado..."
                />
              )}
              <Input
                className="mt-2"
                value={delivery}
                onChange={(e) => setDelivery(e.target.value)}
                placeholder="Ou digite manualmente"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Documento (opcional)</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="NF ou Romaneio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nf">NF</SelectItem>
                  <SelectItem value="rom">Romaneio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Nº NF/ROM</Label>
              <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="Ex: 12345" />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Itens *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItems([
                    ...items,
                    { item_type: "malha", article_id: "", yarn_type_id: "", boxes: "", pieces: 0, weight_kg: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="border rounded-lg p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Tipo:</Label>
                    <Select
                      value={it.item_type}
                      onValueChange={(v) =>
                        setItems(items.map((x, i) => (i === idx ? { ...x, item_type: v as any } : x)))
                      }
                    >
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="malha">Malha</SelectItem>
                        <SelectItem value="fio">Fio</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto text-destructive"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {it.item_type === "malha" ? (
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 sm:col-span-7">
                        <Label className="text-xs">Artigo</Label>
                        <SearchableSelect
                          value={it.article_id}
                          onValueChange={(v) =>
                            setItems(items.map((x, i) => (i === idx ? { ...x, article_id: v } : x)))
                          }
                          options={artOptions}
                          placeholder="Selecione"
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-2">
                        <Label className="text-xs">Peças</Label>
                        <Input
                          type="number"
                          min={0}
                          value={it.pieces || ""}
                          onChange={(e) =>
                            setItems(
                              items.map((x, i) =>
                                i === idx ? { ...x, pieces: parseInt(e.target.value || "0", 10) } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <Label className="text-xs">Peso (kg)</Label>
                        <BrazilianWeightInput
                          value={it.weight_kg}
                          onChange={(v) => setItems(items.map((x, i) => (i === idx ? { ...x, weight_kg: v } : x)))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 sm:col-span-6">
                        <Label className="text-xs">Tipo de fio</Label>
                        <SearchableSelect
                          value={it.yarn_type_id}
                          onValueChange={(v) =>
                            setItems(items.map((x, i) => (i === idx ? { ...x, yarn_type_id: v } : x)))
                          }
                          options={yarnOptions}
                          placeholder="Selecione o fio"
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <Label className="text-xs">Caixas</Label>
                        <Input
                          type="number"
                          min={0}
                          value={it.boxes}
                          onChange={(e) =>
                            setItems(items.map((x, i) => (i === idx ? { ...x, boxes: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="col-span-6 sm:col-span-3">
                        <Label className="text-xs">Peso (kg)</Label>
                        <BrazilianWeightInput
                          value={it.weight_kg}
                          onChange={(v) => setItems(items.map((x, i) => (i === idx ? { ...x, weight_kg: v } : x)))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Salvando…" : mode === "edit" ? "Salvar alterações" : "Criar OFR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreightersModal({
  open,
  onOpenChange,
  freighters,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  freighters: any[];
  onCreate: (p: { name: string; phone?: string; vehicle?: string; user_id?: string; profile_id?: string }) => void;
  onUpdate: (p: {
    id: string;
    name?: string;
    phone?: string;
    vehicle?: string;
    active?: boolean;
    user_id?: string | null;
    profile_id?: string | null;
  }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState<
    Array<{ user_id: string; id: string; name: string; email: string; role: string }>
  >([]);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !user?.company_id) return;
    (supabase.from as any)("profiles")
      .select("id, user_id, name, email, role")
      .eq("company_id", user.company_id)
      .eq("role", "freteiro")
      .then(({ data }: any) => setProfiles(data || []));
  }, [open, user?.company_id]);

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({
        title: "Vincule um usuário freteiro",
        description: 'Cadastre um usuário com perfil "Freteiro" em Configurações e selecione-o aqui.',
        variant: "destructive",
      });
      return;
    }
    const prof = profiles.find((p) => p.user_id === userId);
    if (!prof) {
      toast({ title: "Usuário inválido", variant: "destructive" });
      return;
    }
    onCreate({
      name: name.trim(),
      phone: phone.trim() || undefined,
      vehicle: vehicle.trim() || undefined,
      user_id: userId,
      profile_id: prof.id,
    });
    setName("");
    setPhone("");
    setVehicle("");
    setUserId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Freteiros cadastrados</DialogTitle>
        </DialogHeader>

        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <p className="text-sm font-medium">Novo freteiro</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Veículo</Label>
              <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Vincular usuário (freteiro) *</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum (só cadastro)" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Cadastre um usuário com perfil "Freteiro" em Configurações.
                    </div>
                  )}
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.name} ({p.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {profiles.length > 0 && !userId && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Selecione um usuário com perfil <b>Freteiro</b> para vincular ao cadastro (obrigatório).
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!name.trim() || !userId}>
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {freighters.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum freteiro cadastrado.</p>
          )}
          {freighters.map((f) => (
            <div key={f.id} className="flex items-center justify-between border rounded-lg p-2 gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {f.name}
                  {!f.active && <span className="ml-2 text-xs text-muted-foreground">(inativo)</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {[f.phone, f.vehicle].filter(Boolean).join(" · ") || "—"}
                  {f.user_id ? " · com login" : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => onUpdate({ id: f.id, active: !f.active })}>
                  {f.active ? "Desativar" : "Ativar"}
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(f.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompleteModal({
  open,
  order,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  open: boolean;
  order: FreightOrder | null;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    photos: Array<{ file: File; description?: string }>;
    freight_price_per_kg?: number | null;
    freight_total?: number | null;
  }) => void;
  submitting: boolean;
}) {
  const [photos, setPhotos] = useState<Array<{ file: File; description: string; preview: string }>>([]);
  const [priceStr, setPriceStr] = useState("");
  const [priceMode, setPriceMode] = useState<"per_kg" | "fixed">("per_kg");
  const [totalStr, setTotalStr] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setPhotos([]);
      setPriceStr("");
      setTotalStr("");
      setPriceMode("per_kg");
    }
  }, [open, order?.id]);

  // Revoga object URLs somente ao desmontar o modal (não a cada mudança de photos,
  // senão o preview da foto anterior é revogado ao adicionar a próxima).
  const photosRef = React.useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => {
        try {
          URL.revokeObjectURL(p.preview);
        } catch {
          /* noop */
        }
      });
    };
  }, []);

  const totalKg = (order?.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
  const priceNumInput = parseFloat(priceStr.replace(",", ".")) || 0;
  const totalNumInput = parseFloat(totalStr.replace(",", ".")) || 0;
  const priceNum =
    priceMode === "per_kg"
      ? priceNumInput
      : totalKg > 0 && totalNumInput > 0
        ? Math.round((totalNumInput / totalKg) * 10000) / 10000
        : 0;
  const freightTotal = priceMode === "per_kg" ? totalKg * priceNumInput : totalNumInput;

  const onFile = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= 2) break;
      next.push({ file: f, description: "", preview: URL.createObjectURL(f) });
    }
    setPhotos(next);
  };

  const submit = () => {
    if (photos.length === 0) return toast({ title: "Anexe ao menos 1 foto", variant: "destructive" });
    if (priceMode === "per_kg" && priceNumInput <= 0) {
      return toast({ title: "Informe o valor por kg", variant: "destructive" });
    }
    if (priceMode === "fixed" && totalNumInput <= 0) {
      return toast({ title: "Informe o valor fixo do frete", variant: "destructive" });
    }
    if (priceMode === "fixed" && totalKg <= 0) {
      return toast({ title: "Sem peso total na OFR — não é possível calcular o valor por kg", variant: "destructive" });
    }
    onSubmit({
      photos: photos.map((p) => ({ file: p.file, description: p.description })),
      freight_price_per_kg: priceNum > 0 ? priceNum : null,
      freight_total: priceMode === "fixed" ? totalNumInput : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="p-0 gap-0 w-screen h-screen max-w-none sm:max-w-none sm:rounded-none flex flex-col"
        style={{ width: "100vw", height: "100vh" }}
      >
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle>Finalizar Entrega{order ? ` — OFR #${order.ofr_number}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <Label className="text-[10px] uppercase text-muted-foreground">
              Documento (definido na criação da OFR)
            </Label>
            <div className="mt-1 font-semibold text-sm text-foreground">
              {order?.delivery_doc_type ? (
                `${order.delivery_doc_type === "rom" ? "Romaneio" : "NF"}${order.delivery_doc_number ? ` ${order.delivery_doc_number}` : ""}`
              ) : (
                <span className="text-muted-foreground italic font-normal">Sem documento vinculado</span>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Modo de cobrança</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={priceMode === "per_kg" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPriceMode("per_kg")}
                >
                  Valor por kg
                </Button>
                <Button
                  type="button"
                  variant={priceMode === "fixed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPriceMode("fixed")}
                >
                  Valor fixo
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              {priceMode === "per_kg" ? (
                <div>
                  <Label>Valor por kg (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={priceStr}
                    onChange={(e) => setPriceStr(e.target.value)}
                    placeholder="0,10"
                  />
                </div>
              ) : (
                <div>
                  <Label>Valor fixo do frete (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={totalStr}
                    onChange={(e) => setTotalStr(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              )}
              <div>
                <Label>Peso total</Label>
                <Input
                  value={`${totalKg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`}
                  disabled
                />
              </div>
              <div>
                <Label>{priceMode === "per_kg" ? "Total do frete" : "Valor por kg (calc.)"}</Label>
                <Input
                  value={priceMode === "per_kg" ? fmtMoney(freightTotal) : fmtMoney(priceNum)}
                  disabled
                  className="font-bold"
                />
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">Anexe até 2 fotos comprovando a entrega/NF.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild disabled={photos.length >= 2}>
              <label className="cursor-pointer">
                <Camera className="h-4 w-4 mr-1.5" /> Tirar foto
                <input
                  hidden
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => onFile(e.target.files)}
                />
              </label>
            </Button>
            <Button variant="outline" size="sm" asChild disabled={photos.length >= 2}>
              <label className="cursor-pointer">
                <Plus className="h-4 w-4 mr-1.5" /> Da galeria
                <input hidden type="file" accept="image/*" multiple onChange={(e) => onFile(e.target.files)} />
              </label>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {photos.map((p, idx) => (
              <div key={idx} className="border rounded-lg p-2 space-y-2">
                <div className="relative">
                  <img src={p.preview} alt="" className="w-full h-32 object-cover rounded" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 bg-background/80"
                    onClick={() => {
                      try {
                        URL.revokeObjectURL(p.preview);
                      } catch {
                        /* noop */
                      }
                      setPhotos(photos.filter((_, i) => i !== idx));
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  placeholder="Descrição (opcional)"
                  value={p.description}
                  onChange={(e) =>
                    setPhotos(photos.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))
                  }
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="px-4 py-3 border-t shrink-0 bg-background gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Enviando…" : "Finalizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const { toast } = useToast();
  const handleSubmit = () => {
    const r = reason.trim();
    if (!r) {
      toast({ title: "Informe o motivo do cancelamento", variant: "destructive" });
      return;
    }
    onSubmit(r);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar OFR</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Motivo *</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={handleSubmit}>
            Cancelar OFR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailsModal({
  order,
  onOpenChange,
  getPhotoSignedUrl,
}: {
  order: FreightOrder | null;
  onOpenChange: (o: boolean) => void;
  getPhotoSignedUrl: (p: string, e?: number) => Promise<string | null>;
}) {
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    if (!order?.photos?.length) {
      setPhotoUrls({});
      return;
    }
    (async () => {
      const map: Record<string, string> = {};
      for (const p of order.photos!) {
        const url = await getPhotoSignedUrl(p.storage_path, 3600);
        if (url) map[p.id] = url;
      }
      setPhotoUrls(map);
    })();
  }, [order?.id]);
  // Reseta o visualizador ao trocar de OFR
  useEffect(() => {
    setViewerUrl(null);
  }, [order?.id]);

  if (!order) return null;

  const downloadPhotos = async () => {
    if (!order.photos?.length) return;
    setDownloading(true);
    try {
      for (let i = 0; i < order.photos.length; i++) {
        const p = order.photos[i];
        const url = photoUrls[p.id] || (await getPhotoSignedUrl(p.storage_path, 3600));
        if (!url) continue;
        const res = await fetch(url);
        const blob = await res.blob();
        // Extrai extensão só do último segmento do path (fallback seguro para 'jpg')
        const filename = p.storage_path.split("/").pop() || "";
        const dot = filename.lastIndexOf(".");
        const rawExt = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
        const ext = /^[a-z0-9]{2,5}$/.test(rawExt) ? rawExt : "jpg";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `OFR-${order.ofr_number}-foto-${i + 1}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } catch (e: any) {
      toast({ title: "Erro ao baixar fotos", description: e?.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Dialog open={!!order} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              OFR #{order.ofr_number} — {STATUS_LABEL[order.status]}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-muted-foreground">Freteiro:</span>{" "}
                <span className="font-medium">{order.freighter?.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Veículo:</span>{" "}
                <span className="font-medium">{order.freighter?.vehicle || "—"}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground">Rateio de custo:</span>{" "}
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                  {order.cost_company_name || order.cost_company?.name || "—"}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-teal-500/40 bg-teal-500/10 p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-teal-700 dark:text-teal-300 mb-2">
                <Truck className="h-3.5 w-3.5" />
                Rota
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Coleta
                  </div>
                  <div className="mt-0.5 font-bold text-sm text-foreground break-words">{order.pickup_location}</div>
                </div>
                <ArrowRight className="hidden sm:block h-4 w-4 text-teal-600 dark:text-teal-400 mt-5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Entrega
                  </div>
                  <div className="mt-0.5 font-bold text-sm text-foreground break-words">{order.delivery_location}</div>
                </div>
              </div>
            </div>

            {order.observations && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300 mb-1">
                  <StickyNote className="h-3.5 w-3.5" />
                  Observações
                </div>
                <p className="text-sm font-medium text-foreground whitespace-pre-wrap break-words">
                  {order.observations}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {order.delivery_doc_number && (
                <div className="border rounded-lg p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">Documento</div>
                  <div className="font-semibold text-sm">
                    {order.delivery_doc_type === "rom" ? "Romaneio" : "NF"} {order.delivery_doc_number}
                  </div>
                </div>
              )}
              {order.freight_price_per_kg != null && (
                <div className="border rounded-lg p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">R$ / kg</div>
                  <div className="font-semibold text-sm">{fmtMoney(order.freight_price_per_kg)}</div>
                </div>
              )}
              {order.freight_total != null && (
                <div className="border rounded-lg p-2 bg-emerald-500/10 border-emerald-500/40">
                  <div className="text-[10px] uppercase text-muted-foreground">Total do frete</div>
                  <div className="font-bold text-sm text-emerald-700 dark:text-emerald-300">
                    {fmtMoney(order.freight_total)}
                  </div>
                </div>
              )}
            </div>

            <ItemsBreakdown items={order.items || []} />

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold">Linha do tempo</div>
              <div className="px-3 py-2 space-y-1 text-xs">
                <div>
                  Criada: <span className="font-medium">{fmt(order.created_at)}</span>
                  {order.creator && (
                    <span className="text-muted-foreground">
                      {" "}
                      · por {order.creator.name} #{order.creator.code}
                    </span>
                  )}
                </div>
                <div>
                  Frete iniciado: <span className="font-medium">{fmt(order.pickup_started_at)}</span>
                  {order.pickup_starter && (
                    <span className="text-muted-foreground">
                      {" "}
                      · por {order.pickup_starter.name} #{order.pickup_starter.code}
                    </span>
                  )}
                </div>
                <div>
                  Finalizada: <span className="font-medium">{fmt(order.completed_at)}</span>
                  {order.completer && (
                    <span className="text-muted-foreground">
                      {" "}
                      · por {order.completer.name} #{order.completer.code}
                    </span>
                  )}
                </div>
                {order.cancelled_at && (
                  <div className="text-destructive">
                    Cancelada: {fmt(order.cancelled_at)} — {order.cancellation_reason}
                    {order.canceller && ` · por ${order.canceller.name} #${order.canceller.code}`}
                  </div>
                )}
                {order.edit_authorized_at && (
                  <div className="text-amber-700 dark:text-amber-300">
                    Edição autorizada: {fmt(order.edit_authorized_at)}
                    {order.edit_authorizer && ` · por ${order.edit_authorizer.name} #${order.edit_authorizer.code}`}
                    {order.edit_authorized_reason && ` — Motivo: ${order.edit_authorized_reason}`}
                  </div>
                )}
                {order.edited_at && (
                  <div className="text-amber-700 dark:text-amber-300">
                    Editada: <span className="font-medium">{fmt(order.edited_at)}</span>
                    {order.editor && ` · por ${order.editor.name} #${order.editor.code}`}
                  </div>
                )}
              </div>
            </div>

            {order.edited_at &&
              (order.previous_price_per_kg != null || (order.edit_photos && order.edit_photos.length > 0)) && (
                <EditHistoryBlock order={order} getPhotoSignedUrl={getPhotoSignedUrl} onOpenViewer={setViewerUrl} />
              )}

            {(order.photos || []).length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold">Fotos da entrega</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5"
                    onClick={downloadPhotos}
                    disabled={downloading}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloading ? "Baixando…" : "Baixar fotos"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {order.photos!.map((p) => (
                    <div key={p.id} className="border rounded-lg p-2">
                      {photoUrls[p.id] ? (
                        <img
                          src={photoUrls[p.id]}
                          alt=""
                          className="w-full h-40 object-cover rounded cursor-zoom-in hover:opacity-90 transition"
                          onClick={() => setViewerUrl(photoUrls[p.id])}
                        />
                      ) : (
                        <div className="w-full h-40 bg-muted animate-pulse rounded" />
                      )}
                      {p.description && <p className="text-xs mt-1">{p.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewerUrl} onOpenChange={(o) => !o && setViewerUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto p-2 bg-black/95 border-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Foto em tela cheia</DialogTitle>
          </DialogHeader>
          {viewerUrl && <img src={viewerUrl} alt="" className="max-h-[90vh] max-w-[92vw] object-contain mx-auto" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
function ItemsBreakdown({ items }: { items: FreightOrderItem[] }) {
  const fmtKg = (n: number) =>
    Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const malhas = items.filter((i) => i.item_type !== "fio");
  const fios = items.filter((i) => i.item_type === "fio");
  const sum = (arr: FreightOrderItem[], k: "pieces" | "weight_kg" | "boxes") =>
    arr.reduce((s, i) => s + Number((i as any)[k] || 0), 0);
  const totalPieces = sum(malhas, "pieces");
  const totalBoxes = sum(fios, "boxes");
  const kgMalha = sum(malhas, "weight_kg");
  const kgFio = sum(fios, "weight_kg");
  const kgTotal = kgMalha + kgFio;
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/60 px-3 py-1.5 text-xs font-semibold flex items-center justify-between gap-2">
        <span>Itens ({items.length})</span>
        <span className="text-[11px] font-mono text-muted-foreground">Total: {fmtKg(kgTotal)} kg</span>
      </div>

      {malhas.length > 0 && (
        <div>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide font-semibold text-sky-700 dark:text-sky-400 bg-sky-500/5 border-t border-b border-sky-500/20 flex flex-wrap items-center gap-x-2 gap-y-0.5 justify-between">
            <span>Malhas · {malhas.length} item(ns)</span>
            <span className="font-mono text-muted-foreground normal-case tracking-normal">
              {totalPieces} pçs · {fmtKg(kgMalha)} kg
            </span>
          </div>
          <ul className="divide-y">
            {malhas.map((i) => {
              const kg = Number(i.weight_kg || 0);
              const pcs = Number(i.pieces || 0);
              return (
                <li key={i.id} className="px-3 py-2 hover:bg-muted/30">
                  <div className="text-xs font-semibold text-foreground break-words">
                    {i.article?.name || i.article_name || "—"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {pcs} pçs
                    </span>
                    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {fmtKg(kg)} kg
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {fios.length > 0 && (
        <div>
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide font-semibold text-violet-700 dark:text-violet-400 bg-violet-500/5 border-t border-b border-violet-500/20 flex flex-wrap items-center gap-x-2 gap-y-0.5 justify-between">
            <span>Fios · {fios.length} item(ns)</span>
            <span className="font-mono text-muted-foreground normal-case tracking-normal">
              {totalBoxes} cx · {fmtKg(kgFio)} kg
            </span>
          </div>
          <ul className="divide-y">
            {fios.map((i) => {
              const kg = Number(i.weight_kg || 0);
              const bx = Number(i.boxes || 0);
              return (
                <li key={i.id} className="px-3 py-2 hover:bg-muted/30">
                  <div className="text-xs font-semibold text-foreground break-words">{i.yarn_type_name || "—"}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {bx} cx
                    </span>
                    <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {fmtKg(kg)} kg
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {items.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum item.</p>}
    </div>
  );
}

function CostCompaniesModal({
  open,
  onOpenChange,
  costCompanies,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  costCompanies: any[];
  onCreate: (p: { name: string; document?: string }) => void;
  onUpdate: (p: { id: string; name?: string; document?: string | null; active?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), document: document.trim() || undefined });
    setName("");
    setDocument("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Empresas (Rateio de custo)</DialogTitle>
        </DialogHeader>

        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <p className="text-sm font-medium">Nova empresa</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Malharia XYZ" />
            </div>
            <div>
              <Label className="text-xs">CNPJ / Documento</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!name.trim()}>
              <Plus className="h-4 w-4 mr-1.5" />
              Adicionar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {costCompanies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma empresa cadastrada.</p>
          )}
          {costCompanies.map((c) => (
            <div key={c.id} className="flex items-center justify-between border rounded-lg p-2 gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {c.name}
                  {!c.active && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}
                </p>
                <p className="text-xs text-muted-foreground truncate">{c.document || "—"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => onUpdate({ id: c.id, active: !c.active })}>
                  {c.active ? "Desativar" : "Ativar"}
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============= Addresses Manager Modal =============
function AddressesModal({
  open,
  onOpenChange,
  addresses,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  addresses: FreightAddress[];
  onCreate: (p: { name: string; full_address: string; is_company?: boolean }) => void;
  onUpdate: (p: { id: string; name?: string; full_address?: string; active?: boolean; is_company?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<FreightAddress | null>(null);
  const [markCompany, setMarkCompany] = useState(false);

  const companyAddress = addresses.find((a) => a.is_company);
  const otherAddresses = addresses.filter((a) => !a.is_company);
  const editing = editingId ? addresses.find((a) => a.id === editingId) : null;
  // Bloqueia cadastrar outros endereços enquanto não houver endereço da empresa
  const mustRegisterCompanyFirst = !companyAddress && !editing;
  const effectiveIsCompany = mustRegisterCompanyFirst ? true : markCompany;

  useEffect(() => {
    if (!open) {
      setName("");
      setAddr("");
      setEditingId(null);
      setPreview("");
      setConfirmDelete(null);
      setMarkCompany(false);
    }
  }, [open]);

  const previewQuery = preview.trim() || addr.trim();
  const embedUrl = previewQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(previewQuery)}&output=embed`
    : null;

  function submit() {
    if (!name.trim() || !addr.trim()) return;
    if (editingId) {
      onUpdate({ id: editingId, name: name.trim(), full_address: addr.trim(), is_company: effectiveIsCompany });
      setEditingId(null);
    } else {
      onCreate({ name: name.trim(), full_address: addr.trim(), is_company: effectiveIsCompany });
    }
    setName("");
    setAddr("");
    setPreview("");
    setMarkCompany(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-4xl h-[80vh] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Endereços
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Cadastre endereços para reutilizar em Coletas e Entregas.</p>
        </DialogHeader>
        {mustRegisterCompanyFirst && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm">
            <strong>Obrigatório:</strong> cadastre primeiro o endereço da sua empresa. Ele será usado como referência
            para os demais endereços.
          </div>
        )}
        <div className="flex-1 overflow-auto grid grid-cols-1 lg:grid-cols-2 gap-4 pr-2">
          <div className="space-y-3">
            <div>
              <Label>{effectiveIsCompany ? "Nome da empresa *" : "Nome do local *"}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={effectiveIsCompany ? "Ex: Malharia Modelo" : "Ex: Tinturaria Litoral"}
              />
            </div>
            <div>
              <Label>Endereço completo *</Label>
              <Textarea
                rows={3}
                value={addr}
                onChange={(e) => setAddr(e.target.value)}
                placeholder="Rua, número, bairro, cidade — UF"
              />
            </div>
            {(() => {
              const alreadyHasCompany = !!companyAddress && (!editing || !editing.is_company);
              const lockedOn = mustRegisterCompanyFirst || (editing?.is_company ?? false);
              const checkboxDisabled = lockedOn || alreadyHasCompany;
              return (
                <label className={cn("flex items-center gap-2 text-sm", checkboxDisabled && "opacity-70")}>
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={effectiveIsCompany}
                    disabled={checkboxDisabled}
                    onChange={(e) => setMarkCompany(e.target.checked)}
                  />
                  <span>
                    Este é o <strong>endereço da empresa</strong>
                    {mustRegisterCompanyFirst && " (obrigatório no primeiro cadastro)"}
                    {alreadyHasCompany && " — já cadastrado"}
                  </span>
                </label>
              );
            })()}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreview(addr)}
                disabled={!addr.trim()}
              >
                <MapIcon className="h-4 w-4 mr-1.5" /> Ver no mapa
              </Button>
              <Button type="button" onClick={submit} disabled={!name.trim() || !addr.trim()} className="ml-auto">
                {editingId ? "Atualizar" : "Cadastrar"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(null);
                    setName("");
                    setAddr("");
                    setPreview("");
                    setMarkCompany(false);
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
            {embedUrl && (
              <div className="rounded-md overflow-hidden border" style={{ height: 260 }}>
                <iframe
                  title="Mapa"
                  src={embedUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            {companyAddress && (
              <>
                <div className="text-sm font-semibold text-muted-foreground">Endereço da empresa</div>
                <AddressRow
                  a={companyAddress}
                  isCompany
                  onEdit={() => {
                    setEditingId(companyAddress.id);
                    setName(companyAddress.name);
                    setAddr(companyAddress.full_address);
                    setPreview(companyAddress.full_address);
                    setMarkCompany(true);
                  }}
                  onToggleActive={() => onUpdate({ id: companyAddress.id, active: !companyAddress.active })}
                  onDelete={() => setConfirmDelete(companyAddress)}
                />
              </>
            )}
            <div className="text-sm font-semibold text-muted-foreground pt-2">
              Outros endereços ({otherAddresses.length})
            </div>
            {otherAddresses.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
                {mustRegisterCompanyFirst
                  ? "Cadastre primeiro o endereço da empresa."
                  : "Nenhum outro endereço cadastrado."}
              </div>
            )}
            {otherAddresses.map((a) => (
              <AddressRow
                key={a.id}
                a={a}
                onEdit={() => {
                  setEditingId(a.id);
                  setName(a.name);
                  setAddr(a.full_address);
                  setPreview(a.full_address);
                  setMarkCompany(false);
                }}
                onToggleActive={() => onUpdate({ id: a.id, active: !a.active })}
                onDelete={() => setConfirmDelete(a)}
              />
            ))}
          </div>
        </div>
      </DialogContent>
      <DeleteConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Remover endereço"
        description={
          confirmDelete
            ? `Tem certeza que deseja remover o endereço "${confirmDelete.name}"? Esta ação não pode ser desfeita.`
            : ""
        }
        onConfirm={() => {
          if (confirmDelete) {
            onDelete(confirmDelete.id);
            setConfirmDelete(null);
          }
        }}
      />
    </Dialog>
  );
}

function AddressRow({
  a,
  isCompany,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  a: FreightAddress;
  isCompany?: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={cn("border rounded-md p-3 space-y-2", isCompany && "border-primary/40 bg-primary/5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium truncate">{a.name}</div>
            {isCompany && <Badge className="text-xs">Empresa</Badge>}
          </div>
          <div className="text-xs text-muted-foreground break-words">{a.full_address}</div>
        </div>
        {!a.active && (
          <Badge variant="secondary" className="text-xs">
            Inativo
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
        </Button>
        {!isCompany && (
          <Button size="sm" variant="outline" onClick={onToggleActive}>
            {a.active ? "Desativar" : "Ativar"}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(`https://www.google.com/maps?q=${encodeURIComponent(a.full_address)}`, "_blank")}
        >
          <MapIcon className="h-3.5 w-3.5 mr-1" /> Mapa
        </Button>
        {!isCompany && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============= Order Addresses (GPS) Modal =============
function OrderAddressesModal({
  order,
  onOpenChange,
}: {
  order: FreightOrder | null;
  onOpenChange: (o: boolean) => void;
}) {
  const open = !!order;
  function openGps(text: string) {
    // Tenta abrir no app nativo de mapas (mobile) ou Google Maps (desktop).
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5" /> OFR #{order?.ofr_number} — Endereços
          </DialogTitle>
        </DialogHeader>
        {order && (
          <div className="space-y-4">
            <div className="rounded-lg border p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
              <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> COLETA
              </div>
              <div className="text-sm break-words mb-3">{order.pickup_location || "—"}</div>
              {order.pickup_location && (
                <Button size="sm" className="w-full" onClick={() => openGps(order.pickup_location!)}>
                  <Navigation className="h-4 w-4 mr-1.5" /> Abrir no GPS
                </Button>
              )}
            </div>
            <div className="rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> ENTREGA
              </div>
              <div className="text-sm break-words mb-3">{order.delivery_location || "—"}</div>
              {order.delivery_location && (
                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => openGps(order.delivery_location!)}
                >
                  <Navigation className="h-4 w-4 mr-1.5" /> Abrir no GPS
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Autorizar edição (admin) ---------------- */

function AuthorizeEditModal({
  order,
  onOpenChange,
  onSubmit,
  submitting,
}: {
  order: FreightOrder | null;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string) => void;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (order) setReason("");
  }, [order?.id]);
  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <ShieldCheck className="h-5 w-5" /> Aut. edição
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {order && (
            <p className="text-sm text-muted-foreground">
              OFR <strong>#{order.ofr_number}</strong> — {order.freighter?.name || "Freteiro"}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            O freteiro será notificado e poderá alterar apenas o <strong>valor do frete</strong> e as{" "}
            <strong>fotos</strong> desta OFR.
          </p>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              rows={3}
              placeholder="Ex: Foto de NF trocada, valor por kg incorreto..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            disabled={submitting}
            onClick={() => onSubmit(reason.trim())}
          >
            {submitting ? "Autorizando…" : "Autorizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Edição do Freteiro (valor + fotos) ---------------- */

function FreighterEditModal({
  order,
  onOpenChange,
  onSubmit,
  submitting,
  getPhotoSignedUrl,
}: {
  order: FreightOrder | null;
  onOpenChange: (o: boolean) => void;
  onSubmit: (payload: {
    pricePerKg: number;
    keepPhotoIds: string[];
    addPhotos: Array<{ file: File; description?: string }>;
  }) => void;
  submitting: boolean;
  getPhotoSignedUrl: (p: string, e?: number) => Promise<string | null>;
}) {
  const [priceStr, setPriceStr] = useState("");
  const [keepIds, setKeepIds] = useState<string[]>([]);
  const [addPhotos, setAddPhotos] = useState<Array<{ file: File; description: string; preview: string }>>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (!order) return;
    setPriceStr(order.freight_price_per_kg != null ? String(order.freight_price_per_kg).replace(".", ",") : "");
    setKeepIds((order.photos || []).map((p) => p.id));
    setAddPhotos([]);
  }, [order?.id]);

  useEffect(() => {
    if (!order?.photos?.length) {
      setPhotoUrls({});
      return;
    }
    (async () => {
      const map: Record<string, string> = {};
      for (const p of order.photos!) {
        const url = await getPhotoSignedUrl(p.storage_path, 3600);
        if (url) map[p.id] = url;
      }
      setPhotoUrls(map);
    })();
  }, [order?.id]);

  const addPhotosRef = React.useRef(addPhotos);
  useEffect(() => {
    addPhotosRef.current = addPhotos;
  }, [addPhotos]);
  useEffect(() => {
    return () => {
      addPhotosRef.current.forEach((p) => {
        try {
          URL.revokeObjectURL(p.preview);
        } catch {
          /* noop */
        }
      });
    };
  }, []);

  if (!order) return null;

  const totalKg = (order.items || []).reduce((s, i) => s + Number(i.weight_kg || 0), 0);
  const priceNum = parseFloat(priceStr.replace(",", ".")) || 0;
  const newTotal = totalKg * priceNum;
  const totalFinalPhotos = keepIds.length + addPhotos.length;
  const priceChanged = Number(order.freight_price_per_kg || 0) !== priceNum;

  const onFile = (files: FileList | null) => {
    if (!files) return;
    const next = [...addPhotos];
    for (const f of Array.from(files)) {
      if (keepIds.length + next.length >= 2) break;
      next.push({ file: f, description: "", preview: URL.createObjectURL(f) });
    }
    setAddPhotos(next);
  };

  const submit = () => {
    if (totalFinalPhotos < 1) return toast({ title: "Mantenha ou anexe ao menos 1 foto", variant: "destructive" });
    if (totalFinalPhotos > 2) return toast({ title: "Máximo de 2 fotos", variant: "destructive" });
    if (priceNum <= 0) return toast({ title: "Informe um valor por kg válido", variant: "destructive" });
    onSubmit({
      pricePerKg: priceNum,
      keepPhotoIds: keepIds,
      addPhotos: addPhotos.map((p) => ({ file: p.file, description: p.description })),
    });
  };

  return (
    <Dialog open={!!order} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="p-0 gap-0 w-screen h-screen max-w-none sm:max-w-none sm:rounded-none flex flex-col"
        style={{ width: "100vw", height: "100vh" }}
      >
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <PencilRuler className="h-5 w-5 text-amber-600" />
            Editar OFR #{order.ofr_number}
          </DialogTitle>
          {order.edit_authorized_reason && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Motivo autorizado: {order.edit_authorized_reason}
            </p>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border rounded-lg p-3 bg-muted/30">
            <div>
              <Label>Valor por kg (R$)</Label>
              <Input
                inputMode="decimal"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="0,10"
              />
              {priceChanged && order.freight_price_per_kg != null && (
                <p className="text-[11px] mt-1 text-amber-700 dark:text-amber-300">
                  Antes: {fmtMoney(order.freight_price_per_kg)} → Agora: {fmtMoney(priceNum)}
                </p>
              )}
            </div>
            <div>
              <Label>Peso total</Label>
              <Input
                value={`${totalKg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`}
                disabled
              />
            </div>
            <div>
              <Label>Total do frete</Label>
              <Input value={fmtMoney(newTotal)} disabled className="font-bold" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Fotos ({totalFinalPhotos}/2)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild disabled={totalFinalPhotos >= 2}>
                  <label className="cursor-pointer">
                    <Camera className="h-4 w-4 mr-1.5" /> Tirar
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => onFile(e.target.files)}
                    />
                  </label>
                </Button>
                <Button variant="outline" size="sm" asChild disabled={totalFinalPhotos >= 2}>
                  <label className="cursor-pointer">
                    <Plus className="h-4 w-4 mr-1.5" /> Galeria
                    <input hidden type="file" accept="image/*" multiple onChange={(e) => onFile(e.target.files)} />
                  </label>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(order.photos || []).map((p) => {
                const kept = keepIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "border rounded-lg p-2 space-y-2 relative",
                      !kept && "opacity-50 border-destructive/60",
                    )}
                  >
                    {photoUrls[p.id] ? (
                      <img src={photoUrls[p.id]} alt="" className="w-full h-32 object-cover rounded" />
                    ) : (
                      <div className="w-full h-32 bg-muted animate-pulse rounded" />
                    )}
                    <Button
                      variant={kept ? "destructive" : "outline"}
                      size="sm"
                      className="w-full h-8"
                      onClick={() => setKeepIds(kept ? keepIds.filter((id) => id !== p.id) : [...keepIds, p.id])}
                    >
                      {kept ? (
                        <>
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Manter
                        </>
                      )}
                    </Button>
                    <p className="text-[10px] text-muted-foreground">Foto atual</p>
                  </div>
                );
              })}
              {addPhotos.map((p, idx) => (
                <div key={`new-${idx}`} className="border rounded-lg p-2 space-y-2 border-emerald-500/60">
                  <div className="relative">
                    <img src={p.preview} alt="" className="w-full h-32 object-cover rounded" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 bg-background/80"
                      onClick={() => {
                        try {
                          URL.revokeObjectURL(p.preview);
                        } catch {
                          /* noop */
                        }
                        setAddPhotos(addPhotos.filter((_, i) => i !== idx));
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Descrição (opcional)"
                    value={p.description}
                    onChange={(e) =>
                      setAddPhotos(addPhotos.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))
                    }
                  />
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Nova foto</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="px-4 py-3 border-t shrink-0 bg-background gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-amber-600 hover:bg-amber-700 text-white">
            {submitting ? "Salvando…" : "Salvar edição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Histórico de edição (no DetailsModal) ---------------- */

function EditHistoryBlock({
  order,
  getPhotoSignedUrl,
  onOpenViewer,
}: {
  order: FreightOrder;
  getPhotoSignedUrl: (p: string, e?: number) => Promise<string | null>;
  onOpenViewer: (url: string | null) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const ps = order.edit_photos || [];
    if (!ps.length) {
      setUrls({});
      return;
    }
    (async () => {
      const map: Record<string, string> = {};
      for (const p of ps) {
        const u = await getPhotoSignedUrl(p.storage_path, 3600);
        if (u) map[p.id] = u;
      }
      setUrls(map);
    })();
  }, [order.id, (order.edit_photos || []).length]);

  const hasPriceChange =
    order.previous_price_per_kg != null &&
    Number(order.previous_price_per_kg) !== Number(order.freight_price_per_kg ?? 0);
  const oldPhotos = order.edit_photos || [];
  return (
    <div className="border-2 border-amber-500/50 rounded-lg overflow-hidden bg-amber-500/5">
      <div className="bg-amber-500/20 px-3 py-1.5 text-xs font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-200">
        <History className="h-3.5 w-3.5" /> Histórico de Edição
      </div>
      <div className="p-3 space-y-3 text-xs">
        {hasPriceChange && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border bg-background p-2">
              <div className="text-[10px] uppercase text-muted-foreground">R$ / kg (antes → agora)</div>
              <div className="font-semibold">
                <span className="line-through text-muted-foreground">{fmtMoney(order.previous_price_per_kg)}</span>
                {" → "}
                <span className="text-amber-700 dark:text-amber-300">{fmtMoney(order.freight_price_per_kg)}</span>
              </div>
            </div>
            <div className="rounded border bg-background p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Total (antes → agora)</div>
              <div className="font-semibold">
                <span className="line-through text-muted-foreground">{fmtMoney(order.previous_total)}</span>
                {" → "}
                <span className="text-amber-700 dark:text-amber-300">{fmtMoney(order.freight_total)}</span>
              </div>
            </div>
          </div>
        )}
        {oldPhotos.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold mb-1">Fotos removidas ({oldPhotos.length})</p>
            <div className="grid grid-cols-2 gap-2">
              {oldPhotos.map((p) => (
                <div key={p.id} className="border rounded p-1 bg-background">
                  {urls[p.id] ? (
                    <img
                      src={urls[p.id]}
                      alt=""
                      className="w-full h-24 object-cover rounded cursor-zoom-in opacity-80 hover:opacity-100"
                      onClick={() => onOpenViewer(urls[p.id])}
                    />
                  ) : (
                    <div className="w-full h-24 bg-muted animate-pulse rounded" />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">Removida em {fmt(p.replaced_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
