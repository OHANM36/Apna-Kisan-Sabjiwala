-- =========================================================
-- अपना किसान सब्ज़ीवाला - डिलीवरी बॉय (PIN लॉगिन) + ग्राहक डिलीवरी-कन्फर्मेशन पिन मॉड्यूल
-- अगर आपने पहले से schema.sql चला रखी है, तो सिर्फ यह फाइल
-- Supabase Dashboard > SQL Editor में चलाएं। यह दोबारा चलाने के लिए भी सुरक्षित है।
-- =========================================================

-- डिलीवरी बॉय टेबल: हर एंट्री का अपना 4 अंकों का पिन होता है, जिससे वो
-- /delivery पैनल में लॉगिन करता है (ईमेल/पासवर्ड की ज़रूरत नहीं)
create table if not exists delivery_boys (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  pin text not null,               -- 4 अंकों का पिन (जैसे: 1234)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- एक समय पर दो सक्रिय डिलीवरी बॉय का एक जैसा पिन नहीं हो सकता (लॉगिन में गड़बड़ी से बचने के लिए)
create unique index if not exists idx_delivery_boys_active_pin
  on delivery_boys(pin) where is_active = true;

-- ऑर्डर को यह पता चले कि कौन सा डिलीवरी बॉय उसे डिलीवर कर रहा है
alter table orders add column if not exists delivery_boy_id uuid references delivery_boys(id) on delete set null;
create index if not exists idx_orders_delivery_boy on orders(delivery_boy_id);

-- =========================================================
-- ग्राहक डिलीवरी-कन्फर्मेशन पिन: हर ऑर्डर पर 4 अंकों का रैंडम पिन,
-- ग्राहक ऑर्डर कन्फर्मेशन पेज पर देखता है, डिलीवरी बॉय को सामान लेते वक्त बताता है
-- =========================================================
alter table orders add column if not exists delivery_pin text;

create or replace function generate_delivery_pin()
returns trigger as $$
begin
  if new.delivery_pin is null then
    new.delivery_pin := lpad(floor(random() * 10000)::text, 4, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_delivery_pin on orders;
create trigger trg_delivery_pin before insert on orders
  for each row execute function generate_delivery_pin();

-- पहले से मौजूद (अधूरे) ऑर्डर्स को भी पिन दे दें
update orders set delivery_pin = lpad(floor(random() * 10000)::text, 4, '0') where delivery_pin is null;

-- =========================================================
-- RLS: डिलीवरी बॉय सुरक्षा
-- ध्यान दें: यह पिन-लॉगिन बाकी पैनल जैसा Supabase Auth (auth.users) इस्तेमाल नहीं करता,
-- इसलिए PIN का मिलान/ऑर्डर स्टेटस बदलना ऐप के anon key से ही होता है (App-level PIN gate),
-- ठीक उसी तरह जैसे इस ऐप में ग्राहक का ऑर्डर बनाना/पढ़ना पहले से काम करता है।
-- असली गोपनीय जानकारी (जैसे पेमेंट) इस टेबल में कभी न रखें।
-- =========================================================
alter table delivery_boys enable row level security;

drop policy if exists "delivery_boys_public_read" on delivery_boys;
create policy "delivery_boys_public_read" on delivery_boys for select using (true);

drop policy if exists "delivery_boys_admin_write" on delivery_boys;
create policy "delivery_boys_admin_write" on delivery_boys for insert with check (is_admin());

drop policy if exists "delivery_boys_admin_update" on delivery_boys;
create policy "delivery_boys_admin_update" on delivery_boys for update using (is_admin());

drop policy if exists "delivery_boys_admin_delete" on delivery_boys;
create policy "delivery_boys_admin_delete" on delivery_boys for delete using (is_admin());

-- डिलीवरी बॉय को इन स्टेटस के बीच ऑर्डर को आगे बढ़ाने (और delivery_boy_id सेट करने) की अनुमति
drop policy if exists "orders_delivery_update" on orders;
create policy "orders_delivery_update" on orders for update using (
  order_status in ('स्वीकार किया गया','सामान तैयार हो रहा है','डिलीवरी के लिए निकल गया')
) with check (
  order_status in ('सामान तैयार हो रहा है','डिलीवरी के लिए निकल गया','डिलीवरी पूरी हुई')
);

-- =========================================================
-- पूर्ण। अब एडमिन पैनल में जाएं: /admin/delivery-boys
-- वहाँ से नया डिलीवरी बॉय जोड़ें (नाम + 4 अंकों का पिन), फिर वह
-- /delivery पर जाकर उसी पिन से लॉगिन कर सकेगा।
--
-- ग्राहक को उसका डिलीवरी-कन्फर्मेशन पिन ऑर्डर कन्फर्मेशन पेज पर दिखेगा।
-- डिलीवरी बॉय "डिलीवर हो गया" दबाने पर वही पिन ग्राहक से पूछकर डालेगा।
-- =========================================================
