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

-- सुरक्षा: seller खुद अपनी is_approved value नहीं बदल सकता, सिर्फ एडमिन बदल सकता है
create or replace function prevent_self_approve()
returns trigger as $$
begin
  if not is_admin() then
    new.is_approved := old.is_approved;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_self_approve on sellers;
create trigger trg_prevent_self_approve before update on sellers
  for each row execute function prevent_self_approve();

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
  order_status text not null default 'नया ऑर्डर' check (order_status in (
    'नया ऑर्डर','भुगतान सफल','स्वीकार किया गया','सामान तैयार हो रहा है','डिलीवरी के लिए निकल गया','डिलीवरी पूरी हुई','रद्द'
  )),
  latitude numeric(10,7),
  longitude numeric(10,7),
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
create trigger trg_vegetables_updated before update on vegetables
  for each row execute function set_updated_at();

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
create trigger trg_order_number before insert on orders
  for each row execute function generate_order_number();

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

-- सहायक फंक्शन: क्या मौजूदा उपयोगकर्ता एडमिन है?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from admin_users where id = auth.uid()
  );
$$ language sql security definer stable;

-- ---------- categories: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
create policy "categories_public_read" on categories for select using (true);
create policy "categories_admin_write" on categories for insert with check (is_admin());
create policy "categories_admin_update" on categories for update using (is_admin());
create policy "categories_admin_delete" on categories for delete using (is_admin());

-- ---------- vegetables: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
create policy "vegetables_public_read" on vegetables for select using (
  seller_id is null
  or is_admin()
  or seller_id = auth.uid()
  or exists (select 1 from sellers s where s.id = vegetables.seller_id and s.is_approved and s.is_active)
);
create policy "vegetables_admin_write" on vegetables for insert with check (is_admin());
create policy "vegetables_admin_update" on vegetables for update using (is_admin());
create policy "vegetables_admin_delete" on vegetables for delete using (is_admin());
create policy "vegetables_seller_write" on vegetables for insert with check (seller_id = auth.uid());
create policy "vegetables_seller_update" on vegetables for update using (seller_id = auth.uid());
create policy "vegetables_seller_delete" on vegetables for delete using (seller_id = auth.uid());

-- ---------- offers: सक्रिय ऑफर सभी देख सकते हैं ----------
create policy "offers_public_read" on offers for select using (true);
create policy "offers_admin_write" on offers for insert with check (is_admin());
create policy "offers_admin_update" on offers for update using (is_admin());
create policy "offers_admin_delete" on offers for delete using (is_admin());

-- ---------- delivery_settings: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
create policy "delivery_settings_public_read" on delivery_settings for select using (true);
create policy "delivery_settings_admin_update" on delivery_settings for update using (is_admin());

-- ---------- welcome_popup: सभी पढ़ सकते हैं, केवल एडमिन बदल सकते हैं ----------
create policy "welcome_popup_public_read" on welcome_popup for select using (true);
create policy "welcome_popup_admin_update" on welcome_popup for update using (is_admin());

-- ---------- customers: कोई भी नया ग्राहक बना सकता है (ऑर्डर के समय), एडमिन सब देख सकता है ----------
create policy "customers_public_insert" on customers for insert with check (true);
create policy "customers_public_read_own" on customers for select using (true);
create policy "customers_admin_update" on customers for update using (is_admin());
create policy "customers_admin_delete" on customers for delete using (is_admin());

-- ---------- customer_addresses ----------
create policy "addresses_public_insert" on customer_addresses for insert with check (true);
create policy "addresses_public_read" on customer_addresses for select using (true);
create policy "addresses_admin_update" on customer_addresses for update using (is_admin());
create policy "addresses_admin_delete" on customer_addresses for delete using (is_admin());

-- ---------- orders: कोई भी ऑर्डर बना सकता है, पढ़ सकता है; केवल एडमिन स्टेटस बदले ----------
create policy "orders_public_insert" on orders for insert with check (true);
create policy "orders_public_read" on orders for select using (true);
create policy "orders_admin_update" on orders for update using (is_admin());
create policy "orders_public_update_payment" on orders for update using (true)
  with check (order_status in ('नया ऑर्डर','भुगतान सफल'));
create policy "orders_admin_delete" on orders for delete using (is_admin());

-- ---------- order_items ----------
create policy "order_items_public_insert" on order_items for insert with check (true);
create policy "order_items_public_read" on order_items for select using (true);
create policy "order_items_admin_delete" on order_items for delete using (is_admin());

-- ---------- payments ----------
create policy "payments_public_insert" on payments for insert with check (true);
create policy "payments_public_read" on payments for select using (true);
create policy "payments_public_update" on payments for update using (true);
create policy "payments_admin_delete" on payments for delete using (is_admin());

-- ---------- admin_users: केवल एडमिन खुद को पढ़ सके ----------
create policy "admin_users_self_read" on admin_users for select using (auth.uid() = id or is_admin());
create policy "admin_users_admin_write" on admin_users for insert with check (is_admin());
create policy "admin_users_admin_update" on admin_users for update using (is_admin());

-- ---------- sellers: विक्रेता खुद अपना प्रोफाइल देख/अपडेट कर सके, एडमिन सबको देख/approve कर सके ----------
create policy "sellers_self_read" on sellers for select using (auth.uid() = id or is_admin());
create policy "sellers_self_signup" on sellers for insert with check (auth.uid() = id);
create policy "sellers_self_update" on sellers for update using (auth.uid() = id or is_admin());
create policy "sellers_admin_delete" on sellers for delete using (is_admin());

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
on conflict do nothing;

-- =========================================================
-- पूर्ण। अब Supabase Dashboard > Authentication में एक एडमिन यूज़र बनाएं
-- और उसकी id को admin_users टेबल में इस तरह डालें:
--
-- insert into admin_users (id, full_name, phone)
-- values ('YAHAN-AUTH-USER-KI-UUID-DAALEIN', 'Admin Name', '8839351985');
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
-- create policy "sellers_self_read" on sellers for select using (auth.uid() = id or is_admin());
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
