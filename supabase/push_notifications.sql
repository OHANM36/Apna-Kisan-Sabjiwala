-- =========================================================
-- Web Push: ऑर्डर बनते ही एडमिन के फ़ोन/कंप्यूटर पर नोटिफ़िकेशन (ऐप बंद हो तब भी)
-- Supabase SQL Editor में एक बार चलाएँ (दोबारा चलाना सुरक्षित है)।
-- पूरी सेटअप-विधि: PUSH_SETUP.md
-- =========================================================

create extension if not exists pg_net;

-- 1) एडमिन डिवाइसों की push subscriptions
--    RLS चालू और कोई policy नहीं => ब्राउज़र सीधे टेबल नहीं छू सकता, सिर्फ़ नीचे के RPC से
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;

-- 2) Edge Function का URL और गुप्त कुंजी (सिर्फ़ trigger/service-role पढ़ सकता है)
create table if not exists push_config (
  key text primary key,
  value text not null
);
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

-- 3) एडमिन अपना डिवाइस रजिस्टर/हटा सके
create or replace function register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'BAD_SUBSCRIPTION';
  end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh,
        auth_key = excluded.auth_key, user_agent = excluded.user_agent;
end $$;

create or replace function unregister_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ALLOWED'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

revoke all on function register_push_subscription(text, text, text, text) from public, anon;
revoke all on function unregister_push_subscription(text) from public, anon;
grant execute on function register_push_subscription(text, text, text, text) to authenticated;
grant execute on function unregister_push_subscription(text) to authenticated;

-- 4) नया ऑर्डर बनते ही Edge Function को बुलाओ।
--    रकम/आइटम इस पल तक भरे नहीं होते, इसलिए सिर्फ़ order_number भेजते हैं;
--    pg_net request commit के बाद जाती है और Edge Function ऑर्डर को database से ताज़ा पढ़ता है।
--    कोई भी गड़बड़ी ऑर्डर बनने को कभी नहीं रोकती।
create or replace function notify_new_order_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url    from push_config where key = 'function_url';
  select value into v_secret from push_config where key = 'secret';
  if v_url is null or v_secret is null then return new; end if;
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('order_number', new.order_number),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'push notify failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_orders_push_notify on orders;
create trigger trg_orders_push_notify
  after insert on orders
  for each row execute function notify_new_order_push();

-- 5) एक बार (अपने मान डालकर) चलाएँ:
-- insert into push_config (key, value) values
--   ('function_url', 'https://<PROJECT-REF>.supabase.co/functions/v1/send-order-push'),
--   ('secret',       '<वही PUSH_WEBHOOK_SECRET जो Edge secrets में रखा>')
-- on conflict (key) do update set value = excluded.value;
