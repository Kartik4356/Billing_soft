import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Package, ShoppingCart, Boxes, Truck, Settings,
  LogOut, Menu, X, BarChart3, Wallet, ShieldCheck, TicketCheck, CreditCard,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const baseNav = [
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/pos", label: "New Sale", Icon: ShoppingCart },
  { to: "/products", label: "Products", Icon: Package },
  { to: "/inventory", label: "Inventory", Icon: Boxes },
  { to: "/suppliers", label: "Suppliers", Icon: Truck },
  { to: "/reports", label: "Reports", Icon: BarChart3 },
  { to: "/credits", label: "Credits", Icon: Wallet },
  { to: "/subscription", label: "Subscription", Icon: CreditCard },
  { to: "/support", label: "Support", Icon: TicketCheck },
  { to: "/settings", label: "Settings", Icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      setIsAdmin(!!data);
    })();
  }, []);

  const nav = isAdmin
    ? [{ to: "/admin", label: "Admin", Icon: ShieldCheck } as const, ...baseNav]
    : baseNav;

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <Brand />
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-sidebar text-sidebar-foreground flex flex-col">
            <Brand onClose={() => setOpen(false)} />
            <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
              {nav.map(({ to, label, Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-sidebar-border">
              <Button
                variant="ghost"
                className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={signOut}
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </Button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b border-border bg-card flex items-center justify-between px-4 py-3">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2">
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-semibold">ShopFlow</div>
          <div className="w-9" />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function Brand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="px-5 py-5 flex items-center justify-between">
      <Link to="/dashboard" className="flex items-center gap-2 font-bold">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Package className="w-4 h-4" />
        </div>
        ShopFlow
      </Link>
      {onClose && <button onClick={onClose}><X className="w-5 h-5" /></button>}
    </div>
  );
}