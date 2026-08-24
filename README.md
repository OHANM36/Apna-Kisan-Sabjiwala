# 🥬 अपना किसान सब्ज़ीवाला — ऑनलाइन सब्ज़ी ऑर्डरिंग ऐप

एक पूरी तरह काम करने वाला ऑनलाइन सब्ज़ी बिक्री सिस्टम — React + Vite + Tailwind CSS + Supabase पर बना हुआ।
केवल **ऑनलाइन भुगतान** (UPI / कार्ड / नेट बैंकिंग) — Cash on Delivery कहीं भी नहीं है।

---

## 📁 प्रोजेक्ट में क्या है

```
apna-kisan-sabjiwala/
├── src/
│   ├── pages/          → ग्राहक के पेज (होम, कार्ट, चेकआउट, ऑर्डर इतिहास...)
│   ├── admin/           → एडमिन पैनल (लॉगिन, डैशबोर्ड, सब्ज़ी/ऑर्डर/ग्राहक प्रबंधन, रिपोर्ट)
│   ├── components/      → रीयूज़ेबल UI (Header, BottomNav, VegetableCard...)
│   ├── context/         → कार्ट, सेटिंग, एडमिन-ऑथ का React Context
│   └── utils/           → भुगतान, WhatsApp मैसेज, फॉर्मेटिंग हेल्पर
├── supabase/schema.sql   → पूरा डेटाबेस स्कीमा + RLS + डेमो डेटा
├── .env.example          → ज़रूरी एनवायरनमेंट वैरिएबल की लिस्ट
└── package.json
```

---

## 1️⃣ शुरुआत कैसे करें (लोकल पर चलाना)

```bash
npm install
cp .env.example .env
# अब .env फाइल में अपनी Supabase और Razorpay की जानकारी भरें (नीचे देखें)
npm run dev
```

ऐप `http://localhost:5173` पर खुलेगा।
एडमिन पैनल: `http://localhost:5173/admin/login`

---

## 2️⃣ Supabase सेटअप (डेटाबेस)

1. [supabase.com](https://supabase.com) पर मुफ़्त में एक नया प्रोजेक्ट बनाएं।
2. Supabase Dashboard में **SQL Editor** खोलें।
3. `supabase/schema.sql` फाइल की पूरी कॉपी वहां पेस्ट करके **Run** करें।
   - यह सभी टेबल, सुरक्षा नियम (RLS), और कुछ डेमो सब्ज़ियाँ/श्रेणियाँ अपने आप बना देगा।
4. **Project Settings → API** में जाकर:
   - `Project URL` कॉपी करें → `.env` में `VITE_SUPABASE_URL` में डालें
   - `anon public` key कॉपी करें → `.env` में `VITE_SUPABASE_ANON_KEY` में डालें

### फोटो अपलोड के लिए Storage Bucket बनाएं
1. Supabase Dashboard → **Storage** → **New bucket**
2. नाम रखें: `vegetable-images`
3. **Public bucket** को ✅ चालू करें (ताकि फोटो ऐप में दिख सकें)
4. Bucket बनाने के बाद भी अपलोड की अनुमति के लिए **SQL Editor** में यह ज़रूर चलाएं
   (Public toggle सिर्फ फोटो *देखने* की अनुमति देता है, *अपलोड* करने की अनुमति अलग से चाहिए):

```sql
create policy "Public read for vegetable-images"
on storage.objects for select
using (bucket_id = 'vegetable-images');

create policy "Authenticated upload for vegetable-images"
on storage.objects for insert
with check (bucket_id = 'vegetable-images' and auth.role() = 'authenticated');

create policy "Authenticated update for vegetable-images"
on storage.objects for update
using (bucket_id = 'vegetable-images' and auth.role() = 'authenticated');

create policy "Authenticated delete for vegetable-images"
on storage.objects for delete
using (bucket_id = 'vegetable-images' and auth.role() = 'authenticated');
```

### एडमिन यूज़र कैसे बनाएं
1. Supabase Dashboard → **Authentication → Users → Add user**
   - ईमेल और पासवर्ड डालकर एडमिन का लॉगिन बनाएं
2. उस यूज़र की **User UID** कॉपी करें
3. SQL Editor में यह चलाएं (UID और नाम बदलकर):

```sql
insert into admin_users (id, full_name, phone)
values ('यहां-UID-पेस्ट-करें', 'आपका नाम', '8839351985');
```

अब आप उसी ईमेल-पासवर्ड से `/admin/login` पर लॉगिन कर सकते हैं।

---

## 3️⃣ ऑनलाइन भुगतान सेटअप (Razorpay — UPI सपोर्ट सहित)

इस ऐप में **Razorpay Checkout** का उपयोग किया गया है क्योंकि यह UPI, कार्ड और नेट बैंकिंग तीनों को एक साथ सपोर्ट करता है।

1. [razorpay.com](https://razorpay.com) पर मुफ़्त अकाउंट बनाएं।
2. Dashboard → **Settings → API Keys** से `Key Id` कॉपी करें।
3. `.env` फाइल में `VITE_RAZORPAY_KEY_ID` में डालें।
4. शुरुआत में **Test Mode** के key से जांच करें (payment असल में नहीं कटेगा)।
5. असली भुगतान चालू करने के लिए Razorpay में KYC पूरा करके **Live Mode** की key इस्तेमाल करें।

### ⚠️ महत्वपूर्ण सुरक्षा सलाह (प्रोडक्शन के लिए)
अभी भुगतान की राशि सीधे ब्राउज़र (frontend) से भेजी जाती है। पूरी तरह सुरक्षित बनाने के लिए
Supabase **Edge Functions** के ज़रिए यह 2 फंक्शन बनाना बेहतर है:
- `create-razorpay-order` — सर्वर पर ऑर्डर बनाकर राशि तय करना (ताकि कोई राशि से छेड़छाड़ न कर सके)
- `verify-razorpay-payment` — भुगतान के सिग्नेचर को सर्वर पर जांचना

`src/utils/payment.js` फाइल में इसके लिए जगह और निर्देश (comments) पहले से दिए गए हैं।
छोटे व्यवसाय के लिए मौजूदा सेटअप (frontend-only) से भी काम चल सकता है, बड़े स्तर पर जाने से पहले
Edge Functions जोड़ने की सलाह दी जाती है।

---

## 4️⃣ WhatsApp सुविधा

- ऑर्डर पूरा होने पर ग्राहक को "WhatsApp पर ऑर्डर भेजें" बटन दिखेगा।
- यह बटन WhatsApp खोलकर ऑर्डर की पूरी जानकारी अपने आप टाइप कर देता है (wa.me लिंक)।
- व्यवसाय का WhatsApp नंबर बदलने के लिए Supabase के `delivery_settings` टेबल में
  `business_whatsapp` कॉलम बदलें (SQL Editor से, या भविष्य में एडमिन पैनल में सेटिंग पेज जोड़कर):

```sql
update delivery_settings set business_whatsapp = '91XXXXXXXXXX' where id = 1;
```

---

## 5️⃣ न्यूनतम ऑर्डर राशि और डिलीवरी शुल्क बदलना

SQL Editor से:

```sql
update delivery_settings
set min_order_value = 199, delivery_fee = 20, free_delivery_above = 500
where id = 1;
```

---

## 6️⃣ ऑनलाइन डिप्लॉय कैसे करें (Vercel/Netlify + Supabase)

### Vercel पर डिप्लॉय
1. इस प्रोजेक्ट को GitHub पर पुश करें।
2. [vercel.com](https://vercel.com) पर जाकर **New Project → Import Git Repository**।
3. Environment Variables में `.env` की सभी वैल्यू डालें (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_RAZORPAY_KEY_ID आदि)।
4. **Deploy** बटन दबाएं। कुछ मिनट में ऐप लाइव हो जाएगा।

### Netlify पर डिप्लॉय
1. [netlify.com](https://netlify.com) → **Add new site → Import an existing project**
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Environment variables में वही जानकारी डालें जो ऊपर बताई गई है।

### Supabase प्रोडक्शन चेकलिस्ट
- RLS सभी टेबल पर चालू है (schema.sql में पहले से किया गया है) ✅
- `vegetable-images` bucket public है ✅
- कम से कम एक एडमिन यूज़र बना हुआ है ✅

---

## 7️⃣ ऐप की मुख्य सुविधाएँ (जो पहले से बनी हैं)

**ग्राहक की तरफ:**
- होम पेज: सब्ज़ी खोज, श्रेणियाँ, ऑफर, आज की उपलब्ध सब्ज़ियाँ
- हर सब्ज़ी: फोटो/इमोजी, नाम, कीमत, माप, उपलब्धता, कार्ट बटन
- कार्ट: मात्रा बढ़ाना/घटाना, हटाना, कुल राशि, न्यूनतम ऑर्डर जांच
- चेकआउट: ग्राहक जानकारी फॉर्म, कूपन कोड, केवल ऑनलाइन भुगतान (Razorpay)
- भुगतान असफल होने पर दोबारा भुगतान करने का विकल्प
- ऑर्डर पुष्टि पेज: ऑर्डर नंबर, स्थिति ट्रैकर, WhatsApp बटन
- ऑर्डर इतिहास: मोबाइल नंबर से पुराने ऑर्डर देखना, दोबारा ऑर्डर करना

**एडमिन पैनल:**
- सुरक्षित लॉगिन (Supabase Auth)
- डैशबोर्ड: आज/सप्ताह/महीने की बिक्री, कुल ऑर्डर आदि
- सब्ज़ी प्रबंधन: जोड़ना, बदलना, फोटो अपलोड, उपलब्ध/अनुपलब्ध, हटाना
- ऑर्डर प्रबंधन: स्थिति बदलना (नया → भुगतान सफल → स्वीकार → तैयार → डिलीवरी के लिए निकला → पूरा / रद्द)
- ग्राहक प्रबंधन: सूची, खोज, हर ग्राहक का ऑर्डर इतिहास
- बिक्री रिपोर्ट: आज/सप्ताह/महीने की बिक्री, टॉप बिकने वाली सब्ज़ियाँ, कुल ऑनलाइन भुगतान

---

## 8️⃣ साउंड नोटिफिकेशन (नया ऑर्डर + स्थिति बदलने पर)

एडमिन पैनल में अब नया ऑर्डर आने पर और ऑर्डर की स्थिति/भुगतान बदलने पर अपने आप साउंड और एक छोटा नोटिफिकेशन (toast) दिखता है — चाहे एडमिन किसी भी पेज पर हो। इसके लिए **Supabase Realtime** चालू करना ज़रूरी है:

1. Supabase Dashboard → **Database → Replication** में जाएं
2. `orders` टेबल को ढूंढकर उसके सामने का टॉगल **चालू (ON)** करें
3. पुरानी और नई value की तुलना करने के लिए (जैसे order_status बदलने से पहले/बाद की value पहचानने के लिए) SQL Editor में यह भी चलाएं:

```sql
alter table orders replica identity full;
```

इसके बिना नोटिफिकेशन काम नहीं करेगा या स्थिति बदलने पर टोस्ट सही जानकारी नहीं दिखाएगा।

**ध्यान रहे:** ब्राउज़र की autoplay नीति के कारण, पेज खुलते ही पहला साउंड कभी-कभी न बजे — एडमिन के एक बार पेज पर क्लिक करने के बाद यह सामान्य रूप से काम करता है।

---

## 9️⃣ मल्टी-वेंडर मार्केटप्लेस (अलग-अलग विक्रेता)

अब कई विक्रेता (seller) खुद रजिस्टर करके अपनी सब्ज़ियाँ बेच सकते हैं। हर विक्रेता सिर्फ अपनी सब्ज़ियाँ और अपने ऑर्डर देख सकता है; एडमिन सबको मैनेज कर सकता है।

### कैसे काम करता है
- **विक्रेता खाता बनाना:** `/seller/signup` पर जाकर कोई भी विक्रेता अपना व्यवसाय, नाम, फोन, ईमेल-पासवर्ड डालकर आवेदन कर सकता है
- **एडमिन अप्रूवल:** नया विक्रेता तब तक अपनी सब्ज़ियाँ ग्राहकों को नहीं दिखा सकता जब तक एडमिन पैनल → **विक्रेता** पेज से उसे अप्रूव न करे
- **विक्रेता पैनल:** अप्रूव होने के बाद `/seller/login` से लॉगिन करके विक्रेता अपनी सब्ज़ियाँ जोड़/बदल सकता है और सिर्फ अपनी सब्ज़ियों वाले ऑर्डर देख सकता है (`/seller` — डैशबोर्ड, मेरी सब्ज़ियाँ, मेरे ऑर्डर)
- **कीमत/स्थिति/ऑर्डर की पूरी प्रक्रिया** अब भी एडमिन के हाथ में रहती है — विक्रेता सिर्फ प्रोडक्ट जोड़ता है और अपने ऑर्डर देखता है, ऑर्डर की स्थिति नहीं बदल सकता

### ज़रूरी सेटअप
1. Supabase Authentication में **"Confirm email" बंद रखें** (Authentication → Providers → Email → "Confirm email" टॉगल बंद करें), वरना विक्रेता साइन-अप के तुरंत बाद अपने आप लॉगिन नहीं हो पाएगा और प्रोफाइल नहीं बन पाएगी
2. अगर आपने पहले schema.sql चला रखी है, तो `supabase/schema.sql` फाइल के आखिर में मौजूद **"मल्टी-वेंडर मार्केटप्लेस"** वाला MIGRATION हिस्सा SQL Editor में चलाएं

---

## 🔟 AI ऑर्डर असिस्टेंट (टेक्स्ट + वॉइस — Google AI से)

ग्राहक अब बोलकर या टाइप करके ऑर्डर कर सकते हैं — जैसे "2 किलो आलू और 1 किलो टमाटर देना"। AI सिर्फ सब्ज़ी/मात्रा पहचानता है; **कीमत हमेशा डेटाबेस से ली जाती है, AI कभी कीमत खुद नहीं बनाता** (सर्वर-साइड Supabase Edge Function में सत्यापित)। AI दिमाग और वॉइस-पहचान — दोनों के लिए **Google की सेवाएं** इस्तेमाल होती हैं (Gemini + Cloud Speech-to-Text)।

### कैसे काम करता है
- Home पेज पर 🤖 **"AI से ऑर्डर करें"** बटन — टैप करने पर चैट खुलती है
- टेक्स्ट या 🎤 माइक (हिंदी वॉइस — Google Cloud Speech-to-Text, ज़्यादातर सभी आधुनिक ब्राउज़र में काम करता है क्योंकि रिकॉर्डिंग सीधे ब्राउज़र से होती है, पहचान सर्वर पर) से बोल सकते हैं
- AI (Google Gemini) सब्ज़ी + मात्रा पहचानकर डेटाबेस से असली कीमत जोड़ता है और सारांश दिखाता है
- "✅ ऑर्डर कन्फर्म करें" दबाने पर आइटम मौजूदा कार्ट में जुड़ जाते हैं और सामान्य checkout/payment प्रक्रिया से गुज़रते हैं — **कोई अलग ऑर्डर सिस्टम नहीं**, वही पुराना भरोसेमंद रास्ता
- एडमिन पैनल → ऑर्डर प्रबंधन में AI से आए ऑर्डर पर 🤖 **"AI सहायक"** बैज दिखता है, और फ़िल्टर में भी अलग से चुन सकते हैं

### ज़रूरी सेटअप (Edge Functions डिप्लॉय करना)

चूंकि Edge Functions सर्वर-साइड कोड हैं, इन्हें [Supabase CLI](https://supabase.com/docs/guides/cli) से डिप्लॉय करना होगा (सिर्फ SQL Editor से नहीं हो सकता):

1. अपने कंप्यूटर पर Supabase CLI इंस्टॉल करें:
   ```bash
   npm install -g supabase
   ```
2. लॉगिन करें और प्रोजेक्ट से जोड़ें:
   ```bash
   supabase login
   supabase link --project-ref आपका-प्रोजेक्ट-रेफ़  # Supabase URL में मिलेगा
   ```
3. **Google API key बनाएं:**
   - [aistudio.google.com/apikey](https://aistudio.google.com/apikey) पर जाकर एक Gemini API key बनाएं (AI दिमाग के लिए)
   - उसी Google Cloud प्रोजेक्ट में जाकर [Cloud Speech-to-Text API](https://console.cloud.google.com/apis/library/speech.googleapis.com) को **चालू (Enable)** करें (वॉइस पहचान के लिए) — यह API अलग से enable करनी ज़रूरी है, वरना वॉइस वाला हिस्सा एरर देगा
   - ध्यान दें: Gemini की एक मुफ़्त सीमा (free tier) है, पर Cloud Speech-to-Text हमेशा से पेड सेवा है (बिलिंग अकाउंट चालू करना होगा), भले ही शुरू में कुछ मुफ़्त क्रेडिट मिले
4. उस key को secret के रूप में सेट करें (दोनों functions के लिए एक ही key काम करेगी):
   ```bash
   supabase secrets set GOOGLE_API_KEY=AIzaSy-आपकी-key-यहां
   ```
5. दोनों फंक्शन डिप्लॉय करें:
   ```bash
   supabase functions deploy parse-order
   supabase functions deploy speech-to-text
   ```

### डेटाबेस अपडेट
```sql
alter table orders add column if not exists order_source text not null default 'वेबसाइट'
  check (order_source in ('वेबसाइट','AI सहायक','WhatsApp'));
```

### सीमाएं (ईमानदारी से)
- **वॉइस इनपुट** के लिए ब्राउज़र से माइक की अनुमति चाहिए (HTTPS ज़रूरी — Vercel/Netlify दोनों पर अपने आप मिल जाता है)
- मॉडल का नाम कोड में `gemini-2.5-flash` सेट है — अगर भविष्य में Google इसे बदल/हटा दे, तो `supabase/functions/parse-order/index.ts` में `GEMINI_MODEL` वैरिएबल बदलकर [ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models) पर मौजूद नया मॉडल नाम डालें
- **WhatsApp बॉट** अभी इसमें शामिल नहीं है — इसके लिए Twilio/Gupshup/360dialog जैसी सेवा का पेड, verified WhatsApp Business API अकाउंट चाहिए, जो आपको खुद बनाना होगा। अभी मौजूद "WhatsApp पर ऑर्डर भेजें" बटन (wa.me लिंक) पहले जैसा ही काम करता रहेगा
- अगर सब्ज़ी का नाम/मात्रा साफ़ न समझ आए, AI सीधे ऑर्डर नहीं बनाता — स्पष्टीकरण मांगता है (जैसा स्पेसिफिकेशन में मांगा गया था)

---

## 1️⃣1️⃣ आगे क्या जोड़ सकते हैं (वैकल्पिक सुधार)

- बिल PDF डाउनलोड/प्रिंट सुविधा
- एडमिन पैनल से WhatsApp नंबर व डिलीवरी सेटिंग बदलने का UI पेज
- SMS/WhatsApp के ज़रिए ऑर्डर स्थिति के ऑटोमेटिक नोटिफिकेशन (Supabase Edge Function + WhatsApp Business API)
- मल्टीपल एडमिन/स्टाफ भूमिकाएं

---

किसी भी समस्या के लिए Supabase Dashboard के Logs (Database → Logs) ज़रूर जांचें — ज़्यादातर समस्याएं
गलत `.env` जानकारी या RLS पॉलिसी न चलने की वजह से होती हैं।

## Vendor ↔ Seller Profile association

The customer-facing Vendor directory now uses the same `sellers` profile managed from **Admin → Sellers**. There is no separate vendor table.

Relationship:

- `sellers.id` = vendor/seller identity
- `vegetables.seller_id` → `sellers.id`
- `order_items.seller_id` → `sellers.id`
- Customer `/vendors` shows only approved + active seller profiles
- Customer `/vendors/:vendorId` shows that seller's active vegetables
- Admin can edit the seller profile used by the customer Vendor directory
- Seller can edit their own profile at `/seller/profile`

### Supabase migration

Run `supabase/vendor_seller_association.sql` after the main `supabase/schema.sql`. This adds the public approved/active seller read policy and indexes required for the association.
