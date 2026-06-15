import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Calendar, Clock, CheckCircle, AlertCircle, ArrowRight, Sparkles, Zap, Star } from "lucide-react";
import { fmtDate, fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({ meta: [{ title: "Subscription — ShopFlow" }] }),
  component: SubscriptionPage,
});

type Subscription = {
  id: string;
  plan: string;
  plan_type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  expires_at: string;
  price: number | null;
  trial_used: boolean | null;
};

const PLAN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  TRIAL: Sparkles,
  SIX_MONTH: Zap,
  ONE_YEAR: Star,
};

function SubscriptionPage() {
  const { data: sub, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data as Subscription | null;
    },
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const daysLeft = sub?.expires_at
    ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86400000)
    : null;

  const planType = sub?.plan_type ?? (sub?.plan === "yearly" ? "ONE_YEAR" : "SIX_MONTH");
  const Icon = PLAN_ICONS[planType] ?? CreditCard;

  const isExpired = sub?.status === "expired" || (daysLeft !== null && daysLeft <= 0);
  const isExpiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 30;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Subscription</h1>
        <p className="text-sm text-muted-foreground">Manage your ShopFlow plan</p>
      </div>

      {/* Expiry warnings */}
      {isExpired && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Subscription Expired</div>
            <div className="text-sm mt-0.5">Your plan has expired. Please renew to continue using inventory and billing features.</div>
          </div>
        </div>
      )}
      {isExpiringSoon && !isExpired && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-200 text-amber-700">
          <Clock className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Expiring Soon</div>
            <div className="text-sm mt-0.5">Your subscription expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}. Renew now to avoid interruption.</div>
          </div>
        </div>
      )}

      {/* Current plan card */}
      {sub ? (
        <Card className="p-6 space-y-5" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">
                  {planType === "TRIAL" ? "Free Trial" : planType === "SIX_MONTH" ? "Six-Month Plan" : "One-Year Plan"}
                </h2>
                <Badge
                  variant={isExpired ? "destructive" : sub.status === "active" ? "default" : "outline"}
                  className="text-xs capitalize"
                >
                  {isExpired ? "Expired" : sub.status}
                </Badge>
              </div>
              {sub.price !== null && sub.price > 0 && (
                <div className="text-sm text-muted-foreground mt-1">
                  Paid: {fmtMoney(sub.price)}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-muted/50 space-y-0.5">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Start Date
              </div>
              <div className="font-medium text-sm">
                {sub.start_date ? fmtDate(sub.start_date) : fmtDate(sub.expires_at)}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-muted/50 space-y-0.5">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="w-3 h-3" /> End Date
              </div>
              <div className={`font-medium text-sm ${isExpired ? "text-destructive" : ""}`}>
                {fmtDate(sub.expires_at)}
              </div>
            </div>
          </div>

          {daysLeft !== null && (
            <div className="p-4 rounded-xl bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Days remaining</span>
                <span className={`text-lg font-bold ${isExpired ? "text-destructive" : isExpiringSoon ? "text-amber-600" : "text-emerald-600"}`}>
                  {Math.max(0, daysLeft)} days
                </span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isExpired ? "bg-destructive" : isExpiringSoon ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{
                    width: `${Math.min(100, Math.max(0, (daysLeft / (planType === "TRIAL" ? 30 : planType === "SIX_MONTH" ? 180 : 365)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border flex gap-3">
            <Link to="/subscriptions" className="flex-1">
              <Button className="w-full" variant={isExpired ? "default" : "outline"}>
                {isExpired ? "Renew Now" : "Upgrade Plan"} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center space-y-4">
          <CreditCard className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
          <h3 className="font-semibold">No subscription found</h3>
          <p className="text-sm text-muted-foreground">Choose a plan to get started.</p>
          <Link to="/subscriptions">
            <Button>Choose a Plan <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </Link>
        </Card>
      )}

      {/* Features included */}
      {sub && !isExpired && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">Included in your plan</h3>
          <ul className="space-y-2">
            {[
              "Full inventory management",
              "Point-of-sale billing",
              "Sales analytics & reports",
              "Supplier management",
              "Customer credit ledger",
              "Barcode scanner support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
