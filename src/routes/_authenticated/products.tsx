import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, ScanLine } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { BarcodeScanner } from "@/components/BarcodeScanner";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products — ShopFlow" }] }),
  component: ProductsPage,
});

type Product = {
  id: string; name: string; sku: string | null; barcode: string | null;
  purchase_price: number; selling_price: number; stock: number; low_stock_threshold: number;
};

function ProductsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const filtered = products.filter(p =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()) || p.barcode?.includes(q));

  async function softDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Product deleted");
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">{products.length} items</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEdit(null)}><Plus className="w-4 h-4 mr-1" /> Add product</Button>
          </DialogTrigger>
          <ProductForm product={edit} onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["products"] }); }} />
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, SKU, or barcode" className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div> :
          filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted-foreground mb-3">No products yet.</p>
              <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Add your first product</Button>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.sku || "—"}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(p.purchase_price)}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(p.selling_price)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={p.stock <= p.low_stock_threshold ? "text-destructive font-medium" : ""}>{p.stock}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => { setEdit(p); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => softDelete(p.id)}><Trash2 className="w-4 h-4" /></Button>
                    </td>
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

function ProductForm({ product, onSaved }: { product: Product | null; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    purchase_price: String(product?.purchase_price ?? ""),
    selling_price: String(product?.selling_price ?? ""),
    stock: String(product?.stock ?? "0"),
    low_stock_threshold: String(product?.low_stock_threshold ?? "5"),
  });
  const [saving, setSaving] = useState(false);
  const [scan, setScan] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      user_id: user!.id,
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      purchase_price: Number(form.purchase_price || 0),
      selling_price: Number(form.selling_price || 0),
      stock: Number(form.stock || 0),
      low_stock_threshold: Number(form.low_stock_threshold || 0),
    };
    const { error } = product
      ? await supabase.from("products").update(payload).eq("id", product.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(product ? "Product updated" : "Product added");
    onSaved();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <Row label="Name"><Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} required /></Row>
        <div className="grid grid-cols-2 gap-3">
          <Row label="SKU"><Input value={form.sku} onChange={e=>setForm({...form, sku:e.target.value})} /></Row>
          <Row label="Barcode">
            <div className="flex gap-2">
              <Input value={form.barcode} onChange={e=>setForm({...form, barcode:e.target.value})} />
              <Button type="button" variant="outline" size="icon" onClick={() => setScan(true)} title="Scan">
                <ScanLine className="w-4 h-4" />
              </Button>
            </div>
          </Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Purchase price (₹)"><Input type="number" step="0.01" value={form.purchase_price} onChange={e=>setForm({...form, purchase_price:e.target.value})} required /></Row>
          <Row label="Selling price (₹)"><Input type="number" step="0.01" value={form.selling_price} onChange={e=>setForm({...form, selling_price:e.target.value})} required /></Row>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Row label="Stock"><Input type="number" value={form.stock} onChange={e=>setForm({...form, stock:e.target.value})} /></Row>
          <Row label="Low-stock alert at"><Input type="number" value={form.low_stock_threshold} onChange={e=>setForm({...form, low_stock_threshold:e.target.value})} /></Row>
        </div>
        <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </form>
      <BarcodeScanner open={scan} onClose={() => setScan(false)} onDetected={(code) => setForm((f) => ({ ...f, barcode: code }))} />
    </DialogContent>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}