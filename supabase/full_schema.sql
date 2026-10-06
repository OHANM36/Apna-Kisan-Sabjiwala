-- =========================================================
-- अपना किसान सब्ज़ीवाला — FULL SCHEMA (नई इंस्टॉलेशन के लिए एक ही फ़ाइल)
--
-- यह फ़ाइल नीचे की 12 माइग्रेशन फ़ाइलों को सही क्रम में जोड़कर बनी है।
-- सिर्फ़ NEW / खाली Supabase प्रोजेक्ट पर, SQL Editor में पूरी एक बार चलाएँ।
-- (दोबारा चलाना भी सुरक्षित है — सब कुछ idempotent है।)
--
-- क्रम:
--    1) schema.sql                       बुनियादी टेबल, RLS नीतियाँ, डेमो श्रेणियाँ/सब्ज़ियाँ
--    2) pricing_engine.sql               Dynamic Pricing Engine (owner-only लागत/मार्जिन टेबल)
--    3) vendor_seller_association.sql    विक्रेता ↔ सेलर प्रोफ़ाइल
--    4) delivery_boy_module.sql          डिलीवरी बॉय टेबल
--    5) security_hardening.sql           सुरक्षा (place_order, token-आधारित पहुँच, PIN hash, Storage नीतियाँ)
--    6) cod_payment.sql                  कैश ऑन डिलीवरी
--    7) pay_online_on_delivery.sql       डिलीवरी पर ऑनलाइन (UPI) भुगतान
--    8) delivery_orders_date.sql         डिलीवरी पेज में डिलीवरी-तारीख
--    9) shipping_labels.sql              शिपिंग लेबल / बैग गिनती
--   10) order_status_workflow.sql        ऑर्डर-स्थिति नियम, रद्दीकरण, इतिहास
--   11) push_notifications.sql           एडमिन Web Push
--   12) customer_push.sql                ग्राहक Web Push (स्थिति बदलने पर)
--
-- अलग से (इस फ़ाइल में नहीं):
--   • supabase/seed_vegetables_optional.sql  → वैकल्पिक: आपकी असली सब्ज़ी-सूची (डेमो सूची हटाकर)
--   • पहला एडमिन यूज़र बनाना और push_config के मान → DEPLOY_GUIDE_HI.md देखें
-- =========================================================

-- Storage bucket (फोटो के लिए) — पहले से हो तो सिर्फ़ सेटिंग ठीक करता है
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('vegetable-images', 'vegetable-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
exception when others then
  raise notice 'Storage bucket नहीं बना (%): Dashboard → Storage में "vegetable-images" (Public) हाथ से बनाएँ', sqlerrm;
end $$;


-- #########################################################
-- भाग 1/12: schema.sql — बुनियादी टेबल, RLS नीतियाँ, डेमो श्रेणियाँ/सब्ज़ियाँ
-- #########################################################

-- =========================================================
-- अपना किसान सब्ज़ीवाला - Supabase Database Schema
-- इस पूरी फाइल को Supabase Dashboard > SQL Editor में चलाएं
-- =========================================================

-- एक्सटेंशन (UUID जनरेट करने के लिए)
create extension if not exists "pgcrypto";

-- =========================================================
-- 1. एडमिन उपयोगकर्ता टेबल (admin_users)
-- Supabase Auth के साथ जुड़ा हुआ - auth.users से लिंक
-- =========================================================
create table if not exists admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null default 'admin' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

-- =========================================================
-- 1क. विक्रेता (sellers) - मल्टी-वेंडर मार्केटप्लेस के लिए
-- हर seller खुद साइन-अप करता है, एडमिन उसे approve करता है
-- =========================================================
create table if not exists sellers (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  owner_name text not null,
  phone text not null,
  email text,
  photo_url text,
  is_approved boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- सुरक्षा: seller खुद न approve हो सकता है (insert पर भी), न खुद को दोबारा active कर सकता है; सिर्फ एडमिन बदल सकता है
-- (auth.uid() IS NULL = service_role / SQL Editor, वहाँ रोक नहीं)
create or replace function sellers_guard()
returns trigger as $$
begin
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'INSERT' then
      new.is_approved := false;
      new.is_active := true;
    else
      new.is_approved := old.is_approved;
      new.is_active := old.is_active;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_self_approve on sellers;
drop trigger if exists trg_sellers_guard on sellers;
drop trigger if exists trg_sellers_guard on sellers;
create trigger trg_sellers_guard before insert or update on sellers
  for each row execute function sellers_guard();

-- =========================================================
-- 1ख. डिलीवरी बॉय (delivery_boys) - PIN से लॉगिन (Supabase Auth नहीं)
-- हर डिलीवरी बॉय का अपना 4 अंकों का पिन होता है, जिससे वो /delivery पैनल में लॉगिन करता है
-- =========================================================
create table if not exists delivery_boys (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  pin_hash text,                   -- 4 अंकों के पिन का bcrypt hash (plaintext PIN कहीं नहीं रखा जाता)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- PIN सेट/बदलना: एडमिन पैनल → admin_save_delivery_boy() RPC (security_hardening.sql)

-- =========================================================
-- 2. सब्ज़ियों की श्रेणियाँ (categories)
-- =========================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- जैसे: हरी सब्ज़ियाँ
  slug text not null unique,        -- जैसे: hari-sabjiyan
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 3. सब्ज़ियाँ (vegetables)
-- =========================================================
create table if not exists vegetables (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  name text not null,                 -- जैसे: आलू
  emoji text default '🥬',
  image_url text,
  price numeric(10,2) not null,       -- कीमत
  mrp numeric(10,2),                  -- वैकल्पिक: कटी हुई (strikethrough) MRP कीमत — छूट % दिखाने के लिए
  unit text not null default 'किलो',  -- किलो / आधा किलो / ग्राम / गड्डी / नग
  price_tiers jsonb,                  -- वैकल्पिक: मात्रा के हिसाब से अलग-अलग कीमत
                                       -- जैसे: [{"qty":0.5,"unit":"किलो","price":18},{"qty":1,"unit":"किलो","price":30}]
  seller_id uuid references sellers(id) on delete set null,  -- खाली = एडमिन/दुकान की अपनी सब्ज़ी, वरना उस विक्रेता की
  stock_status text not null default 'उपलब्ध' check (stock_status in ('उपलब्ध','अनुपलब्ध')),
  is_featured boolean not null default false,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 4. ऑफर / छूट (offers)
-- =========================================================
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  discount_type text not null default 'percent' check (discount_type in ('percent','flat')),
  discount_value numeric(10,2) not null default 0,
  coupon_code text unique,
  min_order_value numeric(10,2) default 0,
  is_active boolean not null default true,
  valid_from timestamptz default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 5. डिलीवरी सेटिंग (delivery_settings) - सिंगल-रो सेटिंग टेबल
-- =========================================================
create table if not exists delivery_settings (
  id int primary key default 1,
  min_order_value numeric(10,2) not null default 199,
  delivery_fee numeric(10,2) not null default 20,
  free_delivery_above numeric(10,2),
  business_whatsapp text not null default '918839351985',
  business_name text not null default 'Apna Kisan Sabjiwala',
  is_store_open boolean not null default true,
  constraint single_row check (id = 1)
);
insert into delivery_settings (id) values (1) on conflict (id) do nothing;

-- =========================================================
-- 5क. स्वागत पॉपअप (welcome_popup) - ग्राहक ऐप खोलते ही दिखने वाला संदेश
-- एडमिन पैनल से कभी भी बदला जा सकता है, कोड बदलने की ज़रूरत नहीं
-- =========================================================
create table if not exists welcome_popup (
  id int primary key default 1,
  is_active boolean not null default false,
  title text not null default 'स्वागत है!',
  message text not null default 'अपना किसान सब्ज़ीवाला में आपका स्वागत है — ताज़ी सब्ज़ियाँ अब सीधे आपके घर तक!',
  image_url text,
  button_text text not null default 'ठीक है',
  updated_at timestamptz not null default now(),
  constraint single_row_popup check (id = 1)
);
insert into welcome_popup (id) values (1) on conflict (id) do nothing;

-- =========================================================
-- 6. ग्राहक (customers) - मोबाइल नंबर से पहचान
-- =========================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null unique,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 7. ग्राहक के पते (customer_addresses)
-- =========================================================
create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  full_address text not null,
  mohalla text,
  city text not null default 'Bhopal',
  pincode text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 8. ऑर्डर (orders)
-- =========================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,     -- जैसे: AKS-20260819-0001
  customer_id uuid references customers(id),
  customer_name text not null,
  customer_phone text not null,
  full_address text not null,
  mohalla text,
  city text not null default 'Bhopal',
  pincode text not null,
  delivery_date date,
  delivery_time_slot text,
  extra_notes text,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  coupon_code text,
  total_amount numeric(10,2) not null default 0,
  payment_status text not null default 'लंबित' check (payment_status in ('लंबित','सफल','असफल','रिफंड')),
  payment_method text default 'ऑनलाइन' check (payment_method in ('UPI','ऑनलाइन')),
  order_source text not null default 'वेबसाइट' check (order_source in ('वेबसाइट','AI सहायक','WhatsApp')),
  order_status text not null default 'नया ऑर्डर' check (order_status in (
    'नया ऑर्डर','भुगतान सफल','स्वीकार किया गया','सामान तैयार हो रहा है','डिलीवरी के लिए निकल गया','डिलीवरी पूरी हुई','रद्द'
  )),
  latitude numeric(10,7),
  longitude numeric(10,7),
  delivery_boy_id uuid references delivery_boys(id) on delete set null,  -- कौन सा डिलीवरी बॉय डिलीवर कर रहा है
  delivery_pin text,  -- ग्राहक द्वारा डिलीवरी बॉय को बताया जाने वाला 4 अंकों का पिन (डिलीवरी कन्फर्म करने के लिए)
  delivery_pin_attempts int not null default 0,   -- गलत PIN की कोशिशें (5 के बाद लॉक)
  access_token uuid not null default gen_random_uuid(),  -- ग्राहक की पहुँच का गोपनीय token (सिर्फ ऑर्डर बनाने वाले को मिलता है)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 9. ऑर्डर की वस्तुएँ (order_items)
-- =========================================================
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  vegetable_id uuid references vegetables(id),
  vegetable_name text not null,   -- नाम सेव रखें ताकि बाद में सब्ज़ी डिलीट/बदलने पर भी ऑर्डर रिकॉर्ड सही रहे
  unit text not null,
  price numeric(10,2) not null,
  quantity numeric(10,2) not null default 1,
  item_total numeric(10,2) not null,
  seller_id uuid references sellers(id) on delete set null,  -- किस विक्रेता की सब्ज़ी थी (ऑर्डर के समय)
  seller_name text                    -- विक्रेता का नाम सेव रखें (सब्ज़ी की तरह) ताकि बाद में भी सही दिखे
);

-- =========================================================
-- 10. भुगतान (payments) - Razorpay जैसे गेटवे के रिकॉर्ड
-- =========================================================
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  gateway text not null default 'razorpay',
  gateway_order_id text,
  gateway_payment_id text,
  gateway_signature text,
  amount numeric(10,2) not null,
  status text not null default 'लंबित' check (status in ('लंबित','सफल','असफल','रिफंड')),
  method text,          -- UPI, कार्ड आदि
  created_at timestamptz not null default now()
);

-- =========================================================
-- इंडेक्स (परफॉर्मेंस के लिए)
-- =========================================================
create index if not exists idx_vegetables_category on vegetables(category_id);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_status on orders(order_status);
create index if not exists idx_orders_created on orders(created_at desc);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_orders_delivery_boy on orders(delivery_boy_id);

-- =========================================================
-- updated_at ऑटो-अपडेट ट्रिगर
-- =========================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_vegetables_updated on vegetables;
drop trigger if exists trg_vegetables_updated on vegetables;
create trigger trg_vegetables_updated before update on vegetables
  for each row execute function set_updated_at();

drop trigger if exists trg_orders_updated on orders;
drop trigger if exists trg_orders_updated on orders;
create trigger trg_orders_updated before update on orders
  for each row execute function set_updated_at();

-- =========================================================
-- ऑर्डर नंबर ऑटो-जनरेशन (AKS-YYYYMMDD-XXXX फॉर्मेट)
-- =========================================================
create sequence if not exists order_number_seq;

create or replace function generate_order_number()
returns trigger as $$
begin
  if new.order_number is null then
    new.order_number := 'AKS-' || to_char(now(), 'YYYYMMDD') || '-' ||
      lpad(nextval('order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_order_number on orders;
drop trigger if exists trg_order_number on orders;
create trigger trg_order_number before insert on orders
  for each row execute function generate_order_number();

-- =========================================================
-- डिलीवरी पिन ऑटो-जनरेशन (हर ऑर्डर पर 4 अंकों का रैंडम पिन)
-- ग्राहक यह पिन ऑर्डर कन्फर्मेशन पेज पर देखता है और डिलीवरी के समय
-- डिलीवरी बॉय को बताता है — इससे साबित होता है कि सामान सही व्यक्ति तक पहुँचा
-- =========================================================
create or replace function generate_delivery_pin()
returns trigger as $$
begin
  if new.delivery_pin is null then
    new.delivery_pin := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 10000)::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql set search_path = public, extensions;

drop trigger if exists trg_delivery_pin on orders;
drop trigger if exists trg_delivery_pin on orders;
create trigger trg_delivery_pin before insert on orders
  for each row execute function generate_delivery_pin();

-- =========================================================
-- RLS (Row Level Security) चालू करें
-- =========================================================
alter table categories enable row level security;
alter table vegetables enable row level security;
alter table offers enable row level security;
alter table delivery_settings enable row level security;
alter table welcome_popup enable row level security;
alter table customers enable row level security;
alter table customer_addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table admin_users enable row level security;
alter table sellers enable row level security;
alter table delivery_boys enable row level security;

-- सहायक फंक्शन: क्या मौजूदा उपयोगकर्ता एडमिन है?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from admin_users where id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

-- मालिक = role 'admin' (staff नहीं). pricing_engine.sql में भी यही परिभाषा है।
create or replace function is_owner()
returns boolean as $$
  select exists (select 1 from admin_users where id = auth.uid() and role = 'admin');
$$ language sql security definer stable set search_path = public;

-- ---------- categories: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
drop policy if exists "categories_public_read" on categories;
create policy "categories_public_read" on categories for select using (true);
drop policy if exists "categories_admin_write" on categories;
create policy "categories_admin_write" on categories for insert with check (is_admin());
drop policy if exists "categories_admin_update" on categories;
create policy "categories_admin_update" on categories for update using (is_admin());
drop policy if exists "categories_admin_delete" on categories;
create policy "categories_admin_delete" on categories for delete using (is_admin());

-- ---------- vegetables: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
drop policy if exists "vegetables_public_read" on vegetables;
create policy "vegetables_public_read" on vegetables for select using (
  seller_id is null
  or is_admin()
  or seller_id = auth.uid()
  or exists (select 1 from sellers s where s.id = vegetables.seller_id and s.is_approved and s.is_active)
);
drop policy if exists "vegetables_admin_write" on vegetables;
create policy "vegetables_admin_write" on vegetables for insert with check (is_admin());
drop policy if exists "vegetables_admin_update" on vegetables;
create policy "vegetables_admin_update" on vegetables for update using (is_admin());
drop policy if exists "vegetables_admin_delete" on vegetables;
create policy "vegetables_admin_delete" on vegetables for delete using (is_admin());
drop policy if exists "vegetables_seller_write" on vegetables;
create policy "vegetables_seller_write" on vegetables for insert with check (
  seller_id = auth.uid()
  and exists (select 1 from sellers s where s.id = auth.uid() and s.is_approved and s.is_active)
);
drop policy if exists "vegetables_seller_update" on vegetables;
create policy "vegetables_seller_update" on vegetables for update
  using (seller_id = auth.uid())
  with check (
    seller_id = auth.uid()
    and exists (select 1 from sellers s where s.id = auth.uid() and s.is_approved and s.is_active)
  );
drop policy if exists "vegetables_seller_delete" on vegetables;
create policy "vegetables_seller_delete" on vegetables for delete using (seller_id = auth.uid());

-- ---------- offers: सक्रिय ऑफर सभी देख सकते हैं ----------
drop policy if exists "offers_public_read" on offers;
create policy "offers_public_read" on offers for select using (true);
drop policy if exists "offers_admin_write" on offers;
create policy "offers_admin_write" on offers for insert with check (is_admin());
drop policy if exists "offers_admin_update" on offers;
create policy "offers_admin_update" on offers for update using (is_admin());
drop policy if exists "offers_admin_delete" on offers;
create policy "offers_admin_delete" on offers for delete using (is_admin());

-- ---------- delivery_settings: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
drop policy if exists "delivery_settings_public_read" on delivery_settings;
create policy "delivery_settings_public_read" on delivery_settings for select using (true);
drop policy if exists "delivery_settings_admin_update" on delivery_settings;
create policy "delivery_settings_admin_update" on delivery_settings for update using (is_admin());

-- ---------- welcome_popup: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
drop policy if exists "welcome_popup_public_read" on welcome_popup;
create policy "welcome_popup_public_read" on welcome_popup for select using (true);
drop policy if exists "welcome_popup_admin_update" on welcome_popup;
create policy "welcome_popup_admin_update" on welcome_popup for update using (is_admin());

-- ---------- customers / addresses / orders / order_items / payments ----------
-- सुरक्षा: इन टेबल पर सीधी public पहुँच नहीं है। anon key ब्राउज़र में सबको दिखती है,
-- इसलिए ग्राहक/डिलीवरी/सेलर की सारी पहुँच security-definer RPC से होती है
-- (place_order, get_order_public, customer_orders, delivery_*, seller_order_lines — security_hardening.sql देखें)।
drop policy if exists "customers_admin_read" on customers;
create policy "customers_admin_read"   on customers for select using (is_admin());
drop policy if exists "customers_admin_update" on customers;
create policy "customers_admin_update" on customers for update using (is_admin());
drop policy if exists "customers_admin_delete" on customers;
create policy "customers_admin_delete" on customers for delete using (is_admin());

drop policy if exists "addresses_admin_read" on customer_addresses;
create policy "addresses_admin_read"   on customer_addresses for select using (is_admin());
drop policy if exists "addresses_admin_update" on customer_addresses;
create policy "addresses_admin_update" on customer_addresses for update using (is_admin());
drop policy if exists "addresses_admin_delete" on customer_addresses;
create policy "addresses_admin_delete" on customer_addresses for delete using (is_admin());

drop policy if exists "orders_admin_read" on orders;
create policy "orders_admin_read"   on orders for select using (is_admin());
drop policy if exists "orders_admin_update" on orders;
create policy "orders_admin_update" on orders for update using (is_admin());
drop policy if exists "orders_admin_delete" on orders;
create policy "orders_admin_delete" on orders for delete using (is_admin());

drop policy if exists "order_items_admin_read" on order_items;
create policy "order_items_admin_read"   on order_items for select using (is_admin());
drop policy if exists "order_items_admin_delete" on order_items;
create policy "order_items_admin_delete" on order_items for delete using (is_admin());

drop policy if exists "payments_admin_read" on payments;
create policy "payments_admin_read"   on payments for select using (is_admin());
drop policy if exists "payments_admin_delete" on payments;
create policy "payments_admin_delete" on payments for delete using (is_admin());
-- payments में लिखना सिर्फ़ Edge Functions (service_role) / mark_order_paid() से

-- ---------- admin_users: केवल एडमिन खुद को पढ़ सके ----------
drop policy if exists "admin_users_self_read" on admin_users;
create policy "admin_users_self_read" on admin_users for select using (auth.uid() = id or is_admin());
drop policy if exists "admin_users_owner_insert" on admin_users;
create policy "admin_users_owner_insert" on admin_users for insert with check (is_owner());
drop policy if exists "admin_users_owner_update" on admin_users;
create policy "admin_users_owner_update" on admin_users for update using (is_owner()) with check (is_owner());

-- ---------- sellers: विक्रेता खुद अपना प्रोफाइल देख/अपडेट कर सके, एडमिन सबको देख/approve कर सके ----------
drop policy if exists "sellers_self_read" on sellers;
create policy "sellers_self_read" on sellers for select using (
  auth.uid() = id or is_admin() or (is_approved = true and is_active = true)
);
drop policy if exists "sellers_self_signup" on sellers;
create policy "sellers_self_signup" on sellers for insert with check (auth.uid() = id);
drop policy if exists "sellers_self_update" on sellers;
create policy "sellers_self_update" on sellers for update
  using (auth.uid() = id or is_admin()) with check (auth.uid() = id or is_admin());
drop policy if exists "sellers_admin_delete" on sellers;
create policy "sellers_admin_delete" on sellers for delete using (is_admin());

-- ---------- delivery_boys: सिर्फ एडमिन (लॉगिन delivery_login() RPC से, PIN hash में) ----------
drop policy if exists "delivery_boys_admin_read" on delivery_boys;
create policy "delivery_boys_admin_read" on delivery_boys for select using (is_admin());
drop policy if exists "delivery_boys_admin_write" on delivery_boys;
create policy "delivery_boys_admin_write" on delivery_boys for insert with check (is_admin());
drop policy if exists "delivery_boys_admin_update" on delivery_boys;
create policy "delivery_boys_admin_update" on delivery_boys for update using (is_admin());
drop policy if exists "delivery_boys_admin_delete" on delivery_boys;
create policy "delivery_boys_admin_delete" on delivery_boys for delete using (is_admin());

-- =========================================================
-- शुरुआती डेमो डेटा (श्रेणियाँ)
-- =========================================================
insert into categories (name, slug, display_order) values
  ('सभी सब्ज़ियाँ', 'sabhi-sabjiyan', 0),
  ('आलू और प्याज़', 'aloo-pyaz', 1),
  ('हरी सब्ज़ियाँ', 'hari-sabjiyan', 2),
  ('मौसमी सब्ज़ियाँ', 'mausami-sabjiyan', 3),
  ('पत्तेदार सब्ज़ियाँ', 'patedar-sabjiyan', 4),
  ('जड़ वाली सब्ज़ियाँ', 'jad-wali-sabjiyan', 5),
  ('फल', 'fal', 6),
  ('अन्य सामान', 'anya-samaan', 7)
on conflict (slug) do nothing;

-- शुरुआती डेमो सब्ज़ियाँ
insert into vegetables (category_id, name, emoji, price, unit, display_order)
select id, v.name, v.emoji, v.price, v.unit, v.ord
from categories, (values
  ('आलू और प्याज़','आलू','🥔',30,'किलो',1),
  ('आलू और प्याज़','प्याज़','🧅',35,'किलो',2),
  ('मौसमी सब्ज़ियाँ','टमाटर','🍅',40,'किलो',3),
  ('जड़ वाली सब्ज़ियाँ','गाजर','🥕',50,'किलो',4),
  ('मौसमी सब्ज़ियाँ','फूलगोभी','🥦',45,'किलो',5),
  ('पत्तेदार सब्ज़ियाँ','पालक','🥬',25,'गड्डी',6),
  ('मौसमी सब्ज़ियाँ','खीरा','🥒',35,'किलो',7),
  ('हरी सब्ज़ियाँ','हरी मिर्च','🌶️',60,'किलो',8),
  ('मौसमी सब्ज़ियाँ','बैंगन','🍆',40,'किलो',9),
  ('हरी सब्ज़ियाँ','मटर','🫛',80,'किलो',10)
) as v(cat_name, name, emoji, price, unit, ord)
where categories.name = v.cat_name
  and not exists (select 1 from vegetables x where x.name = v.name);  -- दोबारा चलाने पर डुप्लिकेट नहीं

-- =========================================================
-- पूर्ण। अब Supabase Dashboard > Authentication में एक एडमिन यूज़र बनाएं
-- और उसकी id को admin_users टेबल में इस तरह डालें:
--
-- insert into admin_users (id, full_name, phone)
-- values ('YAHAN-AUTH-USER-KI-UUID-DAALEIN', 'Admin Name', '8839351985');
-- =========================================================

-- =========================================================
-- ⚠️ नीचे के MIGRATION टिप्पणी-ब्लॉक पुराने (असुरक्षित) संस्करण के हैं और सिर्फ़ इतिहास के लिए हैं।
--    इन्हें चलाने की ज़रूरत नहीं — नए DB पर ऊपर की schema.sql काफ़ी है, और पुराने DB पर
--    supabase/security_hardening.sql (सबसे आख़िर में) सारी policies सुरक्षित रूप में दोबारा लगा देती है।
-- =========================================================

-- =========================================================
-- MIGRATION: अगर आपने पहले से यह पूरी schema.sql चला रखी है और
-- सिर्फ orders टेबल में latitude/longitude कॉलम जोड़ने हैं
-- (एडमिन पैनल में ऑर्डर का नक़्शा दिखाने के लिए), तो सिर्फ यह चलाएं:
--
-- alter table orders add column if not exists latitude numeric(10,7);
-- alter table orders add column if not exists longitude numeric(10,7);
-- =========================================================

-- =========================================================
-- MIGRATION: मात्रा के हिसाब से अलग-अलग कीमत (dynamic/tiered pricing)
-- जोड़ने के लिए, अगर आपने पहले से schema.sql चला रखी है तो सिर्फ यह चलाएं:
--
-- alter table vegetables add column if not exists price_tiers jsonb;
-- =========================================================

-- =========================================================
-- MIGRATION: "स्वागत पॉपअप" (dynamic welcome message) जोड़ने के लिए,
-- अगर आपने पहले से schema.sql चला रखी है तो सिर्फ यह चलाएं:
--
-- create table if not exists welcome_popup (
--   id int primary key default 1,
--   is_active boolean not null default false,
--   title text not null default 'स्वागत है!',
--   message text not null default 'अपना किसान सब्ज़ीवाला में आपका स्वागत है — ताज़ी सब्ज़ियाँ अब सीधे आपके घर तक!',
--   image_url text,
--   button_text text not null default 'ठीक है',
--   updated_at timestamptz not null default now(),
--   constraint single_row_popup check (id = 1)
-- );
-- insert into welcome_popup (id) values (1) on conflict (id) do nothing;
-- alter table welcome_popup enable row level security;
-- create policy "welcome_popup_public_read" on welcome_popup for select using (true);
-- create policy "welcome_popup_admin_update" on welcome_popup for update using (is_admin());
-- =========================================================

-- =========================================================
-- MIGRATION: मल्टी-वेंडर मार्केटप्लेस (अलग-अलग विक्रेता/seller) जोड़ने के लिए,
-- अगर आपने पहले से schema.sql चला रखी है तो सिर्फ यह पूरा हिस्सा चलाएं:

-- create table if not exists sellers (
--   id uuid primary key references auth.users(id) on delete cascade,
--   business_name text not null,
--   owner_name text not null,
--   phone text not null,
--   email text,
--   is_approved boolean not null default false,
--   is_active boolean not null default true,
--   created_at timestamptz not null default now()
-- );

-- create or replace function prevent_self_approve()
-- returns trigger as $$
-- begin
--   if not is_admin() then
--     new.is_approved := old.is_approved;
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer;

-- drop trigger if exists trg_prevent_self_approve on sellers;
-- create trigger trg_prevent_self_approve before update on sellers
--   for each row execute function prevent_self_approve();

-- alter table vegetables add column if not exists seller_id uuid references sellers(id) on delete set null;
-- alter table order_items add column if not exists seller_id uuid references sellers(id) on delete set null;

-- alter table sellers enable row level security;
-- create policy "sellers_self_read" on sellers for select using (
--   auth.uid() = id or is_admin() or (is_approved = true and is_active = true)
-- );
-- create policy "sellers_self_signup" on sellers for insert with check (auth.uid() = id);
-- create policy "sellers_self_update" on sellers for update using (auth.uid() = id or is_admin());
-- create policy "sellers_admin_delete" on sellers for delete using (is_admin());

-- drop policy if exists "vegetables_public_read" on vegetables;
-- create policy "vegetables_public_read" on vegetables for select using (
--   seller_id is null
--   or is_admin()
--   or seller_id = auth.uid()
--   or exists (select 1 from sellers s where s.id = vegetables.seller_id and s.is_approved and s.is_active)
-- );
-- create policy "vegetables_seller_write" on vegetables for insert with check (seller_id = auth.uid());
-- create policy "vegetables_seller_update" on vegetables for update using (seller_id = auth.uid());
-- create policy "vegetables_seller_delete" on vegetables for delete using (seller_id = auth.uid());
-- =========================================================

-- =========================================================
-- MIGRATION: विक्रेता की दुकान/प्रोफाइल फोटो जोड़ने के लिए,
-- अगर आपने पहले से schema.sql (sellers टेबल सहित) चला रखी है तो सिर्फ यह चलाएं:
--
-- alter table sellers add column if not exists photo_url text;
-- =========================================================

-- =========================================================
-- MIGRATION: ऑर्डर में विक्रेता का नाम दिखाने के लिए (customer-facing),
-- अगर आपने पहले से schema.sql (seller_id वाला order_items) चला रखी है तो सिर्फ यह चलाएं:
--
-- alter table order_items add column if not exists seller_name text;
-- =========================================================

-- =========================================================
-- MIGRATION: डिलीवरी बॉय (PIN लॉगिन) + ग्राहक डिलीवरी-कन्फर्मेशन पिन मॉड्यूल जोड़ने के लिए,
-- अगर आपने पहले से schema.sql चला रखी है तो supabase/delivery_boy_module.sql
-- फाइल पूरी की पूरी Supabase SQL Editor में चलाएं (दोबारा चलाने के लिए भी सुरक्षित है)।
-- =========================================================

-- =========================================================
-- MIGRATION: सब्ज़ी पर MRP/डिस्काउंट बैज दिखाने के लिए,
-- अगर आपने पहले से schema.sql चला रखी है तो सिर्फ यह चलाएं:
--
-- alter table vegetables add column if not exists mrp numeric(10,2);
-- =========================================================

-- =========================================================
-- MIGRATION: AI ऑर्डर असिस्टेंट के लिए order_source कॉलम जोड़ने हेतु,
-- अगर आपने पहले से schema.sql चला रखी है तो सिर्फ यह चलाएं:
--
-- alter table orders add column if not exists order_source text not null default 'वेबसाइट'
--   check (order_source in ('वेबसाइट','AI सहायक','WhatsApp'));
-- =========================================================

-- #########################################################
-- भाग 2/12: pricing_engine.sql — Dynamic Pricing Engine (owner-only लागत/मार्जिन टेबल)
-- #########################################################

-- =========================================================
-- अपना किसान सब्ज़ीवाला — Dynamic Pricing Engine (डेटाबेस माइग्रेशन)
--
-- कैसे चलाएं: schema.sql (और बाकी मौजूदा माइग्रेशन) के बाद इस पूरी फाइल को
-- Supabase Dashboard > SQL Editor में एक बार चलाएं। दोबारा चलाना सुरक्षित है (idempotent)।
--
-- सुरक्षा का सिद्धांत (बहुत ज़रूरी):
--   `vegetables` की RLS में "सब पढ़ सकते हैं" नीति है (ग्राहक ऐप के लिए); `orders`/`order_items` अब सिर्फ़ एडमिन पढ़ सकता है
--   (ग्राहक की पहुँच RPC से — security_hardening.sql)। फिर भी लागत/मुनाफ़ा अलग owner-only टेबलों में ही रखा है।
--   इसलिए खरीद कीमत, मार्जिन, लागत और मुनाफ़ा उन टेबलों में नहीं रखे गए —
--   वो नीचे की अलग टेबलों में हैं जिन्हें सिर्फ़ मालिक (admin_users.role = 'admin') पढ़ सकता है।
--   ग्राहक को सिर्फ़ `vegetables.price` (प्रकाशित कीमत) दिखती है।
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 0. पहले से कोड में इस्तेमाल हो रहे कॉलम (schema.sql में नहीं थे) — सुरक्षित रूप से जोड़ें
-- ---------------------------------------------------------
alter table vegetables add column if not exists name_en text;
alter table categories add column if not exists name_en text;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------
-- 1. भूमिका: मालिक (owner) बनाम स्टाफ
--    is_admin() (मौजूदा) = admin + staff दोनों. is_owner() = सिर्फ़ role 'admin'.
-- ---------------------------------------------------------
create or replace function is_owner()
returns boolean as $$
  select exists (select 1 from admin_users where id = auth.uid() and role = 'admin');
$$ language sql security definer stable set search_path = public;

-- ---------------------------------------------------------
-- 2. pricing_settings — सिंगल-रो सेटिंग (राउंडिंग, न्यूनतम सुरक्षा, freshness, demand, अलर्ट सीमाएं)
-- ---------------------------------------------------------
create table if not exists pricing_settings (
  id int primary key default 1,
  rounding_mode text not null default 'ceil_1'
    check (rounding_mode in ('ceil_1','nearest_1','nearest_5','psychological','ceil_0_5','nearest_0_5','none')),
  small_unit_rounding_mode text not null default 'ceil_1'
    check (small_unit_rounding_mode in ('ceil_1','nearest_1','nearest_5','psychological','ceil_0_5','nearest_0_5','none')),
  min_safety_margin_pct numeric(6,2) not null default 0 check (min_safety_margin_pct >= 0),
  max_wastage_pct numeric(5,2) not null default 50 check (max_wastage_pct >= 0 and max_wastage_pct < 100),
  max_margin_pct numeric(6,2) not null default 200 check (max_margin_pct >= 0),
  default_wastage_pct numeric(5,2) not null default 5 check (default_wastage_pct >= 0 and default_wastage_pct < 100),
  default_handling_cost numeric(10,2) not null default 0 check (default_handling_cost >= 0),
  default_margin_pct numeric(6,2) not null default 20 check (default_margin_pct >= 0),
  freshness_enabled boolean not null default true,
  freshness_tiers jsonb not null default '[{"minDays":0,"percent":0},{"minDays":1,"percent":5},{"minDays":2,"percent":10},{"minDays":3,"percent":15}]'
    check (jsonb_typeof(freshness_tiers) = 'array'),
  demand_enabled boolean not null default false,
  demand_low_pct numeric(5,2) not null default -5 check (demand_low_pct <= 0 and demand_low_pct >= -90),
  demand_high_pct numeric(5,2) not null default 5 check (demand_high_pct >= 0 and demand_high_pct <= 100),
  demand_max_increase_pct numeric(5,2) not null default 10 check (demand_max_increase_pct >= 0),
  demand_max_decrease_pct numeric(5,2) not null default 10 check (demand_max_decrease_pct >= 0),
  stale_after_days int not null default 2 check (stale_after_days >= 1),
  purchase_change_alert_pct numeric(6,2) not null default 10 check (purchase_change_alert_pct >= 0),
  low_margin_pct numeric(6,2) not null default 8 check (low_margin_pct >= 0),
  high_wastage_pct numeric(5,2) not null default 25 check (high_wastage_pct >= 0 and high_wastage_pct < 100),
  delivery_cost_per_order numeric(10,2) not null default 20 check (delivery_cost_per_order >= 0),
  payment_charge_pct numeric(5,2) not null default 2 check (payment_charge_pct >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint single_row_pricing_settings check (id = 1)
);
insert into pricing_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------
-- 3. pricing_rules — श्रेणी (category) के अनुसार डिफ़ॉल्ट नियम (बदले जा सकते हैं)
--    सब्ज़ी में wastage/margin/handling खाली (NULL) हो तो यही नियम लागू होता है।
-- ---------------------------------------------------------
create table if not exists pricing_rules (
  category_id uuid primary key references categories(id) on delete cascade,
  rule_type text not null default 'normal' check (rule_type in ('regular','normal','leafy','premium')),
  wastage_pct numeric(5,2) not null check (wastage_pct >= 0 and wastage_pct < 100),
  margin_pct numeric(6,2) not null check (margin_pct >= 0),
  handling_cost numeric(10,2) not null default 0 check (handling_cost >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 4. product_pricing — हर सब्ज़ी की प्राइसिंग प्रोफ़ाइल (सिर्फ़ मालिक)
--    सभी "snapshot" रकमें प्रति बेस-यूनिट (किलो/नग/गड्डी) हैं और सेंट्रल इंजन (src/pricing/engine.js)
--    से पब्लिश के समय लिखी जाती हैं — डेटाबेस में फ़ॉर्मूला दोहराया नहीं गया।
-- ---------------------------------------------------------
create table if not exists product_pricing (
  vegetable_id uuid primary key references vegetables(id) on delete cascade,
  version bigint not null default 1,
  purchase_price numeric(10,2) not null check (purchase_price > 0),
  previous_purchase_price numeric(10,2),
  purchase_unit text not null default 'kg' check (purchase_unit in ('kg','500g','250g','200g','100g','piece','bunch')),
  selling_unit text not null default 'kg' check (selling_unit in ('kg','500g','250g','200g','100g','piece','bunch')),
  pack_sizes text[] not null default '{}',
  wastage_pct numeric(5,2) check (wastage_pct is null or (wastage_pct >= 0 and wastage_pct < 100)),
  handling_cost numeric(10,2) check (handling_cost is null or handling_cost >= 0),
  margin_pct numeric(6,2) check (margin_pct is null or margin_pct >= 0),
  demand_level text not null default 'normal' check (demand_level in ('low','normal','high')),
  allow_clearance boolean not null default false,
  manual_override boolean not null default false,
  manual_price numeric(10,2) check (manual_price is null or manual_price > 0),
  loss_price_confirmed boolean not null default false,
  purchase_per_base numeric(10,2) not null,
  effective_cost numeric(10,2) not null,
  base_cost numeric(10,2) not null,
  min_safe_price numeric(10,2) not null,
  recommended_price numeric(10,2) not null,
  published_price numeric(10,2) not null check (published_price > 0),
  previous_published_price numeric(10,2),
  price_source text not null default 'auto' check (price_source in ('auto','manual')),
  min_protection_applied boolean not null default false,
  last_price_updated_at timestamptz not null default now(),
  price_updated_by uuid,
  price_updated_by_name text,
  updated_at timestamptz not null default now(),
  constraint manual_needs_price check (not manual_override or manual_price is not null),
  constraint purchase_sells_compatible check (
    (purchase_unit in ('kg','500g','250g','200g','100g') and selling_unit in ('kg','500g','250g','200g','100g'))
    or purchase_unit = selling_unit
  )
);

-- ---------------------------------------------------------
-- 5. inventory — मौजूदा स्टॉक और स्टॉक कब आया (stock age इसी से निकलती है)
--    स्टाफ भी स्टॉक अपडेट कर सकता है।
-- ---------------------------------------------------------
create table if not exists inventory (
  vegetable_id uuid primary key references vegetables(id) on delete cascade,
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  unit text not null default 'kg' check (unit in ('kg','500g','250g','200g','100g','piece','bunch')),
  stock_received_at date not null default ((now() at time zone 'Asia/Kolkata')::date),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ---------------------------------------------------------
-- 6. purchase_prices — रोज़ की खरीद कीमतों का लॉग
-- ---------------------------------------------------------
create table if not exists purchase_prices (
  id uuid primary key default gen_random_uuid(),
  vegetable_id uuid references vegetables(id) on delete cascade,
  price numeric(10,2) not null check (price > 0),
  unit text not null,
  previous_price numeric(10,2),
  batch_id uuid,
  recorded_at timestamptz not null default now(),
  recorded_by uuid
);
create index if not exists idx_purchase_prices_veg on purchase_prices(vegetable_id, recorded_at desc);

-- ---------------------------------------------------------
-- 7. price_history — हर पब्लिश पर पूरा snapshot (इनपुट सहित), ताकि नियम बदलने पर भी पुरानी रिपोर्ट सही रहे
-- ---------------------------------------------------------
create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  vegetable_id uuid references vegetables(id) on delete set null,
  vegetable_name text,
  batch_id uuid,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_name text,
  source text not null check (source in ('auto','manual','external')),
  purchase_price numeric(10,2),
  previous_purchase_price numeric(10,2),
  purchase_unit text,
  purchase_per_base numeric(10,2),
  wastage_pct numeric(5,2),
  handling_cost numeric(10,2),
  margin_pct numeric(6,2),
  stock_age_days int,
  freshness_pct numeric(5,2),
  demand_level text,
  demand_pct numeric(5,2),
  rounding_mode text,
  effective_cost numeric(10,2),
  base_cost numeric(10,2),
  min_safe_price numeric(10,2),
  calculated_price numeric(10,2),
  published_price numeric(10,2),
  previous_published_price numeric(10,2),
  min_protection_applied boolean not null default false,
  loss_confirmed boolean not null default false,
  price_tiers jsonb
);
create index if not exists idx_price_history_veg on price_history(vegetable_id, changed_at desc);
create index if not exists idx_price_history_time on price_history(changed_at desc);

-- ---------------------------------------------------------
-- 8. pricing_audit_log — महत्वपूर्ण बदलावों का ऑडिट (कौन, कब, पहले/बाद में क्या)
-- ---------------------------------------------------------
create table if not exists pricing_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text,
  table_name text not null,
  row_key text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index if not exists idx_pricing_audit_at on pricing_audit_log(at desc);

create or replace function log_pricing_audit()
returns trigger as $$
declare
  k text;
  nm text;
begin
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if tg_op = 'DELETE' then
    k := to_jsonb(old) ->> tg_argv[0];
  else
    k := to_jsonb(new) ->> tg_argv[0];
  end if;
  select full_name into nm from admin_users where id = auth.uid();
  insert into pricing_audit_log (actor, actor_name, table_name, row_key, action, old_row, new_row)
  values (
    auth.uid(), nm, tg_table_name, k, lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_audit_product_pricing on product_pricing;
create trigger trg_audit_product_pricing after insert or update or delete on product_pricing
  for each row execute function log_pricing_audit('vegetable_id');
drop trigger if exists trg_audit_pricing_settings on pricing_settings;
create trigger trg_audit_pricing_settings after insert or update or delete on pricing_settings
  for each row execute function log_pricing_audit('id');
drop trigger if exists trg_audit_pricing_rules on pricing_rules;
create trigger trg_audit_pricing_rules after insert or update or delete on pricing_rules
  for each row execute function log_pricing_audit('category_id');
drop trigger if exists trg_audit_delivery_settings on delivery_settings;
create trigger trg_audit_delivery_settings after insert or update or delete on delivery_settings
  for each row execute function log_pricing_audit('id');

drop trigger if exists trg_pricing_settings_updated on pricing_settings;
create trigger trg_pricing_settings_updated before update on pricing_settings
  for each row execute function set_updated_at();
drop trigger if exists trg_pricing_rules_updated on pricing_rules;
create trigger trg_pricing_rules_updated before update on pricing_rules
  for each row execute function set_updated_at();
drop trigger if exists trg_inventory_updated on inventory;
create trigger trg_inventory_updated before update on inventory
  for each row execute function set_updated_at();

-- ---------------------------------------------------------
-- 9. delivery_rules — डिलीवरी शुल्क के नियम (कार्ट सबटोटल के हिसाब से), वेजिटेबल कीमत से अलग
--    "min_subtotal से ऊपर fee" — अगला नियम शुरू होने तक। zone कॉलम भविष्य के ज़ोन/दूरी आधारित रेट के लिए।
-- ---------------------------------------------------------
create table if not exists delivery_rules (
  id uuid primary key default gen_random_uuid(),
  zone text,
  label text,
  min_subtotal numeric(10,2) not null check (min_subtotal >= 0),
  fee numeric(10,2) not null check (fee >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_delivery_rules_zone_min on delivery_rules ((coalesce(zone, '')), min_subtotal);

drop trigger if exists trg_audit_delivery_rules on delivery_rules;
create trigger trg_audit_delivery_rules after insert or update or delete on delivery_rules
  for each row execute function log_pricing_audit('id');

-- मौजूदा delivery_settings से शुरुआती नियम (ग्राहकों का मौजूदा व्यवहार वैसा ही रहता है)
do $$
declare ds delivery_settings%rowtype;
begin
  select * into ds from delivery_settings where id = 1;
  if found and not exists (select 1 from delivery_rules) then
    insert into delivery_rules (label, min_subtotal, fee) values ('Standard', 0, ds.delivery_fee);
    if ds.free_delivery_above is not null and ds.free_delivery_above > 0 then
      insert into delivery_rules (label, min_subtotal, fee) values ('Free delivery', ds.free_delivery_above, 0);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------
-- 10. ऑर्डर की लागत/मुनाफ़ा (सिर्फ़ मालिक) — सर्वर पर, ऑर्डर बनते ही
-- ---------------------------------------------------------
create table if not exists order_item_costs (
  order_item_id uuid primary key references order_items(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  vegetable_id uuid,
  cost_known boolean not null default false,
  base_units numeric(12,4),
  purchase_cost numeric(12,2) not null default 0,
  wastage_cost numeric(12,2) not null default 0,
  handling_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_item_costs_order on order_item_costs(order_id);

create table if not exists order_financials (
  order_id uuid primary key references orders(id) on delete cascade,
  items_revenue numeric(12,2) not null default 0,
  delivery_fee_collected numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  revenue numeric(12,2) not null default 0,               -- ग्राहक ने कुल दिया (total_amount)
  product_purchase_cost numeric(12,2) not null default 0,
  wastage_cost numeric(12,2) not null default 0,
  packing_cost numeric(12,2) not null default 0,
  delivery_cost numeric(12,2) not null default 0,         -- असली डिलीवरी खर्च (ग्राहक से लिए शुल्क से अलग)
  payment_charge_pct numeric(5,2) not null default 0,
  payment_charges numeric(12,2) not null default 0,
  contribution numeric(12,2) not null default 0,
  unknown_cost_items int not null default 0,              -- जिन आइटम की लागत पता नहीं (प्राइसिंग प्रोफ़ाइल नहीं / विक्रेता की सब्ज़ी)
  computed_at timestamptz not null default now()
);

-- ऑर्डर लाइन की यूनिट (जैसे "किलो", "0.5 किलो", "250 ग्राम", "2 किलो", "नग") को बेस-यूनिट में बदलें।
-- वज़न → किलो, नग → piece, गड्डी → bunch. मेल न खाए तो NULL (लागत अज्ञात — अनुमान नहीं लगाते)।
create or replace function aks_line_base_units(p_unit text, p_qty numeric, p_purchase_unit text)
returns numeric as $$
declare
  u text := btrim(coalesce(p_unit, ''));
  n numeric := 1;
  word text;
  m text[];
  grams numeric;
  weight_purchase boolean := p_purchase_unit in ('kg','500g','250g','200g','100g');
begin
  m := regexp_match(u, '^\s*([0-9]+(?:\.[0-9]+)?)\s*(.+)$');
  if m is not null then
    n := m[1]::numeric;
    word := lower(btrim(m[2]));
  else
    word := lower(u);
  end if;

  grams := case word
    when 'किलो' then 1000 when 'kg' then 1000 when 'किलोग्राम' then 1000
    when 'आधा किलो' then 500
    when 'ग्राम' then 1 when 'gram' then 1 when 'g' then 1 when 'gm' then 1
    else null end;
  if grams is not null then
    if not weight_purchase then return null; end if;
    return p_qty * n * grams / 1000;
  end if;
  if word in ('नग', 'piece', 'pcs', 'pc') then
    if p_purchase_unit <> 'piece' then return null; end if;
    return p_qty * n;
  end if;
  if word in ('गड्डी', 'bunch') then
    if p_purchase_unit <> 'bunch' then return null; end if;
    return p_qty * n;
  end if;
  return null;
end;
$$ language plpgsql immutable;

create or replace function recompute_order_financials(p_order_id uuid)
returns void as $$
declare
  o orders%rowtype;
  s record;
  existing order_financials%rowtype;
  cfg pricing_settings%rowtype;
  v_delivery_cost numeric(12,2);
  v_pay_pct numeric(5,2);
  v_pay numeric(12,2);
begin
  select * into o from orders where id = p_order_id;
  if not found then return; end if;

  select
    coalesce(sum(purchase_cost) filter (where cost_known), 0) as pc,
    coalesce(sum(wastage_cost) filter (where cost_known), 0) as wc,
    coalesce(sum(handling_cost) filter (where cost_known), 0) as hc,
    count(*) filter (where not cost_known) as unknown
  into s from order_item_costs where order_id = p_order_id;

  select * into existing from order_financials where order_id = p_order_id;
  select * into cfg from pricing_settings where id = 1;

  -- डिलीवरी खर्च और पेमेंट चार्ज % पहली गणना के समय के रखे जाते हैं (बाद में सेटिंग बदलने से पुराना हिसाब न बदले)
  v_delivery_cost := coalesce(existing.delivery_cost, cfg.delivery_cost_per_order, 0);
  v_pay_pct := coalesce(existing.payment_charge_pct, cfg.payment_charge_pct, 0);
  v_pay := round(o.total_amount * v_pay_pct / 100, 2);

  insert into order_financials (
    order_id, items_revenue, delivery_fee_collected, discount, revenue,
    product_purchase_cost, wastage_cost, packing_cost, delivery_cost,
    payment_charge_pct, payment_charges, contribution, unknown_cost_items, computed_at
  ) values (
    p_order_id, o.subtotal, o.delivery_fee, o.discount, o.total_amount,
    s.pc, s.wc, s.hc, v_delivery_cost,
    v_pay_pct, v_pay, o.total_amount - s.pc - s.wc - s.hc - v_delivery_cost - v_pay, s.unknown, now()
  )
  on conflict (order_id) do update set
    items_revenue = excluded.items_revenue,
    delivery_fee_collected = excluded.delivery_fee_collected,
    discount = excluded.discount,
    revenue = excluded.revenue,
    product_purchase_cost = excluded.product_purchase_cost,
    wastage_cost = excluded.wastage_cost,
    packing_cost = excluded.packing_cost,
    delivery_cost = excluded.delivery_cost,
    payment_charge_pct = excluded.payment_charge_pct,
    payment_charges = excluded.payment_charges,
    contribution = excluded.contribution,
    unknown_cost_items = excluded.unknown_cost_items,
    computed_at = excluded.computed_at;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function snapshot_order_item_cost()
returns trigger as $$
declare
  pp product_pricing%rowtype;
  units numeric;
begin
  select * into pp from product_pricing where vegetable_id = new.vegetable_id;
  if found then
    units := aks_line_base_units(new.unit, new.quantity, pp.purchase_unit);
  end if;

  if found and units is not null then
    insert into order_item_costs (order_item_id, order_id, vegetable_id, cost_known, base_units, purchase_cost, wastage_cost, handling_cost)
    values (
      new.id, new.order_id, new.vegetable_id, true, units,
      round(units * pp.purchase_per_base, 2),
      round(units * (pp.effective_cost - pp.purchase_per_base), 2),
      round(units * (pp.base_cost - pp.effective_cost), 2)
    );
  else
    insert into order_item_costs (order_item_id, order_id, vegetable_id, cost_known)
    values (new.id, new.order_id, new.vegetable_id, false);
  end if;

  perform recompute_order_financials(new.order_id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_order_item_cost on order_items;
create trigger trg_order_item_cost after insert on order_items
  for each row execute function snapshot_order_item_cost();

create or replace function refresh_order_financials_on_change()
returns trigger as $$
begin
  perform recompute_order_financials(new.id);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_order_financials_refresh on orders;
create trigger trg_order_financials_refresh after update of subtotal, delivery_fee, discount, total_amount on orders
  for each row
  when (old.subtotal is distinct from new.subtotal or old.delivery_fee is distinct from new.delivery_fee
        or old.discount is distinct from new.discount or old.total_amount is distinct from new.total_amount)
  execute function refresh_order_financials_on_change();

-- ---------------------------------------------------------
-- 11. सुरक्षा-जाल: ऑटो-प्राइसिंग वाली सब्ज़ी की कीमत सीधे (पुराने "कीमतें बदलें" या फ़ॉर्म से) नहीं बदल सकती।
--     बदलाव सिर्फ़ publish_prices() से — ताकि न्यूनतम-कीमत सुरक्षा और हिस्ट्री बायपास न हों।
--     बाकी (बिना प्रोफ़ाइल की) सब्ज़ियों में बदलाव पहले जैसा चलता है, और हिस्ट्री में 'external' के रूप में दर्ज होता है।
-- ---------------------------------------------------------
create or replace function guard_profiled_vegetable_price()
returns trigger as $$
begin
  if (new.price is distinct from old.price or new.unit is distinct from old.unit or new.price_tiers is distinct from old.price_tiers)
     and exists (select 1 from product_pricing where vegetable_id = new.id)
     and coalesce(current_setting('aks.pricing_publish', true), '') <> 'on' then
    raise exception 'यह सब्ज़ी ऑटो-प्राइसिंग से चलती है। कीमत "आज की कीमतें" / "प्रोडक्ट प्राइसिंग" स्क्रीन से बदलें (चाहें तो वहां मैनुअल प्राइस चुनें)।';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_guard_profiled_price on vegetables;
create trigger trg_guard_profiled_price before update of price, unit, price_tiers on vegetables
  for each row execute function guard_profiled_vegetable_price();

create or replace function log_external_price_change()
returns trigger as $$
declare nm text;
begin
  if new.price is distinct from old.price and coalesce(current_setting('aks.pricing_publish', true), '') <> 'on' then
    select full_name into nm from admin_users where id = auth.uid();
    insert into price_history (vegetable_id, vegetable_name, changed_by, changed_by_name, source, published_price, previous_published_price, price_tiers)
    values (new.id, new.name, auth.uid(), nm, 'external', new.price, old.price, new.price_tiers);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_log_external_price on vegetables;
create trigger trg_log_external_price after update of price on vegetables
  for each row execute function log_external_price_change();

-- ---------------------------------------------------------
-- 12. publish_prices — नई कीमतें एक साथ, एक ट्रांज़ैक्शन में पब्लिश (केवल मालिक)
--
--   p_items: JSON array. हर आइटम:
--     { vegetable_id, base_version (नई प्रोफ़ाइल के लिए null), purchase_price, purchase_unit, selling_unit, pack_sizes[],
--       wastage_pct, handling_cost, margin_pct (null = श्रेणी डिफ़ॉल्ट), demand_level, allow_clearance,
--       manual_override, manual_price, loss_confirmed, stock_received_at, store_unit, price_tiers,
--       snapshot: { purchase_per_base, effective_cost, base_cost, min_safe_price, recommended_price, published_price,
--                   price_source, min_protection_applied, wastage_pct, handling_cost, margin_pct, stock_age_days,
--                   freshness_pct, demand_pct, rounding_mode } }
--
--   * इंजन (JS) कीमत निकालता है; यहां सिर्फ़ जांच: कीमत > 0, सुरक्षित कीमत से नीचे हो तो पुष्टि ज़रूरी,
--     और सर्वर पर किसी और ने नया बदलाव किया हो (version बदल गया) तो चुपचाप ओवरराइट नहीं — 'conflict' लौटता है।
--   * हर आइटम अलग सबट्रांज़ैक्शन में: एक फेल होने पर बाकी लागू हो जाते हैं।
-- ---------------------------------------------------------
create or replace function publish_prices(p_items jsonb, p_note text default null)
returns jsonb as $$
declare
  it jsonb;
  snap jsonb;
  batch uuid := gen_random_uuid();
  results jsonb := '[]'::jsonb;
  applied int := 0;
  vid uuid;
  veg vegetables%rowtype;
  pp product_pricing%rowtype;
  existed boolean;
  base_ver bigint;
  new_ver bigint;
  published numeric;
  min_safe numeric;
  loss_ok boolean;
  allow_clear boolean;
  src text;
  tiers jsonb;
  actor_name text;
  purchase numeric;
begin
  if not is_owner() then
    raise exception 'सिर्फ़ मालिक कीमतें पब्लिश कर सकता है' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items एक JSON array होना चाहिए';
  end if;

  select full_name into actor_name from admin_users where id = auth.uid();
  perform set_config('aks.pricing_publish', 'on', true);

  for it in select * from jsonb_array_elements(p_items) loop
    begin
      vid := (it ->> 'vegetable_id')::uuid;
      snap := it -> 'snapshot';

      select * into veg from vegetables where id = vid for update;
      if not found then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'not_found');
        continue;
      end if;
      if veg.seller_id is not null then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'seller_product');
        continue;
      end if;

      select * into pp from product_pricing where vegetable_id = vid for update;
      existed := found;
      base_ver := nullif(it ->> 'base_version', '')::bigint;
      if (existed and (base_ver is null or base_ver <> pp.version)) or (not existed and base_ver is not null) then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'conflict', 'reason', 'server_changed',
          'server_version', case when existed then pp.version end, 'server_price', case when existed then pp.published_price else veg.price end);
        continue;
      end if;

      purchase := (it ->> 'purchase_price')::numeric;
      published := (snap ->> 'published_price')::numeric;
      min_safe := (snap ->> 'min_safe_price')::numeric;
      loss_ok := coalesce((it ->> 'loss_confirmed')::boolean, false);
      allow_clear := coalesce((it ->> 'allow_clearance')::boolean, false);
      src := coalesce(snap ->> 'price_source', 'auto');

      if purchase is null or purchase <= 0 then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'invalid_purchase_price');
        continue;
      end if;
      if published is null or published <= 0 or published > 1000000 or min_safe is null then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'invalid_price');
        continue;
      end if;
      -- न्यूनतम-कीमत सुरक्षा: नुकसान वाली कीमत बिना स्पष्ट पुष्टि/क्लीयरेंस अनुमति के नहीं
      if published < min_safe and not (loss_ok or allow_clear) then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'below_safe_price_unconfirmed');
        continue;
      end if;
      if src = 'manual' and coalesce((it ->> 'manual_price')::numeric, 0) <> published then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'manual_price_mismatch');
        continue;
      end if;
      if (it ->> 'store_unit') not in ('किलो','नग','गड्डी') then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'invalid_store_unit');
        continue;
      end if;

      tiers := it -> 'price_tiers';
      if tiers is null or jsonb_typeof(tiers) <> 'array' or jsonb_array_length(tiers) = 0 then
        tiers := null;
      elsif exists (
        select 1 from jsonb_array_elements(tiers) t
        where coalesce((t ->> 'qty')::numeric, 0) <= 0 or coalesce((t ->> 'price')::numeric, 0) <= 0
           or coalesce(t ->> 'unit', '') not in ('किलो','ग्राम')
      ) then
        results := results || jsonb_build_object('vegetable_id', vid, 'status', 'rejected', 'reason', 'invalid_tiers');
        continue;
      end if;

      new_ver := case when existed then pp.version + 1 else 1 end;

      if existed then
        update product_pricing set
          version = new_ver,
          previous_purchase_price = pp.purchase_price,
          purchase_price = purchase,
          purchase_unit = it ->> 'purchase_unit',
          selling_unit = it ->> 'selling_unit',
          pack_sizes = coalesce(array(select jsonb_array_elements_text(coalesce(it -> 'pack_sizes', '[]'::jsonb))), '{}'),
          wastage_pct = nullif(it ->> 'wastage_pct', '')::numeric,
          handling_cost = nullif(it ->> 'handling_cost', '')::numeric,
          margin_pct = nullif(it ->> 'margin_pct', '')::numeric,
          demand_level = coalesce(it ->> 'demand_level', 'normal'),
          allow_clearance = allow_clear,
          manual_override = coalesce((it ->> 'manual_override')::boolean, false),
          manual_price = nullif(it ->> 'manual_price', '')::numeric,
          loss_price_confirmed = loss_ok,
          purchase_per_base = (snap ->> 'purchase_per_base')::numeric,
          effective_cost = (snap ->> 'effective_cost')::numeric,
          base_cost = (snap ->> 'base_cost')::numeric,
          min_safe_price = min_safe,
          recommended_price = (snap ->> 'recommended_price')::numeric,
          previous_published_price = pp.published_price,
          published_price = published,
          price_source = src,
          min_protection_applied = coalesce((snap ->> 'min_protection_applied')::boolean, false),
          last_price_updated_at = now(),
          price_updated_by = auth.uid(),
          price_updated_by_name = actor_name,
          updated_at = now()
        where vegetable_id = vid;
      else
        insert into product_pricing (
          vegetable_id, version, purchase_price, previous_purchase_price, purchase_unit, selling_unit, pack_sizes,
          wastage_pct, handling_cost, margin_pct, demand_level, allow_clearance, manual_override, manual_price, loss_price_confirmed,
          purchase_per_base, effective_cost, base_cost, min_safe_price, recommended_price, previous_published_price, published_price,
          price_source, min_protection_applied, last_price_updated_at, price_updated_by, price_updated_by_name
        ) values (
          vid, 1, purchase, null, it ->> 'purchase_unit', it ->> 'selling_unit',
          coalesce(array(select jsonb_array_elements_text(coalesce(it -> 'pack_sizes', '[]'::jsonb))), '{}'),
          nullif(it ->> 'wastage_pct', '')::numeric, nullif(it ->> 'handling_cost', '')::numeric, nullif(it ->> 'margin_pct', '')::numeric,
          coalesce(it ->> 'demand_level', 'normal'), allow_clear,
          coalesce((it ->> 'manual_override')::boolean, false), nullif(it ->> 'manual_price', '')::numeric, loss_ok,
          (snap ->> 'purchase_per_base')::numeric, (snap ->> 'effective_cost')::numeric, (snap ->> 'base_cost')::numeric,
          min_safe, (snap ->> 'recommended_price')::numeric, veg.price, published,
          src, coalesce((snap ->> 'min_protection_applied')::boolean, false), now(), auth.uid(), actor_name
        );
      end if;

      -- ग्राहक स्टोर की कीमत (और पैक टियर) अपडेट
      update vegetables set price = published, unit = it ->> 'store_unit', price_tiers = tiers where id = vid;

      -- स्टॉक कब आया (stock age)
      if nullif(it ->> 'stock_received_at', '') is not null then
        insert into inventory (vegetable_id, stock_received_at, unit, updated_by)
        values (vid, (it ->> 'stock_received_at')::date, it ->> 'purchase_unit', auth.uid())
        on conflict (vegetable_id) do update set stock_received_at = excluded.stock_received_at, updated_by = excluded.updated_by;
      end if;

      insert into purchase_prices (vegetable_id, price, unit, previous_price, batch_id, recorded_by)
      values (vid, purchase, it ->> 'purchase_unit', case when existed then pp.purchase_price end, batch, auth.uid());

      insert into price_history (
        vegetable_id, vegetable_name, batch_id, changed_by, changed_by_name, source,
        purchase_price, previous_purchase_price, purchase_unit, purchase_per_base,
        wastage_pct, handling_cost, margin_pct, stock_age_days, freshness_pct, demand_level, demand_pct, rounding_mode,
        effective_cost, base_cost, min_safe_price, calculated_price, published_price, previous_published_price,
        min_protection_applied, loss_confirmed, price_tiers
      ) values (
        vid, veg.name, batch, auth.uid(), actor_name, src,
        purchase, case when existed then pp.purchase_price end, it ->> 'purchase_unit', (snap ->> 'purchase_per_base')::numeric,
        (snap ->> 'wastage_pct')::numeric, (snap ->> 'handling_cost')::numeric, (snap ->> 'margin_pct')::numeric,
        (snap ->> 'stock_age_days')::int, (snap ->> 'freshness_pct')::numeric, it ->> 'demand_level', (snap ->> 'demand_pct')::numeric, snap ->> 'rounding_mode',
        (snap ->> 'effective_cost')::numeric, (snap ->> 'base_cost')::numeric, min_safe, (snap ->> 'recommended_price')::numeric,
        published, case when existed then pp.published_price else veg.price end,
        coalesce((snap ->> 'min_protection_applied')::boolean, false), loss_ok and published < min_safe, tiers
      );

      applied := applied + 1;
      results := results || jsonb_build_object('vegetable_id', vid, 'status', 'applied', 'version', new_ver);
    exception when others then
      results := results || jsonb_build_object('vegetable_id', it ->> 'vegetable_id', 'status', 'rejected', 'reason', sqlerrm);
    end;
  end loop;

  insert into pricing_audit_log (actor, actor_name, table_name, row_key, action, new_row)
  values (auth.uid(), actor_name, 'publish_prices', batch::text, 'publish',
          jsonb_build_object('items', jsonb_array_length(p_items), 'applied', applied, 'note', p_note));

  return jsonb_build_object('batch_id', batch, 'applied', applied, 'results', results);
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function publish_prices(jsonb, text) from public;
grant execute on function publish_prices(jsonb, text) to authenticated;

-- ---------------------------------------------------------
-- 13. RLS
-- ---------------------------------------------------------
alter table pricing_settings enable row level security;
alter table pricing_rules enable row level security;
alter table product_pricing enable row level security;
alter table inventory enable row level security;
alter table purchase_prices enable row level security;
alter table price_history enable row level security;
alter table pricing_audit_log enable row level security;
alter table delivery_rules enable row level security;
alter table order_item_costs enable row level security;
alter table order_financials enable row level security;

-- मालिक-ओनली (लागत/मार्जिन/मुनाफ़ा): पढ़ना और (जहां लागू) लिखना
drop policy if exists "pricing_settings_owner_read" on pricing_settings;
create policy "pricing_settings_owner_read" on pricing_settings for select using (is_owner());
drop policy if exists "pricing_settings_owner_update" on pricing_settings;
create policy "pricing_settings_owner_update" on pricing_settings for update using (is_owner()) with check (is_owner());

drop policy if exists "pricing_rules_owner_read" on pricing_rules;
create policy "pricing_rules_owner_read" on pricing_rules for select using (is_owner());
drop policy if exists "pricing_rules_owner_insert" on pricing_rules;
create policy "pricing_rules_owner_insert" on pricing_rules for insert with check (is_owner());
drop policy if exists "pricing_rules_owner_update" on pricing_rules;
create policy "pricing_rules_owner_update" on pricing_rules for update using (is_owner()) with check (is_owner());
drop policy if exists "pricing_rules_owner_delete" on pricing_rules;
create policy "pricing_rules_owner_delete" on pricing_rules for delete using (is_owner());

-- product_pricing: सिर्फ़ मालिक पढ़े; लिखना केवल publish_prices() (security definer) से
drop policy if exists "product_pricing_owner_read" on product_pricing;
create policy "product_pricing_owner_read" on product_pricing for select using (is_owner());

drop policy if exists "purchase_prices_owner_read" on purchase_prices;
create policy "purchase_prices_owner_read" on purchase_prices for select using (is_owner());
drop policy if exists "price_history_owner_read" on price_history;
create policy "price_history_owner_read" on price_history for select using (is_owner());
drop policy if exists "pricing_audit_owner_read" on pricing_audit_log;
create policy "pricing_audit_owner_read" on pricing_audit_log for select using (is_owner());
drop policy if exists "order_item_costs_owner_read" on order_item_costs;
create policy "order_item_costs_owner_read" on order_item_costs for select using (is_owner());
drop policy if exists "order_financials_owner_read" on order_financials;
create policy "order_financials_owner_read" on order_financials for select using (is_owner());

-- inventory: मालिक + स्टाफ (स्टॉक अपडेट कर सकते हैं)
drop policy if exists "inventory_admin_read" on inventory;
create policy "inventory_admin_read" on inventory for select using (is_admin());
drop policy if exists "inventory_admin_insert" on inventory;
create policy "inventory_admin_insert" on inventory for insert with check (is_admin());
drop policy if exists "inventory_admin_update" on inventory;
create policy "inventory_admin_update" on inventory for update using (is_admin()) with check (is_admin());
drop policy if exists "inventory_owner_delete" on inventory;
create policy "inventory_owner_delete" on inventory for delete using (is_owner());

-- delivery_rules: ग्राहक कार्ट में शुल्क निकालने के लिए पढ़ते हैं; बदलाव सिर्फ़ मालिक
drop policy if exists "delivery_rules_public_read" on delivery_rules;
create policy "delivery_rules_public_read" on delivery_rules for select using (true);
drop policy if exists "delivery_rules_owner_insert" on delivery_rules;
create policy "delivery_rules_owner_insert" on delivery_rules for insert with check (is_owner());
drop policy if exists "delivery_rules_owner_update" on delivery_rules;
create policy "delivery_rules_owner_update" on delivery_rules for update using (is_owner()) with check (is_owner());
drop policy if exists "delivery_rules_owner_delete" on delivery_rules;
create policy "delivery_rules_owner_delete" on delivery_rules for delete using (is_owner());

-- न्यूनतम ऑर्डर/डिलीवरी सेटिंग अब सिर्फ़ मालिक बदल सके (पहले admin+staff दोनों)
drop policy if exists "delivery_settings_admin_update" on delivery_settings;
create policy "delivery_settings_admin_update" on delivery_settings for update using (is_owner()) with check (is_owner());

-- ---------------------------------------------------------
-- 14. श्रेणी-आधारित डिफ़ॉल्ट नियम (शुरुआती — कभी भी बदल सकते हैं)
--     regular: wastage 2–5%, margin 12–18% | normal: 5–10%, 15–25% | leafy: 15–30%, 25–40% | premium: 5–15%, 25–40%
-- ---------------------------------------------------------
insert into pricing_rules (category_id, rule_type, wastage_pct, margin_pct, handling_cost)
select c.id, r.rule_type, r.wastage, r.margin, 0
from categories c
join (values
  ('aloo-pyaz',         'regular', 4,  15),
  ('jad-wali-sabjiyan', 'regular', 4,  15),
  ('hari-sabjiyan',     'normal',  8,  20),
  ('mausami-sabjiyan',  'normal',  8,  20),
  ('anya-samaan',       'normal',  8,  20),
  ('patedar-sabjiyan',  'leafy',   20, 30),
  ('fal',               'premium', 10, 30)
) as r(slug, rule_type, wastage, margin) on r.slug = c.slug
on conflict (category_id) do nothing;

-- =========================================================
-- पूर्ण।  इसके बाद ऐप में: एडमिन → "आज की कीमतें" खोलकर पहली बार खरीद कीमतें डालें और पब्लिश करें।
-- =========================================================

-- #########################################################
-- भाग 3/12: vendor_seller_association.sql — विक्रेता ↔ सेलर प्रोफ़ाइल
-- #########################################################

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

-- #########################################################
-- भाग 4/12: delivery_boy_module.sql — डिलीवरी बॉय टेबल
-- #########################################################

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

-- #########################################################
-- भाग 5/12: security_hardening.sql — सुरक्षा (place_order, token-आधारित पहुँच, PIN hash, Storage नीतियाँ)
-- #########################################################

-- ⚠️ नोट: place_order, delivery_orders, seller_order_lines, cancel_stale_unpaid_orders के COD-सहित संस्करण cod_payment.sql में हैं।
--    इस फ़ाइल को दोबारा चलाएँ तो उसके बाद cod_payment.sql और pay_online_on_delivery.sql भी चलाएँ, वरना COD बंद जैसा व्यवहार लौट आएगा।
-- =========================================================
-- अपना किसान सब्ज़ीवाला — SECURITY HARDENING (Production Audit के सुधार)
--
-- चलाने का क्रम (Supabase SQL Editor):
--   1) schema.sql   2) pricing_engine.sql   3) vendor_seller_association.sql
--   4) (पुराने DB पर) delivery_boy_module.sql   5) यह फाइल — security_hardening.sql (सबसे आख़िर में)
--
-- यह फाइल दोबारा चलाने के लिए सुरक्षित (idempotent) है।
-- ⚠️ पहले STAGING प्रोजेक्ट पर चलाएँ। इसके बाद client-code भी बदला हुआ चाहिए (इसी zip में है),
--    इसलिए SQL और नया frontend/Edge Functions एक साथ लाइव करें।
--
-- कवर करता है: C1 C2 C3 C5 · H1 H2 H4 H7(store-open/stock) · M1 M3 M4 M5 M6 M8 · L1 L2
-- Razorpay (C4) के लिए supabase/functions/{create-razorpay-order,verify-razorpay-payment,razorpay-webhook} भी डिप्लॉय करें।
-- =========================================================

create extension if not exists pgcrypto;
-- pgcrypto Supabase में `extensions` schema में रहता है; DO-blocks को भी मिले इसलिए:
set search_path = public, extensions;

do $$ begin
  if to_regprocedure('is_owner()') is null then
    raise exception 'पहले pricing_engine.sql चलाएँ (is_owner() चाहिए)';
  end if;
end $$;

-- ---------------------------------------------------------
-- 0. सहायक फंक्शन
-- ---------------------------------------------------------
-- L2: security definer + निश्चित search_path
create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from admin_users where id = auth.uid());
$$;

-- अमान्य टेक्स्ट पर error की जगह NULL लौटाता है
create or replace function aks_try_numeric(p text)
returns numeric language plpgsql immutable as $$
begin
  return nullif(btrim(p), '')::numeric;
exception when others then
  return null;
end $$;

-- अनुरोध करने वाले का IP (PostgREST header से) — rate-limit के लिए
create or replace function aks_client_ip()
returns text language plpgsql stable set search_path = public as $$
declare h json;
begin
  begin
    h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  exception when others then
    h := '{}'::json;
  end;
  return coalesce(nullif(btrim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), ''), 'unknown');
end $$;

-- ---------------------------------------------------------
-- 1. C1/C2/C3/C5: खुली policies हटाएँ → सिर्फ़ एडमिन पढ़/लिख सके
--    ग्राहक/डिलीवरी/सेलर की पहुँच नीचे के RPC से (security definer)।
-- ---------------------------------------------------------
drop policy if exists "customers_public_insert"       on customers;
drop policy if exists "customers_public_read_own"     on customers;
drop policy if exists "addresses_public_insert"       on customer_addresses;
drop policy if exists "addresses_public_read"         on customer_addresses;
drop policy if exists "orders_public_insert"          on orders;
drop policy if exists "orders_public_read"            on orders;
drop policy if exists "orders_public_update_payment"  on orders;
drop policy if exists "orders_delivery_update"        on orders;
drop policy if exists "order_items_public_insert"     on order_items;
drop policy if exists "order_items_public_read"       on order_items;
drop policy if exists "payments_public_insert"        on payments;
drop policy if exists "payments_public_read"          on payments;
drop policy if exists "payments_public_update"        on payments;
drop policy if exists "delivery_boys_public_read"     on delivery_boys;

drop policy if exists "customers_admin_read"          on customers;
drop policy if exists "customers_admin_read" on customers;
create policy "customers_admin_read"   on customers          for select using (is_admin());
drop policy if exists "addresses_admin_read"          on customer_addresses;
drop policy if exists "addresses_admin_read" on customer_addresses;
create policy "addresses_admin_read"   on customer_addresses for select using (is_admin());
drop policy if exists "orders_admin_read"             on orders;
drop policy if exists "orders_admin_read" on orders;
create policy "orders_admin_read"      on orders             for select using (is_admin());
drop policy if exists "order_items_admin_read"        on order_items;
drop policy if exists "order_items_admin_read" on order_items;
create policy "order_items_admin_read" on order_items        for select using (is_admin());
drop policy if exists "payments_admin_read"           on payments;
drop policy if exists "payments_admin_read" on payments;
create policy "payments_admin_read"    on payments           for select using (is_admin());
drop policy if exists "delivery_boys_admin_read"      on delivery_boys;
drop policy if exists "delivery_boys_admin_read" on delivery_boys;
create policy "delivery_boys_admin_read" on delivery_boys    for select using (is_admin());

-- (orders_admin_update, *_admin_delete, customers_admin_update पहले से मौजूद हैं)

-- ---------------------------------------------------------
-- 2. कॉलम, constraints, इंडेक्स
-- ---------------------------------------------------------
-- ग्राहक की पहुँच: random token (सिर्फ़ ऑर्डर बनाने वाले को मिलता है)
alter table orders add column if not exists access_token uuid not null default gen_random_uuid();
create unique index if not exists idx_orders_access_token on orders(access_token);
-- delivery PIN की गलत कोशिशों की गिनती (L1)
alter table orders add column if not exists delivery_pin_attempts int not null default 0;

-- L1: delivery PIN crypto-safe random से
create or replace function generate_delivery_pin()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new.delivery_pin is null then
    new.delivery_pin := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 10000)::text, 4, '0');
  end if;
  return new;
end $$;

-- M6: बुनियादी CHECK / UNIQUE (NOT VALID = पुराने डेटा पर नहीं चलती, नई/बदली पंक्तियों पर लागू)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'chk_orders_amounts') then
    alter table orders add constraint chk_orders_amounts
      check (subtotal >= 0 and delivery_fee >= 0 and discount >= 0 and total_amount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_order_items_values') then
    alter table order_items add constraint chk_order_items_values
      check (quantity > 0 and price >= 0 and item_total >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_payments_amount') then
    alter table payments add constraint chk_payments_amount check (amount >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chk_veg_price_pos') then
    alter table vegetables add constraint chk_veg_price_pos check (price > 0) not valid;
  end if;
end $$;

create unique index if not exists idx_payments_gateway_payment_unique
  on payments(gateway_payment_id) where gateway_payment_id is not null;
create index if not exists idx_payments_order on payments(order_id);
create index if not exists idx_orders_phone on orders(customer_phone);

-- M6: जिस सब्ज़ी का कभी ऑर्डर हुआ उसे डिलीट करने पर FK error न आए (ऑर्डर में नाम सेव रहता है)
alter table order_items drop constraint if exists order_items_vegetable_id_fkey;
alter table order_items add constraint order_items_vegetable_id_fkey
  foreign key (vegetable_id) references vegetables(id) on delete set null;

-- AI/ग्राम वाले ऑर्डर में 0.125 किलो जैसी मात्रा आ सकती है → 3 दशमलव तक
alter table order_items alter column quantity type numeric(10,3);

-- M1: कूपन की उपयोग-सीमा (NULL = असीमित, यानी पुराना व्यवहार)
alter table offers add column if not exists max_uses_per_customer int check (max_uses_per_customer is null or max_uses_per_customer > 0);
alter table offers add column if not exists max_total_uses int check (max_total_uses is null or max_total_uses > 0);

create table if not exists coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  customer_phone text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_coupon_redemptions_offer on coupon_redemptions(offer_id, customer_phone);
alter table coupon_redemptions enable row level security;
drop policy if exists "coupon_redemptions_admin_read" on coupon_redemptions;
create policy "coupon_redemptions_admin_read" on coupon_redemptions for select using (is_admin());

-- H4: idempotency (double-click / retry / refresh पर एक ही ऑर्डर)
create table if not exists order_idempotency (
  key uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table order_idempotency enable row level security;   -- कोई policy नहीं = सीधी पहुँच बंद; सिर्फ़ RPC

-- rate-limit लॉग (customer lookup + delivery login)
create table if not exists security_attempts (
  id bigserial primary key,
  kind text not null,
  subject text not null,
  at timestamptz not null default now()
);
create index if not exists idx_security_attempts on security_attempts(kind, subject, at desc);
alter table security_attempts enable row level security;

-- ---------------------------------------------------------
-- 3. H1/H2: admin_users और sellers पर privilege-escalation बंद
-- ---------------------------------------------------------
drop policy if exists "admin_users_admin_write"  on admin_users;
drop policy if exists "admin_users_admin_update" on admin_users;
drop policy if exists "admin_users_owner_insert" on admin_users;
drop policy if exists "admin_users_owner_update" on admin_users;
drop policy if exists "admin_users_owner_insert" on admin_users;
create policy "admin_users_owner_insert" on admin_users for insert with check (is_owner());
drop policy if exists "admin_users_owner_update" on admin_users;
create policy "admin_users_owner_update" on admin_users for update using (is_owner()) with check (is_owner());

create or replace function sellers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() IS NULL = service_role / SQL Editor (कोई end-user JWT नहीं) → वहाँ रोक नहीं
  if auth.uid() is not null and not is_admin() then
    if tg_op = 'INSERT' then
      new.is_approved := false;
      new.is_active := true;
    else
      new.is_approved := old.is_approved;
      new.is_active := old.is_active;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_self_approve on sellers;
drop trigger if exists trg_sellers_guard on sellers;
create trigger trg_sellers_guard before insert or update on sellers
  for each row execute function sellers_guard();

drop policy if exists "sellers_self_update" on sellers;
create policy "sellers_self_update" on sellers for update
  using (auth.uid() = id or is_admin()) with check (auth.uid() = id or is_admin());

drop policy if exists "vegetables_seller_write"  on vegetables;
drop policy if exists "vegetables_seller_update" on vegetables;
drop policy if exists "vegetables_seller_write" on vegetables;
create policy "vegetables_seller_write" on vegetables for insert with check (
  seller_id = auth.uid()
  and exists (select 1 from sellers s where s.id = auth.uid() and s.is_approved and s.is_active)
);
drop policy if exists "vegetables_seller_update" on vegetables;
create policy "vegetables_seller_update" on vegetables for update
  using (seller_id = auth.uid())
  with check (
    seller_id = auth.uid()
    and exists (select 1 from sellers s where s.id = auth.uid() and s.is_approved and s.is_active)
  );

-- M4: बंद ऑर्डर वापस खोलना सिर्फ़ मालिक (owner) कर सके
create or replace function guard_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.order_status is distinct from old.order_status
     and old.order_status in ('डिलीवरी पूरी हुई', 'रद्द')
     and auth.uid() is not null
     and not is_owner() then
    raise exception 'INVALID_TRANSITION';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_order_status on orders;
create trigger trg_guard_order_status before update of order_status on orders
  for each row execute function guard_order_status();

-- ---------------------------------------------------------
-- 4. C3/H4/H7/M1/M5/M8: place_order — ऑर्डर सिर्फ़ सर्वर पर बने (कीमत, शुल्क, कूपन, स्टॉक, store-open)
--
-- p_customer: {name, phone, address, mohalla, city, pincode, delivery_date, delivery_time_slot, notes, lat, lng, order_source}
-- p_items:    [{vegetable_id, quantity, tier_qty?, tier_unit?}]   ← कीमत client से कभी नहीं आती
-- ---------------------------------------------------------
create or replace function place_order(p_idem uuid, p_customer jsonb, p_items jsonb, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  ds delivery_settings%rowtype;
  o orders%rowtype;
  veg vegetables%rowtype;
  it jsonb;
  tier jsonb;
  offer offers%rowtype;
  qty numeric;
  price numeric;
  unit_label text;
  line_total numeric;
  sub numeric := 0;
  fee numeric;
  disc numeric := 0;
  total numeric;
  cust uuid;
  v_phone text := btrim(coalesce(p_customer->>'phone', ''));
  v_name text := btrim(coalesce(p_customer->>'name', ''));
  v_addr text := btrim(coalesce(p_customer->>'address', ''));
  v_pin text := btrim(coalesce(p_customer->>'pincode', ''));
  v_date date;
  v_slot text := btrim(coalesce(p_customer->>'delivery_time_slot', ''));
  v_source text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  existing uuid;
  coupon text := upper(btrim(coalesce(p_coupon, '')));
  used_by_cust int;
  used_total int;
  pending_cnt int;
  tq numeric;
  tu text;
begin
  if p_idem is null then raise exception 'BAD_REQUEST'; end if;

  -- एक ही key की दो एक-साथ कॉल: दूसरी पहली के खत्म होने तक रुकेगी
  perform pg_advisory_xact_lock(hashtextextended(p_idem::text, 0));

  select order_id into existing from order_idempotency where key = p_idem;
  if existing is not null then
    select * into o from orders where id = existing;
    return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total_amount', o.total_amount,
                              'payment_status', o.payment_status, 'access_token', o.access_token, 'replayed', true);
  end if;

  select * into ds from delivery_settings where id = 1;
  if not found then raise exception 'SETTINGS_MISSING'; end if;
  if not ds.is_store_open then raise exception 'STORE_CLOSED'; end if;

  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'BAD_PHONE'; end if;
  if length(v_name) not between 1 and 80 then raise exception 'BAD_NAME'; end if;
  if length(v_addr) not between 5 and 300 then raise exception 'BAD_ADDRESS'; end if;
  if v_pin !~ '^[0-9]{6}$' then raise exception 'BAD_PINCODE'; end if;
  if length(btrim(coalesce(p_customer->>'city', ''))) not between 1 and 60 then raise exception 'BAD_CITY'; end if;
  if length(v_slot) not between 1 and 60 then raise exception 'BAD_SLOT'; end if;
  begin
    v_date := (p_customer->>'delivery_date')::date;
  exception when others then
    raise exception 'BAD_DATE';
  end;
  if v_date is null or v_date < v_today or v_date > v_today + 14 then raise exception 'BAD_DATE'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'BAD_ITEMS';
  end if;

  v_source := coalesce(p_customer->>'order_source', '');
  if v_source not in ('वेबसाइट', 'AI सहायक', 'WhatsApp') then v_source := 'वेबसाइट'; end if;

  -- एक नंबर से बहुत सारे अधूरे (अनपेड) ऑर्डर बनाकर spam रोकें
  select count(*) into pending_cnt from orders
    where customer_phone = v_phone and payment_status = 'लंबित' and created_at > now() - interval '1 hour';
  if pending_cnt >= 5 then raise exception 'TOO_MANY_PENDING'; end if;

  -- M5: race-free upsert
  insert into customers (full_name, phone) values (v_name, v_phone)
    on conflict (phone) do update set full_name = excluded.full_name
    returning id into cust;

  insert into orders (customer_id, customer_name, customer_phone, full_address, mohalla, city, pincode,
                      delivery_date, delivery_time_slot, extra_notes, latitude, longitude,
                      payment_status, payment_method, order_status, order_source)
  values (cust, v_name, v_phone, v_addr, left(btrim(coalesce(p_customer->>'mohalla', '')), 100),
          btrim(p_customer->>'city'), v_pin, v_date, v_slot,
          left(btrim(coalesce(p_customer->>'notes', '')), 300),
          case when aks_try_numeric(p_customer->>'lat') between -90 and 90 then aks_try_numeric(p_customer->>'lat') end,
          case when aks_try_numeric(p_customer->>'lng') between -180 and 180 then aks_try_numeric(p_customer->>'lng') end,
          'लंबित', 'ऑनलाइन', 'नया ऑर्डर', v_source)
  returning * into o;

  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) is distinct from 'object' then raise exception 'BAD_ITEMS'; end if;
    if (it->>'vegetable_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'BAD_ITEMS';
    end if;
    qty := aks_try_numeric(it->>'quantity');
    if qty is null or qty <= 0 or qty > 50 or qty <> round(qty, 3) then raise exception 'BAD_QTY'; end if;

    select * into veg from vegetables where id = (it->>'vegetable_id')::uuid;
    if not found or not veg.is_active or veg.stock_status <> 'उपलब्ध' then raise exception 'ITEM_UNAVAILABLE'; end if;
    if veg.seller_id is not null and not exists (
         select 1 from sellers s where s.id = veg.seller_id and s.is_approved and s.is_active) then
      raise exception 'ITEM_UNAVAILABLE';
    end if;

    tier := null;
    tq := aks_try_numeric(it->>'tier_qty');
    tu := nullif(btrim(coalesce(it->>'tier_unit', '')), '');
    if tq is not null or tu is not null then
      select e.value into tier from jsonb_array_elements(coalesce(veg.price_tiers, '[]'::jsonb)) e
        where aks_try_numeric(e.value->>'qty') = tq and e.value->>'unit' = tu limit 1;
      if tier is null then raise exception 'BAD_TIER'; end if;
      price := (tier->>'price')::numeric;
      unit_label := (tier->>'qty') || ' ' || (tier->>'unit');
    else
      price := veg.price;
      unit_label := veg.unit;
    end if;
    if price is null or price <= 0 then raise exception 'ITEM_UNAVAILABLE'; end if;

    line_total := round(price * qty, 2);
    insert into order_items (order_id, vegetable_id, vegetable_name, unit, price, quantity, item_total, seller_id, seller_name)
    values (o.id, veg.id, veg.name, unit_label, price, qty, line_total, veg.seller_id,
            (select s.business_name from sellers s where s.id = veg.seller_id));
    sub := sub + line_total;
  end loop;

  if ds.min_order_value > 0 and sub < ds.min_order_value then raise exception 'BELOW_MIN'; end if;

  -- डिलीवरी शुल्क: client की calculateDeliveryFee जैसा ही नियम
  select r.fee into fee from delivery_rules r
    where r.is_active and coalesce(r.zone, '') = '' and r.min_subtotal <= sub
    order by r.min_subtotal desc limit 1;
  if not found then
    fee := case when ds.free_delivery_above is not null and ds.free_delivery_above > 0 and sub >= ds.free_delivery_above
                then 0 else ds.delivery_fee end;
  end if;

  -- M1: कूपन सर्वर पर जाँचा जाता है
  if coupon <> '' then
    select * into offer from offers where upper(coupon_code) = coupon and is_active;
    if not found then raise exception 'COUPON_INVALID'; end if;
    if offer.valid_from is not null and offer.valid_from > now() then raise exception 'COUPON_INVALID'; end if;
    if offer.valid_until is not null and offer.valid_until < now() then raise exception 'COUPON_EXPIRED'; end if;
    if coalesce(offer.min_order_value, 0) > 0 and sub < offer.min_order_value then raise exception 'COUPON_MIN_ORDER'; end if;
    if offer.max_uses_per_customer is not null then
      select count(*) into used_by_cust from coupon_redemptions where offer_id = offer.id and customer_phone = v_phone;
      if used_by_cust >= offer.max_uses_per_customer then raise exception 'COUPON_USED'; end if;
    end if;
    if offer.max_total_uses is not null then
      select count(*) into used_total from coupon_redemptions where offer_id = offer.id;
      if used_total >= offer.max_total_uses then raise exception 'COUPON_USED'; end if;
    end if;
    disc := case when offer.discount_type = 'percent' then sub * offer.discount_value / 100 else offer.discount_value end;
    disc := round(least(greatest(disc, 0), sub), 2);
    insert into coupon_redemptions (offer_id, order_id, customer_phone) values (offer.id, o.id, v_phone);
  end if;

  total := greatest(0, round(sub + fee - disc, 2));
  update orders set subtotal = sub, delivery_fee = fee, discount = disc, total_amount = total,
                    coupon_code = nullif(coupon, '')
    where id = o.id;                                 -- order_financials trigger यहीं चलता है

  insert into order_idempotency (key, order_id) values (p_idem, o.id);
  select * into o from orders where id = o.id;
  return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total_amount', o.total_amount,
                            'payment_status', o.payment_status, 'access_token', o.access_token);
end $$;

revoke all on function place_order(uuid, jsonb, jsonb, text) from public;
grant execute on function place_order(uuid, jsonb, jsonb, text) to anon, authenticated;

-- कूपन की सिर्फ़ जाँच (Checkout पर छूट दिखाने के लिए) — असली लगाना place_order में ही होता है
create or replace function validate_coupon(p_code text, p_subtotal numeric, p_phone text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  offer offers%rowtype;
  code text := upper(btrim(coalesce(p_code, '')));
  sub numeric := coalesce(p_subtotal, 0);
  disc numeric;
  ph text := btrim(coalesce(p_phone, ''));
begin
  if code = '' or length(code) > 40 then return jsonb_build_object('ok', false, 'error', 'COUPON_INVALID'); end if;
  select * into offer from offers where upper(coupon_code) = code and is_active;
  if not found or (offer.valid_from is not null and offer.valid_from > now()) then
    return jsonb_build_object('ok', false, 'error', 'COUPON_INVALID');
  end if;
  if offer.valid_until is not null and offer.valid_until < now() then
    return jsonb_build_object('ok', false, 'error', 'COUPON_EXPIRED');
  end if;
  if coalesce(offer.min_order_value, 0) > 0 and sub < offer.min_order_value then
    return jsonb_build_object('ok', false, 'error', 'COUPON_MIN_ORDER', 'min_order_value', offer.min_order_value);
  end if;
  if offer.max_total_uses is not null
     and (select count(*) from coupon_redemptions where offer_id = offer.id) >= offer.max_total_uses then
    return jsonb_build_object('ok', false, 'error', 'COUPON_USED');
  end if;
  if offer.max_uses_per_customer is not null and ph ~ '^[6-9][0-9]{9}$'
     and (select count(*) from coupon_redemptions where offer_id = offer.id and customer_phone = ph) >= offer.max_uses_per_customer then
    return jsonb_build_object('ok', false, 'error', 'COUPON_USED');
  end if;
  disc := case when offer.discount_type = 'percent' then sub * offer.discount_value / 100 else offer.discount_value end;
  disc := round(least(greatest(disc, 0), sub), 2);
  return jsonb_build_object('ok', true, 'discount', disc);
end $$;
revoke all on function validate_coupon(text, numeric, text) from public;
grant execute on function validate_coupon(text, numeric, text) to anon, authenticated;

-- ---------------------------------------------------------
-- 5. C1: ग्राहक की पढ़ने की पहुँच — access_token से (या फ़ोन + ऑर्डर नंबर से, बिना OTP)
-- ---------------------------------------------------------
create or replace function get_order_public(p_order_id uuid, p_token uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'access_token' - 'delivery_boy_id' - 'delivery_pin_attempts',
    'items', coalesce((select jsonb_agg(to_jsonb(i) - 'seller_id' order by i.vegetable_name)
                       from order_items i where i.order_id = o.id), '[]'::jsonb))
  from orders o where o.id = p_order_id and o.access_token = p_token;
$$;
revoke all on function get_order_public(uuid, uuid) from public;
grant execute on function get_order_public(uuid, uuid) to anon, authenticated;

-- "मेरे ऑर्डर": फ़ोन + उस फ़ोन के किसी एक ऑर्डर का नंबर सही हो तभी सूची मिलती है।
-- गलत कोशिशें गिनी जाती हैं (फ़ोन के हिसाब से 5 / 15 मिनट, IP के हिसाब से 20 / 15 मिनट)।
-- नोट: OTP जितना मज़बूत नहीं है — ऑर्डर नंबर गोपनीय "पासवर्ड" की तरह काम करता है।
create or replace function customer_orders(p_phone text, p_order_number text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ph text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  num text := upper(btrim(coalesce(p_order_number, '')));
  ip text := aks_client_ip();
  fails_phone int;
  fails_ip int;
  result jsonb;
begin
  if ph !~ '^[6-9][0-9]{9}$' or length(num) not between 6 and 40 then
    return jsonb_build_object('ok', false, 'error', 'BAD_INPUT');
  end if;
  delete from security_attempts where kind = 'customer_lookup' and at < now() - interval '1 day';
  select count(*) into fails_phone from security_attempts
    where kind = 'customer_lookup' and subject = 'phone:' || ph and at > now() - interval '15 minutes';
  select count(*) into fails_ip from security_attempts
    where kind = 'customer_lookup' and subject = 'ip:' || ip and at > now() - interval '15 minutes';
  if fails_phone >= 5 or fails_ip >= 20 then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;

  if not exists (select 1 from orders where customer_phone = ph and upper(order_number) = num) then
    insert into security_attempts (kind, subject) values ('customer_lookup', 'phone:' || ph), ('customer_lookup', 'ip:' || ip);
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) into result
  from (
    select (to_jsonb(o) - 'delivery_boy_id' - 'delivery_pin' - 'delivery_pin_attempts')
           || jsonb_build_object('order_items',
                coalesce((select jsonb_agg(to_jsonb(i) - 'seller_id') from order_items i where i.order_id = o.id), '[]'::jsonb)) as x
    from orders o where o.customer_phone = ph order by o.created_at desc limit 30
  ) t;
  return jsonb_build_object('ok', true, 'orders', result);
end $$;
revoke all on function customer_orders(text, text) from public;
grant execute on function customer_orders(text, text) to anon, authenticated;

-- ऑर्डर-स्थिति बदलाव की सूचना (realtime की जगह polling): [{id, token}] → [{id, order_number, order_status, payment_status}]
create or replace function get_orders_status(p_orders jsonb)
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'order_number', o.order_number,
           'order_status', o.order_status, 'payment_status', o.payment_status)), '[]'::jsonb)
  from (
    select e->>'id' as id, e->>'token' as token
    from jsonb_array_elements(case when jsonb_typeof(p_orders) = 'array' then p_orders else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object'
      and (e->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (e->>'token') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    limit 10
  ) x
  join orders o on o.id = x.id::uuid and o.access_token = x.token::uuid;
$$;
revoke all on function get_orders_status(jsonb) from public;
grant execute on function get_orders_status(jsonb) to anon, authenticated;

-- ---------------------------------------------------------
-- 6. C4: भुगतान सफल मानने का एकमात्र रास्ता — सिर्फ़ service_role (Edge Functions) चला सकता है
-- ---------------------------------------------------------
create or replace function mark_order_paid(
  p_order_id uuid, p_gateway_order_id text, p_payment_id text, p_signature text, p_method text, p_amount numeric)
returns text language plpgsql security definer set search_path = public as $$
declare o orders%rowtype;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then return 'not_found'; end if;
  if o.payment_status = 'सफल' then return 'already'; end if;
  if p_amount is not null and round(p_amount, 2) <> o.total_amount then return 'amount_mismatch'; end if;

  update payments set status = 'सफल', gateway_payment_id = p_payment_id, gateway_signature = p_signature, method = p_method
    where order_id = p_order_id and gateway_order_id = p_gateway_order_id;
  if not found then
    insert into payments (order_id, gateway, gateway_order_id, gateway_payment_id, gateway_signature, amount, status, method)
    values (p_order_id, 'razorpay', p_gateway_order_id, p_payment_id, p_signature, o.total_amount, 'सफल', p_method);
  end if;

  update orders set payment_status = 'सफल',
                    order_status = case when order_status = 'नया ऑर्डर' then 'भुगतान सफल' else order_status end
    where id = p_order_id;
  return 'ok';
end $$;
revoke all on function mark_order_paid(uuid, text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function mark_order_paid(uuid, text, text, text, text, numeric) to service_role;

-- बिना भुगतान वाले पुराने अधूरे ऑर्डर रद्द करें (pg_cron / Supabase Scheduled Function से हर घंटे चला सकते हैं)
--   select cron.schedule('cancel-stale-orders', '0 * * * *', $$select cancel_stale_unpaid_orders(3)$$);
create or replace function cancel_stale_unpaid_orders(p_hours int default 3)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update orders set order_status = 'रद्द'
    where payment_status = 'लंबित' and order_status = 'नया ऑर्डर'
      and created_at < now() - make_interval(hours => greatest(p_hours, 1));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function cancel_stale_unpaid_orders(int) from public, anon, authenticated;
grant execute on function cancel_stale_unpaid_orders(int) to service_role;

-- ---------------------------------------------------------
-- 7. C5/L1/M3: डिलीवरी बॉय — PIN hash, सर्वर-साइड session, claim/confirm RPC
-- ---------------------------------------------------------
alter table delivery_boys add column if not exists pin_hash text;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'delivery_boys' and column_name = 'pin') then
    update delivery_boys set pin_hash = crypt(pin, gen_salt('bf', 10)) where pin_hash is null and pin ~ '^[0-9]{4}$';
    drop index if exists idx_delivery_boys_active_pin;
    alter table delivery_boys drop column pin;
  end if;
end $$;

create table if not exists delivery_sessions (
  token_hash text primary key,
  delivery_boy_id uuid not null references delivery_boys(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_delivery_sessions_boy on delivery_sessions(delivery_boy_id);
alter table delivery_sessions enable row level security;

-- एडमिन: नया/बदला PIN सेट करना (PIN कभी वापस पढ़ा नहीं जा सकता)
create or replace function admin_save_delivery_boy(
  p_id uuid, p_full_name text, p_phone text, p_pin text, p_is_active boolean)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := p_id;
  v_pin text := nullif(btrim(coalesce(p_pin, '')), '');
begin
  if not is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(btrim(coalesce(p_full_name, ''))) not between 1 and 80 then raise exception 'BAD_NAME'; end if;
  if v_pin is not null then
    if v_pin !~ '^[0-9]{4}$' then raise exception 'BAD_PIN'; end if;
    if p_is_active and exists (
         select 1 from delivery_boys b
         where b.is_active and b.id is distinct from p_id and b.pin_hash is not null and crypt(v_pin, b.pin_hash) = b.pin_hash) then
      raise exception 'PIN_IN_USE';
    end if;
  elsif p_id is null then
    raise exception 'BAD_PIN';
  end if;

  if p_id is null then
    insert into delivery_boys (full_name, phone, pin_hash, is_active)
    values (btrim(p_full_name), nullif(btrim(coalesce(p_phone, '')), ''), crypt(v_pin, gen_salt('bf', 10)), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update delivery_boys set
      full_name = btrim(p_full_name),
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      is_active = coalesce(p_is_active, is_active),
      pin_hash = case when v_pin is null then pin_hash else crypt(v_pin, gen_salt('bf', 10)) end
    where id = p_id;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_pin is not null or not coalesce(p_is_active, true) then
      delete from delivery_sessions where delivery_boy_id = p_id;      -- PIN बदला/निष्क्रिय किया → पुराने session खत्म
    end if;
  end if;
  return v_id;
end $$;
revoke all on function admin_save_delivery_boy(uuid, text, text, text, boolean) from public;
grant execute on function admin_save_delivery_boy(uuid, text, text, text, boolean) to authenticated;

-- आंतरिक: token → सक्रिय डिलीवरी बॉय की id (सीधे ग्राहकों को नहीं दिया जाता)
create or replace function aks_delivery_boy_from_token(p_token text)
returns uuid language sql security definer stable set search_path = public, extensions as $$
  select s.delivery_boy_id
  from delivery_sessions s join delivery_boys b on b.id = s.delivery_boy_id
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now() and b.is_active;
$$;
revoke all on function aks_delivery_boy_from_token(text) from public, anon, authenticated;

create or replace function delivery_login(p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  ip text := aks_client_ip();
  fails_ip int;
  fails_all int;
  b delivery_boys%rowtype;
  tok text;
begin
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'error', 'BAD_PIN'); end if;
  delete from security_attempts where kind = 'delivery_login' and at < now() - interval '1 day';
  select count(*) into fails_ip from security_attempts
    where kind = 'delivery_login' and subject = 'ip:' || ip and at > now() - interval '15 minutes';
  select count(*) into fails_all from security_attempts
    where kind = 'delivery_login' and at > now() - interval '15 minutes';
  if fails_ip >= 5 or fails_all >= 40 then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;

  select * into b from delivery_boys where is_active and pin_hash is not null and crypt(p_pin, pin_hash) = pin_hash limit 1;
  if not found then
    insert into security_attempts (kind, subject) values ('delivery_login', 'ip:' || ip);
    return jsonb_build_object('ok', false, 'error', 'WRONG_PIN');
  end if;

  tok := encode(gen_random_bytes(32), 'hex');
  insert into delivery_sessions (token_hash, delivery_boy_id, expires_at)
    values (encode(digest(tok, 'sha256'), 'hex'), b.id, now() + interval '7 days');
  delete from delivery_sessions where expires_at < now();
  return jsonb_build_object('ok', true, 'token', tok, 'boy', jsonb_build_object('id', b.id, 'full_name', b.full_name));
end $$;
revoke all on function delivery_login(text) from public;
grant execute on function delivery_login(text) to anon, authenticated;

create or replace function delivery_me(p_token text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token); b delivery_boys%rowtype;
begin
  if v is null then return null; end if;
  select * into b from delivery_boys where id = v;
  return jsonb_build_object('id', b.id, 'full_name', b.full_name);
end $$;
revoke all on function delivery_me(text) from public;
grant execute on function delivery_me(text) to anon, authenticated;

create or replace function delivery_logout(p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  delete from delivery_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;
revoke all on function delivery_logout(text) from public;
grant execute on function delivery_logout(text) to anon, authenticated;

-- सूची: delivery_pin / भुगतान की जानकारी / customer_id कभी नहीं जाती
create or replace function delivery_orders(p_token text, p_tab text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token);
begin
  if v is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc) from (
      select o.id, o.order_number, o.customer_name, o.customer_phone, o.full_address, o.mohalla, o.city, o.pincode,
             o.delivery_time_slot, o.extra_notes, o.latitude, o.longitude, o.total_amount, o.order_status, o.created_at,
             coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'vegetable_name', i.vegetable_name,
                         'quantity', i.quantity, 'unit', i.unit, 'item_total', i.item_total))
                       from order_items i where i.order_id = o.id), '[]'::jsonb) as order_items
      from orders o
      where case
        when p_tab = 'available' then o.order_status in ('स्वीकार किया गया', 'सामान तैयार हो रहा है') and o.delivery_boy_id is null
        when p_tab = 'mine'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी के लिए निकल गया'
        when p_tab = 'done'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी पूरी हुई'
        else false end
      order by o.created_at desc
      limit case when p_tab = 'done' then 20 else 100 end
    ) t), '[]'::jsonb);
end $$;
revoke all on function delivery_orders(text, text) from public;
grant execute on function delivery_orders(text, text) to anon, authenticated;

-- M3: दो boys एक ही ऑर्डर नहीं ले सकते
create or replace function delivery_claim_order(p_token text, p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token); n int;
begin
  if v is null then raise exception 'UNAUTHORIZED'; end if;
  update orders set delivery_boy_id = v, order_status = 'डिलीवरी के लिए निकल गया'
    where id = p_order_id and delivery_boy_id is null
      and order_status in ('स्वीकार किया गया', 'सामान तैयार हो रहा है');
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'TAKEN'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function delivery_claim_order(text, uuid) from public;
grant execute on function delivery_claim_order(text, uuid) to anon, authenticated;

-- PIN की जाँच सर्वर पर; हर ऑर्डर पर 5 गलत कोशिश के बाद लॉक (एडमिन ऑर्डर-स्थिति खुद बदल सकता है)
create or replace function delivery_confirm(p_token text, p_order_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token); o orders%rowtype;
begin
  if v is null then raise exception 'UNAUTHORIZED'; end if;
  select * into o from orders where id = p_order_id and delivery_boy_id = v for update;
  if not found or o.order_status <> 'डिलीवरी के लिए निकल गया' then
    return jsonb_build_object('ok', false, 'error', 'NOT_ALLOWED');
  end if;
  if o.delivery_pin_attempts >= 5 then return jsonb_build_object('ok', false, 'error', 'LOCKED'); end if;
  if o.delivery_pin is distinct from btrim(coalesce(p_pin, '')) then
    update orders set delivery_pin_attempts = delivery_pin_attempts + 1 where id = o.id;
    return jsonb_build_object('ok', false, 'error', 'WRONG_PIN', 'attempts_left', greatest(0, 4 - o.delivery_pin_attempts));
  end if;
  update orders set order_status = 'डिलीवरी पूरी हुई' where id = o.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function delivery_confirm(text, uuid, text) from public;
grant execute on function delivery_confirm(text, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------
-- 8. सेलर: सिर्फ़ अपनी लाइनें + ज़रूरी कॉलम (delivery_pin / GPS / token नहीं)
-- ---------------------------------------------------------
create or replace function seller_order_lines()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('orders', jsonb_build_object(
      'order_number', o.order_number, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
      'full_address', o.full_address, 'mohalla', o.mohalla, 'city', o.city, 'pincode', o.pincode,
      'delivery_date', o.delivery_date, 'delivery_time_slot', o.delivery_time_slot,
      'payment_status', o.payment_status, 'order_status', o.order_status, 'created_at', o.created_at))
    order by o.created_at desc), '[]'::jsonb)
  from order_items i join orders o on o.id = i.order_id
  where auth.uid() is not null and i.seller_id = auth.uid();
$$;
revoke all on function seller_order_lines() from public, anon;
grant execute on function seller_order_lines() to authenticated;

-- ---------------------------------------------------------
-- 9. M2: Storage — सिर्फ़ एडमिन / अप्रूव्ड सेलर फोटो डाल-बदल-हटा सकें
-- ---------------------------------------------------------
do $$ begin
  drop policy if exists "Authenticated upload for vegetable-images" on storage.objects;
  drop policy if exists "Authenticated update for vegetable-images" on storage.objects;
  drop policy if exists "Authenticated delete for vegetable-images" on storage.objects;
  drop policy if exists "vegetable_images_staff_insert" on storage.objects;
  drop policy if exists "vegetable_images_staff_update" on storage.objects;
  drop policy if exists "vegetable_images_staff_delete" on storage.objects;

  create policy "vegetable_images_staff_insert" on storage.objects for insert with check (
    bucket_id = 'vegetable-images'
    and (public.is_admin() or exists (select 1 from public.sellers s where s.id = auth.uid() and s.is_approved and s.is_active)));
  create policy "vegetable_images_staff_update" on storage.objects for update using (
    bucket_id = 'vegetable-images'
    and (public.is_admin() or exists (select 1 from public.sellers s where s.id = auth.uid() and s.is_approved and s.is_active)));
  create policy "vegetable_images_staff_delete" on storage.objects for delete using (
    bucket_id = 'vegetable-images'
    and (public.is_admin() or exists (select 1 from public.sellers s where s.id = auth.uid() and s.is_approved and s.is_active)));

  -- साइज़/टाइप सीमा (bucket मौजूद हो तभी)
  update storage.buckets set file_size_limit = 2097152,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
    where id = 'vegetable-images';
exception when others then
  raise notice 'Storage policies/limits नहीं लगे (%): bucket "vegetable-images" बनाकर यह हिस्सा दोबारा चलाएँ', sqlerrm;
end $$;

-- =========================================================
-- पूर्ण। अब staging पर जाँचें (anon key से, ये सब फेल होने चाहिए):
--   GET  /rest/v1/orders?select=*            → [] (खाली)
--   GET  /rest/v1/delivery_boys?select=*     → [] (खाली)
--   PATCH /rest/v1/orders?...                → 0 rows / 401
--   POST /rest/v1/orders                      → 401/403 (RLS)
-- =========================================================

-- #########################################################
-- भाग 6/12: cod_payment.sql — कैश ऑन डिलीवरी
-- #########################################################

-- =========================================================
-- कैश ऑन डिलीवरी (COD) — एडमिन पैनल से चालू/बंद
--
-- कब चलाएँ: schema.sql → pricing_engine.sql → vendor_seller_association.sql → delivery_boy_module.sql
--           → security_hardening.sql → **यह फ़ाइल**। (दोबारा चलाना सुरक्षित है — idempotent)
--
-- यह फ़ाइल security_hardening.sql के 4 functions को COD-सहित दोबारा परिभाषित करती है
-- (place_order, delivery_orders, seller_order_lines, cancel_stale_unpaid_orders)।
-- इसलिए security_hardening.sql कभी दोबारा चलाएँ तो इसके बाद यह फ़ाइल भी चलाएँ।
--
-- व्यवहार:
--   • COD डिफ़ॉल्ट रूप से **बंद** है; मालिक (owner) एडमिन पैनल → "भुगतान विकल्प" से चालू करता है।
--   • COD ऑर्डर: payment_method='COD', payment_status='लंबित' रहता है (पैसा आया नहीं), order_status='नया ऑर्डर'।
--   • डिलीवरी पूरी होते ही (डिलीवरी बॉय का पिन-कन्फर्म या एडमिन का स्टेटस) payment_status अपने-आप 'सफल'
--     हो जाता है और payments में gateway='cod' की पंक्ति बनती है (रिपोर्ट में बिक्री तभी गिनी जाती है)।
--   • COD ऑर्डर cancel_stale_unpaid_orders से रद्द नहीं होते।
--   • COD की सीमा (cod_max_order_value, वैकल्पिक) और एक IP से 10 ऑर्डर/घंटा की रोक सर्वर पर लागू है।
-- =========================================================

-- ---------------------------------------------------------
-- 1. सेटिंग (delivery_settings): चालू/बंद + वैकल्पिक अधिकतम राशि
--    पढ़ना सबके लिए, बदलना सिर्फ़ owner (मौजूदा delivery_settings_admin_update policy), हर बदलाव pricing_audit_log में दर्ज
-- ---------------------------------------------------------
alter table delivery_settings add column if not exists cod_enabled boolean not null default false;
alter table delivery_settings add column if not exists cod_max_order_value numeric(10,2)
  check (cod_max_order_value is null or cod_max_order_value > 0);

-- ---------------------------------------------------------
-- 2. orders.payment_method में 'COD' की अनुमति
-- ---------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'orders'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%payment_method%'
  loop
    execute format('alter table orders drop constraint %I', c.conname);
  end loop;
  alter table orders add constraint orders_payment_method_check check (payment_method in ('UPI', 'ऑनलाइन', 'COD'));
end $$;

-- ---------------------------------------------------------
-- 3. डिलीवरी पूरी होते ही COD का पैसा 'प्राप्त' दर्ज करें
--    (delivery_confirm और एडमिन के स्टेटस-बदलाव, दोनों रास्तों पर लागू)
-- ---------------------------------------------------------
create or replace function cod_settle_on_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_method = 'COD'
     and new.order_status = 'डिलीवरी पूरी हुई'
     and old.order_status is distinct from new.order_status
     and new.payment_status = 'लंबित' then
    new.payment_status := 'सफल';
    insert into payments (order_id, gateway, amount, status, method)
      values (new.id, 'cod', new.total_amount, 'सफल', 'COD');
  end if;
  return new;
end $$;
drop trigger if exists trg_cod_settle_on_delivery on orders;
create trigger trg_cod_settle_on_delivery before update of order_status on orders
  for each row execute function cod_settle_on_delivery();

-- ---------------------------------------------------------
-- 4. security_hardening.sql के functions — COD-सहित (बदलाव सिर्फ़ COD वाले हिस्सों में)
-- ---------------------------------------------------------
create or replace function place_order(p_idem uuid, p_customer jsonb, p_items jsonb, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  ds delivery_settings%rowtype;
  o orders%rowtype;
  veg vegetables%rowtype;
  it jsonb;
  tier jsonb;
  offer offers%rowtype;
  qty numeric;
  price numeric;
  unit_label text;
  line_total numeric;
  sub numeric := 0;
  fee numeric;
  disc numeric := 0;
  total numeric;
  cust uuid;
  v_phone text := btrim(coalesce(p_customer->>'phone', ''));
  v_name text := btrim(coalesce(p_customer->>'name', ''));
  v_addr text := btrim(coalesce(p_customer->>'address', ''));
  v_pin text := btrim(coalesce(p_customer->>'pincode', ''));
  v_date date;
  v_slot text := btrim(coalesce(p_customer->>'delivery_time_slot', ''));
  v_source text;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  existing uuid;
  coupon text := upper(btrim(coalesce(p_coupon, '')));
  used_by_cust int;
  used_total int;
  pending_cnt int;
  tq numeric;
  tu text;
  v_method text;
  v_raw_method text := upper(btrim(coalesce(p_customer->>'payment_method', '')));
  v_ip text := aks_client_ip();
  cod_recent int;
begin
  if p_idem is null then raise exception 'BAD_REQUEST'; end if;

  -- एक ही key की दो एक-साथ कॉल: दूसरी पहली के खत्म होने तक रुकेगी
  perform pg_advisory_xact_lock(hashtextextended(p_idem::text, 0));

  select order_id into existing from order_idempotency where key = p_idem;
  if existing is not null then
    select * into o from orders where id = existing;
    return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total_amount', o.total_amount,
                              'payment_status', o.payment_status, 'payment_method', o.payment_method, 'access_token', o.access_token, 'replayed', true);
  end if;

  select * into ds from delivery_settings where id = 1;
  if not found then raise exception 'SETTINGS_MISSING'; end if;
  if not ds.is_store_open then raise exception 'STORE_CLOSED'; end if;

  -- भुगतान का तरीका: ऑनलाइन (डिफ़ॉल्ट) या कैश ऑन डिलीवरी — COD तभी जब एडमिन ने चालू किया हो (सर्वर पर जाँच)
  if v_raw_method in ('', 'ONLINE') then
    v_method := 'ऑनलाइन';
  elsif v_raw_method = 'COD' then
    if not ds.cod_enabled then raise exception 'COD_DISABLED'; end if;
    v_method := 'COD';
    -- COD में अग्रिम भुगतान नहीं होता, इसलिए फ़र्ज़ी ऑर्डर रोकने को एक IP से प्रति घंटे 10 की सीमा
    delete from security_attempts where kind = 'cod_order' and at < now() - interval '1 day';
    select count(*) into cod_recent from security_attempts
      where kind = 'cod_order' and subject = 'ip:' || v_ip and at > now() - interval '1 hour';
    if v_ip <> 'unknown' and cod_recent >= 10 then raise exception 'RATE_LIMITED'; end if;
  else
    raise exception 'BAD_PAYMENT_METHOD';
  end if;

  if v_phone !~ '^[6-9][0-9]{9}$' then raise exception 'BAD_PHONE'; end if;
  if length(v_name) not between 1 and 80 then raise exception 'BAD_NAME'; end if;
  if length(v_addr) not between 5 and 300 then raise exception 'BAD_ADDRESS'; end if;
  if v_pin !~ '^[0-9]{6}$' then raise exception 'BAD_PINCODE'; end if;
  if length(btrim(coalesce(p_customer->>'city', ''))) not between 1 and 60 then raise exception 'BAD_CITY'; end if;
  if length(v_slot) not between 1 and 60 then raise exception 'BAD_SLOT'; end if;
  begin
    v_date := (p_customer->>'delivery_date')::date;
  exception when others then
    raise exception 'BAD_DATE';
  end;
  if v_date is null or v_date < v_today or v_date > v_today + 14 then raise exception 'BAD_DATE'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'BAD_ITEMS';
  end if;

  v_source := coalesce(p_customer->>'order_source', '');
  if v_source not in ('वेबसाइट', 'AI सहायक', 'WhatsApp') then v_source := 'वेबसाइट'; end if;

  -- एक नंबर से बहुत सारे अधूरे (अनपेड) ऑर्डर बनाकर spam रोकें
  select count(*) into pending_cnt from orders
    where customer_phone = v_phone and payment_status = 'लंबित' and created_at > now() - interval '1 hour';
  if pending_cnt >= 5 then raise exception 'TOO_MANY_PENDING'; end if;

  -- M5: race-free upsert
  insert into customers (full_name, phone) values (v_name, v_phone)
    on conflict (phone) do update set full_name = excluded.full_name
    returning id into cust;

  insert into orders (customer_id, customer_name, customer_phone, full_address, mohalla, city, pincode,
                      delivery_date, delivery_time_slot, extra_notes, latitude, longitude,
                      payment_status, payment_method, order_status, order_source)
  values (cust, v_name, v_phone, v_addr, left(btrim(coalesce(p_customer->>'mohalla', '')), 100),
          btrim(p_customer->>'city'), v_pin, v_date, v_slot,
          left(btrim(coalesce(p_customer->>'notes', '')), 300),
          case when aks_try_numeric(p_customer->>'lat') between -90 and 90 then aks_try_numeric(p_customer->>'lat') end,
          case when aks_try_numeric(p_customer->>'lng') between -180 and 180 then aks_try_numeric(p_customer->>'lng') end,
          'लंबित', v_method, 'नया ऑर्डर', v_source)
  returning * into o;

  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) is distinct from 'object' then raise exception 'BAD_ITEMS'; end if;
    if (it->>'vegetable_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'BAD_ITEMS';
    end if;
    qty := aks_try_numeric(it->>'quantity');
    if qty is null or qty <= 0 or qty > 50 or qty <> round(qty, 3) then raise exception 'BAD_QTY'; end if;

    select * into veg from vegetables where id = (it->>'vegetable_id')::uuid;
    if not found or not veg.is_active or veg.stock_status <> 'उपलब्ध' then raise exception 'ITEM_UNAVAILABLE'; end if;
    if veg.seller_id is not null and not exists (
         select 1 from sellers s where s.id = veg.seller_id and s.is_approved and s.is_active) then
      raise exception 'ITEM_UNAVAILABLE';
    end if;

    tier := null;
    tq := aks_try_numeric(it->>'tier_qty');
    tu := nullif(btrim(coalesce(it->>'tier_unit', '')), '');
    if tq is not null or tu is not null then
      select e.value into tier from jsonb_array_elements(coalesce(veg.price_tiers, '[]'::jsonb)) e
        where aks_try_numeric(e.value->>'qty') = tq and e.value->>'unit' = tu limit 1;
      if tier is null then raise exception 'BAD_TIER'; end if;
      price := (tier->>'price')::numeric;
      unit_label := (tier->>'qty') || ' ' || (tier->>'unit');
    else
      price := veg.price;
      unit_label := veg.unit;
    end if;
    if price is null or price <= 0 then raise exception 'ITEM_UNAVAILABLE'; end if;

    line_total := round(price * qty, 2);
    insert into order_items (order_id, vegetable_id, vegetable_name, unit, price, quantity, item_total, seller_id, seller_name)
    values (o.id, veg.id, veg.name, unit_label, price, qty, line_total, veg.seller_id,
            (select s.business_name from sellers s where s.id = veg.seller_id));
    sub := sub + line_total;
  end loop;

  if ds.min_order_value > 0 and sub < ds.min_order_value then raise exception 'BELOW_MIN'; end if;

  -- डिलीवरी शुल्क: client की calculateDeliveryFee जैसा ही नियम
  select r.fee into fee from delivery_rules r
    where r.is_active and coalesce(r.zone, '') = '' and r.min_subtotal <= sub
    order by r.min_subtotal desc limit 1;
  if not found then
    fee := case when ds.free_delivery_above is not null and ds.free_delivery_above > 0 and sub >= ds.free_delivery_above
                then 0 else ds.delivery_fee end;
  end if;

  -- M1: कूपन सर्वर पर जाँचा जाता है
  if coupon <> '' then
    select * into offer from offers where upper(coupon_code) = coupon and is_active;
    if not found then raise exception 'COUPON_INVALID'; end if;
    if offer.valid_from is not null and offer.valid_from > now() then raise exception 'COUPON_INVALID'; end if;
    if offer.valid_until is not null and offer.valid_until < now() then raise exception 'COUPON_EXPIRED'; end if;
    if coalesce(offer.min_order_value, 0) > 0 and sub < offer.min_order_value then raise exception 'COUPON_MIN_ORDER'; end if;
    if offer.max_uses_per_customer is not null then
      select count(*) into used_by_cust from coupon_redemptions where offer_id = offer.id and customer_phone = v_phone;
      if used_by_cust >= offer.max_uses_per_customer then raise exception 'COUPON_USED'; end if;
    end if;
    if offer.max_total_uses is not null then
      select count(*) into used_total from coupon_redemptions where offer_id = offer.id;
      if used_total >= offer.max_total_uses then raise exception 'COUPON_USED'; end if;
    end if;
    disc := case when offer.discount_type = 'percent' then sub * offer.discount_value / 100 else offer.discount_value end;
    disc := round(least(greatest(disc, 0), sub), 2);
    insert into coupon_redemptions (offer_id, order_id, customer_phone) values (offer.id, o.id, v_phone);
  end if;

  total := greatest(0, round(sub + fee - disc, 2));
  if v_method = 'COD' and ds.cod_max_order_value is not null and total > ds.cod_max_order_value then
    raise exception 'COD_LIMIT_EXCEEDED';
  end if;
  update orders set subtotal = sub, delivery_fee = fee, discount = disc, total_amount = total,
                    coupon_code = nullif(coupon, '')
    where id = o.id;                                 -- order_financials trigger यहीं चलता है

  if v_method = 'COD' then
    insert into security_attempts (kind, subject) values ('cod_order', 'ip:' || v_ip);
  end if;
  insert into order_idempotency (key, order_id) values (p_idem, o.id);
  select * into o from orders where id = o.id;
  return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total_amount', o.total_amount,
                            'payment_status', o.payment_status, 'payment_method', o.payment_method, 'access_token', o.access_token);
end $$;


-- डिलीवरी पर ऑनलाइन भुगतान (pay_online_on_delivery.sql) का कॉलम — नीचे के functions इसे पढ़ते हैं, इसलिए पहले से मौजूद रहे
alter table orders add column if not exists cod_pay_mode text not null default 'cash'
  check (cod_pay_mode in ('cash', 'online'));

create or replace function delivery_orders(p_token text, p_tab text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token);
begin
  if v is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc) from (
      select o.id, o.order_number, o.customer_name, o.customer_phone, o.full_address, o.mohalla, o.city, o.pincode,
             o.delivery_time_slot, o.extra_notes, o.latitude, o.longitude, o.total_amount, o.payment_method, o.cod_pay_mode, o.payment_status, o.order_status, o.created_at,
             coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'vegetable_name', i.vegetable_name,
                         'quantity', i.quantity, 'unit', i.unit, 'item_total', i.item_total))
                       from order_items i where i.order_id = o.id), '[]'::jsonb) as order_items
      from orders o
      where case
        when p_tab = 'available' then o.order_status in ('स्वीकार किया गया', 'सामान तैयार हो रहा है') and o.delivery_boy_id is null
        when p_tab = 'mine'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी के लिए निकल गया'
        when p_tab = 'done'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी पूरी हुई'
        else false end
      order by o.created_at desc
      limit case when p_tab = 'done' then 20 else 100 end
    ) t), '[]'::jsonb);
end $$;

create or replace function seller_order_lines()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('orders', jsonb_build_object(
      'order_number', o.order_number, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
      'full_address', o.full_address, 'mohalla', o.mohalla, 'city', o.city, 'pincode', o.pincode,
      'delivery_date', o.delivery_date, 'delivery_time_slot', o.delivery_time_slot,
      'payment_status', o.payment_status, 'payment_method', o.payment_method, 'cod_pay_mode', o.cod_pay_mode, 'order_status', o.order_status, 'created_at', o.created_at))
    order by o.created_at desc), '[]'::jsonb)
  from order_items i join orders o on o.id = i.order_id
  where auth.uid() is not null and i.seller_id = auth.uid();
$$;

create or replace function cancel_stale_unpaid_orders(p_hours int default 3)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update orders set order_status = 'रद्द'
    where payment_status = 'लंबित' and coalesce(payment_method, '') <> 'COD' and order_status = 'नया ऑर्डर'
      and created_at < now() - make_interval(hours => greatest(p_hours, 1));
  get diagnostics n = row_count;
  return n;
end $$;

-- #########################################################
-- भाग 7/12: pay_online_on_delivery.sql — डिलीवरी पर ऑनलाइन (UPI) भुगतान
-- #########################################################

-- =========================================================
-- डिलीवरी पर ऑनलाइन भुगतान (UPI / QR स्कैन) — COD का ही एक रूप
--
-- कब चलाएँ: ... → security_hardening.sql → cod_payment.sql → **यह फ़ाइल**। (दोबारा चलाना सुरक्षित है — idempotent)
--
-- व्यवहार:
--   • ग्राहक चेकआउट पर "डिलीवरी पर ऑनलाइन भुगतान (UPI)" चुनता है → ऑर्डर payment_method='COD' ही रहता है
--     (सारे COD नियम: चालू/बंद, राशि-सीमा, डिलीवरी पर 'सफल' दर्ज होना — वैसे ही लागू), बस orders.cod_pay_mode='online'।
--   • डिलीवरी बॉय को "UPI/ऑनलाइन लें" दिखता है और दुकान के UPI ID का QR (राशि पहले से भरी हुई) खुलता है।
--   • दुकान का UPI ID एडमिन → भुगतान विकल्प में सेट होता है (delivery_settings.shop_upi_id)।
--   • नोट: यह Razorpay नहीं है — पैसा सीधे दुकान के UPI में आता है और डिलीवरी बॉय अपने फ़ोन/SMS में
--     पैसे आने की पुष्टि देखकर ही डिलीवरी पिन कन्फर्म करता है (कैश जैसा ही भरोसा)।
-- =========================================================

-- 1. नए कॉलम
alter table orders add column if not exists cod_pay_mode text not null default 'cash'
  check (cod_pay_mode in ('cash', 'online'));

alter table delivery_settings add column if not exists shop_upi_id text;

-- नोट: Postgres regex में दोहराव की सीमा 255 है ({2,256} से 'invalid repetition count(s)' त्रुटि आती थी)।
-- पुरानी (गलत) जाँच हटाकर सही जाँच लगाएँ — दोबारा चलाना सुरक्षित है।
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'delivery_settings'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%shop_upi_id%'
  loop
    execute format('alter table delivery_settings drop constraint %I', c.conname);
  end loop;
  alter table delivery_settings add constraint delivery_settings_shop_upi_id_check
    check (shop_upi_id is null or shop_upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9.-]{2,64}$');
end $$;

-- 2. ग्राहक का चुनाव दर्ज करना — ऑर्डर का गोपनीय access_token सही हो तभी, और सिर्फ़ COD ऑर्डर पर,
--    डिलीवरी के लिए निकलने से पहले तक। (place_order को छुआ नहीं गया।)
create or replace function set_cod_pay_mode(p_order_id uuid, p_token uuid, p_mode text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_mode not in ('cash', 'online') then raise exception 'BAD_MODE'; end if;
  update orders set cod_pay_mode = p_mode
   where id = p_order_id
     and access_token = p_token
     and payment_method = 'COD'
     and payment_status = 'लंबित'
     and order_status in ('नया ऑर्डर', 'स्वीकार किया गया', 'सामान तैयार हो रहा है');
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function set_cod_pay_mode(uuid, uuid, text) from public;
grant execute on function set_cod_pay_mode(uuid, uuid, text) to anon, authenticated;

-- 3. cod_payment.sql के दो functions — सिर्फ़ cod_pay_mode जोड़ा गया
create or replace function delivery_orders(p_token text, p_tab text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token);
begin
  if v is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc) from (
      select o.id, o.order_number, o.customer_name, o.customer_phone, o.full_address, o.mohalla, o.city, o.pincode,
             o.delivery_time_slot, o.extra_notes, o.latitude, o.longitude, o.total_amount, o.payment_method, o.cod_pay_mode, o.payment_status, o.order_status, o.created_at,
             coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'vegetable_name', i.vegetable_name,
                         'quantity', i.quantity, 'unit', i.unit, 'item_total', i.item_total))
                       from order_items i where i.order_id = o.id), '[]'::jsonb) as order_items
      from orders o
      where case
        when p_tab = 'available' then o.order_status in ('स्वीकार किया गया', 'सामान तैयार हो रहा है') and o.delivery_boy_id is null
        when p_tab = 'mine'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी के लिए निकल गया'
        when p_tab = 'done'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी पूरी हुई'
        else false end
      order by o.created_at desc
      limit case when p_tab = 'done' then 20 else 100 end
    ) t), '[]'::jsonb);
end $$;

create or replace function seller_order_lines()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(i) || jsonb_build_object('orders', jsonb_build_object(
      'order_number', o.order_number, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
      'full_address', o.full_address, 'mohalla', o.mohalla, 'city', o.city, 'pincode', o.pincode,
      'delivery_date', o.delivery_date, 'delivery_time_slot', o.delivery_time_slot,
      'payment_status', o.payment_status, 'payment_method', o.payment_method, 'cod_pay_mode', o.cod_pay_mode,
      'order_status', o.order_status, 'created_at', o.created_at))
    order by o.created_at desc), '[]'::jsonb)
  from order_items i join orders o on o.id = i.order_id
  where auth.uid() is not null and i.seller_id = auth.uid();
$$;

-- #########################################################
-- भाग 8/12: delivery_orders_date.sql — डिलीवरी पेज में डिलीवरी-तारीख
-- #########################################################

-- =========================================================
-- डिलीवरी बॉय के पेज को ऑर्डर की डिलीवरी-तारीख भी मिले (delivery_orders में delivery_date जोड़ा)
--
-- क्यों: "रास्ते वाले ऑर्डर" सुविधा सिर्फ़ उसी तारीख और उसी स्लॉट के ऑर्डर साथ दिखाती है।
--       यह फ़ाइल न चलाएँ तो भी सुविधा चलती है, पर तब सिर्फ़ स्लॉट मिलाया जाता है (तारीख नहीं)।
--
-- कब चलाएँ: ... → security_hardening.sql → cod_payment.sql → pay_online_on_delivery.sql → **यह फ़ाइल**।
--           (दोबारा चलाना सुरक्षित है; बदलाव सिर्फ़ एक कॉलम जोड़ना है)
--           ध्यान: pay_online_on_delivery.sql / cod_payment.sql / security_hardening.sql कभी दोबारा चलाएँ तो इसे उनके बाद फिर चलाएँ।
-- =========================================================

create or replace function delivery_orders(p_token text, p_tab text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token);
begin
  if v is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc) from (
      select o.id, o.order_number, o.customer_name, o.customer_phone, o.full_address, o.mohalla, o.city, o.pincode,
             o.delivery_date, o.delivery_time_slot, o.extra_notes, o.latitude, o.longitude, o.total_amount, o.payment_method, o.cod_pay_mode, o.payment_status, o.order_status, o.created_at,
             coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'vegetable_name', i.vegetable_name,
                         'quantity', i.quantity, 'unit', i.unit, 'item_total', i.item_total))
                       from order_items i where i.order_id = o.id), '[]'::jsonb) as order_items
      from orders o
      where case
        when p_tab = 'available' then o.order_status in ('स्वीकार किया गया', 'सामान तैयार हो रहा है') and o.delivery_boy_id is null
        when p_tab = 'mine'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी के लिए निकल गया'
        when p_tab = 'done'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी पूरी हुई'
        else false end
      order by o.created_at desc
      limit case when p_tab = 'done' then 20 else 100 end
    ) t), '[]'::jsonb);
end $$;

-- #########################################################
-- भाग 9/12: shipping_labels.sql — शिपिंग लेबल / बैग गिनती
-- #########################################################

-- शिपिंग/डिलीवरी लेबल प्रिंट — बैग की संख्या + प्रिंट की गिनती
-- Supabase SQL editor में एक बार चलाएँ (दोबारा चलाना सुरक्षित है)।
-- ज़रूरी नहीं: बिना इसके भी लेबल छपते हैं (बैग = 1 मानकर); यह सिर्फ़ बैग-संख्या और "कितनी बार छपा" सहेजता है।
-- ⚠️ यह ऑर्डर की स्थिति (order_status), भुगतान या डिलीवरी को कभी नहीं बदलता।

alter table orders add column if not exists bag_count integer not null default 1;
alter table orders add column if not exists label_print_count integer not null default 0;
alter table orders add column if not exists label_last_printed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'orders'::regclass and conname = 'orders_bag_count_check') then
    alter table orders add constraint orders_bag_count_check check (bag_count >= 1 and bag_count <= 20);
  end if;
end $$;

-- सिर्फ़ एडमिन। सिर्फ़ तीन कॉलम बदलता है; order_status/cancel_* कॉलम नहीं छूता, इसलिए
-- trg_guard_order_status (before update of order_status, ...) चलता ही नहीं और इतिहास में कोई नई स्थिति दर्ज नहीं होती।
create or replace function admin_record_label_print(p_order_ids uuid[], p_bag_counts jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update orders o set
    label_print_count = o.label_print_count + 1,
    label_last_printed_at = now(),
    bag_count = case
      when coalesce(p_bag_counts, '{}'::jsonb) ? o.id::text
        then least(greatest((p_bag_counts ->> o.id::text)::int, 1), 20)
      else o.bag_count end
  where o.id = any(p_order_ids);
end $$;

revoke all on function admin_record_label_print(uuid[], jsonb) from public, anon;
grant execute on function admin_record_label_print(uuid[], jsonb) to authenticated;

-- #########################################################
-- भाग 10/12: order_status_workflow.sql — ऑर्डर-स्थिति नियम, रद्दीकरण, इतिहास
-- #########################################################

-- =========================================================
-- ऑर्डर-स्थिति: सिर्फ़ आगे बढ़ना + एडमिन रद्दीकरण (cancellation) + ऑडिट इतिहास
--
-- चलाने का क्रम: security_hardening.sql, cod_payment.sql, delivery_orders_date.sql, pay_online_on_delivery.sql के बाद।
-- दोबारा चलाना सुरक्षित है (idempotent)। कोई मौजूदा ऑर्डर/स्थिति/कॉलम बदला नहीं जाता।
--
-- मौजूदा स्थिति-मान (बदले नहीं गए):
--   'नया ऑर्डर', 'भुगतान सफल', 'स्वीकार किया गया', 'सामान तैयार हो रहा है',
--   'डिलीवरी के लिए निकल गया', 'डिलीवरी पूरी हुई', 'रद्द'
--
-- अनुमत बदलाव (एडमिन — लॉग-इन उपयोगकर्ता, चाहे UI से या सीधे API से):
--   नया ऑर्डर / भुगतान सफल  → स्वीकार किया गया | रद्द
--   स्वीकार किया गया         → सामान तैयार हो रहा है | रद्द
--   सामान तैयार हो रहा है     → डिलीवरी के लिए निकल गया | रद्द
--   डिलीवरी के लिए निकल गया   → डिलीवरी पूरी हुई          (रद्द नहीं)
--   डिलीवरी पूरी हुई / रद्द    → कुछ नहीं (लॉक)
--
-- सिर्फ़ भरोसेमंद सर्वर-रास्तों के लिए (auth.uid() NULL: Edge Function/service_role, SECURITY DEFINER RPC, cron) अतिरिक्त:
--   नया ऑर्डर → भुगतान सफल            (mark_order_paid — भुगतान verify होने पर)
--   स्वीकार किया गया → डिलीवरी के लिए निकल गया   (delivery_claim_order — डिलीवरी बॉय "Accepted" ऑर्डर सीधे उठा सकता है)
--   नया ऑर्डर → रद्द                   (cancel_stale_unpaid_orders)
-- =========================================================

-- ---------------------------------------------------------
-- 1. रद्दीकरण के कॉलम (पहले से हों तो दोबारा नहीं बनते)
-- ---------------------------------------------------------
alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists cancelled_at  timestamptz;
alter table orders add column if not exists cancelled_by  uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------
-- 2. इतिहास टेबल — हर सफल स्थिति-बदलाव का रिकॉर्ड (असफल कोशिशें यहाँ नहीं आतीं)
--    changed_by = लॉग-इन एडमिन की ID; NULL = सिस्टम (डिलीवरी बॉय / भुगतान / अपने-आप रद्द)
-- ---------------------------------------------------------
create table if not exists order_status_history (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  old_status    text,
  new_status    text not null,
  changed_by    uuid references auth.users(id) on delete set null,
  change_reason text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_order_status_history_order on order_status_history(order_id, created_at);

alter table order_status_history enable row level security;
drop policy if exists "order_status_history_admin_read" on order_status_history;
create policy "order_status_history_admin_read" on order_status_history for select using (is_admin());
-- कोई insert/update/delete policy नहीं: सिर्फ़ नीचे का trigger (security definer) लिखता है
revoke all on order_status_history from anon, authenticated;
grant select on order_status_history to authenticated;

-- ---------------------------------------------------------
-- 3. डेटाबेस-स्तर की जाँच (source of truth) — पुराने guard_order_status को बदलता है
--    (वही trigger-नाम trg_guard_order_status, इसलिए दोहरा trigger नहीं बनता)
--    ⚠️ पहले मालिक (owner) बंद ऑर्डर वापस खोल सकता था (M4) — अब डिलीवर/रद्द ऑर्डर सबके लिए लॉक हैं।
-- ---------------------------------------------------------
create or replace function guard_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  ok boolean;
begin
  -- स्थिति नहीं बदली: रद्दीकरण के कॉलम सिर्फ़ सर्वर-रास्ते बदल सकते हैं (एडमिन नहीं)
  if new.order_status is not distinct from old.order_status then
    if v_uid is not null and (
         new.cancel_reason is distinct from old.cancel_reason
      or new.cancelled_at  is distinct from old.cancelled_at
      or new.cancelled_by  is distinct from old.cancelled_by) then
      raise exception 'CANCEL_FIELDS_LOCKED';
    end if;
    return new;
  end if;

  -- वैध बदलाव की सूची
  ok := case
    when old.order_status in ('नया ऑर्डर', 'भुगतान सफल')
         and new.order_status in ('स्वीकार किया गया', 'रद्द') then true
    when old.order_status = 'स्वीकार किया गया'
         and new.order_status in ('सामान तैयार हो रहा है', 'रद्द') then true
    when old.order_status = 'सामान तैयार हो रहा है'
         and new.order_status in ('डिलीवरी के लिए निकल गया', 'रद्द') then true
    when old.order_status = 'डिलीवरी के लिए निकल गया'
         and new.order_status = 'डिलीवरी पूरी हुई' then true
    -- सिर्फ़ भरोसेमंद सर्वर-रास्ते (लॉग-इन एडमिन नहीं):
    when v_uid is null and old.order_status = 'नया ऑर्डर' and new.order_status = 'भुगतान सफल' then true
    when v_uid is null and old.order_status = 'स्वीकार किया गया'
         and new.order_status = 'डिलीवरी के लिए निकल गया' and new.delivery_boy_id is not null then true
    else false end;

  if not ok then
    raise exception 'INVALID_TRANSITION';
  end if;

  if new.order_status = 'रद्द' then
    if v_uid is not null then
      -- एडमिन: कारण ज़रूरी; रद्द करने वाला और समय सर्वर तय करता है (क्लाइंट का भेजा मान नहीं माना जाता)
      new.cancel_reason := left(btrim(coalesce(new.cancel_reason, '')), 500);
      if new.cancel_reason = '' then
        raise exception 'CANCEL_REASON_REQUIRED';
      end if;
      new.cancelled_by := v_uid;
    else
      new.cancel_reason := coalesce(nullif(left(btrim(coalesce(new.cancel_reason, '')), 500), ''), 'सिस्टम द्वारा रद्द');
    end if;
    new.cancelled_at := now();
  else
    -- रद्द नहीं हो रहा: रद्दीकरण के कॉलम खाली रहें
    new.cancel_reason := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_order_status on orders;
create trigger trg_guard_order_status
  before update of order_status, cancel_reason, cancelled_at, cancelled_by on orders
  for each row execute function guard_order_status();

-- ---------------------------------------------------------
-- 4. इतिहास — AFTER trigger: बदलाव सफल होने पर ही दर्ज (रोलबैक होने पर इतिहास भी नहीं बनता)
-- ---------------------------------------------------------
create or replace function log_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into order_status_history (order_id, old_status, new_status, changed_by, change_reason)
  values (new.id, old.order_status, new.order_status, auth.uid(),
          case when new.order_status = 'रद्द' then new.cancel_reason else null end);
  return new;
end $$;

drop trigger if exists trg_log_order_status_change on orders;
create trigger trg_log_order_status_change
  after update of order_status on orders
  for each row when (old.order_status is distinct from new.order_status)
  execute function log_order_status_change();

-- ---------------------------------------------------------
-- 5. एडमिन के लिए सुरक्षित RPC: ताला (row lock) + stale-जाँच + स्थिति बदलाव एक साथ
--    p_expected_status = वह स्थिति जो एडमिन की स्क्रीन पर दिख रही थी।
--    अगर तब तक किसी और ने (दूसरा एडमिन / डिलीवरी बॉय) स्थिति बदल दी हो → {ok:false, error:'STALE', current:...}
--    बाकी जाँच (वैध बदलाव, कारण, रद्द करने वाला) trigger करता है — सीधे API से भी वही नियम।
-- ---------------------------------------------------------
create or replace function admin_set_order_status(
  p_order_id uuid, p_expected_status text, p_new_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'UNAUTHORIZED';
  end if;
  select order_status into cur from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if cur is distinct from p_expected_status then
    return jsonb_build_object('ok', false, 'error', 'STALE', 'current', cur);
  end if;
  update orders
     set order_status = p_new_status,
         cancel_reason = case when p_new_status = 'रद्द' then p_reason else null end
   where id = p_order_id;
  return jsonb_build_object('ok', true, 'status', p_new_status);
end $$;
revoke all on function admin_set_order_status(uuid, text, text, text) from public, anon;
grant execute on function admin_set_order_status(uuid, text, text, text) to authenticated;

-- #########################################################
-- भाग 11/12: push_notifications.sql — एडमिन Web Push
-- #########################################################

-- =========================================================
-- Web Push: ऑर्डर बनते ही एडमिन के फ़ोन/कंप्यूटर पर नोटिफ़िकेशन (ऐप बंद हो तब भी)
-- Supabase SQL Editor में एक बार चलाएँ (दोबारा चलाना सुरक्षित है)।
-- पूरी सेटअप-विधि: PUSH_SETUP.md
-- =========================================================

create extension if not exists pg_net;

-- 1) एडमिन डिवाइसों की push subscriptions
--    RLS चालू और कोई policy नहीं => ब्राउज़र सीधे टेबल नहीं छू सकता, सिर्फ़ नीचे के RPC से
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;

-- 2) Edge Function का URL और गुप्त कुंजी (सिर्फ़ trigger/service-role पढ़ सकता है)
create table if not exists push_config (
  key text primary key,
  value text not null
);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

-- 3) एडमिन अपना डिवाइस रजिस्टर/हटा सके
create or replace function register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'BAD_SUBSCRIPTION';
  end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh,
        auth_key = excluded.auth_key, user_agent = excluded.user_agent;
end $$;

create or replace function unregister_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ALLOWED'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

revoke all on function register_push_subscription(text, text, text, text) from public, anon;
revoke all on function unregister_push_subscription(text) from public, anon;
grant execute on function register_push_subscription(text, text, text, text) to authenticated;
grant execute on function unregister_push_subscription(text) to authenticated;

-- 4) नया ऑर्डर बनते ही Edge Function को बुलाओ।
--    रकम/आइटम इस पल तक भरे नहीं होते, इसलिए सिर्फ़ order_number भेजते हैं;
--    pg_net request commit के बाद जाती है और Edge Function ऑर्डर को database से ताज़ा पढ़ता है।
--    कोई भी गड़बड़ी ऑर्डर बनने को कभी नहीं रोकती।
create or replace function notify_new_order_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url    from push_config where key = 'function_url';
  select value into v_secret from push_config where key = 'secret';
  if v_url is null or v_secret is null then return new; end if;
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('order_number', new.order_number),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'push notify failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_orders_push_notify on orders;
create trigger trg_orders_push_notify
  after insert on orders
  for each row execute function notify_new_order_push();

-- 5) एक बार (अपने मान डालकर) चलाएँ:
-- insert into push_config (key, value) values
--   ('function_url', 'https://<PROJECT-REF>.supabase.co/functions/v1/send-order-push'),
--   ('secret',       '<वही PUSH_WEBHOOK_SECRET जो Edge secrets में रखा>')
-- on conflict (key) do update set value = excluded.value;

-- #########################################################
-- भाग 12/12: customer_push.sql — ग्राहक Web Push (स्थिति बदलने पर)
-- #########################################################

-- =========================================================
-- ग्राहक Web Push: ऑर्डर की स्थिति बदलते ही ग्राहक के फ़ोन पर नोटिफ़िकेशन (ऐप बंद हो तब भी)
--
-- चलाने का क्रम: push_notifications.sql और order_status_workflow.sql के बाद।
-- Supabase SQL Editor में एक बार चलाएँ (दोबारा चलाना सुरक्षित है)। सेटअप: PUSH_SETUP.md (भाग "ग्राहक")
--
-- ग्राहक लॉग-इन नहीं करते, इसलिए हर subscription किसी *ऑर्डर* से जुड़ती है और वह जुड़ाव
-- उसी गोपनीय access_token से जाँचा जाता है जिससे ग्राहक अपना ऑर्डर देखता है। यानी किसी और के
-- ऑर्डर की सूचना पाने के लिए उसका token चाहिए।
-- =========================================================

create extension if not exists pg_net;

-- 1) ग्राहक डिवाइस ↔ ऑर्डर subscriptions
--    RLS चालू और कोई policy नहीं => ब्राउज़र सीधे टेबल नहीं छू सकता, सिर्फ़ नीचे के RPC से
create table if not exists customer_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  lang text not null default 'hi' check (lang in ('hi', 'en')),
  user_agent text,
  created_at timestamptz not null default now(),
  unique (order_id, endpoint)
);
create index if not exists idx_customer_push_order on customer_push_subscriptions(order_id);
create index if not exists idx_customer_push_endpoint on customer_push_subscriptions(endpoint);
alter table customer_push_subscriptions enable row level security;
revoke all on customer_push_subscriptions from anon, authenticated;

-- 2) डिवाइस के चालू ऑर्डर एक साथ रजिस्टर करें: p_orders = [{id, token}] (get_orders_status जैसा)
--    सिर्फ़ वही ऑर्डर जुड़ते हैं जिनका token सही हो और जो अभी बंद (डिलीवर/रद्द) न हुए हों।
create or replace function register_customer_push(
  p_orders jsonb, p_endpoint text, p_p256dh text, p_auth text,
  p_lang text default 'hi', p_user_agent text default null
) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or length(p_p256dh) > 200
     or coalesce(p_auth, '') = '' or length(p_auth) > 100 then
    raise exception 'BAD_SUBSCRIPTION';
  end if;

  with input as (
    select e->>'id' as id, e->>'token' as token
    from jsonb_array_elements(case when jsonb_typeof(p_orders) = 'array' then p_orders else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object'
      and (e->>'id')    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (e->>'token') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    limit 10
  ), ins as (
    insert into customer_push_subscriptions (order_id, endpoint, p256dh, auth_key, lang, user_agent)
    select o.id, p_endpoint, p_p256dh, p_auth,
           case when p_lang = 'en' then 'en' else 'hi' end, left(p_user_agent, 300)
    from input x
    join orders o on o.id = x.id::uuid and o.access_token = x.token::uuid
    where o.order_status not in ('डिलीवरी पूरी हुई', 'रद्द')
    on conflict (order_id, endpoint) do update
      set p256dh = excluded.p256dh, auth_key = excluded.auth_key,
          lang = excluded.lang, user_agent = excluded.user_agent
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- 3) ग्राहक नोटिफ़िकेशन बंद करे: इस डिवाइस की सारी जुड़ावें हटती हैं
--    (endpoint एक अनुमान न लगने वाला लंबा URL है, इसलिए वही "पहचान" है)
create or replace function unregister_customer_push(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint is null or length(p_endpoint) > 1000 then return; end if;
  delete from customer_push_subscriptions where endpoint = p_endpoint;
end $$;

revoke all on function register_customer_push(jsonb, text, text, text, text, text) from public;
revoke all on function unregister_customer_push(text) from public;
grant execute on function register_customer_push(jsonb, text, text, text, text, text) to anon, authenticated;
grant execute on function unregister_customer_push(text) to anon, authenticated;

-- 4) स्थिति बदलते ही Edge Function को बुलाओ (admin, डिलीवरी बॉय, भुगतान, अपने-आप रद्द — सब रास्ते)।
--    जिस ऑर्डर पर किसी ने नोटिफ़िकेशन चालू नहीं किया उसके लिए कोई HTTP कॉल नहीं होती।
--    कोई भी गड़बड़ी ऑर्डर की स्थिति बदलने को कभी नहीं रोकती।
create or replace function notify_order_status_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from customer_push_subscriptions where order_id = new.id) then
    return new;
  end if;
  select value into v_url    from push_config where key = 'customer_function_url';
  select value into v_secret from push_config where key = 'secret';
  if v_url is null or v_secret is null then return new; end if;
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('order_id', new.id, 'order_number', new.order_number, 'status', new.order_status),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'customer push notify failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_orders_status_push on orders;
create trigger trg_orders_status_push
  after update of order_status on orders
  for each row when (old.order_status is distinct from new.order_status)
  execute function notify_order_status_push();

-- 5) एक बार (अपना मान डालकर) चलाएँ — 'secret' पहले से push_config में है (एडमिन push वाला, वही चलेगा):
-- insert into push_config (key, value) values
--   ('customer_function_url', 'https://<PROJECT-REF>.supabase.co/functions/v1/send-customer-push')
-- on conflict (key) do update set value = excluded.value;

-- PostgREST (Supabase API) को नया स्कीमा तुरंत दिखे
notify pgrst, 'reload schema';

-- =========================================================
-- ✅ FULL SCHEMA पूरा। अब DEPLOY_GUIDE_HI.md का अगला चरण देखें।
-- =========================================================
