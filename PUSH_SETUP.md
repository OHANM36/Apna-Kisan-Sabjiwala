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
