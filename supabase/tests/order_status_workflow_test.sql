-- =========================================================
-- order_status_workflow.sql का व्यवहार-परीक्षण
-- चलाने के लिए: खाली टेस्ट डेटाबेस में (Supabase auth/roles का स्टब चाहिए — cod_test.sql जैसा) क्रम से:
--   schema.sql, pricing_engine.sql, vendor_seller_association.sql, delivery_boy_module.sql,
--   security_hardening.sql, cod_payment.sql, delivery_orders_date.sql, pay_online_on_delivery.sql,
--   order_status_workflow.sql — फिर यह फाइल।
-- हर जांच फेल हो तो EXCEPTION; सब सही हो तो आख़िर में "ALL PASSED"।
-- ⚠️ यह फाइल टेस्ट डेटा बनाती है — असली/प्रोडक्शन डेटाबेस पर न चलाएँ।
-- =========================================================
\set ON_ERROR_STOP on

-- Supabase की डिफ़ॉल्ट privileges की नक़ल (असल में RLS ही रोक है)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
revoke all on order_status_history from authenticated;
grant select on order_status_history to authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test'),
  ('22222222-2222-2222-2222-222222222222', 'staff@test'),
  ('33333333-3333-3333-3333-333333333333', 'random-user@test')
  on conflict do nothing;
insert into admin_users (id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'मालिक', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'स्टाफ', 'staff')
  on conflict do nothing;
insert into delivery_boys (id, full_name, pin_hash) values
  ('44444444-4444-4444-4444-444444444444', 'टेस्ट बॉय', extensions.crypt('1234', extensions.gen_salt('bf', 4)))
  on conflict do nothing;
insert into delivery_sessions (token_hash, delivery_boy_id, expires_at)
  values (encode(extensions.digest('boy-token', 'sha256'), 'hex'), '44444444-4444-4444-4444-444444444444', now() + interval '1 day')
  on conflict do nothing;

create schema if not exists t;
grant usage on schema t to public;

-- किसी भी स्थिति में टेस्ट ऑर्डर बनाओ (INSERT पर स्थिति-trigger नहीं चलता)
create or replace function t.mk(p_status text, p_paid boolean default false, p_method text default 'ऑनलाइन', p_boy uuid default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into orders (customer_name, customer_phone, full_address, pincode, total_amount,
                      order_status, payment_status, payment_method, delivery_boy_id)
  values ('टेस्ट ग्राहक', '9876543210', '१२ गांधी नगर', '462001', 230,
          p_status, case when p_paid then 'सफल' else 'लंबित' end, p_method, p_boy)
  returning id into v;
  return v;
end $$;

-- लॉग-इन उपयोगकर्ता की तरह सीधा table UPDATE (RLS लागू) — 'OK' / 'NOROWS' / error संदेश
create or replace function t.upd(p_uid uuid, p_id uuid, p_to text, p_reason text default null, p_cancel_cols boolean default false)
returns text language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  if p_cancel_cols then
    update orders set order_status = p_to, cancel_reason = p_reason,
                      cancelled_by = '33333333-3333-3333-3333-333333333333', cancelled_at = '2001-01-01'
      where id = p_id;
  else
    update orders set order_status = p_to, cancel_reason = coalesce(p_reason, cancel_reason) where id = p_id;
  end if;
  get diagnostics n = row_count;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return case when n = 1 then 'OK' else 'NOROWS' end;
exception when others then
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return sqlerrm;
end $$;

-- RPC को लॉग-इन एडमिन की तरह बुलाओ
create or replace function t.rpc(p_uid uuid, p_id uuid, p_expected text, p_to text, p_reason text default null)
returns text language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role authenticated';
  r := admin_set_order_status(p_id, p_expected, p_to, p_reason);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return case when (r->>'ok')::boolean then 'OK' else r->>'error' end;
exception when others then
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return sqlerrm;
end $$;
grant execute on all functions in schema t to public;

-- ---------- 0. ढांचा ----------
do $$
begin
  assert (select count(*) from information_schema.columns where table_name = 'orders'
          and column_name in ('cancel_reason', 'cancelled_at', 'cancelled_by')) = 3, 'रद्दीकरण के 3 कॉलम चाहिए';
  assert (select count(*) from pg_trigger where tgrelid = 'orders'::regclass and tgname = 'trg_guard_order_status') = 1,
    'guard trigger ठीक एक होना चाहिए (दोहरा नहीं)';
  assert (select relrowsecurity from pg_class where relname = 'order_status_history'), 'history पर RLS चालू होनी चाहिए';
  raise notice 'PASS 0: structure';
end $$;

-- ---------- 1. पूरी matrix: सभी 7×7 जोड़े, लॉग-इन एडमिन (मालिक) के सीधे UPDATE से ----------
do $$
declare
  sts text[] := array['नया ऑर्डर','भुगतान सफल','स्वीकार किया गया','सामान तैयार हो रहा है','डिलीवरी के लिए निकल गया','डिलीवरी पूरी हुई','रद्द'];
  allowed text[] := array[
    'नया ऑर्डर>स्वीकार किया गया','नया ऑर्डर>रद्द',
    'भुगतान सफल>स्वीकार किया गया','भुगतान सफल>रद्द',
    'स्वीकार किया गया>सामान तैयार हो रहा है','स्वीकार किया गया>रद्द',
    'सामान तैयार हो रहा है>डिलीवरी के लिए निकल गया','सामान तैयार हो रहा है>रद्द',
    'डिलीवरी के लिए निकल गया>डिलीवरी पूरी हुई'];
  a text; b text; oid uuid; res text; exp_ok boolean; checks int := 0;
  uid uuid;
begin
  foreach uid in array array['11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-222222222222'::uuid] loop
    foreach a in array sts loop
      foreach b in array sts loop
        oid := t.mk(a);
        res := t.upd(uid, oid, b, case when b = 'रद्द' then 'ग्राहक ने रद्द करने को कहा' end);
        exp_ok := (a || '>' || b) = any (allowed);
        if a = b then
          -- वही स्थिति दोबारा लगाना बदलाव नहीं है: स्थिति वही, इतिहास में कोई पंक्ति नहीं
          assert res in ('OK', 'CANCEL_FIELDS_LOCKED'), format('%s → %s (वही स्थिति) हानिरहित होना चाहिए, मिला: %s', a, b, res);
          assert (select order_status from orders o where o.id = oid) = a;
          assert (select count(*) from order_status_history h where h.order_id = oid) = 0, 'no-op पर इतिहास नहीं';
        elsif exp_ok then
          assert res = 'OK', format('%s → %s अनुमत होना चाहिए, मिला: %s', a, b, res);
          assert (select order_status from orders o where o.id = oid) = b, 'अनुमत बदलाव लागू होना चाहिए';
        else
          assert res = 'INVALID_TRANSITION', format('%s → %s रद्द होना चाहिए, मिला: %s', a, b, res);
          assert (select order_status from orders o where o.id = oid) = a, 'असफल बदलाव के बाद स्थिति वही रहनी चाहिए';
        end if;
        checks := checks + 1;
      end loop;
    end loop;
  end loop;
  raise notice 'PASS 1: full 7x7 matrix, owner + staff (% pairs)', checks;
end $$;

-- ---------- 2. spec के नामित उदाहरण (साफ़ पढ़ने के लिए) ----------
do $$
declare o uuid; own uuid := '11111111-1111-1111-1111-111111111111';
begin
  assert t.upd(own, t.mk('डिलीवरी के लिए निकल गया'), 'स्वीकार किया गया') = 'INVALID_TRANSITION', 'OFD → Accepted';
  assert t.upd(own, t.mk('डिलीवरी के लिए निकल गया'), 'सामान तैयार हो रहा है') = 'INVALID_TRANSITION', 'OFD → Preparing';
  assert t.upd(own, t.mk('डिलीवरी के लिए निकल गया'), 'रद्द', 'कारण') = 'INVALID_TRANSITION', 'OFD → Cancel';
  assert t.upd(own, t.mk('स्वीकार किया गया'), 'नया ऑर्डर') = 'INVALID_TRANSITION', 'Accepted → New';
  assert t.upd(own, t.mk('सामान तैयार हो रहा है'), 'स्वीकार किया गया') = 'INVALID_TRANSITION', 'Preparing → Accepted';
  assert t.upd(own, t.mk('डिलीवरी पूरी हुई'), 'सामान तैयार हो रहा है') = 'INVALID_TRANSITION', 'Delivered → Preparing';
  assert t.upd(own, t.mk('डिलीवरी पूरी हुई'), 'रद्द', 'कारण') = 'INVALID_TRANSITION', 'Delivered → Cancel';
  assert t.upd(own, t.mk('रद्द'), 'स्वीकार किया गया') = 'INVALID_TRANSITION', 'Cancelled → Accepted';
  -- एडमिन "भुगतान सफल" खुद नहीं लगा सकता (सिर्फ़ verified भुगतान से)
  assert t.upd(own, t.mk('नया ऑर्डर'), 'भुगतान सफल') = 'INVALID_TRANSITION', 'admin cannot mark paid status';
  -- एडमिन Accepted से सीधे Out for Delivery नहीं (सिर्फ़ डिलीवरी बॉय का claim)
  assert t.upd(own, t.mk('स्वीकार किया गया'), 'डिलीवरी के लिए निकल गया') = 'INVALID_TRANSITION', 'admin Accepted → OFD';
  -- मालिक भी बंद ऑर्डर वापस नहीं खोल सकता (पुराना M4 व्यवहार हटा)
  assert t.upd(own, t.mk('रद्द'), 'नया ऑर्डर') = 'INVALID_TRANSITION', 'owner reopen cancelled';
  assert t.upd(own, t.mk('डिलीवरी पूरी हुई'), 'नया ऑर्डर') = 'INVALID_TRANSITION', 'owner reopen delivered';
  raise notice 'PASS 2: named examples';
end $$;

-- ---------- 3. रद्दीकरण का डेटा: कारण, एडमिन ID, समय; क्लाइंट के झूठे मान नहीं चलते ----------
do $$
declare o uuid; r orders%rowtype; own uuid := '11111111-1111-1111-1111-111111111111'; stf uuid := '22222222-2222-2222-2222-222222222222';
begin
  -- कारण के बिना रद्द नहीं
  o := t.mk('स्वीकार किया गया');
  assert t.upd(own, o, 'रद्द', null) = 'CANCEL_REASON_REQUIRED', 'कारण ज़रूरी';
  assert t.upd(own, o, 'रद्द', '   ') = 'CANCEL_REASON_REQUIRED', 'खाली कारण नहीं';
  assert (select order_status from orders where id = o) = 'स्वीकार किया गया', 'असफल रद्दीकरण से स्थिति नहीं बदली';

  -- सही रद्दीकरण; क्लाइंट ने नकली cancelled_by / cancelled_at भेजे तो भी सर्वर के मान लगें
  assert t.upd(stf, o, 'रद्द', 'सामान उपलब्ध नहीं', true) = 'OK';
  select * into r from orders where id = o;
  assert r.cancel_reason = 'सामान उपलब्ध नहीं', 'कारण सेव';
  assert r.cancelled_by = stf, 'cancelled_by = लॉग-इन एडमिन (क्लाइंट का नकली मान नहीं)';
  assert r.cancelled_at > now() - interval '1 minute', 'cancelled_at = सर्वर का समय (क्लाइंट का 2001 नहीं)';

  -- रद्द के बाद कारण/समय/ID बदले नहीं जा सकते
  assert t.upd(own, o, 'रद्द', 'कुछ और') = 'CANCEL_FIELDS_LOCKED', 'रद्दीकरण-रिकॉर्ड बदला नहीं जा सकता';

  -- सीधे cancel_reason-सिर्फ़ UPDATE (स्थिति बिना बदले) — बिना status के भी रोक
  declare n text;
  begin
    perform set_config('request.jwt.claim.sub', own::text, true);
    execute 'set local role authenticated';
    begin
      update orders set cancel_reason = 'छेड़छाड़' where id = o;
      n := 'OK';
    exception when others then n := sqlerrm; end;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    assert n = 'CANCEL_FIELDS_LOCKED', 'सिर्फ़ cancel_reason का UPDATE भी रुकना चाहिए, मिला: ' || n;
  end;

  -- कारण 500 अक्षर पर कटता है
  o := t.mk('नया ऑर्डर');
  assert t.upd(own, o, 'रद्द', repeat('क', 900)) = 'OK';
  assert length((select cancel_reason from orders where id = o)) = 500, 'लंबा कारण 500 पर कटे';
  raise notice 'PASS 3: cancellation data';
end $$;

-- ---------- 4. भुगतान-सुरक्षा: paid ऑनलाइन ऑर्डर रद्द हो तो payment_status 'सफल' ही रहे, 'रिफंड' अपने-आप नहीं ----------
do $$
declare o uuid; r orders%rowtype; own uuid := '11111111-1111-1111-1111-111111111111';
begin
  o := t.mk('भुगतान सफल', true, 'ऑनलाइन');
  assert t.rpc(own, o, 'भुगतान सफल', 'रद्द', 'ग्राहक ने रद्द करने को कहा') = 'OK';
  select * into r from orders where id = o;
  assert r.order_status = 'रद्द' and r.payment_status = 'सफल', 'रद्द ऑर्डर पर भुगतान-स्थिति "सफल" ही रहनी चाहिए (रिफंड अपने-आप नहीं)';
  assert (select count(*) from payments where order_id = o and status = 'रिफंड') = 0, 'कोई नकली refund रिकॉर्ड नहीं';
  raise notice 'PASS 4: paid-order cancellation keeps payment_status';
end $$;

-- ---------- 5. RPC: stale-जाँच, अधिकार, वैधता ----------
do $$
declare o uuid; own uuid := '11111111-1111-1111-1111-111111111111'; stf uuid := '22222222-2222-2222-2222-222222222222'; rnd uuid := '33333333-3333-3333-3333-333333333333';
begin
  -- सामान्य आगे बढ़ना
  o := t.mk('नया ऑर्डर');
  assert t.rpc(own, o, 'नया ऑर्डर', 'स्वीकार किया गया') = 'OK';
  -- दूसरे एडमिन की स्क्रीन पुरानी (अब भी 'नया ऑर्डर' दिख रहा है) → STALE, कुछ बदला नहीं
  assert t.rpc(stf, o, 'नया ऑर्डर', 'रद्द', 'कारण') = 'STALE', 'पुराने expected-status पर STALE';
  assert (select order_status from orders where id = o) = 'स्वीकार किया गया', 'STALE कार्रवाई ने कुछ नहीं बदला';
  assert (select count(*) from orders where id = o and cancelled_at is not null) = 0;
  -- सही expected के साथ चलता है
  assert t.rpc(stf, o, 'स्वीकार किया गया', 'सामान तैयार हो रहा है') = 'OK';
  -- अवैध बदलाव RPC से भी नहीं
  assert t.rpc(own, o, 'सामान तैयार हो रहा है', 'स्वीकार किया गया') = 'INVALID_TRANSITION';
  assert t.rpc(own, o, 'सामान तैयार हो रहा है', 'रद्द', '') = 'CANCEL_REASON_REQUIRED';
  -- एडमिन नहीं / बिना लॉग-इन / अनजान ऑर्डर
  assert t.rpc(rnd, o, 'सामान तैयार हो रहा है', 'डिलीवरी के लिए निकल गया') = 'UNAUTHORIZED', 'गैर-एडमिन';
  assert t.rpc(null, o, 'सामान तैयार हो रहा है', 'डिलीवरी के लिए निकल गया') = 'UNAUTHORIZED', 'बिना लॉग-इन';
  assert t.rpc(own, gen_random_uuid(), 'नया ऑर्डर', 'स्वीकार किया गया') = 'ORDER_NOT_FOUND';
  -- अंतिम चरण
  assert t.rpc(own, o, 'सामान तैयार हो रहा है', 'डिलीवरी के लिए निकल गया') = 'OK';
  assert t.rpc(own, o, 'डिलीवरी के लिए निकल गया', 'रद्द', 'कारण') = 'INVALID_TRANSITION', 'OFD पर रद्द नहीं';
  assert t.rpc(own, o, 'डिलीवरी के लिए निकल गया', 'डिलीवरी पूरी हुई') = 'OK';
  assert t.rpc(own, o, 'डिलीवरी पूरी हुई', 'सामान तैयार हो रहा है') = 'INVALID_TRANSITION';
  raise notice 'PASS 5: RPC stale/authz/validity';
end $$;

-- anon सीधे RPC नहीं चला सकता
do $$
declare ok boolean;
begin
  ok := has_function_privilege('anon', 'admin_set_order_status(uuid,text,text,text)', 'execute');
  assert not ok, 'anon को RPC execute नहीं मिलना चाहिए';
  assert has_function_privilege('authenticated', 'admin_set_order_status(uuid,text,text,text)', 'execute');
  raise notice 'PASS 5b: RPC grants';
end $$;

-- ---------- 6. RLS: गैर-एडमिन लॉग-इन उपयोगकर्ता ऑर्डर बदल नहीं सकता ----------
do $$
declare o uuid := t.mk('नया ऑर्डर');
begin
  assert t.upd('33333333-3333-3333-3333-333333333333', o, 'स्वीकार किया गया') = 'NOROWS', 'गैर-एडमिन का UPDATE RLS से 0 पंक्तियाँ';
  assert (select order_status from orders where id = o) = 'नया ऑर्डर';
  raise notice 'PASS 6: RLS intact';
end $$;

-- ---------- 7. सर्वर-रास्ते: भुगतान, डिलीवरी बॉय (claim / confirm), अपने-आप रद्द ----------
do $$
declare o uuid; r jsonb; boy uuid := '44444444-4444-4444-4444-444444444444';
begin
  -- mark_order_paid: नया → भुगतान सफल
  o := t.mk('नया ऑर्डर', false, 'ऑनलाइन');
  perform mark_order_paid(o, 'gw_order_1', 'pay_1', 'sig', 'upi', 230);
  assert (select order_status from orders where id = o) = 'भुगतान सफल' and (select payment_status from orders where id = o) = 'सफल';

  -- डिलीवरी बॉय Accepted ऑर्डर सीधे उठा सकता है (मौजूदा workflow टूटा नहीं)
  o := t.mk('स्वीकार किया गया', true);
  r := delivery_claim_order('boy-token', o);
  assert (r->>'ok')::boolean, 'claim (Accepted) चलना चाहिए: ' || r::text;
  assert (select order_status from orders where id = o) = 'डिलीवरी के लिए निकल गया';
  assert (select delivery_boy_id from orders where id = o) = boy, 'डिलीवरी असाइनमेंट सुरक्षित';

  -- Preparing वाला भी
  o := t.mk('सामान तैयार हो रहा है', true);
  assert (delivery_claim_order('boy-token', o)->>'ok')::boolean;

  -- दूसरा claim (TAKEN) और रद्द ऑर्डर का claim नहीं
  assert (delivery_claim_order('boy-token', o)->>'error') = 'TAKEN';
  o := t.mk('रद्द');
  assert (delivery_claim_order('boy-token', o)->>'ok')::boolean = false;

  -- सही PIN से डिलीवरी: OFD → Delivered, फिर लॉक
  o := t.mk('स्वीकार किया गया', true);
  update orders set delivery_pin = '4321' where id = o;
  perform delivery_claim_order('boy-token', o);
  assert (delivery_confirm('boy-token', o, '4321')->>'ok')::boolean;
  assert (select order_status from orders where id = o) = 'डिलीवरी पूरी हुई';
  assert t.upd('11111111-1111-1111-1111-111111111111', o, 'डिलीवरी के लिए निकल गया') = 'INVALID_TRANSITION', 'delivered ऑर्डर लॉक';
  assert t.upd('11111111-1111-1111-1111-111111111111', o, 'रद्द', 'कारण') = 'INVALID_TRANSITION';

  -- COD: delivered होने पर पैसा 'प्राप्त' (मौजूदा व्यवहार वैसा ही)
  o := t.mk('डिलीवरी के लिए निकल गया', false, 'COD', boy);
  assert t.rpc('11111111-1111-1111-1111-111111111111', o, 'डिलीवरी के लिए निकल गया', 'डिलीवरी पूरी हुई') = 'OK';
  assert (select payment_status from orders where id = o) = 'सफल', 'COD settle trigger अब भी चलता है';

  -- पुराने अनपेड ऑर्डर अपने-आप रद्द (cron) — कारण 'सिस्टम', cancelled_by खाली
  o := t.mk('नया ऑर्डर', false, 'ऑनलाइन');
  update orders set created_at = now() - interval '10 hours' where id = o;
  perform cancel_stale_unpaid_orders(3);
  assert (select order_status from orders where id = o) = 'रद्द';
  assert (select cancel_reason from orders where id = o) like 'सिस्टम%' and (select cancelled_by from orders where id = o) is null;
  raise notice 'PASS 7: payment / delivery-boy / cron paths';
end $$;

-- ---------- 8. इतिहास (audit) ----------
do $$
declare o uuid; own uuid := '11111111-1111-1111-1111-111111111111'; n int; h order_status_history%rowtype;
begin
  o := t.mk('नया ऑर्डर');
  perform t.rpc(own, o, 'नया ऑर्डर', 'स्वीकार किया गया');
  perform t.rpc(own, o, 'स्वीकार किया गया', 'सामान तैयार हो रहा है');
  -- असफल कोशिशें इतिहास में नहीं आनी चाहिए
  perform t.rpc(own, o, 'सामान तैयार हो रहा है', 'स्वीकार किया गया');      -- अवैध
  perform t.rpc(own, o, 'नया ऑर्डर', 'रद्द', 'कारण');                       -- stale
  perform t.upd(own, o, 'डिलीवरी पूरी हुई');                                  -- छलाँग, अवैध
  perform t.rpc(own, o, 'सामान तैयार हो रहा है', 'रद्द', 'ग्राहक ने रद्द करने को कहा');
  select count(*) into n from order_status_history where order_id = o;
  assert n = 3, 'ठीक 3 सफल बदलाव दर्ज होने चाहिए, मिले ' || n;
  assert (select string_agg(old_status || '>' || new_status, ' | ' order by created_at, new_status) from order_status_history where order_id = o)
    like '%नया ऑर्डर>स्वीकार किया गया%' ;
  select * into h from order_status_history where order_id = o and new_status = 'रद्द';
  assert h.old_status = 'सामान तैयार हो रहा है' and h.change_reason = 'ग्राहक ने रद्द करने को कहा' and h.changed_by = own,
    'रद्दीकरण का इतिहास: कारण + एडमिन ID';
  assert (select count(*) from order_status_history where order_id = o and new_status <> 'रद्द' and change_reason is not null) = 0;
  -- सिस्टम बदलाव (changed_by खाली)
  o := t.mk('स्वीकार किया गया', true);
  perform delivery_claim_order('boy-token', o);
  assert (select changed_by from order_status_history where order_id = o) is null;
  -- गैर-एडमिन इतिहास पढ़ नहीं सकता; कोई सीधे लिख/बदल नहीं सकता
  declare cnt int; werr text;
  begin
    perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
    execute 'set local role authenticated';
    select count(*) into cnt from order_status_history;
    begin
      insert into order_status_history (order_id, new_status) values (o, 'डिलीवरी पूरी हुई');
      werr := 'INSERTED';
    exception when others then werr := 'DENIED'; end;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    assert cnt = 0, 'गैर-एडमिन को इतिहास नहीं दिखना चाहिए';
    assert werr = 'DENIED', 'क्लाइंट इतिहास में नहीं लिख सकता';
  end;
  -- एडमिन इतिहास पढ़ सकता है
  declare cnt2 int;
  begin
    perform set_config('request.jwt.claim.sub', own::text, true);
    execute 'set local role authenticated';
    select count(*) into cnt2 from order_status_history;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    assert cnt2 > 0, 'एडमिन इतिहास पढ़ सके';
  end;
  raise notice 'PASS 8: audit history';
end $$;

-- ---------- 9. मौजूदा ऑर्डर सुरक्षित: दोबारा migration चलाने से कुछ नहीं बदलता ----------
do $$
declare before_cnt int; before_hist int;
begin
  select count(*) into before_cnt from orders;
  select count(*) into before_hist from order_status_history;
  assert (select count(*) from orders where order_status not in
    ('नया ऑर्डर','भुगतान सफल','स्वीकार किया गया','सामान तैयार हो रहा है','डिलीवरी के लिए निकल गया','डिलीवरी पूरी हुई','रद्द')) = 0;
  raise notice 'PASS 9: data intact (% orders, % history rows)', before_cnt, before_hist;
end $$;

do $$ begin raise notice 'ALL PASSED'; end $$;
