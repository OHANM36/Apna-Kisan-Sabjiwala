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
