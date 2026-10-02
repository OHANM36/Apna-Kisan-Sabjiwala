-- =========================================================
-- कैश ऑन डिलीवरी (cod_payment.sql) का व्यवहार-परीक्षण
-- चलाने के लिए: खाली टेस्ट डेटाबेस में schema.sql, pricing_engine.sql, vendor_seller_association.sql,
--   delivery_boy_module.sql, security_hardening.sql, cod_payment.sql चलाकर फिर यह फाइल।
--   (Supabase के auth स्कीमा का स्टब चाहिए — pricing_engine_test.sql जैसा)
-- हर जांच फेल हो तो EXCEPTION; सब सही हो तो आख़िर में "ALL PASSED"।
-- यह फाइल टेस्ट डेटा बनाती है — असली/प्रोडक्शन डेटाबेस पर न चलाएँ।
-- =========================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test'),
  ('22222222-2222-2222-2222-222222222222', 'staff@test')
  on conflict do nothing;
insert into admin_users (id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'मालिक', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'स्टाफ', 'staff')
  on conflict do nothing;

-- टेस्ट सहायक (आलू ₹30/किलो; 7 किलो = ₹210 + शुल्क ₹20 = ₹230; 10 किलो = ₹300 + ₹20 = ₹320)
create schema if not exists t;
grant usage on schema t to public;
create or replace function t.items(p_qty numeric default 7) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('vegetable_id', (select id from vegetables where name = 'आलू' limit 1), 'quantity', p_qty))
$$;
create or replace function t.cust(p_method text, p_phone text default '9876543210') returns jsonb language sql as $$
  select jsonb_build_object('name', 'टेस्ट ग्राहक', 'phone', p_phone, 'address', '१२ गांधी नगर', 'city', 'Bhopal', 'pincode', '462001',
         'delivery_date', to_char((now() at time zone 'Asia/Kolkata')::date + 1, 'YYYY-MM-DD'), 'delivery_time_slot', 'सुबह 8-10')
         || case when p_method is null then '{}'::jsonb else jsonb_build_object('payment_method', p_method) end
$$;
grant execute on all functions in schema t to public;

-- ---------- 0. शुरुआती स्थिति: COD डिफ़ॉल्ट रूप से बंद ----------
do $$
begin
  assert (select cod_enabled from delivery_settings where id = 1) = false, 'COD डिफ़ॉल्ट बंद होना चाहिए';
  assert (select cod_max_order_value from delivery_settings where id = 1) is null;
  raise notice 'PASS 0: COD default off';
end $$;

-- ---------- 1. COD बंद हो तो सर्वर COD ऑर्डर मना करे; ऑनलाइन/डिफ़ॉल्ट चलता रहे ----------
do $$
declare r jsonb; ok boolean := false;
begin
  set local role anon;
  begin
    perform place_order(gen_random_uuid(), t.cust('COD'), t.items(), null);
  exception when others then ok := sqlerrm like '%COD_DISABLED%';
  end;
  assert ok, 'COD बंद होने पर COD_DISABLED आना चाहिए';

  r := place_order(gen_random_uuid(), t.cust(null), t.items(), null);       -- payment_method भेजा ही नहीं → ऑनलाइन
  assert r->>'payment_method' = 'ऑनलाइन' and r->>'payment_status' = 'लंबित', 'डिफ़ॉल्ट = ऑनलाइन, लंबित';
  r := place_order(gen_random_uuid(), t.cust('online'), t.items(), null);   -- 'online' भी मान्य
  assert r->>'payment_method' = 'ऑनलाइन';
  reset role;
  raise notice 'PASS 1: COD disabled → rejected, online unaffected';
end $$;

-- ---------- 2. बेतुका payment_method मना ----------
do $$
declare ok boolean := false;
begin
  set local role anon;
  begin
    perform place_order(gen_random_uuid(), t.cust('CHEQUE'), t.items(), null);
  exception when others then ok := sqlerrm like '%BAD_PAYMENT_METHOD%';
  end;
  reset role;
  assert ok, 'अज्ञात तरीका मना होना चाहिए';
  raise notice 'PASS 2: unknown payment_method rejected';
end $$;

-- ---------- 3. सेटिंग कौन बदल सकता है: anon ✗, staff ✗, owner ✓ (और audit log में दर्ज) ----------
do $$
declare n int; logs_before int; logs_after int;
begin
  set local role anon;
  update delivery_settings set cod_enabled = true where id = 1;
  get diagnostics n = row_count;
  reset role;
  assert n = 0, 'anon सेटिंग नहीं बदल सकता';

  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  set local role authenticated;
  update delivery_settings set cod_enabled = true where id = 1;
  get diagnostics n = row_count;
  reset role;
  assert n = 0, 'staff सेटिंग नहीं बदल सकता (सिर्फ़ owner)';
  assert (select cod_enabled from delivery_settings where id = 1) = false;

  select count(*) into logs_before from pricing_audit_log where table_name = 'delivery_settings';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  update delivery_settings set cod_enabled = true where id = 1;
  get diagnostics n = row_count;
  reset role;
  assert n = 1, 'owner सेटिंग बदल सकता है';
  assert (select cod_enabled from delivery_settings where id = 1) = true;
  select count(*) into logs_after from pricing_audit_log where table_name = 'delivery_settings';
  assert logs_after = logs_before + 1, 'बदलाव audit log में दर्ज होना चाहिए';
  raise notice 'PASS 3: only owner toggles COD (audited)';
end $$;

-- ---------- 4. COD चालू: ऑर्डर बने — राशि सर्वर से, भुगतान "लंबित", स्थिति "नया ऑर्डर" ----------
do $$
declare r jsonb; o orders%rowtype; r2 jsonb; key uuid := gen_random_uuid();
begin
  set local role anon;
  r := place_order(key, t.cust('COD'), t.items(7), null);
  reset role;
  select * into o from orders where id = (r->>'order_id')::uuid;
  assert o.payment_method = 'COD' and o.payment_status = 'लंबित' and o.order_status = 'नया ऑर्डर';
  assert o.subtotal = 210 and o.delivery_fee = 20 and o.total_amount = 230, 'राशि सर्वर से: ' || o.total_amount;
  assert r->>'payment_method' = 'COD' and (r->>'total_amount')::numeric = 230;
  assert o.delivery_pin ~ '^[0-9]{4}$', 'डिलीवरी पिन बनना चाहिए';
  assert not exists (select 1 from payments where order_id = o.id), 'COD ऑर्डर पर डिलीवरी से पहले कोई payments पंक्ति नहीं';

  -- वही idempotency key दोबारा → वही ऑर्डर (double-click सुरक्षित)
  set local role anon;
  r2 := place_order(key, t.cust('COD'), t.items(7), null);
  reset role;
  assert r2->>'order_id' = r->>'order_id' and (r2->>'replayed')::boolean and r2->>'payment_method' = 'COD';
  assert (select count(*) from orders where customer_phone = '9876543210' and payment_method = 'COD') = 1;

  -- ग्राहक अपना COD ऑर्डर token से पढ़ सके (और payment_method दिखे); बिना token के नहीं
  set local role anon;
  assert (get_order_public((r->>'order_id')::uuid, (r->>'access_token')::uuid))->'order'->>'payment_method' = 'COD';
  assert get_order_public((r->>'order_id')::uuid, gen_random_uuid()) is null;
  reset role;
  raise notice 'PASS 4: COD order placed server-priced, idempotent, readable by token';
end $$;

-- ---------- 5. अधिकतम राशि की सीमा ----------
do $$
declare ok boolean := false; r jsonb;
begin
  update delivery_settings set cod_max_order_value = 250 where id = 1;
  set local role anon;
  r := place_order(gen_random_uuid(), t.cust('COD', '9876500001'), t.items(7), null);     -- ₹230 ≤ 250 ✓
  assert r->>'payment_method' = 'COD';
  begin
    perform place_order(gen_random_uuid(), t.cust('COD', '9876500002'), t.items(10), null);   -- ₹320 > 250 ✗
  exception when others then ok := sqlerrm like '%COD_LIMIT_EXCEEDED%';
  end;
  assert ok, 'सीमा से ऊपर COD मना होना चाहिए';
  -- वही बड़ा ऑर्डर ऑनलाइन में चलता है (सीमा सिर्फ़ COD पर)
  r := place_order(gen_random_uuid(), t.cust('ONLINE', '9876500002'), t.items(10), null);
  assert r->>'payment_method' = 'ऑनलाइन' and (r->>'total_amount')::numeric = 320;
  reset role;
  -- असफल COD ने कोई अधूरा ऑर्डर नहीं छोड़ा (पूरा transaction लौटा)
  assert (select count(*) from orders where customer_phone = '9876500002') = 1, 'सीमा-असफल COD का कोई अवशेष नहीं';
  -- सीमा हटाने (NULL) पर कोई सीमा नहीं
  update delivery_settings set cod_max_order_value = null where id = 1;
  set local role anon;
  r := place_order(gen_random_uuid(), t.cust('COD', '9876500003'), t.items(10), null);
  reset role;
  assert (r->>'total_amount')::numeric = 320;
  -- 0 या नकारात्मक सीमा DB में मान्य नहीं
  begin
    update delivery_settings set cod_max_order_value = 0 where id = 1;
    assert false, 'सीमा 0 स्वीकार नहीं होनी चाहिए';
  exception when check_violation then null;
  end;
  raise notice 'PASS 5: COD max-amount cap enforced on server';
end $$;

-- ---------- 6. बासी "बिना भुगतान" ऑर्डर रद्द हों, पर COD नहीं ----------
do $$
declare cod_id uuid; online_id uuid; n int;
begin
  select id into cod_id from orders where customer_phone = '9876543210' and payment_method = 'COD' limit 1;
  select id into online_id from orders where customer_phone = '9876543210' and payment_method = 'ऑनलाइन' limit 1;
  update orders set created_at = now() - interval '5 hours' where id in (cod_id, online_id);
  n := cancel_stale_unpaid_orders(3);
  assert (select order_status from orders where id = online_id) = 'रद्द', 'पुराना बिना-भुगतान ऑनलाइन ऑर्डर रद्द होना चाहिए';
  assert (select order_status from orders where id = cod_id) = 'नया ऑर्डर', 'COD ऑर्डर रद्द नहीं होना चाहिए';
  raise notice 'PASS 6: stale-cancel skips COD';
end $$;

-- ---------- 7. डिलीवरी बॉय: सूची में "कैश लेना है" की जानकारी; पिन-कन्फर्म पर भुगतान दर्ज ----------
do $$
declare boy uuid; tok text; r jsonb; oid uuid; pin text; lst jsonb; el jsonb; amt numeric;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  boy := admin_save_delivery_boy(null, 'रमेश', '9000000001', '4321', true);
  reset role;

  select id, total_amount into oid, amt from orders where customer_phone = '9876543210' and payment_method = 'COD' limit 1;
  update orders set order_status = 'स्वीकार किया गया' where id = oid;       -- एडमिन ने स्वीकारा

  set local role anon;
  r := delivery_login('4321'); tok := r->>'token';
  assert (r->>'ok')::boolean, 'डिलीवरी लॉगिन';
  lst := delivery_orders(tok, 'available');
  select e into el from jsonb_array_elements(lst) e where (e->>'id')::uuid = oid;
  assert el->>'payment_method' = 'COD' and el->>'payment_status' = 'लंबित' and (el->>'total_amount')::numeric = amt,
    'डिलीवरी बॉय को COD + बाकी राशि दिखनी चाहिए';
  assert not (el ? 'delivery_pin'), 'सूची में डिलीवरी पिन नहीं जाना चाहिए';
  assert (delivery_claim_order(tok, oid))->>'ok' = 'true';
  reset role;

  select delivery_pin into pin from orders where id = oid;
  set local role anon;
  assert (delivery_confirm(tok, oid, case when pin = '0000' then '1111' else '0000' end))->>'error' = 'WRONG_PIN';
  reset role;
  assert (select payment_status from orders where id = oid) = 'लंबित', 'गलत पिन पर भुगतान दर्ज नहीं होना चाहिए';
  set local role anon;
  assert (delivery_confirm(tok, oid, pin))->>'ok' = 'true';
  reset role;

  assert (select order_status from orders where id = oid) = 'डिलीवरी पूरी हुई';
  assert (select payment_status from orders where id = oid) = 'सफल', 'डिलीवरी पर COD भुगतान "सफल" होना चाहिए';
  assert (select count(*) from payments where order_id = oid and gateway = 'cod' and status = 'सफल' and amount = amt and method = 'COD') = 1,
    'payments में एक COD पंक्ति';
  -- आगे के update पर दोहरी पंक्ति नहीं
  update orders set extra_notes = 'x' where id = oid;
  update orders set order_status = 'डिलीवरी पूरी हुई' where id = oid;
  assert (select count(*) from payments where order_id = oid) = 1, 'दोहरी payments पंक्ति नहीं';
  raise notice 'PASS 7: delivery confirm settles COD payment exactly once';
end $$;

-- ---------- 8. एडमिन खुद "डिलीवरी पूरी" करे तो भी COD भुगतान दर्ज; ऑनलाइन ऑर्डर पर असर नहीं; रद्द पर नहीं ----------
do $$
declare cod2 uuid; onl uuid; canc uuid; r jsonb;
begin
  set local role anon;
  r := place_order(gen_random_uuid(), t.cust('COD', '9876500010'), t.items(7), null); cod2 := (r->>'order_id')::uuid;
  r := place_order(gen_random_uuid(), t.cust('ONLINE', '9876500011'), t.items(7), null); onl := (r->>'order_id')::uuid;
  r := place_order(gen_random_uuid(), t.cust('COD', '9876500012'), t.items(7), null); canc := (r->>'order_id')::uuid;
  reset role;

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  update orders set order_status = 'डिलीवरी पूरी हुई' where id = cod2;
  update orders set order_status = 'डिलीवरी पूरी हुई' where id = onl;
  update orders set order_status = 'रद्द' where id = canc;
  reset role;

  assert (select payment_status from orders where id = cod2) = 'सफल';
  assert (select payment_status from orders where id = onl) = 'लंबित', 'ऑनलाइन ऑर्डर का भुगतान बिना गेटवे के सफल नहीं होना चाहिए';
  assert (select payment_status from orders where id = canc) = 'लंबित' and not exists (select 1 from payments where order_id = canc);
  raise notice 'PASS 8: admin-completed COD settles; online/cancelled untouched';
end $$;

-- ---------- 9. सुरक्षा: कोई सीधे payment_method / payment_status नहीं बदल सकता ----------
do $$
declare n int; oid uuid;
begin
  select id into oid from orders where payment_method = 'COD' and payment_status = 'लंबित' limit 1;
  set local role anon;
  update orders set payment_status = 'सफल', payment_method = 'COD' where id = oid;
  get diagnostics n = row_count;
  assert n = 0, 'anon कोई ऑर्डर नहीं बदल सकता';
  insert into payments (order_id, gateway, amount, status) values (oid, 'cod', 1, 'सफल');
  raise exception 'anon ने payments में लिख दिया!';
exception when insufficient_privilege then          -- RLS ने रोका (सिर्फ़ यही अपेक्षित त्रुटि)
  reset role;
  raise notice 'PASS 9: anon cannot alter payment fields (RLS)';
end $$;

-- ---------- 10. एक IP से COD ऑर्डर की सीमा (10/घंटा) ----------
do $$
declare ok boolean := false; i int; r jsonb;
begin
  delete from security_attempts where kind = 'cod_order';
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.7"}', true);
  set local role anon;
  for i in 1..10 loop
    r := place_order(gen_random_uuid(), t.cust('COD', '98765' || lpad((20000 + i)::text, 5, '0')), t.items(7), null);
  end loop;
  begin
    perform place_order(gen_random_uuid(), t.cust('COD', '9876530000'), t.items(7), null);
  exception when others then ok := sqlerrm like '%RATE_LIMITED%';
  end;
  assert ok, '11वाँ COD ऑर्डर उसी IP से मना होना चाहिए';
  -- ऑनलाइन ऑर्डर पर यह सीमा नहीं
  r := place_order(gen_random_uuid(), t.cust('ONLINE', '9876530001'), t.items(7), null);
  assert r->>'payment_method' = 'ऑनलाइन';
  -- दूसरा IP चल सकता है
  perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.8"}', true);
  r := place_order(gen_random_uuid(), t.cust('COD', '9876530002'), t.items(7), null);
  assert r->>'payment_method' = 'COD';
  reset role;
  perform set_config('request.headers', '', true);
  raise notice 'PASS 10: per-IP COD rate limit';
end $$;

-- ---------- 11. COD बंद करने पर नए COD मना, पुराने COD ऑर्डर सुरक्षित ----------
do $$
declare ok boolean := false; before_cnt int; r jsonb;
begin
  select count(*) into before_cnt from orders where payment_method = 'COD';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  update delivery_settings set cod_enabled = false where id = 1;
  reset role;
  set local role anon;
  begin
    perform place_order(gen_random_uuid(), t.cust('COD', '9876540000'), t.items(7), null);
  exception when others then ok := sqlerrm like '%COD_DISABLED%';
  end;
  r := place_order(gen_random_uuid(), t.cust(null, '9876540000'), t.items(7), null);   -- ऑनलाइन अब भी चलता है
  reset role;
  assert ok;
  assert (select count(*) from orders where payment_method = 'COD') = before_cnt, 'पुराने COD ऑर्डर वैसे ही';
  assert r->>'payment_method' = 'ऑनलाइन';
  raise notice 'PASS 11: disabling COD blocks new COD only';
end $$;

-- ---------- 12. सेलर के लिए payment_method पहुँचे ----------
do $$
begin
  assert pg_get_functiondef('seller_order_lines'::regproc) like '%payment_method%', 'seller_order_lines में payment_method';
  raise notice 'PASS 12: seller lines carry payment_method';
end $$;

drop schema t cascade;
do $$ begin raise notice 'ALL PASSED'; end $$;
