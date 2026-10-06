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
