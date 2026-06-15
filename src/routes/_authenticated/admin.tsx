import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2, ShieldAlert, Users, Store, CreditCard, TicketCheck,
  TrendingUp, AlertCircle, CheckCircle, XCircle, Clock, Search,
  MoreHorizontal, RefreshCw, Ban, Play, Eye, Calendar,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin Console — ShopFlow" }] }),
  component: AdminPage,
});

type Shop = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  owner_name: string | null;
  email: string | null;
  mobile: string | null;
  support_status: string;
  created_at: string;
  subscription?: SubInfo;
};

type SubInfo = {
  id: string;
  plan_type: string | null;
  plan: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  expires_at: string;
  price: number | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
  shop_name: string | null;
  created_at: string;
  role: string | null;
  plan: string | null;
  status: string | null;
  expires_at: string | null;
};

type Ticket = {
  id: string;
  user_id: string;
  shop_id: string | null;
  subject: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [searchShop, setSearchShop] = useState("");
  const [searchUser, setSearchUser] = useState("");
  const [ticketFilter, setTicketFilter] = useState("all");
  const [extendShop, setExtendShop] = useState<Shop | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return setLoading(false);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) { setLoading(false); return; }
    setAuthorized(true);

    const [{ data: shopsData }, { data: subsData }, { data: profilesData }, { data: rolesData }, { data: ticketsData }] = await Promise.all([
      supabase.from("shops").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, shop_name, created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("support_tickets").select("*").order("created_at", { ascending: false }),
    ]);

    // Map subscriptions to shops
    const subByUser = new Map<string, SubInfo>();
    (subsData ?? []).forEach((s: any) => {
      if (!subByUser.has(s.user_id)) subByUser.set(s.user_id, s);
    });

    const shopList: Shop[] = (shopsData ?? []).map((s: any) => ({
      ...s,
      subscription: subByUser.get(s.user_id),
    }));
    setShops(shopList);

    // Users tab
    const roleMap = new Map<string, string>();
    (rolesData ?? []).forEach((r: any) => { if (!roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role); });
    const userList: UserRow[] = (profilesData ?? []).map((p: any) => {
      const sub = subByUser.get(p.id);
      return { ...p, role: roleMap.get(p.id) ?? null, plan: sub?.plan ?? null, status: sub?.status ?? null, expires_at: sub?.expires_at ?? null };
    });
    setUsers(userList);

    setTickets(ticketsData ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function setShopStatus(shop: Shop, newStatus: string) {
    setActionLoading(shop.id);
    const { error } = await supabase.from("shops").update({ support_status: newStatus }).eq("id", shop.id);
    setActionLoading(null);
    if (error) return toast.error(error.message);
    toast.success(`Shop ${newStatus === "active" ? "activated" : newStatus === "suspended" ? "suspended" : "disabled"}`);
    setShops((prev) => prev.map((s) => s.id === shop.id ? { ...s, support_status: newStatus } : s));
  }

  async function extendSubscription() {
    if (!extendShop) return;
    setActionLoading("extend");
    const days = parseInt(extendDays);
    if (isNaN(days) || days < 1) return toast.error("Invalid days");

    // Get current subscription
    const { data: sub } = await supabase.from("subscriptions").select("*").eq("shop_id", extendShop.id).order("created_at", { ascending: false }).limit(1).single();
    if (!sub) { toast.error("No subscription found"); setActionLoading(null); return; }

    const currentEnd = new Date(sub.expires_at || sub.end_date || new Date());
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + days);

    const { error } = await supabase.from("subscriptions").update({
      expires_at: newEnd.toISOString(),
      end_date: newEnd.toISOString(),
      status: "active",
    }).eq("id", sub.id);

    setActionLoading(null);
    if (error) return toast.error(error.message);
    toast.success(`Subscription extended by ${days} days`);
    setExtendShop(null);
    load();
  }

  async function updateTicket(id: string, status: string) {
    setActionLoading(id);
    const { error } = await supabase.from("support_tickets").update({ status }).eq("id", id);
    setActionLoading(null);
    if (error) return toast.error(error.message);
    toast.success("Ticket updated");
    setTickets((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
  }

  if (loading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  if (!authorized) return (
    <div className="p-8 max-w-md mx-auto text-center space-y-3 mt-20">
      <ShieldAlert className="w-10 h-10 mx-auto text-destructive" />
      <h1 className="text-2xl font-bold">Admin access only</h1>
      <p className="text-muted-foreground">Your account does not have permission to view this page.</p>
    </div>
  );

  // Dashboard stats
  const shopOwners = users.filter((r) => r.role !== "admin");
  const activeShops = shops.filter((s) => s.support_status === "active").length;
  const trialUsers = users.filter((r) => r.plan === "half_yearly" && r.status === "active").length;
  const paidUsers = users.filter((r) => r.plan === "yearly" && r.status === "active").length;
  const expiredSubs = users.filter((r) => r.status === "expired").length;
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  const filteredShops = shops.filter((s) =>
    !searchShop || s.name.toLowerCase().includes(searchShop.toLowerCase()) ||
    s.owner_name?.toLowerCase().includes(searchShop.toLowerCase()) ||
    s.city?.toLowerCase().includes(searchShop.toLowerCase())
  );
  const filteredUsers = users.filter((u) =>
    !searchUser || u.shop_name?.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(searchUser.toLowerCase())
  );
  const filteredTickets = ticketFilter === "all" ? tickets : tickets.filter((t) => t.status === ticketFilter);

  const daysLeft = (sub?: SubInfo) => {
    if (!sub?.expires_at) return null;
    const d = Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000);
    return d;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Admin Console</h1>
          <p className="text-muted-foreground text-sm">Platform management & oversight</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="shops">Shops ({shops.length})</TabsTrigger>
          <TabsTrigger value="users">Users ({shopOwners.length})</TabsTrigger>
          <TabsTrigger value="support">
            Support
            {openTickets > 0 && <Badge className="ml-2 text-xs py-0 px-1.5">{openTickets}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* === DASHBOARD === */}
        <TabsContent value="dashboard" className="space-y-6 mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            <StatCard icon={<Store className="w-5 h-5" />} label="Total Shops" value={shops.length} />
            <StatCard icon={<CheckCircle className="w-5 h-5" />} label="Active Shops" value={activeShops} color="text-emerald-500" />
            <StatCard icon={<Users className="w-5 h-5" />} label="Trial Users" value={trialUsers} color="text-amber-500" />
            <StatCard icon={<CreditCard className="w-5 h-5" />} label="Paid Users" value={paidUsers} color="text-blue-500" />
            <StatCard icon={<AlertCircle className="w-5 h-5" />} label="Expired Subs" value={expiredSubs} color="text-destructive" />
            <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Total Users" value={shopOwners.length} />
            <StatCard icon={<TicketCheck className="w-5 h-5" />} label="Open Tickets" value={openTickets} color={openTickets > 0 ? "text-orange-500" : undefined} />
          </div>

          {/* Recent shops */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Recently Registered Shops</h3>
            <div className="space-y-3">
              {shops.slice(0, 5).map((shop) => (
                <div key={shop.id} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/40">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{shop.name}</div>
                    <div className="text-xs text-muted-foreground">{shop.city}, {shop.state} · {fmtDate(shop.created_at)}</div>
                  </div>
                  <StatusBadge status={shop.support_status} />
                </div>
              ))}
              {shops.length === 0 && <p className="text-sm text-muted-foreground">No shops yet.</p>}
            </div>
          </Card>
        </TabsContent>

        {/* === SHOPS === */}
        <TabsContent value="shops" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={searchShop} onChange={(e) => setSearchShop(e.target.value)} placeholder="Search shops…" className="pl-9" />
            </div>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shop</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>City / State</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredShops.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No shops found.</TableCell></TableRow>
                  )}
                  {filteredShops.map((shop) => {
                    const days = daysLeft(shop.subscription);
                    return (
                      <TableRow key={shop.id}>
                        <TableCell className="font-medium">{shop.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{shop.type}</TableCell>
                        <TableCell>
                          <div>{shop.owner_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{shop.email}</div>
                        </TableCell>
                        <TableCell>{[shop.city, shop.state].filter(Boolean).join(", ") || "—"}</TableCell>
                        <TableCell>
                          {shop.subscription ? (
                            <Badge variant="outline" className="text-xs">{shop.subscription.plan_type ?? shop.subscription.plan}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell><StatusBadge status={shop.support_status} /></TableCell>
                        <TableCell>
                          {days !== null ? (
                            <span className={days < 7 ? "text-destructive font-medium" : day < 30 ? "text-amber-500" : "text-emerald-500"}>
                              {days > 0 ? `${days}d` : "Expired"}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(shop.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {shop.support_status !== "active" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionLoading === shop.id} onClick={() => setShopStatus(shop, "active")}>
                                <Play className="w-3 h-3 mr-1" /> Activate
                              </Button>
                            )}
                            {shop.support_status === "active" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-amber-600 border-amber-200" disabled={actionLoading === shop.id} onClick={() => setShopStatus(shop, "suspended")}>
                                <Ban className="w-3 h-3 mr-1" /> Suspend
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExtendShop(shop)}>
                              <Calendar className="w-3 h-3 mr-1" /> Extend
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* === USERS === */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder="Search users…" className="pl-9" />
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Sub Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found.</TableCell></TableRow>
                  )}
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell>{u.shop_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                          {u.role || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{u.plan ? u.plan.replace("_", "-") : "—"}</TableCell>
                      <TableCell>
                        {u.status ? (
                          <Badge variant={u.status === "active" ? "default" : u.status === "expired" ? "destructive" : "outline"} className="text-xs">
                            {u.status}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.expires_at ? fmtDate(u.expires_at) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* === SUPPORT === */}
        <TabsContent value="support" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {["all", "open", "in_progress", "resolved", "closed"].map((f) => (
              <Button
                key={f}
                size="sm"
                variant={ticketFilter === f ? "default" : "outline"}
                onClick={() => setTicketFilter(f)}
                className="text-xs capitalize"
              >
                {f.replace("_", " ")}
              </Button>
            ))}
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No tickets found.</TableCell></TableRow>
                  )}
                  {filteredTickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.subject}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{t.description}</div>
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={t.priority} />
                      </TableCell>
                      <TableCell>
                        <TicketStatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDateTime(t.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {t.status === "open" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionLoading === t.id} onClick={() => updateTicket(t.id, "in_progress")}>
                              In Progress
                            </Button>
                          )}
                          {(t.status === "open" || t.status === "in_progress") && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" disabled={actionLoading === t.id} onClick={() => updateTicket(t.id, "resolved")}>
                              Resolve
                            </Button>
                          )}
                          {t.status === "resolved" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={actionLoading === t.id} onClick={() => updateTicket(t.id, "closed")}>
                              Close
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Extend subscription dialog */}
      <Dialog open={!!extendShop} onOpenChange={(o) => !o && setExtendShop(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Subscription — {extendShop?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Enter the number of days to extend the subscription by.</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Days to add</label>
              <Input type="number" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} min="1" max="365" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendShop(null)}>Cancel</Button>
            <Button onClick={extendSubscription} disabled={actionLoading === "extend"}>
              {actionLoading === "extend" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center ${color ?? "text-primary"}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
    suspended: { label: "Suspended", className: "bg-amber-500/10 text-amber-600 border-amber-200" },
    disabled: { label: "Disabled", className: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs ${s.className}`}>{s.label}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = { high: "text-destructive", medium: "text-amber-600", low: "text-muted-foreground" };
  return <Badge variant="outline" className={`text-xs capitalize ${map[priority] ?? ""}`}>{priority}</Badge>;
}

function TicketStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "text-blue-600",
    in_progress: "text-amber-600",
    resolved: "text-emerald-600",
    closed: "text-muted-foreground",
  };
  return <Badge variant="outline" className={`text-xs capitalize ${map[status] ?? ""}`}>{status.replace("_", " ")}</Badge>;
}