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

## 8️⃣ आगे क्या जोड़ सकते हैं (वैकल्पिक सुधार)

- बिल PDF डाउनलोड/प्रिंट सुविधा
- एडमिन पैनल से WhatsApp नंबर व डिलीवरी सेटिंग बदलने का UI पेज
- SMS/WhatsApp के ज़रिए ऑर्डर स्थिति के ऑटोमेटिक नोटिफिकेशन (Supabase Edge Function + WhatsApp Business API)
- मल्टीपल एडमिन/स्टाफ भूमिकाएं

---

किसी भी समस्या के लिए Supabase Dashboard के Logs (Database → Logs) ज़रूर जांचें — ज़्यादातर समस्याएं
गलत `.env` जानकारी या RLS पॉलिसी न चलने की वजह से होती हैं।
