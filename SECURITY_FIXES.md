# सुरक्षा सुधार (Production Audit के बाद)

## लाइव करने का क्रम (पहले STAGING पर)
1. **SQL Editor** में क्रम से: `schema.sql` → `pricing_engine.sql` → `vendor_seller_association.sql` → `delivery_boy_module.sql` → **`security_hardening.sql` (सबसे आख़िर में)**
   - पुराने चालू DB पर सिर्फ़ `security_hardening.sql` चलाना काफ़ी है (दोबारा चलाना सुरक्षित है; पुराने delivery PIN अपने आप hash हो जाते हैं और वही PIN चलते रहते हैं)।
2. **Edge Functions** डिप्लॉय करें:
   ```
   supabase functions deploy parse-order speech-to-text create-razorpay-order verify-razorpay-payment
   supabase functions deploy razorpay-webhook --no-verify-jwt
   supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=... \
       GOOGLE_API_KEY=... ALLOWED_ORIGINS=https://आपका-डोमेन.com
   ```
3. **Razorpay Dashboard → Webhooks**: URL `https://<project>.supabase.co/functions/v1/razorpay-webhook`, events `payment.captured`, `order.paid`।
4. **Frontend** (इसी zip का) deploy करें। SQL और frontend **एक साथ** लाइव करें — पुराना frontend नई RLS के साथ नहीं चलेगा।
5. (वैकल्पिक) अटके ऑर्डर रद्द करने के लिए: `select cron.schedule('cancel-stale-orders','0 * * * *',$$select cancel_stale_unpaid_orders(3)$$);`
6. Frontend env से `VITE_RAZORPAY_KEY_ID` अब ज़रूरी नहीं (key सर्वर से आती है)।

## किसमें क्या ठीक हुआ
| Audit | समाधान |
|---|---|
| C1 ग्राहक/ऑर्डर डेटा सबको पढ़ने योग्य | orders/customers/payments/delivery_boys/order_items पर खुली policies हटीं; ग्राहक की पहुँच `get_order_public` (गोपनीय token), `customer_orders` (फ़ोन + ऑर्डर नंबर, rate-limited, बिना OTP) और `get_orders_status` से |
| C2 किसी का भी ऑर्डर बदलना | `orders_public_update_payment` व सारी anon UPDATE policies हटीं |
| C3 कीमत/total/paid ब्राउज़र तय करता था | `place_order` RPC: कीमत, tier, शुल्क, कूपन, stock, store-open सब सर्वर पर |
| C4 Razorpay बिना verify | `create-razorpay-order` + `verify-razorpay-payment` (HMAC) + `razorpay-webhook`; "सफल" सिर्फ़ `mark_order_paid` (service_role) से |
| C5 Delivery PIN | PIN अब bcrypt hash; `delivery_login` (rate-limited, सर्वर session), `delivery_claim_order`, `delivery_confirm` (हर ऑर्डर 5 गलत कोशिश पर लॉक) |
| H1 staff → owner | `admin_users` insert/update सिर्फ़ owner |
| H2 seller self-approve | insert पर भी `is_approved=false`; खुद दोबारा active नहीं; unapproved सेलर प्रोडक्ट नहीं जोड़ सकता |
| AI कार्ट कीमत ₹150→₹30 | `parse-order` अब प्रति-इकाई कीमत × मात्रा लौटाता है; `AIOrderAssistant` वही कार्ट-मॉडल बनाता है |
| दुकान बंद / stock ख़त्म सिर्फ़ दिखावा | `place_order` सर्वर पर रोकता है; कार्ट-sync अनुपलब्ध लाइन हटाता है |
| Double-click / retry पर डुप्लिकेट | idempotency key + वही ऑर्डर पर भुगतान retry; पुराने अनपेड ऑर्डर `cancel_stale_unpaid_orders` से |
| M1 कूपन | सर्वर जाँच + `max_uses_per_customer` / `max_total_uses` |
| M2 Storage | सिर्फ़ admin/approved seller अपलोड कर सकें; 2 MB, jpeg/png/webp |
| M3 delivery दो बार claim | एक ही atomic UPDATE |
| M4 बंद ऑर्डर दोबारा खोलना | सिर्फ़ owner |
| M5–M9, L1, L2, L8 | customers upsert race-free; CHECK/UNIQUE constraints; vegetable delete पर FK error नहीं; `localStorage` safe wrapper; crypto-safe PIN; function `search_path`; ग्राहक को तकनीकी error नहीं; request timeout; Edge Function में rate-limit, CORS allow-list, input-size सीमा; security headers (`vercel.json`) |

## परीक्षण
- नई सब SQL/RPC logic एक असली PostgreSQL 16 पर चलाकर जाँची गई (anon से सारे हमले, फ़र्ज़ी कीमत/भुगतान, PIN brute-force, privilege escalation, idempotency, कूपन सीमा, सेलर isolation, पुराने DB का upgrade)।
- `npm run build` और `npm test` (65 tests) पास।
- **जाँचा नहीं गया:** असली Supabase + Razorpay के साथ end-to-end (मेरे पास आपका लाइव प्रोजेक्ट/keys नहीं थे), और Edge Functions का Deno runtime में चलना। इन्हें staging पर Razorpay *test mode* में ज़रूर आज़माएँ।

## जानबूझकर बाकी / ध्यान रखें
- "मेरे ऑर्डर" बिना OTP है (फ़ोन + ऑर्डर नंबर) — OTP जितना मज़बूत नहीं। बाद में चाहें तो SMS OTP जोड़ सकते हैं।
- `Content-Security-Policy` अभी **Report-Only** है; लाइव पर console में उल्लंघन न दिखें तो `vercel.json` में enforced (`Content-Security-Policy`) कर दें।
- Low/Info वाले कुछ बिंदु (PWA, bundle-splitting आदि) इस बार नहीं छुए।
