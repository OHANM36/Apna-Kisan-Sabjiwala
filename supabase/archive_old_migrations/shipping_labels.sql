-- शिपिंग/डिलीवरी लेबल प्रिंट — बैग की संख्या + प्रिंट की गिनती
-- Supabase SQL editor में एक बार चलाएँ (दोबारा चलाना सुरक्षित है)।
-- ज़रूरी नहीं: बिना इसके भी लेबल छपते हैं (बैग = 1 मानकर); यह सिर्फ़ बैग-संख्या और "कितनी बार छपा" सहेजता है।
-- ⚠️ यह ऑर्डर की स्थिति (order_status), भुगतान या डिलीवरी को कभी नहीं बदलता।

alter table orders add column if not exists bag_count integer not null default 1;
alter table orders add column if not exists label_print_count integer not null default 0;
alter table orders add column if not exists label_last_printed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'orders'::regclass and conname = 'orders_bag_count_check') then
    alter table orders add constraint orders_bag_count_check check (bag_count >= 1 and bag_count <= 20);
  end if;
end $$;

-- सिर्फ़ एडमिन। सिर्फ़ तीन कॉलम बदलता है; order_status/cancel_* कॉलम नहीं छूता, इसलिए
-- trg_guard_order_status (before update of order_status, ...) चलता ही नहीं और इतिहास में कोई नई स्थिति दर्ज नहीं होती।
create or replace function admin_record_label_print(p_order_ids uuid[], p_bag_counts jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'NOT_ALLOWED'; end if;
  update orders o set
    label_print_count = o.label_print_count + 1,
    label_last_printed_at = now(),
    bag_count = case
      when coalesce(p_bag_counts, '{}'::jsonb) ? o.id::text
        then least(greatest((p_bag_counts ->> o.id::text)::int, 1), 20)
      else o.bag_count end
  where o.id = any(p_order_ids);
end $$;

revoke all on function admin_record_label_print(uuid[], jsonb) from public, anon;
grant execute on function admin_record_label_print(uuid[], jsonb) to authenticated;
