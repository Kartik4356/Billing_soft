import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, ScanLine, MessageCircle, Printer } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { BarcodeScanner } from "@/components/BarcodeScanner";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({ meta: [{ title: "New Sale — ShopFlow" }] }),
  component: POS,
});

type Product = { id: string; name: string; selling_price: number; purchase_price: number; stock: number; barcode: string | null; sku: string | null };
type CartItem = { product: Product; qty: number };

function POS() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [completedTotal, setCompletedTotal] = useState(0);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const matches = useMemo(() => {
    if (!q) return [];
    const t = q.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(t) || p.barcode === q || p.sku?.toLowerCase().includes(t)).slice(0, 8);
  }, [q, products]);

  function addToCart(p: Product) {
    setCart((prev) => {
      const ex = prev.find((c) => c.product.id === p.id);
      if (ex) return prev.map((c) => c.product.id === p.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product: p, qty: 1 }];
    });
    setQ("");
  }

  function onScanned(code: string) {
    const match = products.find((p) => p.barcode === code || p.sku === code);
    if (match) {
      addToCart(match);
      toast.success(`Added ${match.name}`);
    } else {
      toast.error(`No product with barcode ${code}`);
    }
  }

  function adjust(id: string, delta: number) {
    setCart((prev) => prev.flatMap((c) => c.product.id === id ? (c.qty + delta <= 0 ? [] : [{ ...c, qty: c.qty + delta }]) : [c]));
  }

  const subtotal = cart.reduce((s, c) => s + c.product.selling_price * c.qty, 0);
  const profit = cart.reduce((s, c) => s + (c.product.selling_price - c.product.purchase_price) * c.qty, 0);

  async function checkout() {
    if (!cart.length) return;
    for (const c of cart) {
      if (c.qty > c.product.stock) return toast.error(`Not enough stock for ${c.product.name}`);
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sale, error: sErr } = await supabase.from("sales").insert({
      user_id: user!.id,
      customer_name: customer || null,
      customer_phone: customerPhone || null,
      total: subtotal,
      profit,
      payment_method: paymentMethod,
    }).select().single();
    if (sErr || !sale) { setSubmitting(false); return toast.error(sErr?.message ?? "Failed"); }

    const items = cart.map((c) => ({
      sale_id: sale.id, product_id: c.product.id, product_name: c.product.name,
      quantity: c.qty, price: c.product.selling_price, cost: c.product.purchase_price,
    }));
    const { error: iErr } = await supabase.from("sale_items").insert(items);
    if (iErr) { setSubmitting(false); return toast.error(iErr.message); }

    for (const c of cart) {
      await supabase.from("products").update({ stock: c.product.stock - c.qty }).eq("id", c.product.id);
      await supabase.from("stock_movements").insert({
        user_id: user!.id, product_id: c.product.id, type: "sale", quantity: -c.qty, note: `Sale ${sale.id.slice(0, 8)}`,
      });
    }

    setSubmitting(false);
    toast.success(`Sale complete — ${fmtMoney(subtotal)}`);
    setCompletedSaleId(sale.id);
    setCompletedTotal(subtotal);
    qc.invalidateQueries();
  }

  function sendWhatsApp() {
    if (!completedSaleId) return;
    const phone = customerPhone.replace(/\D/g, "");
    if (!phone || phone.length < 10) {
      toast.error("Valid customer phone number required for WhatsApp sharing");
      return;
    }

    const itemList = cart.map((c) => `• ${c.product.name} x${c.qty} = ${fmtMoney(c.product.selling_price * c.qty)}`).join("\n");
    const message = encodeURIComponent(
      `*ShopFlow — Bill Summary*\n\n${itemList}\n\n*Total: ${fmtMoney(completedTotal)}*\n*Payment: ${paymentMethod.toUpperCase()}*\n\nThank you for your purchase! 🙏`
    );
    const waUrl = `https://wa.me/91${phone}?text=${message}`;
    window.open(waUrl, "_blank");

    // Mark as sent
    supabase.from("sales").update({ whatsapp_sent: true }).eq("id", completedSaleId);
  }

  function resetSale() {
    setCart([]);
    setCustomer("");
    setCustomerPhone("");
    setCompletedSaleId(null);
    setCompletedTotal(0);
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">New sale</h1>

      {/* Sale completed — action panel */}
      {completedSaleId && (
        <div className="mb-6 p-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold">
            ✅ Sale completed — {fmtMoney(completedTotal)}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate({ to: "/receipt/$saleId", params: { saleId: completedSaleId } })}
            >
              <Printer className="w-4 h-4 mr-1.5" /> View Receipt
            </Button>
            {customerPhone && (
              <Button size="sm" className="bg-[#25D366] hover:bg-[#128C7E] text-white border-0" onClick={sendWhatsApp}>
                <MessageCircle className="w-4 h-4 mr-1.5" /> Send via WhatsApp
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={resetSale}>
              New Sale
            </Button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        <Card className="p-5">
          <Label>Find product</Label>
          <div className="flex gap-2 mt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU or barcode" className="pl-9" autoFocus />
            </div>
            <Button type="button" variant="outline" onClick={() => setScanOpen(true)} title="Scan barcode">
              <ScanLine className="w-4 h-4" />
            </Button>
          </div>
          {matches.length > 0 && (
            <ul className="mt-3 border border-border rounded-lg divide-y divide-border max-h-80 overflow-auto">
              {matches.map((p) => (
                <li key={p.id}>
                  <button onClick={() => addToCart(p)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent text-left">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.stock} in stock</div>
                    </div>
                    <div className="font-semibold">{fmtMoney(p.selling_price)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q && matches.length === 0 && <p className="text-sm text-muted-foreground mt-3">No matches.</p>}

          <div className="mt-6">
            <h3 className="font-semibold mb-3">Cart ({cart.length})</h3>
            {cart.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Add products to start a sale
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => (
                  <div key={c.product.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.product.name}</div>
                      <div className="text-xs text-muted-foreground">{fmtMoney(c.product.selling_price)} each</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" onClick={() => adjust(c.product.id, -1)}><Minus className="w-3 h-3" /></Button>
                      <span className="w-8 text-center">{c.qty}</span>
                      <Button size="icon" variant="outline" onClick={() => adjust(c.product.id, 1)}><Plus className="w-3 h-3" /></Button>
                    </div>
                    <div className="w-20 text-right font-semibold">{fmtMoney(c.product.selling_price * c.qty)}</div>
                    <Button size="icon" variant="ghost" onClick={() => adjust(c.product.id, -c.qty)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 h-fit sticky top-4 space-y-4">
          <h3 className="font-semibold">Checkout</h3>
          <div className="space-y-2">
            <Label>Customer Name (optional)</Label>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Walk-in customer" />
          </div>
          <div className="space-y-2">
            <Label>
              Customer Phone
              <span className="ml-2 text-xs text-muted-foreground">(for WhatsApp bill)</span>
            </Label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+91 98765 43210"
              type="tel"
            />
          </div>
          <div className="space-y-2">
            <Label>Payment</Label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div className="pt-3 border-t border-border space-y-1.5 text-sm">
            <Row k="Items" v={String(cart.reduce((s, c) => s + c.qty, 0))} />
            <Row k="Profit" v={fmtMoney(profit)} muted />
            <div className="flex justify-between items-baseline pt-2 border-t border-border">
              <span className="font-medium">Total</span>
              <span className="text-2xl font-bold">{fmtMoney(subtotal)}</span>
            </div>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={!cart.length || submitting || !!completedSaleId}
            onClick={checkout}
            style={{ boxShadow: "var(--shadow-elegant)" }}
          >
            {submitting ? "Saving…" : "Complete sale"}
          </Button>
          {customerPhone && cart.length > 0 && (
            <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
              <MessageCircle className="w-3 h-3 text-[#25D366]" /> WhatsApp bill will be available after checkout
            </p>
          )}
        </Card>
      </div>
      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} />
    </div>
  );
}

function Row({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}><span>{k}</span><span>{v}</span></div>;
}