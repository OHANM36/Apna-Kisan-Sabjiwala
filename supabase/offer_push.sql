-- =========================================================
-- ऑफर / कूपन की Web Push सूचना (सभी "ऑफर सूचना" चालू करने वाले ग्राहकों को)
--
-- चलाने का क्रम: push_notifications.sql के बाद। Supabase SQL Editor में एक बार चलाएँ
-- (दोबारा चलाना सुरक्षित है)। सेटअप: PUSH_SETUP.md (भाग "ऑफर सूचना")
--
-- ऑर्डर-स्थिति वाली सूचना हर *ऑर्डर* से जुड़ी होती है, इसलिए ऑफर के लिए अलग सूची चाहिए:
-- ग्राहक अपनी मर्ज़ी से (बटन दबाकर) जुड़ता है, कभी भी हट सकता है।
-- =========================================================

-- 1) ऑफर-सूचना के subscribers
--    RLS चालू और कोई policy नहीं => ब्राउज़र सीधे टेबल नहीं छू सकता, सिर्फ़ नीचे के RPC से
create table if not exists offer_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  lang text not null default 'hi' check (lang in ('hi', 'en')),
  user_agent text,
  created_at timestamptz not null default now()
);
alter table offer_push_subscriptions enable row level security;
revoke all on offer_push_subscriptions from anon, authenticated;

-- 2) ग्राहक जुड़े (लॉग-इन ज़रूरी नहीं; endpoint एक अनुमान न लगने वाला लंबा URL है)
create or replace function register_offer_push(
  p_endpoint text, p_p256dh text, p_auth text,
  p_lang text default 'hi', p_user_agent text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or length(p_p256dh) > 200
     or coalesce(p_auth, '') = '' or length(p_auth) > 100 then
    raise exception 'BAD_SUBSCRIPTION';
  end if;
  insert into offer_push_subscriptions (endpoint, p256dh, auth_key, lang, user_agent)
  values (p_endpoint, p_p256dh, p_auth, case when p_lang = 'en' then 'en' else 'hi' end, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth_key = excluded.auth_key,
        lang = excluded.lang, user_agent = excluded.user_agent;
end $$;

-- 3) ग्राहक ऑफर सूचना बंद करे
create or replace function unregister_offer_push(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint is null or length(p_endpoint) > 1000 then return; end if;
  delete from offer_push_subscriptions where endpoint = p_endpoint;
end $$;

-- 4) मालिक को "कितने लोगों तक पहुँचेगी" दिखाने के लिए (सिर्फ़ गिनती)
create or replace function offer_push_subscriber_count()
returns integer language plpgsql security definer stable set search_path = public as $$
begin
  if not is_owner() then raise exception 'NOT_ALLOWED'; end if;
  return (select count(*)::integer from offer_push_subscriptions);
end $$;

revoke all on function register_offer_push(text, text, text, text, text) from public;
revoke all on function unregister_offer_push(text) from public;
revoke all on function offer_push_subscriber_count() from public, anon;
grant execute on function register_offer_push(text, text, text, text, text) to anon, authenticated;
grant execute on function unregister_offer_push(text) to anon, authenticated;
grant execute on function offer_push_subscriber_count() to authenticated;
