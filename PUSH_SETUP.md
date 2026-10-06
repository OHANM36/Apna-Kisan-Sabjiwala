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
1. `supabase/push_notifications.sql` पूरी चलाएँ।
2. फिर अपने मान डालकर यह चलाएँ:
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

# ऑफर / कूपन सूचना (सभी इच्छुक ग्राहकों को) — सेटअप (एक बार)

VAPID keys और `VITE_VAPID_PUBLIC_KEY` ऊपर वाले ही हैं; नया secret नहीं चाहिए।

1. Supabase SQL Editor में `supabase/offer_push.sql` पूरी चलाएँ।
2. Edge Function डिप्लॉय करें (**`--no-verify-jwt` न लगाएँ** — यह मालिक के login से सुरक्षित है):
```bash
supabase functions deploy send-offer-push
```
3. वेबसाइट दोबारा deploy करें (sw.js में नया badge भी है)।

## कैसे चलता है
- **ग्राहक:** होम पेज पर "नए ऑफर की सूचना पाएँ" कार्ड → "ऑफर सूचना चालू करें" दबाए तो ही जुड़ता है। "बाद में" दबाने पर 7 दिन नहीं दिखता।
- **मालिक:** एडमिन → कूपन / ऑफर → किसी *चालू* कूपन पर **📣 सूचना भेजें** → संदेश जाँचें/बदलें → "सभी को भेजें"।
- सुरक्षा: सिर्फ़ मालिक (role = admin) भेज सकता है; स्टाफ़ नहीं। एक घंटे में अधिकतम 5 बार भेजा जा सकता है।
- जिन फ़ोनों ने अनुमति हटा दी, वे अपने-आप सूची से हट जाते हैं।

## टेस्ट
अपने फ़ोन से ग्राहक साइट खोलकर ऑफर सूचना चालू करें, फिर एडमिन से "सूचना भेजें" दबाएँ।
गिनती 0 दिखे तो कार्ड अभी किसी ने चालू नहीं किया। न आए तो Supabase → Edge Functions → `send-offer-push` → Logs देखें।
