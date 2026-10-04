// एडमिन के लिए ऑर्डर-स्थिति का नियम (सिर्फ़ आगे बढ़ना + रद्द)।
// ⚠️ यही नियम डेटाबेस में supabase/order_status_workflow.sql (guard_order_status) भी लागू करता है — दोनों साथ रखें।
// यहाँ सिर्फ़ UI तय करता है कि कौन-सा बटन दिखे; असली रोक डेटाबेस की है।

export const S = {
  NEW: 'नया ऑर्डर',
  PAID: 'भुगतान सफल',
  ACCEPTED: 'स्वीकार किया गया',
  PREPARING: 'सामान तैयार हो रहा है',
  OUT: 'डिलीवरी के लिए निकल गया',
  DELIVERED: 'डिलीवरी पूरी हुई',
  CANCELLED: 'रद्द',
}

export const FINAL_STATUSES = [S.DELIVERED, S.CANCELLED]

// हर स्थिति से अगला (सिर्फ़ एक) सामान्य कदम — बटन का नाम सहित
const NEXT = {
  [S.NEW]:       { status: S.ACCEPTED,  label: 'ऑर्डर स्वीकार करें' },
  [S.PAID]:      { status: S.ACCEPTED,  label: 'ऑर्डर स्वीकार करें' },
  [S.ACCEPTED]:  { status: S.PREPARING, label: 'तैयारी शुरू करें' },
  [S.PREPARING]: { status: S.OUT,       label: 'डिलीवरी के लिए भेजें' },
  [S.OUT]:       { status: S.DELIVERED, label: 'डिलीवरी पूरी हुई' },
}

// रद्द सिर्फ़ "डिलीवरी के लिए निकल गया" से पहले
const CANCELLABLE = [S.NEW, S.PAID, S.ACCEPTED, S.PREPARING]

export function nextAction(status) {
  return NEXT[status] || null
}

export function canCancel(status) {
  return CANCELLABLE.includes(status)
}

export function isFinal(status) {
  return FINAL_STATUSES.includes(status)
}

// डेटाबेस की अनुमत सूची (एडमिन के लिए) — टेस्ट में तुलना के लिए
export function adminAllowedTransitions(status) {
  const list = []
  if (NEXT[status]) list.push(NEXT[status].status)
  if (canCancel(status)) list.push(S.CANCELLED)
  return list
}

export const CANCEL_REASONS = [
  'ग्राहक ने रद्द करने को कहा',
  'सामान उपलब्ध नहीं',
  'ग्राहक से संपर्क नहीं हो सका',
  'डिलीवरी संभव नहीं',
  'डुप्लिकेट ऑर्डर',
]
export const OTHER_REASON = 'अन्य'

// मॉडल के चुनाव से डेटाबेस में जाने वाला कारण; खाली हो तो null
export function buildCancelReason(selected, otherText) {
  if (!selected) return null
  if (selected === OTHER_REASON) {
    const t = String(otherText || '').trim()
    return t ? `${OTHER_REASON}: ${t}`.slice(0, 500) : null
  }
  return selected
}

// ऑनलाइन भुगतान हो चुका है? (COD का पैसा डिलीवरी पर आता है; रद्द होने तक वह पैसा आया ही नहीं होता)
export function isPaidOnline(order) {
  return order?.payment_method !== 'COD' && order?.payment_status === 'सफल'
}

// रद्द हुआ पर ऑनलाइन पैसा लौटाना बाकी — मौजूदा कोड में कोई refund सिस्टम नहीं है, इसलिए सिर्फ़ चेतावनी दिखती है
export function refundRequired(order) {
  return order?.order_status === S.CANCELLED && isPaidOnline(order)
}

// डेटाबेस/नेटवर्क की गड़बड़ी → एडमिन के लिए साफ़ संदेश
export function describeStatusError(err) {
  const msg = String(err?.message || err || '')
  if (/INVALID_TRANSITION/.test(msg)) return 'यह बदलाव अनुमत नहीं है। ऑर्डर आगे ही बढ़ सकता है, और पूरा/रद्द ऑर्डर बदला नहीं जा सकता।'
  if (/CANCEL_REASON_REQUIRED/.test(msg)) return 'रद्द करने का कारण ज़रूरी है।'
  if (/CANCEL_FIELDS_LOCKED/.test(msg)) return 'रद्दीकरण की जानकारी बदली नहीं जा सकती।'
  if (/UNAUTHORIZED|permission denied|row-level security|JWT/i.test(msg)) return 'आपको यह बदलाव करने की अनुमति नहीं है। दोबारा लॉग-इन करें।'
  if (/ORDER_NOT_FOUND/.test(msg)) return 'ऑर्डर नहीं मिला।'
  if (/Failed to fetch|NetworkError|network|timeout/i.test(msg)) return 'इंटरनेट की समस्या — स्थिति नहीं बदली। नेट जाँचकर दोबारा कोशिश करें।'
  return 'स्थिति बदली नहीं जा सकी। दोबारा कोशिश करें।'
}

export const STALE_MESSAGE = 'ऑर्डर की स्थिति पहले ही बदल चुकी है। ऑर्डर दोबारा लोड हो रहा है...'
