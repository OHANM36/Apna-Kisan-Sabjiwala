# 🚀 अपना किसान सब्ज़ीवाला — नई इंस्टॉलेशन की पूरी गाइड (हिंदी)

यह गाइड **खाली Supabase प्रोजेक्ट** से लेकर **लाइव वेबसाइट** तक सब कुछ क्रम से बताती है।
हर चरण के अंत में ✅ "जाँच" है — आगे बढ़ने से पहले उसे ज़रूर करें।

> **पूरा डेटाबेस अब सिर्फ़ एक फ़ाइल है: `supabase/full_schema.sql`.**
> पुरानी 12 अलग-अलग माइग्रेशन फ़ाइलें `supabase/archive_old_migrations/` में सिर्फ़ संदर्भ के लिए रखी हैं — उन्हें न चलाएँ।

---

## 📋 पूरा क्रम एक नज़र में

| # | काम | कहाँ |
|---|---|---|
| 0 | खाते और टूल तैयार करना | Supabase, Vercel, Razorpay, Google Cloud |
| 1 | कोड तैयार + जाँच | आपका कंप्यूटर |
| 2 | Supabase प्रोजेक्ट बनाना | supabase.com |
| 3 | **डेटाबेस: `full_schema.sql` चलाना** | SQL Editor |
| 4 | पहला एडमिन (मालिक) बनाना | Auth + SQL Editor |
| 5 | Razorpay सेटअप | razorpay.com |
| 6 | Edge Functions + secrets | Supabase CLI |
| 7 | Web Push (नोटिफ़िकेशन) | VAPID keys + SQL |
| 8 | Razorpay Webhook जोड़ना | Razorpay Dashboard |
| 9 | वेबसाइट deploy (Vercel) | Vercel |
| 10 | एडमिन पैनल की पहली सेटिंग | `/admin` |
| 11 | पूरा टेस्ट (चेकलिस्ट) | फ़ोन + कंप्यूटर |
| 12 | असली (Live) भुगतान चालू करना | Razorpay Live |

---

## 0) पहले से तैयार रखें

- **Node.js 20 या नया** (`node -v` से देखें) — https://nodejs.org
- **खाते (मुफ़्त से शुरू कर सकते हैं):**
  - Supabase — https://supabase.com
  - Vercel (या Netlify) — https://vercel.com (कोड GitHub पर रखना आसान रहता है)
  - Razorpay — https://razorpay.com (Live के लिए KYC चाहिए; शुरुआत Test Mode से)
  - Google Cloud (**वैकल्पिक**) — सिर्फ़ "AI ऑर्डर असिस्टेंट" और आवाज़ से ऑर्डर के लिए
- **Supabase CLI** (Edge Functions के लिए):
  ```bash
  npm install -g supabase
  supabase --version
  ```

---

## 1) कोड तैयार करें और जाँचें

```bash
unzip apna-kisan-sabjiwala-fresh-install.zip
cd Apna-Kisan-Sabjiwala-main        # (फ़ोल्डर का नाम जो भी बने)
npm install
npm test                             # सारे टेस्ट पास होने चाहिए
npm run build                        # "built in ..." आना चाहिए
```
✅ **जाँच:** `npm test` में `fail 0` और `npm run build` में कोई error नहीं।

---

## 2) Supabase प्रोजेक्ट बनाएँ

1. https://supabase.com → **New project**।
2. नाम: `apna-kisan-sabjiwala`; **Region: South Asia (Mumbai)** (भारत के ग्राहकों के लिए सबसे तेज़)।
3. **Database Password** मज़बूत रखें और कहीं सुरक्षित लिख लें।
4. प्रोजेक्ट बनने के बाद **Project Settings → API** से ये तीन चीज़ें नोट करें:

| क्या | कहाँ इस्तेमाल होगा | गोपनीय? |
|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | वेबसाइट `.env` | नहीं |
| **anon public key** | वेबसाइट `.env` | नहीं (ब्राउज़र में दिखती है) |
| **service_role key** | **कहीं नहीं डालनी** (Edge Functions में Supabase खुद देता है) | 🔴 **बिलकुल गोपनीय** |

5. **Project Ref** भी नोट करें (URL का `xxxx` हिस्सा) — CLI में चाहिए।

---

## 3) डेटाबेस बनाएँ — सिर्फ़ एक फ़ाइल

1. Supabase Dashboard → **SQL Editor → New query**।
2. `supabase/full_schema.sql` की **पूरी** सामग्री कॉपी करके पेस्ट करें (फ़ाइल बड़ी है, लगभग 3,300 लाइन — पूरी पेस्ट होने दें)।
3. **Run** दबाएँ। 10–30 सेकंड लगेंगे। नीचे **Success** दिखना चाहिए (NOTICE संदेश सामान्य हैं)।

यह फ़ाइल अपने-आप बनाती है: सारी टेबल, सुरक्षा नियम (RLS), ऑर्डर बनाने/भुगतान/डिलीवरी के सुरक्षित फ़ंक्शन, COD, ऑर्डर-स्थिति नियम और इतिहास, शिपिंग लेबल, Push की टेबल, `vegetable-images` फोटो-बकेट (Public, 2 MB, jpeg/png/webp), और 8 डेमो श्रेणियाँ + 10 डेमो सब्ज़ियाँ।

> दोबारा चलाना सुरक्षित है (idempotent) — कुछ दोहराया नहीं जाता।

✅ **जाँच (SQL Editor में चलाएँ):**
```sql
select count(*) as tables  from information_schema.tables where table_schema = 'public';   -- ≈ 31
select count(*) as veg      from vegetables;                                                -- 10
select id, public from storage.buckets;                                                     -- vegetable-images | true
```
अगर bucket नहीं दिखा: Dashboard → **Storage → New bucket** → नाम `vegetable-images` → **Public** ✅ → फिर `full_schema.sql` दोबारा चलाएँ (ताकि फोटो-अपलोड की नीतियाँ लगें)।

### 3क) (वैकल्पिक) अपनी असली सब्ज़ी-सूची
डेमो सब्ज़ियों की जगह अपनी सूची चाहिए तो `supabase/seed_vegetables_optional.sql` खोलकर नाम/कीमतें अपने हिसाब से बदलें और चलाएँ। **या** इसे छोड़कर बाद में एडमिन पैनल → *सब्ज़ियाँ* से जोड़ें।

### 3ख) (वैकल्पिक पर सलाह-योग्य) अटके हुए अनपेड ऑर्डर अपने-आप रद्द
1. Dashboard → **Database → Extensions** → `pg_cron` चालू करें।
2. SQL Editor में:
```sql
select cron.schedule('cancel-stale-orders', '0 * * * *', $$select cancel_stale_unpaid_orders(3)$$);
```
(हर घंटे, 3 घंटे से पुराने बिना-भुगतान ऑनलाइन ऑर्डर रद्द होंगे; COD ऑर्डर नहीं छुए जाते।)

---

## 4) पहला एडमिन (मालिक) बनाएँ

1. Dashboard → **Authentication → Users → Add user → Create new user**
   - Email और मज़बूत Password डालें; **Auto Confirm User** ✅ चालू रखें।
2. बने हुए यूज़र की **User UID** कॉपी करें।
3. SQL Editor में (UID, नाम, फ़ोन अपना डालें):
```sql
insert into admin_users (id, full_name, phone, role)
values ('यहाँ-UID-पेस्ट-करें', 'आपका नाम', '98XXXXXXXX', 'admin');
```
- `role = 'admin'` = **मालिक (owner)** — कीमत/मुनाफ़ा/कूपन/भुगतान-सेटिंग सिर्फ़ यही देख-बदल सकता है।
- स्टाफ के लिए यही करें पर `role = 'staff'` रखें (स्टाफ मालिक के हिसाब नहीं देख सकता)।

### Auth की सेटिंग
**Authentication → URL Configuration:** *Site URL* में अपनी वेबसाइट का पता (जैसे `https://aapkadomain.com`) डालें। (Vercel का पता मिलने के बाद चरण 9 में यह दोबारा भरें।)

> सेलर (विक्रेता) खुद साइन-अप करते हैं और एडमिन पैनल → *विक्रेता* से **अप्रूव** होने तक काम नहीं कर सकते। अगर *Confirm email* चालू है तो सेलर को ईमेल-पुष्टि भी करनी होगी।

---

## 5) Razorpay (ऑनलाइन भुगतान)

1. Razorpay Dashboard में **Test Mode** चालू रखें।
2. **Settings → API Keys → Generate Test Key**: `Key Id` (`rzp_test_...`) और `Key Secret` नोट करें।
3. Key Secret **कभी** कोड/Git/`.env` में न डालें — सिर्फ़ चरण 6 के Supabase secrets में।
4. Webhook बाद में (चरण 8) बनेगा।

---

## 6) Edge Functions और secrets

### 6क) CLI से जुड़ें
```bash
supabase login
cd Apna-Kisan-Sabjiwala-main
# अगर supabase/config.toml नहीं है तो एक बार:
supabase init                       # सवाल पूछे तो "N" चुनें; मौजूदा functions/ फ़ोल्डर नहीं छूता
supabase link --project-ref <PROJECT-REF>
```

### 6ख) Google API key (वैकल्पिक — AI ऑर्डर असिस्टेंट के लिए)
Google Cloud Console में नया प्रोजेक्ट → **APIs & Services** में **Generative Language API (Gemini)** और **Cloud Speech-to-Text API** चालू करें → **Credentials → API key** बनाएँ। (Billing जुड़ी होनी चाहिए; इस key पर इन्हीं दो API की पाबंदी लगा दें।)
इसके बिना ऐप चलता है, बस AI/आवाज़ वाला ऑर्डर बटन काम नहीं करेगा।

### 6ग) Secrets सेट करें (एक बार)
`ALLOWED_ORIGINS` में अपनी वेबसाइट का पता डालें (कई हों तो कॉमा से अलग)। यह खाली रहा तो CORS सबके लिए खुला रहता है — Live पर ज़रूर भरें।
```bash
supabase secrets set \
  RAZORPAY_KEY_ID="rzp_test_xxxxxxxx" \
  RAZORPAY_KEY_SECRET="xxxxxxxxxxxxxxxx" \
  RAZORPAY_WEBHOOK_SECRET="कोई-लंबा-रैंडम-टेक्स्ट-1" \
  GOOGLE_API_KEY="AIza..." \
  ALLOWED_ORIGINS="https://aapkadomain.com"
```
`RAZORPAY_WEBHOOK_SECRET` आप खुद गढ़ते हैं (कम से कम 24 अक्षर) — वही चरण 8 में Razorpay में भी डालना है।

### 6घ) Functions deploy करें
```bash
# JWT-जाँच वाले (ग्राहक का ब्राउज़र बुलाता है):
supabase functions deploy parse-order
supabase functions deploy speech-to-text
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment

# बिना JWT (बाहर से / database से बुलाए जाते हैं; अपनी गुप्त कुंजी से सुरक्षित):
supabase functions deploy razorpay-webhook     --no-verify-jwt
supabase functions deploy send-order-push      --no-verify-jwt
supabase functions deploy send-customer-push   --no-verify-jwt
```
✅ **जाँच:** Dashboard → **Edge Functions** में सातों दिखें और *Active* हों।

---

## 7) Web Push नोटिफ़िकेशन (एडमिन: नया ऑर्डर · ग्राहक: स्थिति बदली)

### 7क) VAPID keys बनाएँ
```bash
npx web-push generate-vapid-keys
```
**Public** और **Private** key मिलेंगी। Private key किसी को न दें।

### 7ख) Edge secrets
```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="<public>" \
  VAPID_PRIVATE_KEY="<private>" \
  VAPID_SUBJECT="mailto:aapka-email@example.com" \
  PUSH_WEBHOOK_SECRET="कोई-लंबा-रैंडम-टेक्स्ट-2"
```
(Functions ऊपर चरण 6घ में deploy हो चुके हैं। secrets बदलने के बाद functions दोबारा deploy करना ज़रूरी नहीं।)

### 7ग) Database को function का पता बताएँ
SQL Editor में (अपना `<PROJECT-REF>` और वही `PUSH_WEBHOOK_SECRET` डालकर):
```sql
insert into push_config (key, value) values
  ('function_url',          'https://<PROJECT-REF>.supabase.co/functions/v1/send-order-push'),
  ('customer_function_url', 'https://<PROJECT-REF>.supabase.co/functions/v1/send-customer-push'),
  ('secret',                '<वही PUSH_WEBHOOK_SECRET>')
on conflict (key) do update set value = excluded.value;
```
✅ **जाँच:** `select key from push_config;` में तीनों `function_url`, `customer_function_url`, `secret` दिखें।

> फ़ोन पर चालू करने के तरीके: एडमिन → पैनल का *"नोटिफ़िकेशन चालू करें"* कार्ड; ग्राहक → ऑर्डर-पेज का *"🔔 सूचना चालू करें"* कार्ड। iPhone पर iOS 16.4+ और ऐप को *Add to Home Screen* करके खोलना ज़रूरी है। Push सिर्फ़ HTTPS वाली deploy की हुई साइट पर चलता है, `npm run dev` पर नहीं।

---

## 8) Razorpay Webhook

1. Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**।
2. **URL:** `https://<PROJECT-REF>.supabase.co/functions/v1/razorpay-webhook`
3. **Secret:** वही `RAZORPAY_WEBHOOK_SECRET` जो चरण 6ग में डाला।
4. **Events:** `payment.captured` और `order.paid` ✅
5. Save करें।

(यही वह रास्ता है जिससे भुगतान "सफल" दर्ज होता है, चाहे ग्राहक भुगतान के बाद ब्राउज़र बंद कर दे।)

---

## 9) वेबसाइट deploy (Vercel)

### 9क) Environment variables
| नाम | मान |
|---|---|
| `VITE_SUPABASE_URL` | Project URL (चरण 2) |
| `VITE_SUPABASE_ANON_KEY` | anon public key (चरण 2) |
| `VITE_VAPID_PUBLIC_KEY` | चरण 7क की **Public** key |
| `VITE_BUSINESS_NAME` | जैसे `Apna Kisan Sabjiwala` |
| `VITE_BUSINESS_WHATSAPP` | `91XXXXXXXXXX` (देश-कोड सहित, बिना +) |
| `VITE_MIN_ORDER_VALUE` | जैसे `199` |
| `VITE_DELIVERY_FEE` | जैसे `20` |

`VITE_RAZORPAY_KEY_ID` की ज़रूरत नहीं — Razorpay key अब सर्वर से आती है। **service_role key या कोई private key यहाँ न डालें।**

### 9ख) Vercel पर
1. कोड GitHub पर डालें (`.env` और `node_modules` अपने-आप `.gitignore` में हैं)।
2. Vercel → **Add New → Project** → वह repo चुनें।
3. Framework: **Vite** (अपने-आप पहचान लेगा) · Build: `npm run build` · Output: `dist`।
4. ऊपर की सारी variables जोड़ें → **Deploy**।
5. मिला हुआ पता (`https://xxxx.vercel.app`) या अपना डोमेन (**Settings → Domains**) चरण 4 की *Site URL* में और चरण 6ग के `ALLOWED_ORIGINS` में भी डालें:
   ```bash
   supabase secrets set ALLOWED_ORIGINS="https://aapkadomain.com,https://xxxx.vercel.app"
   ```
6. variables बदलने पर Vercel में **Redeploy** करें (`VITE_` वाले मान build के समय जुड़ते हैं)।

(`vercel.json` में सुरक्षा headers और पेज-redirect पहले से हैं। Netlify पर भी चलेगा — `public/_redirects` मौजूद है।)

✅ **जाँच:** साइट खुले, सब्ज़ियाँ दिखें, फ़ोन पर *"ऐप इंस्टॉल करें"* विकल्प आए।

---

## 10) एडमिन पैनल की पहली सेटिंग

`https://आपकी-साइट/admin/login` पर चरण 4 की ईमेल-पासवर्ड से लॉगिन करें, फिर:

1. **दुकान का नाम / WhatsApp / न्यूनतम ऑर्डर / डिलीवरी शुल्क** — SQL Editor में:
   ```sql
   update delivery_settings set
     business_name = 'आपकी दुकान का नाम',
     business_whatsapp = '91XXXXXXXXXX',
     min_order_value = 199,
     delivery_fee = 20
   where id = 1;
   ```
2. **श्रेणियाँ → सब्ज़ियाँ**: डेमो हटाकर/बदलकर अपनी सब्ज़ियाँ, फोटो और कीमतें डालें। रोज़ की कीमतें *कीमतें बदलें* या *आज के भाव* (मालिक) से।
3. **भुगतान विकल्प (COD)** (मालिक): COD चालू/बंद, अधिकतम राशि-सीमा, और **दुकान का UPI ID** (जैसे `dukaan@okaxis`) — "डिलीवरी पर UPI" QR के लिए।
4. **डिलीवरी बॉय**: नया बॉय जोड़ें, उसे उसकी **PIN** दें → वह `/delivery/login` से अपने ऑर्डर देखता है।
5. **विक्रेता** (अगर मल्टी-वेंडर चलाते हैं): साइन-अप किए सेलर को अप्रूव करें।
6. **कूपन/ऑफर**, **स्वागत पॉपअप** — ज़रूरत हो तो।
7. अपने फ़ोन में एडमिन पैनल खोलकर **"नोटिफ़िकेशन चालू करें"** दबाएँ (Allow)।

---

## 11) पूरा टेस्ट — यह चेकलिस्ट पूरी करके ही Live जाएँ

फ़ोन पर Test Mode में:

- [ ] **ऑनलाइन ऑर्डर:** सब्ज़ी जोड़ें → चेकआउट → Razorpay Test कार्ड/UPI (`success@razorpay`) → ऑर्डर "भुगतान सफल" हुआ (webhook से)।
- [ ] **COD:** (पहले एडमिन में COD चालू करें) COD ऑर्डर बनता है; Razorpay नहीं खुलता।
- [ ] **एडमिन push:** ऑर्डर देते ही एडमिन के फ़ोन/कंप्यूटर पर 🆕 नोटिफ़िकेशन आता है, और एडमिन पैनल खुला हो तो नए-ऑर्डर की धुन बजती है।
- [ ] **ग्राहक push:** ऑर्डर-पेज पर "🔔 सूचना चालू करें" → Allow → एडमिन से स्थिति बदलें (स्वीकार → तैयारी → निकला…) → ग्राहक के फ़ोन पर हर बार सूचना।
- [ ] **डिलीवरी बॉय:** `/delivery/login` से PIN-लॉगिन → ऑर्डर उठाए → ग्राहक की PIN से "डिलीवरी पूरी" → ऑर्डर बंद और (COD हो तो) भुगतान दर्ज।
- [ ] **रद्द:** एडमिन कारण के साथ ऑर्डर रद्द कर पाए; "निकल गया" के बाद रद्द न हो पाए।
- [ ] **सुरक्षा:** लॉग-आउट (बिना लॉगिन) ब्राउज़र में खोलकर किसी और का ऑर्डर देखने की कोशिश — नहीं दिखना चाहिए।
- [ ] **लेबल प्रिंट**, **रिपोर्ट** पेज खुलते हैं।

---

## 12) असली (Live) भुगतान चालू करना

1. Razorpay में KYC पूरा करें → **Live Mode** → नई *Live* `Key Id` / `Key Secret`।
2. Live के लिए **नया Webhook** (चरण 8 जैसा) बनाएँ, नया secret रखें।
3. Secrets बदलें:
   ```bash
   supabase secrets set RAZORPAY_KEY_ID="rzp_live_xxx" RAZORPAY_KEY_SECRET="xxx" RAZORPAY_WEBHOOK_SECRET="नया-secret"
   ```
4. `ALLOWED_ORIGINS` में सिर्फ़ असली डोमेन रखें।
5. `vercel.json` में `Content-Security-Policy-Report-Only` है। Live पर कुछ दिन ब्राउज़र console में उल्लंघन न दिखें तो इसे `Content-Security-Policy` कर दें।
6. Supabase **Database → Backups** देखें (Pro प्लान में रोज़ का बैकअप); मुफ़्त प्लान पर समय-समय पर डेटा export करें।

---

## 🛠️ समस्या-समाधान

| लक्षण | कारण / उपाय |
|---|---|
| SQL Editor में `permission denied for extension` / pg_net | Dashboard → Database → Extensions में `pg_net` चालू करके `full_schema.sql` दोबारा चलाएँ |
| साइट पर सब्ज़ियाँ नहीं दिखतीं | `.env`/Vercel में `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` गलत; Redeploy करें |
| एडमिन लॉगिन के बाद "अनुमति नहीं" | `admin_users` में पंक्ति नहीं डाली (चरण 4) या UID गलत |
| फोटो अपलोड नहीं होती | bucket `vegetable-images` (Public) नहीं है → चरण 3 की जाँच |
| भुगतान हो गया पर ऑर्डर "लंबित" | Webhook नहीं जुड़ा / secret मेल नहीं खाता → चरण 8; Dashboard → Edge Functions → `razorpay-webhook` → Logs |
| Razorpay खुलता ही नहीं | `create-razorpay-order` deploy नहीं हुआ या `RAZORPAY_KEY_ID/SECRET` secret गलत; उसके Logs देखें |
| AI / आवाज़ ऑर्डर नहीं चलता | `GOOGLE_API_KEY` नहीं/गलत, या दोनों Google API चालू नहीं |
| एडमिन/ग्राहक push नहीं आता | (1) `VITE_VAPID_PUBLIC_KEY` डालकर Redeploy किया? (2) `push_config` की तीन पंक्तियाँ (चरण 7ग) (3) `send-order-push` / `send-customer-push` Logs (4) ब्राउज़र में Notifications Allow? (5) iPhone पर Home Screen से खोला? |
| `INVALID_TRANSITION` error | ऑर्डर-स्थिति सिर्फ़ आगे बढ़ती है (नया → स्वीकार → तैयार → निकला → पूरा); पूरा/रद्द ऑर्डर बदला नहीं जा सकता — यह जानबूझकर है |
| CORS error ब्राउज़र console में | `ALLOWED_ORIGINS` में आपका डोमेन (https:// सहित, अंत में `/` नहीं) जोड़ें |
| "schema cache" / कॉलम नहीं मिला | SQL Editor में `notify pgrst, 'reload schema';` चलाएँ |

---

## 🔐 सुरक्षा याद-दिहानी

- `service_role` key, `RAZORPAY_KEY_SECRET`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GOOGLE_API_KEY` — **सिर्फ़ Supabase secrets में**; Git, `.env`, WhatsApp/ईमेल में कभी नहीं।
- अगर कोई secret लीक हो जाए तो उसे तुरंत बदलें (Razorpay/Google में नई key बनाकर `supabase secrets set` से)।
- एडमिन का पासवर्ड मज़बूत रखें; स्टाफ को `role = 'staff'` ही दें।

## 🔄 आगे अपडेट कैसे करें

- **कोड बदलने पर:** GitHub पर push करें → Vercel अपने-आप deploy करेगा।
- **Edge Function बदलने पर:** `supabase functions deploy <नाम>` (ऊपर के flags के साथ)।
- **डेटाबेस में नया बदलाव:** `full_schema.sql` को असली DB पर दोबारा न चलाएँ; नया बदलाव एक अलग छोटी SQL फ़ाइल में लिखकर SQL Editor में चलाएँ, और नई इंस्टॉलेशन के लिए उसे `full_schema.sql` में भी जोड़ दें।
- **टेस्ट:** `supabase/tests/` की SQL फ़ाइलें सिर्फ़ *टेस्ट डेटाबेस* के लिए हैं (असली DB पर नहीं)।
