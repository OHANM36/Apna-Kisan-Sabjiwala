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
  TOO_MANY_PENDING: 'आपके कई ऑर्डर का भुगतान बाकी है। कृपया कुछ देर बाद कोशिश करें।',
  RATE_LIMITED: 'बहुत ज़्यादा कोशिशें हुईं। कृपया कुछ मिनट बाद दोबारा कोशिश करें।',
  NETWORK: 'इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।',
  UNKNOWN: 'कुछ गड़बड़ी हुई। कृपया दोबारा प्रयास करें।',
}

export function errorCode(err) {
  if (!err) return 'UNKNOWN'
  const msg = String(err.message || err.error_description || err)
  const m = msg.match(/\b([A-Z][A-Z_]{3,})\b/)
  if (m && MESSAGES[m[1]]) return m[1]
  if (/fetch|network|timeout|abort/i.test(msg)) return 'NETWORK'
  return 'UNKNOWN'
}

export function friendlyError(err) {
  const code = typeof err === 'string' && MESSAGES[err] ? err : errorCode(err)
  return MESSAGES[code] || MESSAGES.UNKNOWN
}

// supabase-js के कॉल पर timeout (M9): अटका spinner नहीं
export function withTimeout(promise, ms = 20000) {
  let t
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error('timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t))
}
