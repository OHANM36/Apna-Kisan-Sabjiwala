-- =========================================================
-- अपना किसान सब्ज़ीवाला - डिलीवरी बॉय मॉड्यूल (संगतता फाइल)
--
-- ⚠️ पुराने संस्करण में PIN plaintext में था और anon key से पढ़ा/जाँचा जाता था — यह असुरक्षित था
--    (Production Audit C5), इसलिए वे policies और PIN-कॉलम अब हटा दिए गए हैं।
--
-- अब:
--   • PIN सिर्फ़ bcrypt hash में (delivery_boys.pin_hash); लॉगिन/ऑर्डर-सूची/claim/confirm सब
--     security-definer RPC से (security_hardening.sql में: delivery_login, delivery_orders,
--     delivery_claim_order, delivery_confirm) और session token सर्वर पर।
--   • एडमिन पैनल /admin/delivery-boys → नया डिलीवरी बॉय जोड़ें / PIN बदलें (admin_save_delivery_boy)।
--
-- पुराने DB पर इस फाइल की जगह सिर्फ़ supabase/security_hardening.sql चलाना काफ़ी है।
-- यह फाइल सिर्फ़ ज़रूरी टेबल/कॉलम बनाती है और दोबारा चलाने पर कोई खुली policy वापस नहीं लाती।
-- =========================================================

create table if not exists delivery_boys (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  pin_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table orders add column if not exists delivery_boy_id uuid references delivery_boys(id) on delete set null;
create index if not exists idx_orders_delivery_boy on orders(delivery_boy_id);
alter table orders add column if not exists delivery_pin text;
alter table delivery_boys enable row level security;

-- एडमिन के लिए policies (पढ़ना/लिखना). public read जान-बूझकर नहीं है।
drop policy if exists "delivery_boys_public_read" on delivery_boys;
drop policy if exists "delivery_boys_admin_read" on delivery_boys;
create policy "delivery_boys_admin_read" on delivery_boys for select using (is_admin());
drop policy if exists "delivery_boys_admin_write" on delivery_boys;
create policy "delivery_boys_admin_write" on delivery_boys for insert with check (is_admin());
drop policy if exists "delivery_boys_admin_update" on delivery_boys;
create policy "delivery_boys_admin_update" on delivery_boys for update using (is_admin());
drop policy if exists "delivery_boys_admin_delete" on delivery_boys;
create policy "delivery_boys_admin_delete" on delivery_boys for delete using (is_admin());

-- पुराना खुला "डिलीवरी बॉय कोई भी स्टेटस बदल दे" नियम हटाया गया (अब delivery_claim_order / delivery_confirm RPC)
drop policy if exists "orders_delivery_update" on orders;
