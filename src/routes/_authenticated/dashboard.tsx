import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { TrendingUp, Package, AlertTriangle, Wallet, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — ShopFlow" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0,0,0,0);

      const [{ data: todaySales }, { data: products }, { data: weekSales }, { data: recent }] = await Promise.all([
        supabase.from("sales").select("total, profit").gte("created_at", today.toISOString()),
        supabase.from("products").select("id, name, stock, low_stock_threshold, purchase_price, selling_price").is("deleted_at", null),
        supabase.from("sales").select("total, profit, created_at").gte("created_at", weekAgo.toISOString()).order("created_at"),
        supabase.from("sales").select("id, total, customer_name, created_at").order("created_at", { ascending: false }).limit(5),
      ]);

      const todayRevenue = (todaySales ?? []).reduce((s, r) => s + Number(r.total), 0);
      const todayProfit = (todaySales ?? []).reduce((s, r) => s + Number(r.profit), 0);
      const inventoryValue = (products ?? []).reduce((s, p) => s + Number(p.purchase_price) * (p.stock ?? 0), 0);
      const lowStock = (products ?? []).filter(p => (p.stock ?? 0) <= (p.low_stock_threshold ?? 0));

      // 7-day buckets
      const buckets: Record<string, { date: string; sales: number; profit: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        const k = d.toISOString().slice(0,10);
        buckets[k] = { date: d.toLocaleDateString("en-IN",{ weekday:"short"}), sales: 0, profit: 0 };
      }
      (weekSales ?? []).forEach(s => {
        const k = new Date(s.created_at).toISOString().slice(0,10);
        if (buckets[k]) { buckets[k].sales += Number(s.total); buckets[k].profit += Number(s.profit); }
      });

      return {
        todayRevenue, todayProfit, inventoryValue,
        productCount: products?.length ?? 0,
        lowStock,
        recent: recent ?? [],
        chart: Object.values(buckets),
      };
    },
  });

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Today at a glance</h1>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <Link to="/pos"><Button size="lg" style={{ boxShadow: "var(--shadow-elegant)" }}>New sale <ArrowUpRight className="ml-1 w-4 h-4" /></Button></Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Today's sales" value={fmtMoney(stats?.todayRevenue ?? 0)} Icon={TrendingUp} accent />
        <Stat label="Today's profit" value={fmtMoney(stats?.todayProfit ?? 0)} Icon={Wallet} />
        <Stat label="Inventory value" value={fmtMoney(stats?.inventoryValue ?? 0)} Icon={Package} />
        <Stat label="Low stock" value={String(stats?.lowStock.length ?? 0)} Icon={AlertTriangle} warn={!!stats?.lowStock.length} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Last 7 days</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.chart ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Low stock</h3>
          {stats?.lowStock.length === 0 && <p className="text-sm text-muted-foreground">All stocked up ✓</p>}
          <ul className="space-y-2">
            {stats?.lowStock.slice(0, 6).map(p => (
              <li key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs">{p.stock} left</span>
              </li>
            ))}
          </ul>
          {stats && stats.lowStock.length > 6 && (
            <Link to="/products" className="text-xs text-primary mt-3 inline-block">View all →</Link>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-4">Recent sales</h3>
        {stats?.recent.length === 0 && <p className="text-sm text-muted-foreground">No sales yet. <Link to="/pos" className="text-primary">Create your first sale →</Link></p>}
        <div className="divide-y divide-border">
          {stats?.recent.map(s => (
            <div key={s.id} className="flex items-center justify-between py-3">
              <div>
                <div className="font-medium">{s.customer_name || "Walk-in customer"}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(s.created_at)}</div>
              </div>
              <div className="font-semibold">{fmtMoney(s.total)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, Icon, accent, warn }: { label: string; value: string; Icon: React.ComponentType<{ className?: string }>; accent?: boolean; warn?: boolean }) {
  return (
    <Card className="p-4 md:p-5 relative overflow-hidden">
      {accent && <div className="absolute inset-0 opacity-10" style={{ background: "var(--gradient-primary)" }} />}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${warn ? "text-destructive" : "text-primary"}`} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </Card>
  );
}