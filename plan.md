# Smart Inventory & Billing Platform — Regenerated Plan

## Vision
A mobile-first, web-based inventory, point-of-sale, and analytics platform for small retail shops (stationery, general stores, hardware, mobile accessories, gift, toy, electronics). Replace notebooks and Excel with a tool a shop owner can run from a phone or laptop.

## Outcomes
- Bill a customer in under 10 seconds.
- Inventory updates automatically on every sale and purchase.
- Live visibility of revenue, profit, low stock, and best/worst sellers.
- Optional AI invoice scanning to fast-track supplier intake.

## Tech Stack (this implementation)
- Frontend: TanStack Start (React 19) + Tailwind v4 + shadcn/ui.
- Backend: Lovable Cloud (Postgres + Auth + Storage + Edge).
- AI (Phase 3): Lovable AI gateway (Gemini 2.5) for invoice OCR/extraction.
- Auth: Email/password (default); Google sign-in optional.

## Roles
- **Owner** — full access. Auto-assigned on signup.
- **Employee** (Phase 2) — POS + product search only; no reports/settings/deletes.

## Data Model (implemented Phase 1)
- `profiles(id, full_name, shop_name, shop_category)`
- `user_roles(user_id, role)` with `app_role` enum and `has_role()` security-definer.
- `categories(name)`
- `suppliers(name, phone, gst_number, address)`
- `products(name, sku, barcode, category_id, purchase_price, selling_price, stock, low_stock_threshold, deleted_at)`
- `sales(customer_name, total, profit, payment_method)`
- `sale_items(sale_id, product_id, product_name, quantity, price, cost)`
- `stock_movements(product_id, type, quantity, note, supplier_id)`

Every table has RLS scoped by `auth.uid()`; a trigger on `auth.users` creates the profile + owner role.

## Phased Roadmap

### Phase 1 — Shippable MVP (this build)
1. Auth (email/password) + protected app shell.
2. Onboarding: capture shop name & category on first login.
3. Products: CRUD, search, low-stock threshold, soft delete.
4. Categories: inline create.
5. Inventory: manual stock-in / adjustment with stock_movement log.
6. Suppliers: CRUD.
7. POS / Billing: search-add, cart, checkout → creates sale, decrements stock, computes profit.
8. Dashboard: today's sales, today's profit, inventory value, product count, low-stock list, top sellers (last 30d), recent sales, 7-day sales chart.
9. Settings: shop profile, sign out.

### Phase 2 — Operational depth
- Barcode scan via camera (`@zxing/browser`).
- Receipts: printable HTML receipt + WhatsApp share link.
- Employee role + invite flow.
- Customer credit ledger.
- Date-range reports (sales / profit / inventory) with CSV export.

### Phase 3 — Intelligence
- AI invoice scan: upload image/PDF → Lovable AI extracts line items → user reviews → stock auto-updated.
- Reorder suggestions from avg daily sales × lead time.
- Dead-stock + seasonality insights.
- Demand forecast per SKU.

## Success Metric
A shop owner can register, add their first 20 products, bill a customer, and see today's revenue and low-stock items — all within their first 10 minutes on the app.