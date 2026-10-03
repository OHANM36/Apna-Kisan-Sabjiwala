-- =========================================================
-- डिलीवरी बॉय के पेज को ऑर्डर की डिलीवरी-तारीख भी मिले (delivery_orders में delivery_date जोड़ा)
--
-- क्यों: "रास्ते वाले ऑर्डर" सुविधा सिर्फ़ उसी तारीख और उसी स्लॉट के ऑर्डर साथ दिखाती है।
--       यह फ़ाइल न चलाएँ तो भी सुविधा चलती है, पर तब सिर्फ़ स्लॉट मिलाया जाता है (तारीख नहीं)।
--
-- कब चलाएँ: ... → security_hardening.sql → cod_payment.sql → pay_online_on_delivery.sql → **यह फ़ाइल**।
--           (दोबारा चलाना सुरक्षित है; बदलाव सिर्फ़ एक कॉलम जोड़ना है)
--           ध्यान: pay_online_on_delivery.sql / cod_payment.sql / security_hardening.sql कभी दोबारा चलाएँ तो इसे उनके बाद फिर चलाएँ।
-- =========================================================

create or replace function delivery_orders(p_token text, p_tab text)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare v uuid := aks_delivery_boy_from_token(p_token);
begin
  if v is null then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc) from (
      select o.id, o.order_number, o.customer_name, o.customer_phone, o.full_address, o.mohalla, o.city, o.pincode,
             o.delivery_date, o.delivery_time_slot, o.extra_notes, o.latitude, o.longitude, o.total_amount, o.payment_method, o.cod_pay_mode, o.payment_status, o.order_status, o.created_at,
             coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'vegetable_name', i.vegetable_name,
                         'quantity', i.quantity, 'unit', i.unit, 'item_total', i.item_total))
                       from order_items i where i.order_id = o.id), '[]'::jsonb) as order_items
      from orders o
      where case
        when p_tab = 'available' then o.order_status in ('स्वीकार किया गया', 'सामान तैयार हो रहा है') and o.delivery_boy_id is null
        when p_tab = 'mine'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी के लिए निकल गया'
        when p_tab = 'done'      then o.delivery_boy_id = v and o.order_status = 'डिलीवरी पूरी हुई'
        else false end
      order by o.created_at desc
      limit case when p_tab = 'done' then 20 else 100 end
    ) t), '[]'::jsonb);
end $$;
