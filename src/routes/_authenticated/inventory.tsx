import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload, Loader2, ScanText, FileText } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { OcrReview } from "@/components/OcrReview";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — ShopFlow" }] }),
  component: Inventory,
});

type Movement = {
  id: string; created_at: string; type: string; quantity: number; note: string | null;
  products: { name: string } | null;
};

type InvoiceItem = {
  id: string; invoice_id: string; product_id: string | null;
  product_name: string; quantity: number; purchase_price: number; match_confidence: number;
};

type Product = { id: string; name: string; stock: number; purchase_price: number };

function Inventory() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [ocrItems, setOcrItems] = useState<InvoiceItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: movements = [] } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, created_at, type, quantity, note, products(name)")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as unknown as Movement[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, stock, purchase_price")
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as Product[];
    },
  });

  async function handleInvoiceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Upload to storage
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/invoices/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("shop-documents")
      .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadErr) {
      toast.error(`Upload failed: ${uploadErr.message}`);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("shop-documents").getPublicUrl(path);
    const fileUrl = urlData.publicUrl;

    // Create invoice record
    const { data: invoice, error: invErr } = await supabase
      .from("purchase_invoices")
      .insert({ user_id: user!.id, file_url: fileUrl })
      .select()
      .single();

    if (invErr || !invoice) {
      toast.error("Failed to create invoice record");
      setUploading(false);
      return;
    }

    setUploading(false);
    setOcrLoading(true);
    toast.info("Processing invoice with OCR…");

    // Call OCR Edge Function
    const { data: ocrData, error: ocrErr } = await supabase.functions.invoke("ocr-invoice", {
      body: { invoiceId: invoice.id, fileUrl },
    });

    setOcrLoading(false);

    if (ocrErr || !ocrData?.success) {
      toast.error(ocrData?.error ?? "OCR processing failed");
      return;
    }

    // Fetch parsed items from DB
    const { data: itemsData } = await supabase
      .from("purchase_invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id);

    if (!itemsData?.length) {
      toast.warning("No items could be extracted from this invoice");
      return;
    }

    setInvoiceId(invoice.id);
    setOcrItems(itemsData as InvoiceItem[]);
    setOcrOpen(true);

    if (ocrData.mock) {
      toast.info("Using demo data — add GOOGLE_VISION_API_KEY to Supabase for real OCR");
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">Stock movements log</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Upload Invoice (OCR) */}
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || ocrLoading}
          >
            {uploading || ocrLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ScanText className="w-4 h-4 mr-2" />
            )}
            {uploading ? "Uploading…" : ocrLoading ? "Scanning…" : "Upload Invoice"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={handleInvoiceUpload}
          />

          {/* Manual stock entry */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1" /> Stock entry</Button>
            </DialogTrigger>
            <StockForm onSaved={() => { setOpen(false); qc.invalidateQueries(); }} />
          </Dialog>
        </div>
      </div>

      {/* OCR info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10">
        <ScanText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-medium text-primary">Invoice OCR</span>
          <span className="text-muted-foreground"> — Upload a distributor bill (JPG, PNG, or PDF) to automatically extract and import stock items.</span>
        </div>
      </div>

      <Card className="overflow-hidden">
        {movements.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No stock movements yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                    <td className="px-4 py-3 font-medium">{m.products?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs uppercase ${
                        m.note?.includes("OCR") ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                      }`}>
                        {m.note?.includes("OCR") ? "📄 OCR" : m.type}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${m.quantity > 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* OCR Review Dialog */}
      <Dialog open={ocrOpen} onOpenChange={(o) => { if (!o) { setOcrOpen(false); setOcrItems([]); setInvoiceId(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Review Extracted Items
            </DialogTitle>
          </DialogHeader>
          {invoiceId && ocrItems.length > 0 && (
            <OcrReview
              invoiceId={invoiceId}
              items={ocrItems}
              products={products}
              onConfirmed={() => {
                setOcrOpen(false);
                setOcrItems([]);
                setInvoiceId(null);
                qc.invalidateQueries();
              }}
              onCancel={() => {
                setOcrOpen(false);
                setOcrItems([]);
                setInvoiceId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StockForm({ onSaved }: { onSaved: () => void }) {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, stock, purchase_price").is("deleted_at", null).order("name");
      return data ?? [];
    },
  });
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"purchase" | "adjustment" | "return">("purchase");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return toast.error("Pick a product");
    setSaving(true);
    const p = products.find((p) => p.id === productId)!;
    const delta = Number(qty);
    const signed = type === "adjustment" ? delta : Math.abs(delta);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: mErr } = await supabase.from("stock_movements").insert({
      user_id: user!.id, product_id: productId, type, quantity: signed, note: note || null,
    });
    if (mErr) { setSaving(false); return toast.error(mErr.message); }
    const { error: pErr } = await supabase.from("products").update({ stock: (p.stock ?? 0) + signed }).eq("id", productId);
    setSaving(false);
    if (pErr) return toast.error(pErr.message);
    toast.success("Stock updated");
    onSaved();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add stock entry</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Product</Label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— Select —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (in stock: {p.stock})</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="purchase">Purchase (in)</option>
              <option value="return">Return (in)</option>
              <option value="adjustment">Adjustment (signed)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Restock from XYZ" />
        </div>
        <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}