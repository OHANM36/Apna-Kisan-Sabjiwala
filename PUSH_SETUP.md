# एडमिन Push नोटिफ़िकेशन — सेटअप (एक बार)

ऑर्डर बनते ही एडमिन के फ़ोन/कंप्यूटर पर नोटिफ़िकेशन आएगा, ऐप बंद हो तब भी।

## 1) VAPID keys बनाएँ
```bash
npx web-push generate-vapid-keys
```
**Public key** और **Private key** मिलेंगी। Private key किसी को न दें, कोड/Git में न डालें।

## 2) Supabase Edge secrets
```bash
supabase secrets set VAPID_PUBLIC_KEY="<public>" VAPID_PRIVATE_KEY="<private>" \
  VAPID_SUBJECT="mailto:aapka-email@example.com" PUSH_WEBHOOK_SECRET="<कोई लंबा रैंडम टेक्स्ट>"
```

## 3) Edge Function डिप्लॉय
```bash
supabase functions deploy send-order-push --no-verify-jwt
```

## 4) Database (SQL Editor)
1. `supabase/full_schema.sql` पहले ही चल चुकी है (उसमें push की टेबल/trigger शामिल हैं)।
2. अपने मान डालकर यह चलाएँ:
```sql
insert into push_config (key, value) values
  ('function_url', 'https://<PROJECT-REF>.supabase.co/functions/v1/send-order-push'),
  ('secret',       '<वही PUSH_WEBHOOK_SECRET>')
on conflict (key) do update set value = excluded.value;
```

## 5) वेबसाइट
`.env` / Vercel Environment Variables में `VITE_VAPID_PUBLIC_KEY=<public key>` जोड़कर दोबारा deploy करें।

## 6) हर डिवाइस पर
एडमिन पैनल खोलें → ऊपर का कार्ड **"नोटिफ़िकेशन चालू करें"** → ब्राउज़र पूछे तो **Allow**।

- **Android / Windows / Mac (Chrome, Edge, Firefox):** सीधे चलता है।
- **iPhone:** iOS 16.4+ चाहिए, और ऐप को Safari से *Add to Home Screen* करके वहीं से खोलना होगा।
- Push सिर्फ़ production build (deploy की हुई साइट, HTTPS) पर चलता है, `npm run dev` पर नहीं।

## टेस्ट
कोई टेस्ट ऑर्डर डालें। कुछ सेकंड में नोटिफ़िकेशन आना चाहिए। न आए तो Supabase Dashboard → Edge Functions → `send-order-push` → Logs देखें।

---

# ग्राहक Push नोटिफ़िकेशन — ऑर्डर की स्थिति बदलने पर (एक बार)

एडमिन/डिलीवरी बॉय/भुगतान — किसी भी रास्ते से ऑर्डर की स्थिति बदलते ही, जिस ग्राहक ने सूचना चालू की है उसके फ़ोन पर नोटिफ़िकेशन जाता है (ऐप बंद हो तब भी)।
VAPID keys और secrets ऊपर वाले ही हैं — नए बनाने की ज़रूरत नहीं।

## 1) Edge Function डिप्लॉय
```bash
supabase functions deploy send-customer-push --no-verify-jwt
```

## 2) Database (SQL Editor)
1. `supabase/full_schema.sql` में ग्राहक-push की टेबल/trigger पहले से शामिल हैं (अलग से कुछ चलाना नहीं)।
2. यह चलाएँ (अपना PROJECT-REF डालकर; `secret` ऊपर के चरण में रखा जा चुका है):
```sql
insert into push_config (key, value) values
  ('customer_function_url', 'https://<PROJECT-REF>.supabase.co/functions/v1/send-customer-push')
on conflict (key) do update set value = excluded.value;
```

## 3) वेबसाइट
कोड दोबारा deploy करें (`public/sw.js` भी बदला है)। `VITE_VAPID_PUBLIC_KEY` पहले से लगी है।

## ग्राहक के लिए
ऑर्डर देने के बाद ऑर्डर-पेज पर **"🔔 सूचना चालू करें"** कार्ड → ब्राउज़र पूछे तो **Allow**। एक बार चालू करने के बाद उसके अगले ऑर्डर अपने-आप जुड़ जाते हैं।
iPhone पर: iOS 16.4+ और ऐप *Add to Home Screen* करके वहीं से खोलना होगा।

## किन स्थितियों पर सूचना जाती है
भुगतान सफल · स्वीकार किया गया · सामान तैयार हो रहा है · डिलीवरी के लिए निकल गया · डिलीवरी पूरी हुई · रद्द (संदेश हिंदी/English, ग्राहक की चुनी भाषा में)।
"डिलीवरी के लिए निकल गया" की सूचना में, अगर ऑर्डर किसी डिलीवरी बॉय को सौंपा जा चुका है, तो उसका नाम और फ़ोन नंबर भी जाता है। फ़ोन नंबर नहीं भेजना हो तो `send-customer-push/index.ts` में `SHARE_DELIVERY_PHONE = false` करें।
संदेश बदलने हों तो `supabase/functions/send-customer-push/index.ts` में `MESSAGES` बदलकर फ़ंक्शन दोबारा deploy करें।

## टेस्ट
टेस्ट ऑर्डर दें → ऑर्डर-पेज पर सूचना चालू करें → एडमिन पैनल से स्थिति बदलें (जैसे "स्वीकार करें")। कुछ सेकंड में नोटिफ़िकेशन आना चाहिए।
न आए तो Supabase Dashboard → Edge Functions → `send-customer-push` → Logs देखें; और जाँचें कि `select * from customer_push_subscriptions;` में उस ऑर्डर की पंक्ति बनी है।
