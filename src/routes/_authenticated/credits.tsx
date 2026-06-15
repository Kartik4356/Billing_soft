import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/credits")({
  head: () => ({ meta: [{ title: "Customer Credit — ShopFlow" }] }),
  component: Credits,
});

type Sale = { id: string; created_at: string; customer_name: string | null; total: number };
type Payment = { id: string; created_at: string; customer_name: string; amount: number; note: string | null };

function Credits() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["credits"],
    queryFn: async () => {
      const [{ data: creditSales }, { data: payments }] = await Promise.all([
        supabase.from("sales").select("id, created_at, customer_name, total").eq("payment_method", "credit").order("created_at", { ascending: false }),
        supabase.from("credit_payments").select("*").order("created_at", { ascending: false }),
      ]);
      return { sales: (creditSales ?? []) as Sale[], payments: (payments ?? []) as Payment[] };
    },
  });

  const summary = useMemo(() => {
    const owed = new Map<string, number>();
    (data?.sales ?? []).forEach((s) => {
      const name = (s.customer_name || "Walk-in").trim();
      owed.set(name, (owed.get(name) ?? 0) + Number(s.total));
    });
    (data?.payments ?? []).forEach((p) => {
      owed.set(p.customer_name, (owed.get(p.customer_name) ?? 0) - Number(p.amount));
    });
    return [...owed.entries()].map(([name, balance]) => ({ name, balance })).sort((a, b) => b.balance - a.balance);
  }, [data]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Customer credit</h1>
          <p className="text-sm text-muted-foreground">Outstanding balances by customer</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Record payment</Button></DialogTrigger>
          <PaymentForm
            customers={summary.map((s) => s.name)}
            onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["credits"] }); }}
          />
        </Dialog>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border font-semibold">Outstanding</div>
        {summary.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No credit sales yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.map((s) => (
                  <tr key={s.name}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${s.balance > 0 ? "text-destructive" : "text-success"}`}>
                      {fmtMoney(s.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border font-semibold">Payment history</div>
        {(data?.payments ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No payments recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.payments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDateTime(p.created_at)}</td>
                    <td className="px-4 py-3 font-medium">{p.customer_name}</td>
                    <td className="px-4 py-3 text-right text-success">{fmtMoney(Number(p.amount))}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.note || "—"}</td>
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

function PaymentForm({ customers, onSaved }: { customers: string[]; onSaved: () => void }) {
  const [name, setName] = useState(customers[0] ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !amount) return toast.error("Enter customer and amount");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("credit_payments").insert({
      user_id: user!.id, customer_name: name.trim(), amount: Number(amount), note: note || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Payment recorded");
    onSaved();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Customer</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} list="customer-list" placeholder="Customer name" required />
          <datalist id="customer-list">{customers.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <Label>Amount (₹)</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
        <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}