import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2, Check, X, Search, AlertCircle, CheckCircle, Package,
} from "lucide-react";

type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  purchase_price: number;
  match_confidence: number;
};

type Product = { id: string; name: string; stock: number; purchase_price: number };

type OcrReviewProps = {
  invoiceId: string;
  items: InvoiceItem[];
  products: Product[];
  onConfirmed: () => void;
  onCancel: () => void;
};

export function OcrReview({ invoiceId, items: initialItems, products, onConfirmed, onCancel }: OcrReviewProps) {
  const [items, setItems] = useState<InvoiceItem[]>(initialItems);
  const [confirming, setConfirming] = useState(false);
  const [search, setSearch] = useState<Record<string, string>>({});

  function updateItem(id: string, field: keyof InvoiceItem, value: any) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function matchProduct(itemId: string, product: Product) {
    setItems((prev) => prev.map((item) =>
      item.id === itemId
        ? { ...item, product_id: product.id, product_name: product.name, purchase_price: product.purchase_price, match_confidence: 1.0 }
        : item
    ));
    setSearch((prev) => ({ ...prev, [itemId]: "" }));
  }

  async function handleConfirm() {
    setConfirming(true);
    const { data: { user } } = await supabase.auth.getUser();

    try {
      for (const item of items) {
        if (!item.product_id) continue;

        const product = products.find((p) => p.id === item.product_id);
        if (!product) continue;

        // Update stock
        await supabase.from("products").update({
          stock: (product.stock ?? 0) + item.quantity,
          purchase_price: item.purchase_price,
        }).eq("id", item.product_id);

        // Log stock movement
        await supabase.from("stock_movements").insert({
          user_id: user!.id,
          product_id: item.product_id,
          type: "purchase",
          quantity: item.quantity,
          note: `OCR Import — Invoice ${invoiceId.slice(0, 8)}`,
        });

        // Update invoice item with matched product
        await supabase.from("purchase_invoice_items").update({
          product_id: item.product_id,
          quantity: item.quantity,
          purchase_price: item.purchase_price,
        }).eq("id", item.id);
      }

      toast.success("Inventory updated from invoice!");
      onConfirmed();
    } catch (err: any) {
      toast.error(err?.message ?? "Import failed");
    } finally {
      setConfirming(false);
    }
  }

  const matchedCount = items.filter((i) => i.product_id).length;
  const unmatchedCount = items.filter((i) => !i.product_id).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle className="w-4 h-4" /> {matchedCount} matched
        </div>
        {unmatchedCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-amber-600">
            <AlertCircle className="w-4 h-4" /> {unmatchedCount} need review
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {items.map((item) => {
          const confidence = item.match_confidence;
          const isHighConf = confidence >= 0.85;
          const searchVal = search[item.id] ?? "";
          const filteredProducts = searchVal
            ? products.filter((p) => p.name.toLowerCase().includes(searchVal.toLowerCase())).slice(0, 5)
            : [];

          return (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-colors ${
                item.product_id
                  ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.product_id ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                  }`}
                >
                  {item.product_id ? <Check className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.product_name}</span>
                    {item.product_id && (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">
                        {Math.round(confidence * 100)}% match
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Quantity</label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                        className="h-8 text-sm"
                        min="1"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Price (₹)</label>
                      <Input
                        type="number"
                        value={item.purchase_price}
                        onChange={(e) => updateItem(item.id, "purchase_price", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  {/* Product search / override */}
                  {!item.product_id && (
                    <div className="relative">
                      <div className="flex items-center gap-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={searchVal}
                          onChange={(e) => setSearch((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Search product to match…"
                          className="h-8 text-sm pl-8"
                        />
                      </div>
                      {filteredProducts.length > 0 && (
                        <ul className="absolute z-10 top-full left-0 right-0 mt-1 border border-border rounded-lg bg-popover shadow-lg divide-y divide-border max-h-40 overflow-auto">
                          {filteredProducts.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => matchProduct(item.id, p)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                              >
                                <div className="font-medium">{p.name}</div>
                                <div className="text-xs text-muted-foreground">Stock: {p.stock} · ₹{p.purchase_price}</div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {item.product_id && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      onClick={() => {
                        updateItem(item.id, "product_id", null);
                        updateItem(item.id, "match_confidence", 0);
                      }}
                    >
                      <X className="w-3 h-3" /> Unmatch
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || matchedCount === 0}
          className="flex-1"
        >
          {confirming && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Confirm Import ({matchedCount} items)
        </Button>
      </div>
    </div>
  );
}
