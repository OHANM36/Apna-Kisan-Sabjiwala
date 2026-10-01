-- =========================================================
-- अपना किसान सब्ज़ीवाला — Dynamic Pricing Engine (डेटाबेस माइग्रेशन)
--
-- कैसे चलाएं: schema.sql (और बाकी मौजूदा माइग्रेशन) के बाद इस पूरी फाइल को
-- Supabase Dashboard > SQL Editor में एक बार चलाएं। दोबारा चलाना सुरक्षित है (idempotent)।
--
-- सुरक्षा का सिद्धांत (बहुत ज़रूरी):
--   `vegetables`, `orders`, `order_items` की RLS में "सब पढ़ सकते हैं" नीति है (ग्राहक ऐप के लिए)।
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
