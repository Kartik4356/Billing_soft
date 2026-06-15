import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Printer, MessageCircle, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/receipt/$saleId")({
  head: () => ({ meta: [{ title: "Receipt — ShopFlow" }] }),
  component: Receipt,
});

function Receipt() {
  const { saleId } = Route.useParams();

  const { data } = useQuery({
    queryKey: ["receipt", saleId],
    queryFn: async () => {
      const [{ data: sale }, { data: items }, { data: profile }] = await Promise.all([
        supabase.from("sales").select("*").eq("id", saleId).single(),
        supabase.from("sale_items").select("*").eq("sale_id", saleId),
        supabase.from("profiles").select("shop_name, full_name").maybeSingle(),
      ]);
      return { sale, items: items ?? [], profile };
    },
  });

  if (!data?.sale) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  const { sale, items, profile } = data;

  function buildText() {
    const lines = [
      `*${profile?.shop_name || "ShopFlow"}*`,
      `Receipt #${sale!.id.slice(0, 8).toUpperCase()}`,
      `${fmtDateTime(sale!.created_at)}`,
      sale!.customer_name ? `Customer: ${sale!.customer_name}` : "",
      "",
      ...items.map((i) => `${i.product_name} x${i.quantity} — ${fmtMoney(Number(i.price) * i.quantity)}`),
      "",
      `Total: ${fmtMoney(Number(sale!.total))}`,
      `Payment: ${(sale as any).payment_method}`,
      "",
      "Thank you! 🙏",
    ];
    return lines.filter(Boolean).join("\n");
  }

  const customerPhone = (sale as any).customer_phone;
  const phoneDigits = customerPhone ? customerPhone.replace(/\D/g, "") : "";
  // If we have a phone, send to that number; otherwise open picker
  const waUrl = phoneDigits && phoneDigits.length >= 10
    ? `https://wa.me/91${phoneDigits}?text=${encodeURIComponent(buildText())}`
    : `https://wa.me/?text=${encodeURIComponent(buildText())}`;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" /> Print</Button>
          <a href={waUrl} target="_blank" rel="noreferrer">
            <Button><MessageCircle className="w-4 h-4 mr-1" /> WhatsApp</Button>
          </a>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 md:p-8 print:border-0 print:shadow-none">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">{profile?.shop_name || "ShopFlow"}</h1>
          <p className="text-xs text-muted-foreground mt-1">Receipt #{sale.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-muted-foreground">{fmtDateTime(sale.created_at)}</p>
        </div>

        {sale.customer_name && <p className="text-sm mb-1"><strong>Customer:</strong> {sale.customer_name}</p>}
        {customerPhone && <p className="text-sm mb-4"><strong>Phone:</strong> {customerPhone}</p>}

        <table className="w-full text-sm border-t border-b border-border my-4">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Price</th><th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="py-2">{i.product_name}</td>
                <td className="py-2 text-right">{i.quantity}</td>
                <td className="py-2 text-right">{fmtMoney(Number(i.price))}</td>
                <td className="py-2 text-right font-medium">{fmtMoney(Number(i.price) * i.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-baseline mt-4">
          <span className="font-medium">Total</span>
          <span className="text-2xl font-bold">{fmtMoney(Number(sale.total))}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-2 capitalize">Payment: {sale.payment_method}</p>

        <p className="text-center text-sm text-muted-foreground mt-8">Thank you for your business!</p>
      </div>
    </div>
  );
}