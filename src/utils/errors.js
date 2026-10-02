import { currentLanguage } from './translations.js'

// सर्वर के error-code → ग्राहक के लिए सामान्य संदेश। तकनीकी error.message ग्राहक को कभी नहीं दिखता (L8).
const MESSAGES = {
  STORE_CLOSED: 'दुकान अभी बंद है। कृपया बाद में ऑर्डर करें।',
  ITEM_UNAVAILABLE: 'कार्ट की कोई सब्ज़ी अभी उपलब्ध नहीं है। कृपया कार्ट जाँचें।',
  BELOW_MIN: 'ऑर्डर न्यूनतम राशि से कम है। कृपया और सामान जोड़ें।',
  BAD_PHONE: 'सही मोबाइल नंबर डालें (10 अंक)।',
  BAD_NAME: 'कृपया सही नाम डालें।',
  BAD_ADDRESS: 'कृपया पूरा पता डालें।',
  BAD_PINCODE: 'सही पिन कोड डालें (6 अंक)।',
  BAD_DATE: 'डिलीवरी की तारीख सही नहीं है। आज से 14 दिन के अंदर की तारीख चुनें।',
  BAD_QTY: 'कार्ट में मात्रा सही नहीं है। कृपया कार्ट जाँचें।',
  BAD_TIER: 'कार्ट की कोई कीमत बदल गई है। कृपया कार्ट दोबारा खोलें।',
  BAD_ITEMS: 'कार्ट में कुछ गड़बड़ है। कृपया कार्ट जाँचें।',
  COUPON_INVALID: 'यह कूपन कोड मान्य नहीं है।',
  COUPON_EXPIRED: 'यह कूपन समाप्त हो चुका है।',
  COUPON_MIN_ORDER: 'इस कूपन के लिए ऑर्डर की राशि कम है।',
  COUPON_USED: 'यह कूपन पहले ही इस्तेमाल हो चुका है।',
  COD_DISABLED: 'कैश ऑन डिलीवरी अभी उपलब्ध नहीं है। कृपया ऑनलाइन भुगतान चुनें।',
  COD_LIMIT_EXCEEDED: 'इस राशि के ऑर्डर पर कैश ऑन डिलीवरी उपलब्ध नहीं है। कृपया ऑनलाइन भुगतान चुनें।',
  BAD_PAYMENT_METHOD: 'भुगतान का तरीका सही नहीं है। कृपया दोबारा चुनें।',
  TOO_MANY_PENDING: 'आपके कई ऑर्डर का भुगतान बाकी है। कृपया कुछ देर बाद कोशिश करें।',
  RATE_LIMITED: 'बहुत ज़्यादा कोशिशें हुईं। कृपया कुछ मिनट बाद दोबारा कोशिश करें।',
  NETWORK: 'इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।',
  UNKNOWN: 'कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें।',
}

const MESSAGES_EN = {
  STORE_CLOSED: 'The shop is closed right now. Please order later.',
  ITEM_UNAVAILABLE: 'Some vegetable in your cart is not available right now. Please check your cart.',
  BELOW_MIN: 'Order is below the minimum amount. Please add more items.',
  BAD_PHONE: 'Enter a valid mobile number (10 digits).',
  BAD_NAME: 'Please enter a valid name.',
  BAD_ADDRESS: 'Please enter the full address.',
  BAD_PINCODE: 'Enter a valid pincode (6 digits).',
  BAD_DATE: 'The delivery date is not valid. Choose a date within the next 14 days.',
  BAD_QTY: 'A quantity in your cart is not valid. Please check your cart.',
  BAD_TIER: 'A price in your cart has changed. Please reopen your cart.',
  BAD_ITEMS: 'Something is wrong with your cart. Please check it.',
  COUPON_INVALID: 'This coupon code is not valid.',
  COUPON_EXPIRED: 'This coupon has expired.',
  COUPON_MIN_ORDER: 'Your order amount is too low for this coupon.',
  COUPON_USED: 'This coupon has already been used.',
  COD_DISABLED: 'Cash on Delivery is not available right now. Please choose online payment.',
  COD_LIMIT_EXCEEDED: 'Cash on Delivery is not available for an order of this amount. Please choose online payment.',
  BAD_PAYMENT_METHOD: 'The payment method is not valid. Please choose again.',
  TOO_MANY_PENDING: 'Several of your orders have pending payment. Please try again after a while.',
  RATE_LIMITED: 'Too many attempts. Please try again in a few minutes.',
  NETWORK: 'Check your internet connection and try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
}

export function errorCode(err) {
  if (!err) return 'UNKNOWN'
  const msg = String(err.message || err.error_description || err)
  const m = msg.match(/\b([A-Z][A-Z_]{3,})\b/)
  if (m && MESSAGES[m[1]]) return m[1]
  if (/fetch|network|timeout|abort/i.test(msg)) return 'NETWORK'
  return 'UNKNOWN'
}

// lang पास न हो तो चुनी हुई भाषा (localStorage) से — ताकि पुराने कॉल भी सही भाषा में दिखें
export function friendlyError(err, lang) {
  const code = typeof err === 'string' && MESSAGES[err] ? err : errorCode(err)
  const l = lang || currentLanguage()
  const table = l === 'en' ? MESSAGES_EN : MESSAGES
  return table[code] || table.UNKNOWN
}

// supabase-js के कॉल पर timeout (M9): अटका spinner नहीं
export function withTimeout(promise, ms = 20000) {
  let t
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error('timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}
