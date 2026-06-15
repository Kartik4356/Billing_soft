import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMemo, useState } from "react";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — ShopFlow" }] }),
  component: Reports,
});

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const range = useMemo(() => {
    const f = new Date(from + "T00:00:00").toISOString();
    const t = new Date(to + "T23:59:59").toISOString();
    return { f, t };
  }, [from, to]);

  const { data } = useQuery({
    queryKey: ["reports", range.f, range.t],
    queryFn: async () => {
      const { data: sales } = await supabase
        .from("sales")
        .select("id, created_at, customer_name, total, profit, payment_method")
        .gte("created_at", range.f).lte("created_at", range.t)
        .order("created_at", { ascending: false });
      const { data: items } = await supabase
        .from("sale_items")
        .select("product_name, quantity, price, cost, sale_id, sales!inner(created_at)")
        .gte("sales.created_at", range.f).lte("sales.created_at", range.t);
      return { sales: sales ?? [], items: (items ?? []) as Array<{ product_name: string; quantity: number; price: number; cost: number }> };
    },
  });

  const totals = useMemo(() => {
    const s = data?.sales ?? [];
    return {
      count: s.length,
      revenue: s.reduce((a, r) => a + Number(r.total), 0),
      profit: s.reduce((a, r) => a + Number(r.profit), 0),
    };
  }, [data]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { product_name: string; qty: number; revenue: number; profit: number }>();
    (data?.items ?? []).forEach((i) => {
      const cur = map.get(i.product_name) ?? { product_name: i.product_name, qty: 0, revenue: 0, profit: 0 };
      cur.qty += i.quantity;
      cur.revenue += Number(i.price) * i.quantity;
      cur.profit += (Number(i.price) - Number(i.cost)) * i.quantity;
      map.set(i.product_name, cur);
    });
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">Sales & profit by date range</p>
      </div>

      <Card className="p-5 flex flex-wrap gap-4 items-end">
        <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button
          variant="outline"
          onClick={() => download(`sales-${from}-to-${to}.csv`, toCsv((data?.sales ?? []).map((s) => ({
            date: s.created_at, customer: s.customer_name ?? "Walk-in", total: s.total, profit: s.profit, payment: s.payment_method,
          }))))}
          disabled={!data?.sales.length}
        >
          <Download className="w-4 h-4 mr-1" /> Export sales CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => download(`products-${from}-to-${to}.csv`, toCsv(topProducts.map((p) => ({
            product: p.product_name, qty: p.qty, revenue: p.revenue, profit: p.profit,
          }))))}
          disabled={!topProducts.length}
        >
          <Download className="w-4 h-4 mr-1" /> Export products CSV
        </Button>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Sales</div><div className="text-2xl font-bold mt-1">{totals.count}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Revenue</div><div className="text-2xl font-bold mt-1">{fmtMoney(totals.revenue)}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase text-muted-foreground">Profit</div><div className="text-2xl font-bold mt-1 text-success">{fmtMoney(totals.profit)}</div></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border font-semibold">Top products</div>
        {topProducts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No sales in this range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Revenue</th><th className="px-4 py-3 text-right">Profit</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topProducts.slice(0, 50).map((p) => (
                  <tr key={p.product_name}>
                    <td className="px-4 py-3 font-medium">{p.product_name}</td>
                    <td className="px-4 py-3 text-right">{p.qty}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(p.revenue)}</td>
                    <td className="px-4 py-3 text-right text-success">{fmtMoney(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border font-semibold">Sales log</div>
        {(data?.sales ?? []).length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No sales in this range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Profit</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.sales ?? []).slice(0, 100).map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDateTime(s.created_at)}</td>
                    <td className="px-4 py-3">{s.customer_name || "Walk-in"}</td>
                    <td className="px-4 py-3 capitalize">{s.payment_method}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmtMoney(Number(s.total))}</td>
                    <td className="px-4 py-3 text-right text-success">{fmtMoney(Number(s.profit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}