-- =========================================================
-- ग्राहक Web Push (customer_push.sql) का व्यवहार-परीक्षण — टेस्ट डेटाबेस पर ही चलाएँ
-- पहले full_schema.sql चलाएँ। Supabase के auth/net स्कीमा का स्टब चाहिए (net.http_post को यह फ़ाइल लॉग-टेबल से बदल देती है)।
-- जाँचता है: token सही/गलत, बंद ऑर्डर, सीधी टेबल-पहुँच बंद, स्थिति बदलने पर ठीक एक HTTP कॉल, config न हो तब भी स्थिति बदलना।
-- सब सही हो तो आख़िर में "ALL CUSTOMER PUSH TESTS PASSED"।
-- =========================================================
\set ON_ERROR_STOP on
create schema if not exists t;
create or replace function t.items(p_qty numeric default 7) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('vegetable_id', (select id from vegetables where name = 'आलू' limit 1), 'quantity', p_qty)) $$;
create or replace function t.cust(p_phone text default '9876543210') returns jsonb language sql as $$
  select jsonb_build_object('name','टेस्ट','phone',p_phone,'address','१२ गांधी नगर','city','Bhopal','pincode','462001',
   'delivery_date', to_char((now() at time zone 'Asia/Kolkata')::date + 1,'YYYY-MM-DD'),'delivery_time_slot','सुबह 8-10') $$;
grant usage on schema t to public; grant execute on all functions in schema t to public;
create table t.calls(url text, headers jsonb, body jsonb);
create or replace function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language plpgsql as $$ begin insert into t.calls values (url, headers, body); return 1; end $$;
insert into push_config values ('customer_function_url','https://x.supabase.co/functions/v1/send-customer-push'),('secret','s3cret') on conflict (key) do update set value = excluded.value;

do $$
declare a jsonb; b jsonb; n int; tok uuid; calls int;
begin
  set local role anon;
  a := place_order(gen_random_uuid(), t.cust('9876543210'), t.items(), null);
  b := place_order(gen_random_uuid(), t.cust('9123456789'), t.items(), null);
  -- 1) सही token → 1 जुड़ाव
  n := register_customer_push(jsonb_build_array(jsonb_build_object('id', a->>'order_id', 'token', a->>'access_token')), 'https://push.example/abc', 'p256dh-key', 'auth-key', 'en', 'UA');
  assert n = 1, 'valid token should register 1, got '||n;
  -- 2) दोबारा वही → अब भी 1 पंक्ति (upsert)
  n := register_customer_push(jsonb_build_array(jsonb_build_object('id', a->>'order_id', 'token', a->>'access_token')), 'https://push.example/abc', 'p256dh-key2', 'auth-key2', 'hi', 'UA');
  assert n = 1;
  -- 3) गलत token (दूसरे ऑर्डर का token a के id के साथ) → 0
  n := register_customer_push(jsonb_build_array(jsonb_build_object('id', a->>'order_id', 'token', b->>'access_token')), 'https://push.example/evil', 'k', 'a', 'hi', null);
  assert n = 0, 'wrong token must not register';
  -- 4) बेतुका endpoint / खाली keys → exception
  begin perform register_customer_push('[]'::jsonb, 'http://insecure', 'k', 'a'); assert false, 'should raise'; exception when others then assert sqlerrm like '%BAD_SUBSCRIPTION%', sqlerrm; end;
  -- 5) anon सीधे टेबल नहीं पढ़ सकता
  begin perform count(*) from customer_push_subscriptions; assert false, 'anon read must fail'; exception when insufficient_privilege then null; end;
  reset role;
  assert (select count(*) from customer_push_subscriptions) = 1, 'exactly one row';
  assert (select lang from customer_push_subscriptions) = 'hi', 'upsert updated lang';

  -- 6) स्थिति बदली: a (जुड़ा) → 1 कॉल; b (बिना subscription) → 0 कॉल
  update orders set order_status = 'स्वीकार किया गया' where id = (a->>'order_id')::uuid;
  update orders set order_status = 'स्वीकार किया गया' where id = (b->>'order_id')::uuid;
  select count(*) into calls from t.calls;
  assert calls = 1, 'one HTTP call expected, got '||calls;
  assert (select body->>'status' from t.calls) = 'स्वीकार किया गया';
  assert (select body->>'order_id' from t.calls) = a->>'order_id';
  assert (select headers->>'x-push-secret' from t.calls) = 's3cret';
  -- 7) स्थिति वही रहे (दूसरा column बदले) → कोई नई कॉल नहीं
  update orders set extra_notes = 'hi' where id = (a->>'order_id')::uuid;
  assert (select count(*) from t.calls) = 1;
  -- 8) बंद ऑर्डर पर register नहीं
  update orders set order_status = 'रद्द', cancel_reason = 'test' where id = (b->>'order_id')::uuid;
  set local role anon;
  n := register_customer_push(jsonb_build_array(jsonb_build_object('id', b->>'order_id', 'token', b->>'access_token')), 'https://push.example/zzz', 'k', 'a');
  assert n = 0, 'closed order must not register';
  -- 9) unregister
  perform unregister_customer_push('https://push.example/abc');
  reset role;
  assert (select count(*) from customer_push_subscriptions) = 0;
  -- 10) config न हो तो ऑर्डर-स्थिति बदलना फिर भी चले
  delete from push_config where key = 'customer_function_url';
  update orders set order_status = 'सामान तैयार हो रहा है' where id = (a->>'order_id')::uuid;
  raise notice 'ALL CUSTOMER PUSH TESTS PASSED';
end $$;
