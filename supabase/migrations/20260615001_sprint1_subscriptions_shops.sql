-- ============================================================
-- Sprint 1: Subscription Plans + Shops + Documents + Payments
-- ============================================================

-- 1. Extend app_role enum to include 'admin' if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'admin'
      AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'admin';
  END IF;
END $$;

-- 2. subscription_plans — configurable pricing table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  plan_type   TEXT NOT NULL CHECK (plan_type IN ('TRIAL','SIX_MONTH','ONE_YEAR')),
  duration_days INTEGER NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active plans" ON public.subscription_plans
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage plans" ON public.subscription_plans
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Seed default plans
INSERT INTO public.subscription_plans (name, plan_type, duration_days, price) VALUES
  ('Free Trial',     'TRIAL',     30,  0),
  ('Six-Month Plan', 'SIX_MONTH', 180, 1499),
  ('One-Year Plan',  'ONE_YEAR',  365, 2499)
ON CONFLICT DO NOTHING;

-- 3. shops — business entity table (separate from auth profiles)
CREATE TABLE IF NOT EXISTS public.shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'General Store',
  address         TEXT,
  city            TEXT,
  state           TEXT,
  pincode         TEXT,
  owner_name      TEXT,
  mobile          TEXT,
  email           TEXT,
  pan_number      TEXT,
  gst_number      TEXT,
  support_status  TEXT NOT NULL DEFAULT 'active' CHECK (support_status IN ('active','suspended','disabled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX shops_user_idx ON public.shops(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own shop access" ON public.shops
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all shops" ON public.shops
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all shops" ON public.shops
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER shops_touch_updated_at
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. shop_documents
CREATE TABLE IF NOT EXISTS public.shop_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('pan_card','shop_license','address_proof')),
  file_url      TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified      BOOLEAN NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shop_documents TO authenticated;
GRANT ALL ON public.shop_documents TO service_role;
ALTER TABLE public.shop_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own documents" ON public.shop_documents
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_id AND s.user_id = auth.uid()));
CREATE POLICY "Admins read all documents" ON public.shop_documents
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all documents" ON public.shop_documents
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- 5. Extend subscriptions table with new columns
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS shop_id       UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_type     TEXT CHECK (plan_type IN ('TRIAL','SIX_MONTH','ONE_YEAR')),
  ADD COLUMN IF NOT EXISTS price         NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date    TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS end_date      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_used    BOOLEAN DEFAULT false;

-- Extend status check to include new values
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('active','expired','cancelled','suspended'));

-- 6. subscription_payments
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id              UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  subscription_id      UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  amount               NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency             TEXT NOT NULL DEFAULT 'INR',
  payment_status       TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','captured','failed','refunded')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own payments" ON public.subscription_payments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shops s WHERE s.id = shop_id AND s.user_id = auth.uid()));
CREATE POLICY "Admins read all payments" ON public.subscription_payments
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 7. Add trial_used to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city    TEXT,
  ADD COLUMN IF NOT EXISTS state   TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT;

-- 8. Support tickets
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  description TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tickets_user_idx ON public.support_tickets(user_id);
CREATE INDEX tickets_status_idx ON public.support_tickets(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all tickets" ON public.support_tickets
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update all tickets" ON public.support_tickets
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER tickets_touch_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 9. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_idx ON public.audit_logs(user_id, created_at DESC);
GRANT INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own audit logs read" ON public.audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert own audit logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all audit logs" ON public.audit_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 10. purchase_invoices (OCR Sprint 4 tables added now to avoid future disruption)
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id    UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  file_url       TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date   DATE,
  total_amount   NUMERIC(12,2),
  ocr_status     TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','processing','completed','failed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own invoices" ON public.purchase_invoices
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 0,
  purchase_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  match_confidence NUMERIC(5,2) DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_items TO authenticated;
GRANT ALL ON public.purchase_invoice_items TO service_role;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own invoice items" ON public.purchase_invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = invoice_id AND pi.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_invoices pi WHERE pi.id = invoice_id AND pi.user_id = auth.uid()));

-- 11. Extend sales table for WhatsApp (Sprint 5 — added now)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_phone  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_sent   BOOLEAN NOT NULL DEFAULT false;
