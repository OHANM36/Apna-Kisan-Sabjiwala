-- ⚠️ नोट: place_order, delivery_orders, seller_order_lines, cancel_stale_unpaid_orders के COD-सहित संस्करण cod_payment.sql में हैं।
--    इस फ़ाइल को दोबारा चलाएँ तो उसके बाद cod_payment.sql भी चलाएँ, वरना COD बंद जैसा व्यवहार लौट आएगा।
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
create policy "customers_admin_read"   on customers          for select using (is_admin());
drop policy if exists "addresses_admin_read"          on customer_addresses;
create policy "addresses_admin_read"   on customer_addresses for select using (is_admin());
drop policy if exists "orders_admin_read"             on orders;
create policy "orders_admin_read"      on orders             for select using (is_admin());
drop policy if exists "order_items_admin_read"        on order_items;
create policy "order_items_admin_read" on order_items        for select using (is_admin());
drop policy if exists "payments_admin_read"           on payments;
create policy "payments_admin_read"    on payments           for select using (is_admin());
drop policy if exists "delivery_boys_admin_read"      on delivery_boys;
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
create policy "admin_users_owner_insert" on admin_users for insert with check (is_owner());
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
create policy "vegetables_seller_write" on vegetables for insert with check (
  seller_id = auth.uid()
  and exists (select 1 from sellers s where s.id = auth.uid() and s.is_approved and s.is_active)
);
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
