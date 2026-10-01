-- =========================================================
-- pricing_engine.sql का व्यवहार-परीक्षण (behaviour test)
-- चलाने के लिए: एक खाली टेस्ट डेटाबेस में schema.sql + pricing_engine.sql चलाकर, फिर यह फाइल।
-- Supabase के auth स्कीमा की जगह टेस्ट में `auth.uid()` का स्टब चाहिए (README में देखें)।
-- हर जांच फेल होने पर EXCEPTION देती है; सब सही हो तो आख़िर में "ALL PASSED"।
-- =========================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'owner@test'), ('22222222-2222-2222-2222-222222222222', 'staff@test') on conflict do nothing;
insert into admin_users (id, full_name, role) values ('11111111-1111-1111-1111-111111111111', 'मालिक', 'admin'), ('22222222-2222-2222-2222-222222222222', 'स्टाफ', 'staff') on conflict do nothing;

-- ---------- 0. ढांचा: ग्राहक-पठनीय टेबलों में लागत का कोई कॉलम नहीं ----------
do $$
begin
  assert (select count(*) from information_schema.columns
          where table_schema = 'public' and table_name in ('vegetables','orders','order_items','categories','delivery_rules')
            and column_name ~ '(purchase|cost|margin|profit|wastage|contribution)') = 0,
    'सार्वजनिक टेबलों में लागत/मार्जिन कॉलम नहीं होने चाहिए';
  assert (select count(*) from pricing_rules) = 7, 'श्रेणी नियम सीड नहीं हुए';
  assert (select count(*) from delivery_rules) = 1 and (select fee from delivery_rules) = 20 and (select min_subtotal from delivery_rules) = 0,
    'delivery_rules मौजूदा delivery_settings से सीड होने चाहिए';
  raise notice 'PASS 0: structure + seeds';
end $$;

-- ---------- 1. यूनिट पार्सर ----------
do $$
begin
  assert aks_line_base_units('किलो', 3, 'kg') = 3;
  assert aks_line_base_units('0.5 किलो', 1, 'kg') = 0.5;
  assert aks_line_base_units('250 ग्राम', 2, 'kg') = 0.5;
  assert aks_line_base_units('2 किलो', 1, 'kg') = 2;
  assert aks_line_base_units('आधा किलो', 3, 'kg') = 1.5;
  assert aks_line_base_units('नग', 3, 'piece') = 3;
  assert aks_line_base_units('गड्डी', 2, 'bunch') = 2;
  assert aks_line_base_units('गड्डी', 1, 'kg') is null, 'बेमेल यूनिट में लागत का अनुमान नहीं';
  assert aks_line_base_units('किलो', 1, 'piece') is null;
  assert aks_line_base_units('dozen', 1, 'piece') is null;
  assert aks_line_base_units('किलो', 1, '500g') = 1; -- खरीद यूनिट कुछ भी हो, वज़न वाली है → बेस kg
  raise notice 'PASS 1: unit parser';
end $$;

-- ---------- 2. मालिक: पब्लिश (टमाटर) ----------
do $$
declare
  tid uuid := (select id from vegetables where name = 'टमाटर');
  r jsonb;
  pp product_pricing%rowtype;
  v vegetables%rowtype;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  r := publish_prices(jsonb_build_array(jsonb_build_object(
    'vegetable_id', tid, 'base_version', null,
    'purchase_price', 30, 'purchase_unit', 'kg', 'selling_unit', 'kg', 'pack_sizes', jsonb_build_array('500g','250g'),
    'wastage_pct', 8, 'handling_cost', 2, 'margin_pct', 20, 'demand_level', 'normal',
    'allow_clearance', false, 'manual_override', false, 'manual_price', null, 'loss_confirmed', false,
    'stock_received_at', '2026-09-30', 'store_unit', 'किलो',
    'price_tiers', jsonb_build_array(
      jsonb_build_object('qty', 1, 'unit', 'किलो', 'price', 42),
      jsonb_build_object('qty', 500, 'unit', 'ग्राम', 'price', 21),
      jsonb_build_object('qty', 250, 'unit', 'ग्राम', 'price', 11)),
    'snapshot', jsonb_build_object('purchase_per_base', 30, 'effective_cost', 32.61, 'base_cost', 34.61, 'min_safe_price', 34.61,
      'recommended_price', 41.53, 'published_price', 42, 'price_source', 'auto', 'min_protection_applied', false,
      'wastage_pct', 8, 'handling_cost', 2, 'margin_pct', 20, 'stock_age_days', 0, 'freshness_pct', 0, 'demand_pct', 0, 'rounding_mode', 'ceil_1')
  )), 'पहला पब्लिश');
  reset role;

  assert (r ->> 'applied')::int = 1, 'पब्लिश लागू नहीं हुआ: ' || r::text;
  select * into pp from product_pricing where vegetable_id = tid;
  select * into v from vegetables where id = tid;
  assert v.price = 42 and v.unit = 'किलो', 'ग्राहक-स्टोर की कीमत अपडेट नहीं हुई';
  assert jsonb_array_length(v.price_tiers) = 3, 'पैक टियर नहीं लिखे';
  assert pp.version = 1 and pp.base_cost = 34.61 and pp.previous_published_price = 40, 'प्रोफ़ाइल गलत: prev=' || coalesce(pp.previous_published_price::text, 'null');
  assert (select count(*) from price_history where vegetable_id = tid and source = 'auto' and published_price = 42 and base_cost = 34.61 and wastage_pct = 8 and margin_pct = 20) = 1, 'हिस्ट्री में इनपुट का snapshot नहीं';
  assert (select count(*) from purchase_prices where vegetable_id = tid and price = 30) = 1;
  assert (select stock_received_at from inventory where vegetable_id = tid) = date '2026-09-30';
  raise notice 'PASS 2: owner publish';
end $$;

-- ---------- 3. कॉन्फ़्लिक्ट: पुराना version भेजने पर चुपचाप ओवरराइट नहीं ----------
do $$
declare
  tid uuid := (select id from vegetables where name = 'टमाटर');
  r jsonb;
  item jsonb;
begin
  item := jsonb_build_object(
    'vegetable_id', tid, 'base_version', null, 'purchase_price', 33, 'purchase_unit', 'kg', 'selling_unit', 'kg', 'pack_sizes', '[]'::jsonb,
    'demand_level', 'normal', 'store_unit', 'किलो',
    'snapshot', jsonb_build_object('purchase_per_base', 33, 'effective_cost', 35.87, 'base_cost', 37.87, 'min_safe_price', 37.87,
      'recommended_price', 45.44, 'published_price', 46, 'price_source', 'auto'));
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  r := publish_prices(jsonb_build_array(item));
  assert r -> 'results' -> 0 ->> 'status' = 'conflict', 'base_version null (पुरानी) पर conflict चाहिए: ' || r::text;
  r := publish_prices(jsonb_build_array(jsonb_set(item, '{base_version}', '99')));
  assert r -> 'results' -> 0 ->> 'status' = 'conflict', 'गलत version पर conflict चाहिए';
  reset role;
  assert (select price from vegetables where id = tid) = 42, 'conflict पर कीमत बदलनी नहीं चाहिए';
  assert (select version from product_pricing where vegetable_id = tid) = 1;

  set local role authenticated;
  r := publish_prices(jsonb_build_array(jsonb_set(item, '{base_version}', '1')));
  reset role;
  assert r -> 'results' -> 0 ->> 'status' = 'applied', 'सही version पर लागू होना चाहिए: ' || r::text;
  assert (select price from vegetables where id = tid) = 46;
  assert (select version from product_pricing where vegetable_id = tid) = 2;
  assert (select previous_published_price from product_pricing where vegetable_id = tid) = 42;
  assert (select previous_purchase_price from product_pricing where vegetable_id = tid) = 30;
  assert (select price_tiers from vegetables where id = tid) is null, 'बिना पैक के tiers NULL होने चाहिए';
  raise notice 'PASS 3: optimistic concurrency';
end $$;

-- ---------- 4. न्यूनतम-कीमत सुरक्षा (सर्वर-साइड): पुष्टि के बिना नुकसान वाली कीमत नहीं ----------
do $$
declare
  tid uuid := (select id from vegetables where name = 'टमाटर');
  r jsonb;
  item jsonb;
begin
  item := jsonb_build_object(
    'vegetable_id', tid, 'base_version', 2, 'purchase_price', 33, 'purchase_unit', 'kg', 'selling_unit', 'kg', 'pack_sizes', '[]'::jsonb,
    'demand_level', 'normal', 'store_unit', 'किलो', 'manual_override', true, 'manual_price', 30, 'loss_confirmed', false,
    'snapshot', jsonb_build_object('purchase_per_base', 33, 'effective_cost', 35.87, 'base_cost', 37.87, 'min_safe_price', 37.87,
      'recommended_price', 45.44, 'published_price', 30, 'price_source', 'manual', 'wastage_pct', 8, 'handling_cost', 2, 'margin_pct', 20));
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  r := publish_prices(jsonb_build_array(item));
  assert r -> 'results' -> 0 ->> 'reason' = 'below_safe_price_unconfirmed', 'बिना पुष्टि नुकसान वाली कीमत रुकनी चाहिए: ' || r::text;
  reset role;
  assert (select price from vegetables where id = tid) = 46, 'कीमत बदलनी नहीं चाहिए थी';

  set local role authenticated;
  r := publish_prices(jsonb_build_array(jsonb_set(item, '{loss_confirmed}', 'true')));
  reset role;
  assert r -> 'results' -> 0 ->> 'status' = 'applied', 'पुष्टि के बाद लागू होना चाहिए: ' || r::text;
  assert (select price from vegetables where id = tid) = 30;
  assert (select count(*) from price_history where vegetable_id = tid and loss_confirmed and source = 'manual') = 1, 'हिस्ट्री में loss_confirmed दर्ज होना चाहिए';

  -- manual_price और published_price बेमेल हो तो रोकें
  set local role authenticated;
  r := publish_prices(jsonb_build_array(jsonb_set(jsonb_set(jsonb_set(item, '{base_version}', '3'), '{manual_price}', '35'), '{loss_confirmed}', 'true')));
  reset role;
  assert r -> 'results' -> 0 ->> 'reason' = 'manual_price_mismatch', 'manual_price mismatch: ' || r::text;
  raise notice 'PASS 4: loss protection';
end $$;

-- ---------- 5. बैच में एक खराब आइटम बाकी को नहीं रोकता; टियर/यूनिट/कीमत की जांच ----------
do $$
declare
  aid uuid := (select id from vegetables where name = 'आलू');
  r jsonb;
  good jsonb;
begin
  good := jsonb_build_object(
    'vegetable_id', aid, 'base_version', null, 'purchase_price', 41.5, 'purchase_unit', 'kg', 'selling_unit', 'kg', 'pack_sizes', '[]'::jsonb,
    'demand_level', 'normal', 'store_unit', 'किलो',
    'wastage_pct', 0, 'handling_cost', 0, 'margin_pct', 20,
    'snapshot', jsonb_build_object('purchase_per_base', 41.5, 'effective_cost', 41.5, 'base_cost', 41.5, 'min_safe_price', 41.5,
      'recommended_price', 49.8, 'published_price', 50, 'price_source', 'auto', 'wastage_pct', 0, 'handling_cost', 0, 'margin_pct', 20));
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  r := publish_prices(jsonb_build_array(
    good,
    jsonb_build_object('vegetable_id', gen_random_uuid(), 'purchase_price', 10),
    jsonb_set(jsonb_set(good, '{vegetable_id}', to_jsonb((select id from vegetables where name = 'गाजर')::text)), '{store_unit}', '"kg"'),
    jsonb_set(jsonb_set(good, '{vegetable_id}', to_jsonb((select id from vegetables where name = 'खीरा')::text)), '{snapshot,published_price}', '0'),
    jsonb_set(jsonb_set(good, '{vegetable_id}', to_jsonb((select id from vegetables where name = 'बैंगन')::text)), '{price_tiers}', '[{"qty":1,"unit":"oz","price":10}]'::jsonb)
  ));
  reset role;
  assert (r ->> 'applied')::int = 1, 'सिर्फ़ 1 आइटम लागू होना चाहिए: ' || r::text;
  assert r -> 'results' -> 1 ->> 'reason' = 'not_found';
  assert r -> 'results' -> 2 ->> 'reason' = 'invalid_store_unit', 'store_unit जांच: ' || (r -> 'results' -> 2)::text;
  assert r -> 'results' -> 3 ->> 'reason' = 'invalid_price', 'कीमत 0: ' || (r -> 'results' -> 3)::text;
  assert r -> 'results' -> 4 ->> 'reason' = 'invalid_tiers', 'tiers: ' || (r -> 'results' -> 4)::text;
  assert (select price from vegetables where id = aid) = 50;
  raise notice 'PASS 5: batch isolation + validation';
end $$;

-- ---------- 6. सीधे कीमत बदलने से सुरक्षा; बिना-प्रोफ़ाइल सब्ज़ी पहले जैसी + हिस्ट्री ----------
do $$
declare
  tid uuid := (select id from vegetables where name = 'टमाटर');
  pid uuid := (select id from vegetables where name = 'प्याज़');
  failed boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  begin
    update vegetables set price = 99 where id = tid;
  exception when others then
    failed := true;
    assert sqlerrm like '%ऑटो-प्राइसिंग%', 'गलत त्रुटि: ' || sqlerrm;
  end;
  assert failed, 'प्रोफ़ाइल वाली सब्ज़ी की कीमत सीधे बदलनी नहीं चाहिए';
  update vegetables set name_en = 'Tomato', mrp = 55 where id = tid; -- कीमत के अलावा फ़ील्ड बदल सकते हैं
  update vegetables set price = 38 where id = pid;
  reset role;
  assert (select price from vegetables where id = tid) = 30;
  assert (select price from vegetables where id = pid) = 38, 'बिना प्रोफ़ाइल वाली सब्ज़ी का पुराना रास्ता चलना चाहिए';
  assert (select count(*) from price_history where vegetable_id = pid and source = 'external' and published_price = 38 and previous_published_price = 35) = 1, 'external हिस्ट्री';
  raise notice 'PASS 6: guard trigger';
end $$;

-- ---------- 7. ग्राहक (anon) कुछ भी लागत-संबंधी नहीं देख सकता ----------
do $$
declare t text; n int; blocked boolean;
begin
  set local role anon;
  foreach t in array array['product_pricing','price_history','purchase_prices','pricing_settings','pricing_rules','pricing_audit_log','order_financials','order_item_costs'] loop
    execute format('select count(*) from %I', t) into n;
    assert n = 0, t || ' ग्राहक को दिख रही है!';
  end loop;
  execute 'select count(*) from delivery_rules' into n;
  assert n >= 1, 'delivery_rules ग्राहक को दिखनी चाहिए';
  execute 'select count(*) from vegetables' into n;
  assert n >= 10, 'ग्राहक को सब्ज़ियाँ दिखनी चाहिए';
  blocked := false;
  begin
    insert into product_pricing (vegetable_id, purchase_price, purchase_per_base, effective_cost, base_cost, min_safe_price, recommended_price, published_price)
    values ((select id from vegetables limit 1), 1, 1, 1, 1, 1, 1, 1);
  exception when others then blocked := true; end;
  assert blocked, 'ग्राहक प्रोफ़ाइल नहीं बना सकता';
  blocked := false;
  begin perform publish_prices('[]'::jsonb); exception when others then blocked := true; end;
  assert blocked, 'ग्राहक publish_prices नहीं चला सकता';
  reset role;
  raise notice 'PASS 7: customers see no cost data';
end $$;

-- ---------- 8. स्टाफ: स्टॉक अपडेट कर सकता है, पब्लिश/लागत नहीं ----------
do $$
declare
  tid uuid := (select id from vegetables where name = 'टमाटर');
  n int; rc int; blocked boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  set local role authenticated;
  begin perform publish_prices('[]'::jsonb); exception when others then blocked := true; end;
  assert blocked, 'स्टाफ पब्लिश नहीं कर सकता';
  select count(*) into n from product_pricing;
  assert n = 0, 'स्टाफ को लागत नहीं दिखनी चाहिए';
  select count(*) into n from order_financials;
  assert n = 0;
  update inventory set quantity = 25 where vegetable_id = tid;
  get diagnostics rc = row_count;
  assert rc = 1, 'स्टाफ स्टॉक अपडेट कर सके';
  blocked := false;
  begin update inventory set quantity = -1 where vegetable_id = tid; exception when others then blocked := true; end;
  assert blocked, 'नकारात्मक स्टॉक नहीं होना चाहिए';
  update delivery_settings set min_order_value = 1 where id = 1;
  get diagnostics rc = row_count;
  assert rc = 0, 'स्टाफ न्यूनतम ऑर्डर नहीं बदल सकता';
  update vegetables set price = 61 where name = 'प्याज़'; -- बिना-प्रोफ़ाइल: पुराना रास्ता स्टाफ के लिए भी चले
  reset role;
  assert (select quantity from inventory where vegetable_id = tid) = 25;
  raise notice 'PASS 8: staff permissions';
end $$;

-- ---------- 9. ऑर्डर की लागत/मुनाफ़ा (सर्वर-साइड snapshot) ----------
do $$
declare
  tid uuid := (select id from vegetables where name = 'टमाटर');
  oid1 uuid; f order_financials%rowtype; nn int;
begin
  -- टमाटर को फिर से पैक-टियर के साथ पब्लिश करें ताकि (ऑटो) लागत snapshot वही रहे: purchase 30 / eff 32.61 / base 34.61
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  perform publish_prices(jsonb_build_array(jsonb_build_object(
    'vegetable_id', tid, 'base_version', (select version from product_pricing where vegetable_id = tid),
    'purchase_price', 30, 'purchase_unit', 'kg', 'selling_unit', 'kg', 'pack_sizes', '["500g","250g"]'::jsonb,
    'wastage_pct', 8, 'handling_cost', 2, 'margin_pct', 20, 'demand_level', 'normal', 'store_unit', 'किलो',
    'price_tiers', '[{"qty":1,"unit":"किलो","price":42},{"qty":250,"unit":"ग्राम","price":11}]'::jsonb,
    'snapshot', jsonb_build_object('purchase_per_base', 30, 'effective_cost', 32.61, 'base_cost', 34.61, 'min_safe_price', 34.61,
      'recommended_price', 41.53, 'published_price', 42, 'price_source', 'auto', 'wastage_pct', 8, 'handling_cost', 2, 'margin_pct', 20))));
  reset role;

  -- ग्राहक (anon) चेकआउट जैसा: ऑर्डर + आइटम. 2 किलो @42 + 2×250 ग्राम @11 = 106; डिलीवरी शुल्क 20; कुल 126
  set local role anon;
  insert into orders (customer_name, customer_phone, full_address, pincode, subtotal, delivery_fee, discount, total_amount)
  values ('टेस्ट', '9999999999', 'पता', '462001', 106, 20, 0, 126) returning id into oid1;
  insert into order_items (order_id, vegetable_id, vegetable_name, unit, price, quantity, item_total) values
    (oid1, tid, 'टमाटर', 'किलो', 42, 2, 84),
    (oid1, tid, 'टमाटर', '250 ग्राम', 11, 2, 22);
  reset role;

  select * into f from order_financials where order_id = oid1;
  -- 2 किलो: खरीद 60 + wastage 5.22 + पैकिंग 4 ; 0.5 किलो: खरीद 15 + wastage 1.31 + पैकिंग 1
  assert f.product_purchase_cost = 75, 'purchase: ' || f.product_purchase_cost;
  assert f.wastage_cost = 6.53, 'wastage: ' || f.wastage_cost;
  assert f.packing_cost = 5, 'packing: ' || f.packing_cost;
  assert f.delivery_cost = 20 and f.payment_charges = 2.52 and f.revenue = 126;
  assert f.contribution = 16.95, 'contribution: ' || f.contribution;
  assert f.unknown_cost_items = 0;

  -- स्पेक Section 12 का उदाहरण: ₹200 ऑर्डर, लागत ₹166, डिलीवरी ₹20 → ₹14
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  update pricing_settings set payment_charge_pct = 0 where id = 1; -- उदाहरण में पेमेंट चार्ज नहीं
  reset role;
  declare aid uuid := (select id from vegetables where name = 'आलू'); oid2 uuid; begin
    set local role anon;
    insert into orders (customer_name, customer_phone, full_address, pincode, subtotal, delivery_fee, discount, total_amount)
    values ('टेस्ट2', '9999999998', 'पता', '462001', 200, 0, 0, 200) returning id into oid2;
    insert into order_items (order_id, vegetable_id, vegetable_name, unit, price, quantity, item_total) values (oid2, aid, 'आलू', 'किलो', 50, 4, 200);
    reset role;
    select * into f from order_financials where order_id = oid2;
    assert f.product_purchase_cost + f.wastage_cost + f.packing_cost = 166, 'लागत 166 होनी चाहिए: ' || (f.product_purchase_cost + f.wastage_cost + f.packing_cost);
    assert f.contribution = 14, 'स्पेक उदाहरण: ₹200 − ₹166 − ₹20 = ₹14, मिला ' || f.contribution;
  end;

  -- बिना प्रोफ़ाइल वाली सब्ज़ी → लागत अज्ञात, गिनती में दर्ज
  declare pid uuid := (select id from vegetables where name = 'गाजर'); oid3 uuid; begin
    set local role anon;
    insert into orders (customer_name, customer_phone, full_address, pincode, subtotal, delivery_fee, discount, total_amount)
    values ('टेस्ट3', '9999999997', 'पता', '462001', 100, 20, 0, 120) returning id into oid3;
    insert into order_items (order_id, vegetable_id, vegetable_name, unit, price, quantity, item_total) values (oid3, pid, 'गाजर', 'किलो', 50, 2, 100);
    reset role;
    select * into f from order_financials where order_id = oid3;
    assert f.unknown_cost_items = 1 and f.product_purchase_cost = 0, 'अज्ञात लागत का हिसाब';
  end;

  -- टियर वाली कीमत बाद में बदलने पर पुराने ऑर्डर का snapshot नहीं बदलता
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  perform publish_prices(jsonb_build_array(jsonb_build_object(
    'vegetable_id', tid, 'base_version', (select version from product_pricing where vegetable_id = tid),
    'purchase_price', 60, 'purchase_unit', 'kg', 'selling_unit', 'kg', 'pack_sizes', '[]'::jsonb, 'demand_level', 'normal', 'store_unit', 'किलो',
    'snapshot', jsonb_build_object('purchase_per_base', 60, 'effective_cost', 65, 'base_cost', 67, 'min_safe_price', 67, 'recommended_price', 80, 'published_price', 80, 'price_source', 'auto'))));
  reset role;
  select * into f from order_financials where order_id = oid1;
  assert f.product_purchase_cost = 75 and f.contribution = 16.95, 'पुराने ऑर्डर का हिसाब नहीं बदलना चाहिए';

  -- मालिक ऑर्डर का मुनाफ़ा पढ़ सकता है
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  set local role authenticated;
  select count(*) into nn from order_financials;
  reset role;
  assert nn = 3, 'मालिक को 3 ऑर्डर का हिसाब दिखना चाहिए, मिला ' || nn;
  raise notice 'PASS 9: order cost snapshot + spec profit example';
end $$;

-- ---------- 10. ऑडिट ट्रेल ----------
do $$
begin
  assert (select count(*) from pricing_audit_log where table_name = 'product_pricing') >= 3, 'product_pricing ऑडिट';
  assert (select count(*) from pricing_audit_log where table_name = 'publish_prices' and action = 'publish') >= 4, 'publish ऑडिट';
  assert (select count(*) from pricing_audit_log where table_name = 'pricing_settings' and new_row ->> 'payment_charge_pct' = '0.00' and actor_name = 'मालिक') = 1, 'सेटिंग बदलाव का ऑडिट (कर्ता के नाम सहित)';
  raise notice 'PASS 10: audit trail';
end $$;

select 'ALL PASSED' as result;
