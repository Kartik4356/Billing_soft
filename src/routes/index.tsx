import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Package, ScanLine, BarChart3, ShoppingCart, ArrowRight, Sparkles, Shield, Zap, Star } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShopFlow — Smart Inventory & Billing for Small Shops" },
      { name: "description", content: "Bill customers in seconds, track inventory automatically, and see your sales and profit in real time." },
      { property: "og:title", content: "ShopFlow — Smart Inventory & Billing" },
      { property: "og:description", content: "Replace notebooks and Excel. Built for stationery, general, hardware, mobile, gift and electronics shops." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-primary)" }}>
              <Package className="w-4 h-4" />
            </div>
            ShopFlow
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/subscriptions"><Button>Get started <ArrowRight className="ml-1 w-4 h-4" /></Button></Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium mb-6">
          <Sparkles className="w-3 h-3" /> Built for India's small retail shops
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-hero)" }}>
          Run your shop, not your spreadsheet.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
          ShopFlow turns inventory, billing, and daily numbers into one fast, mobile-first app. Bill a customer in 10 seconds. See profit by the minute.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link to="/subscriptions">
            <Button size="lg" className="shadow-lg" style={{ boxShadow: "var(--shadow-elegant)" }}>
              Start free — 30 days <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-16 grid md:grid-cols-3 gap-6">
        {[
          { Icon: ShoppingCart, t: "Lightning POS", d: "Search or scan, add to cart, print. Stock decrements automatically on every sale." },
          { Icon: ScanLine, t: "Smart Inventory", d: "Low-stock alerts, supplier-linked stock-ins, and a clean audit trail of every movement." },
          { Icon: BarChart3, t: "Live Insights", d: "Today's revenue, profit, top sellers, and dead stock — all on one dashboard." },
        ].map(({ Icon, t, d }) => (
          <div key={t} className="p-6 rounded-2xl bg-card border border-border" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="w-10 h-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center mb-4">
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold mb-1">{t}</h3>
            <p className="text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-2xl border border-border bg-card p-8 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Shield className="w-3 h-3" /> Flexible Pricing
          </div>
          <h2 className="text-3xl font-bold mb-2">Simple, transparent plans</h2>
          <p className="text-muted-foreground mb-6">Start with a free 30-day trial. No credit card required.</p>
          <div className="flex items-center justify-center gap-6 flex-wrap mb-8">
            {[
              { icon: Sparkles, label: "30-Day Free Trial", sub: "₹0", color: "text-emerald-500" },
              { icon: Zap, label: "Six-Month Plan", sub: "₹1,499", color: "text-blue-500" },
              { icon: Star, label: "One-Year Plan", sub: "₹2,499", color: "text-violet-500" },
            ].map(({ icon: Icon, label, sub, color }) => (
              <div key={label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-background min-w-[160px]">
                <Icon className={`w-5 h-5 ${color}`} />
                <div className="text-left">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-lg font-bold">{sub}</div>
                </div>
              </div>
            ))}
          </div>
          <Link to="/subscriptions">
            <Button size="lg" style={{ boxShadow: "var(--shadow-elegant)" }}>
              Choose a plan <ArrowRight className="ml-1 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ShopFlow
      </footer>
    </div>
  );
}
