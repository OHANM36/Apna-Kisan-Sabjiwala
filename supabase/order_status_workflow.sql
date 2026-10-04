-- =========================================================
-- ऑर्डर-स्थिति: सिर्फ़ आगे बढ़ना + एडमिन रद्दीकरण (cancellation) + ऑडिट इतिहास
--
-- चलाने का क्रम: security_hardening.sql, cod_payment.sql, delivery_orders_date.sql, pay_online_on_delivery.sql के बाद।
-- दोबारा चलाना सुरक्षित है (idempotent)। कोई मौजूदा ऑर्डर/स्थिति/कॉलम बदला नहीं जाता।
--
-- मौजूदा स्थिति-मान (बदले नहीं गए):
--   'नया ऑर्डर', 'भुगतान सफल', 'स्वीकार किया गया', 'सामान तैयार हो रहा है',
--   'डिलीवरी के लिए निकल गया', 'डिलीवरी पूरी हुई', 'रद्द'
--
-- अनुमत बदलाव (एडमिन — लॉग-इन उपयोगकर्ता, चाहे UI से या सीधे API से):
--   नया ऑर्डर / भुगतान सफल  → स्वीकार किया गया | रद्द
--   स्वीकार किया गया         → सामान तैयार हो रहा है | रद्द
--   सामान तैयार हो रहा है     → डिलीवरी के लिए निकल गया | रद्द
--   डिलीवरी के लिए निकल गया   → डिलीवरी पूरी हुई          (रद्द नहीं)
--   डिलीवरी पूरी हुई / रद्द    → कुछ नहीं (लॉक)
--
-- सिर्फ़ भरोसेमंद सर्वर-रास्तों के लिए (auth.uid() NULL: Edge Function/service_role, SECURITY DEFINER RPC, cron) अतिरिक्त:
--   नया ऑर्डर → भुगतान सफल            (mark_order_paid — भुगतान verify होने पर)
--   स्वीकार किया गया → डिलीवरी के लिए निकल गया   (delivery_claim_order — डिलीवरी बॉय "Accepted" ऑर्डर सीधे उठा सकता है)
--   नया ऑर्डर → रद्द                   (cancel_stale_unpaid_orders)
-- =========================================================

-- ---------------------------------------------------------
-- 1. रद्दीकरण के कॉलम (पहले से हों तो दोबारा नहीं बनते)
-- ---------------------------------------------------------
alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists cancelled_at  timestamptz;
alter table orders add column if not exists cancelled_by  uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------
-- 2. इतिहास टेबल — हर सफल स्थिति-बदलाव का रिकॉर्ड (असफल कोशिशें यहाँ नहीं आतीं)
--    changed_by = लॉग-इन एडमिन की ID; NULL = सिस्टम (डिलीवरी बॉय / भुगतान / अपने-आप रद्द)
-- ---------------------------------------------------------
create table if not exists order_status_history (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  old_status    text,
  new_status    text not null,
  changed_by    uuid references auth.users(id) on delete set null,
  change_reason text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_order_status_history_order on order_status_history(order_id, created_at);

alter table order_status_history enable row level security;
drop policy if exists "order_status_history_admin_read" on order_status_history;
create policy "order_status_history_admin_read" on order_status_history for select using (is_admin());
-- कोई insert/update/delete policy नहीं: सिर्फ़ नीचे का trigger (security definer) लिखता है
revoke all on order_status_history from anon, authenticated;
grant select on order_status_history to authenticated;

-- ---------------------------------------------------------
-- 3. डेटाबेस-स्तर की जाँच (source of truth) — पुराने guard_order_status को बदलता है
--    (वही trigger-नाम trg_guard_order_status, इसलिए दोहरा trigger नहीं बनता)
--    ⚠️ पहले मालिक (owner) बंद ऑर्डर वापस खोल सकता था (M4) — अब डिलीवर/रद्द ऑर्डर सबके लिए लॉक हैं।
-- ---------------------------------------------------------
create or replace function guard_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  ok boolean;
begin
  -- स्थिति नहीं बदली: रद्दीकरण के कॉलम सिर्फ़ सर्वर-रास्ते बदल सकते हैं (एडमिन नहीं)
  if new.order_status is not distinct from old.order_status then
    if v_uid is not null and (
         new.cancel_reason is distinct from old.cancel_reason
      or new.cancelled_at  is distinct from old.cancelled_at
      or new.cancelled_by  is distinct from old.cancelled_by) then
      raise exception 'CANCEL_FIELDS_LOCKED';
    end if;
    return new;
  end if;

  -- वैध बदलाव की सूची
  ok := case
    when old.order_status in ('नया ऑर्डर', 'भुगतान सफल')
         and new.order_status in ('स्वीकार किया गया', 'रद्द') then true
    when old.order_status = 'स्वीकार किया गया'
         and new.order_status in ('सामान तैयार हो रहा है', 'रद्द') then true
    when old.order_status = 'सामान तैयार हो रहा है'
         and new.order_status in ('डिलीवरी के लिए निकल गया', 'रद्द') then true
    when old.order_status = 'डिलीवरी के लिए निकल गया'
         and new.order_status = 'डिलीवरी पूरी हुई' then true
    -- सिर्फ़ भरोसेमंद सर्वर-रास्ते (लॉग-इन एडमिन नहीं):
    when v_uid is null and old.order_status = 'नया ऑर्डर' and new.order_status = 'भुगतान सफल' then true
    when v_uid is null and old.order_status = 'स्वीकार किया गया'
         and new.order_status = 'डिलीवरी के लिए निकल गया' and new.delivery_boy_id is not null then true
    else false end;

  if not ok then
    raise exception 'INVALID_TRANSITION';
  end if;

  if new.order_status = 'रद्द' then
    if v_uid is not null then
      -- एडमिन: कारण ज़रूरी; रद्द करने वाला और समय सर्वर तय करता है (क्लाइंट का भेजा मान नहीं माना जाता)
      new.cancel_reason := left(btrim(coalesce(new.cancel_reason, '')), 500);
      if new.cancel_reason = '' then
        raise exception 'CANCEL_REASON_REQUIRED';
      end if;
      new.cancelled_by := v_uid;
    else
      new.cancel_reason := coalesce(nullif(left(btrim(coalesce(new.cancel_reason, '')), 500), ''), 'सिस्टम द्वारा रद्द');
    end if;
    new.cancelled_at := now();
  else
    -- रद्द नहीं हो रहा: रद्दीकरण के कॉलम खाली रहें
    new.cancel_reason := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_order_status on orders;
create trigger trg_guard_order_status
  before update of order_status, cancel_reason, cancelled_at, cancelled_by on orders
  for each row execute function guard_order_status();

-- ---------------------------------------------------------
-- 4. इतिहास — AFTER trigger: बदलाव सफल होने पर ही दर्ज (रोलबैक होने पर इतिहास भी नहीं बनता)
-- ---------------------------------------------------------
create or replace function log_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into order_status_history (order_id, old_status, new_status, changed_by, change_reason)
  values (new.id, old.order_status, new.order_status, auth.uid(),
          case when new.order_status = 'रद्द' then new.cancel_reason else null end);
  return new;
end $$;

drop trigger if exists trg_log_order_status_change on orders;
create trigger trg_log_order_status_change
  after update of order_status on orders
  for each row when (old.order_status is distinct from new.order_status)
  execute function log_order_status_change();

-- ---------------------------------------------------------
-- 5. एडमिन के लिए सुरक्षित RPC: ताला (row lock) + stale-जाँच + स्थिति बदलाव एक साथ
--    p_expected_status = वह स्थिति जो एडमिन की स्क्रीन पर दिख रही थी।
--    अगर तब तक किसी और ने (दूसरा एडमिन / डिलीवरी बॉय) स्थिति बदल दी हो → {ok:false, error:'STALE', current:...}
--    बाकी जाँच (वैध बदलाव, कारण, रद्द करने वाला) trigger करता है — सीधे API से भी वही नियम।
-- ---------------------------------------------------------
create or replace function admin_set_order_status(
  p_order_id uuid, p_expected_status text, p_new_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  if auth.uid() is null or not is_admin() then
    raise exception 'UNAUTHORIZED';
  end if;
  select order_status into cur from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if cur is distinct from p_expected_status then
    return jsonb_build_object('ok', false, 'error', 'STALE', 'current', cur);
  end if;
  update orders
     set order_status = p_new_status,
         cancel_reason = case when p_new_status = 'रद्द' then p_reason else null end
   where id = p_order_id;
  return jsonb_build_object('ok', true, 'status', p_new_status);
end $$;
revoke all on function admin_set_order_status(uuid, text, text, text) from public, anon;
grant execute on function admin_set_order_status(uuid, text, text, text) to authenticated;
