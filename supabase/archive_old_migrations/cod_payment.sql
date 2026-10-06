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
