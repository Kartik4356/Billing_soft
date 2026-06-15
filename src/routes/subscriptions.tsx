import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Package,
  Check,
  Loader2,
  Sparkles,
  Calendar,
  Shield,
  Zap,
  ArrowRight,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "Choose a Plan — ShopFlow" },
      { name: "description", content: "Select a subscription plan to get started with ShopFlow." },
    ],
  }),
  component: SubscriptionsPage,
});

type Plan = {
  id: string;
  name: string;
  plan_type: "TRIAL" | "SIX_MONTH" | "ONE_YEAR";
  duration_days: number;
  price: number;
  is_active: boolean;
};

const PLAN_META: Record<string, { icon: React.ComponentType<{ className?: string }>; badge?: string; features: string[]; color: string; gradient: string }> = {
  TRIAL: {
    icon: Sparkles,
    features: [
      "Full platform access for 30 days",
      "Unlimited products & billing",
      "Inventory tracking",
      "Sales analytics",
      "Available once per account",
    ],
    color: "text-emerald-500",
    gradient: "from-emerald-500/10 to-teal-500/10",
  },
  SIX_MONTH: {
    icon: Calendar,
    features: [
      "Full platform access for 6 months",
      "Unlimited products & billing",
      "Priority support",
      "Advanced reports",
      "Document storage",
    ],
    color: "text-blue-500",
    gradient: "from-blue-500/10 to-indigo-500/10",
  },
  ONE_YEAR: {
    icon: Star,
    badge: "BEST VALUE",
    features: [
      "Full platform access for 12 months",
      "2 months free vs monthly",
      "Unlimited products & billing",
      "Priority support",
      "Advanced analytics & reports",
    ],
    color: "text-violet-500",
    gradient: "from-violet-500/10 to-purple-500/10",
  },
};

function SubscriptionsPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [proceeding, setProceeding] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);

  useEffect(() => {
    (async () => {
      // Load plans
      const { data: plansData } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price");
      if (plansData) setPlans(plansData as Plan[]);

      // Check if user is logged in & trial used
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("trial_used")
          .eq("id", user.id)
          .single();
        if (profile?.trial_used) setTrialUsed(true);
      }

      setLoading(false);
    })();
  }, []);

  async function handleProceed() {
    if (!selected) return toast.error("Please select a plan to continue");
    const plan = plans.find((p) => p.id === selected);
    if (!plan) return;

    if (plan.plan_type === "TRIAL" && trialUsed) {
      return toast.error("Free trial has already been used on this account");
    }

    setProceeding(true);

    if (plan.plan_type === "TRIAL") {
      // Store selection in sessionStorage for registration page
      sessionStorage.setItem("selectedPlan", JSON.stringify(plan));
      navigate({ to: "/register-shop" });
      return;
    }

    // Paid plan — create Razorpay order via Edge Function
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-order", {
        body: { planType: plan.plan_type, amount: plan.price },
      });

      if (error || !data?.orderId) {
        toast.error(data?.error ?? "Failed to create payment order");
        setProceeding(false);
        return;
      }

      // Open Razorpay checkout
      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "ShopFlow",
        description: plan.name,
        order_id: data.orderId,
        handler: function (response: any) {
          // Store plan + razorpay response for registration
          sessionStorage.setItem("selectedPlan", JSON.stringify(plan));
          sessionStorage.setItem("razorpayResponse", JSON.stringify(response));
          navigate({ to: "/register-shop" });
        },
        prefill: {},
        theme: { color: "#6d28d9" },
        modal: {
          ondismiss: () => {
            setProceeding(false);
            toast.error("Payment cancelled");
          },
        },
      };

      // @ts-ignore — Razorpay loaded via script tag
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch {
      toast.error("Payment initialization failed");
      setProceeding(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Package className="w-4 h-4" />
            </div>
            ShopFlow
          </Link>
          <Link to="/auth">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-16">
        {/* Hero text */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Shield className="w-3 h-3" /> Step 1 of 2 — Choose Your Plan
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4 bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-hero)" }}
          >
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Start free, upgrade when ready. Full platform access on every plan.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {plans.map((plan) => {
            const meta = PLAN_META[plan.plan_type];
            const Icon = meta?.icon ?? Zap;
            const isSelected = selected === plan.id;
            const isDisabled = plan.plan_type === "TRIAL" && trialUsed;

            return (
              <button
                key={plan.id}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && setSelected(plan.id)}
                className={`relative text-left rounded-2xl border-2 p-6 transition-all duration-200 ${
                  isDisabled
                    ? "opacity-40 cursor-not-allowed border-border"
                    : isSelected
                    ? "border-primary ring-4 ring-primary/20 shadow-lg scale-[1.02]"
                    : "border-border hover:border-primary/50 hover:shadow-md"
                }`}
              >
                {meta?.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-3 py-1 rounded-full bg-primary text-primary-foreground tracking-wider">
                    {meta.badge}
                  </span>
                )}

                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${meta?.gradient} opacity-60 pointer-events-none`} />

                <div className="relative">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center bg-background/80 ${meta?.color}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-primary-foreground" />
                      </div>
                    )}
                    {isDisabled && (
                      <Badge variant="secondary" className="text-xs">Used</Badge>
                    )}
                  </div>

                  <div className="mb-1 font-bold text-lg">{plan.name}</div>
                  <div className="mb-1">
                    {plan.price === 0 ? (
                      <span className="text-3xl font-bold">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">
                          ₹{plan.price.toLocaleString("en-IN")}
                        </span>
                        <span className="text-muted-foreground text-sm ml-1">
                          / {plan.duration_days} days
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mb-5">
                    {plan.duration_days} day access
                  </div>

                  <ul className="space-y-2">
                    {meta?.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
                        <span className={isDisabled ? "line-through" : ""}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>

        {/* Proceed button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            className="px-10 h-12 text-base shadow-lg"
            style={{ boxShadow: selected ? "var(--shadow-elegant)" : undefined }}
            onClick={handleProceed}
            disabled={!selected || proceeding}
          >
            {proceeding ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <ArrowRight className="w-5 h-5 mr-2" />
            )}
            {proceeding ? "Processing…" : "Continue to Registration"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link to="/auth" className="text-primary hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
