-- Apna Kisan Sabjiwala: Vendor <-> Seller Profile association
-- Run after schema.sql in Supabase SQL Editor. Safe to re-run.

-- Customer app can discover only approved + active seller profiles.
drop policy if exists "sellers_public_read_active" on sellers;
create policy "sellers_public_read_active"
on sellers for select
using (is_approved = true and is_active = true);

-- Keep seller ownership/admin editing rules intact.
drop policy if exists "sellers_self_read" on sellers;
create policy "sellers_self_read"
on sellers for select
using (auth.uid() = id or is_admin() or (is_approved = true and is_active = true));

-- Seller profile is the single source of truth for vendor identity.
-- vegetables.seller_id -> sellers.id
-- order_items.seller_id -> sellers.id
-- No separate customer-app vendor table is required.

-- Ensure existing databases have the profile photo field.
alter table sellers add column if not exists photo_url text;

-- Useful indexes for customer vendor browsing and seller product/order loading.
create index if not exists idx_sellers_public on sellers (is_approved, is_active, business_name);
create index if not exists idx_vegetables_seller_active on vegetables (seller_id, is_active, display_order);
create index if not exists idx_order_items_seller on order_items (seller_id);
