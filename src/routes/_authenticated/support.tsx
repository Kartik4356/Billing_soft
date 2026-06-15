import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, TicketCheck, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — ShopFlow" }] }),
  component: SupportPage,
});

type Ticket = {
  id: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function SupportPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [saving, setSaving] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Ticket[];
    },
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return toast.error("Subject and description are required");
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_tickets").insert({
      user_id: user!.id,
      subject: subject.trim(),
      description: description.trim(),
      priority,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Support ticket created");
    setOpen(false);
    setSubject("");
    setDescription("");
    setPriority("medium");
    qc.invalidateQueries({ queryKey: ["support-tickets"] });
  }

  const statusCounts = {
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    resolved: tickets.filter((t) => t.status === "resolved" || t.status === "closed").length,
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Support Center</h1>
          <p className="text-sm text-muted-foreground">Get help with your ShopFlow account</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Support Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Subject *</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief description of the issue" required />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High — Urgent</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Description *</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your issue in detail…"
                  rows={4}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Submit Ticket
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Open", count: statusCounts.open, icon: Clock, color: "text-blue-500" },
          { label: "In Progress", count: statusCounts.in_progress, icon: AlertCircle, color: "text-amber-500" },
          { label: "Resolved", count: statusCounts.resolved, icon: CheckCircle, color: "text-emerald-500" },
        ].map(({ label, count, icon: Icon, color }) => (
          <Card key={label} className="p-4 flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color}`} />
            <div>
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-xl font-bold">{count}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Tickets list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <TicketCheck className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No support tickets yet.</p>
            <Button variant="outline" onClick={() => setOpen(true)}>Create your first ticket</Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="p-4 md:p-5 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium">{ticket.subject}</span>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>
                    <div className="text-xs text-muted-foreground mt-2">{fmtDateTime(ticket.created_at)}</div>
                  </div>
                  <TicketStatusBadge status={ticket.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = { high: "text-destructive border-destructive/30", medium: "text-amber-600 border-amber-200", low: "text-muted-foreground" };
  return <Badge variant="outline" className={`text-xs capitalize ${map[priority] ?? ""}`}>{priority}</Badge>;
}

function TicketStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-blue-500/10 text-blue-600 border-blue-200" },
    in_progress: { label: "In Progress", className: "bg-amber-500/10 text-amber-600 border-amber-200" },
    resolved: { label: "Resolved", className: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
    closed: { label: "Closed", className: "text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <Badge variant="outline" className={`text-xs shrink-0 ${s.className}`}>{s.label}</Badge>;
}
