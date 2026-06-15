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
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — ShopFlow" }] }),
  component: SuppliersPage,
});

type Supplier = { id: string; name: string; phone: string | null; gst_number: string | null; address: string | null };

function SuppliersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  async function remove(id: string) {
    if (!confirm("Delete supplier?")) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["suppliers"] });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">Suppliers</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Add supplier</Button></DialogTrigger>
          <SupplierForm onSaved={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["suppliers"] }); }} />
        </Dialog>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.length === 0 && <Card className="p-8 text-center text-muted-foreground col-span-full">No suppliers yet.</Card>}
        {rows.map(s => (
          <Card key={s.id} className="p-4 flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                {s.phone && <p className="text-sm text-muted-foreground">{s.phone}</p>}
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
            {s.gst_number && <p className="text-xs text-muted-foreground mt-2">GST: {s.gst_number}</p>}
            {s.address && <p className="text-xs text-muted-foreground mt-1">{s.address}</p>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function SupplierForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", gst_number: "", address: "" });
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("suppliers").insert({ ...form, user_id: user!.id });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Supplier added");
    onSaved();
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add supplier</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} required /></div>
        <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} /></div>
        <div className="space-y-1.5"><Label>GST number</Label><Input value={form.gst_number} onChange={e=>setForm({...form, gst_number:e.target.value})} /></div>
        <div className="space-y-1.5"><Label>Address</Label><Input value={form.address} onChange={e=>setForm({...form, address:e.target.value})} /></div>
        <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}