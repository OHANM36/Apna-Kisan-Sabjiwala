import { translateStatus } from './translations.js'
// भुगतान के तरीके (ऑनलाइन / कैश ऑन डिलीवरी) का साझा तर्क।
// ध्यान दें: यहाँ की जाँच सिर्फ़ स्क्रीन दिखाने के लिए है। असली नियम (COD चालू है? सीमा? राशि?) सर्वर पर
// place_order में लागू होते हैं — ब्राउज़र बदलकर इन्हें बायपास नहीं किया जा सकता।

export const PAYMENT_ONLINE = 'online'
export const PAYMENT_COD = 'cod'
export const PAYMENT_COD_ONLINE = 'cod_online' // डिलीवरी पर ऑनलाइन (UPI/QR) — सर्वर पर यह भी payment_method='COD' ही है

/**
 * इस ऑर्डर-राशि के लिए COD विकल्प उपलब्ध है या नहीं।
 * reason: 'disabled' (एडमिन ने बंद रखा है) | 'limit' (राशि अधिकतम सीमा से ज़्यादा) | null
 */
export function codAvailability(settings, total) {
  if (!settings || settings.cod_enabled !== true) return { available: false, reason: 'disabled' }
  const max = Number(settings.cod_max_order_value)
  if (settings.cod_max_order_value != null && Number.isFinite(max) && max > 0 && Number(total) > max) {
    return { available: false, reason: 'limit', limit: max }
  }
  return { available: true, reason: null }
}

export function isCod(order) {
  return order?.payment_method === 'COD'
}

// डिलीवरी पर ऑनलाइन (UPI/QR) से देना है?
export function isCodOnline(order) {
  return isCod(order) && order?.cod_pay_mode === 'online'
}

// पैसा मिल चुका है? (ऑनलाइन: गेटवे से पुष्टि; COD: डिलीवरी पर कैश मिलने पर सर्वर 'सफल' करता है)
export function isPaid(order) {
  return order?.payment_status === 'सफल'
}

// भुगतान की स्थिति का टेक्स्ट। forCustomer=true (ग्राहक का "मेरे ऑर्डर") में ग्राहक की नज़र से:
// पैसा "देना है" / "दे दिया"; बाकी पैनलों (एडमिन/सेलर/व्हाट्सऐप) में दुकान की नज़र से "लेना है" / "मिल गया"।
// lang: 'en' हो तो अंग्रेज़ी (सिर्फ़ ग्राहक-पेज पर पास होता है; बाकी पैनल हिंदी ही रहते हैं)
export function paymentText(order, { forCustomer = false, lang = 'hi' } = {}) {
  const en = lang === 'en'
  if (isCodOnline(order)) {
    if (isPaid(order)) {
      if (en) return forCustomer ? 'Paid online (UPI)' : 'Online (UPI) payment received'
      return forCustomer ? 'ऑनलाइन (UPI) भुगतान हो गया' : 'ऑनलाइन (UPI) भुगतान मिल गया'
    }
    if (en) return forCustomer ? 'Pay online on delivery (UPI) — to be paid on delivery' : 'Online on delivery (UPI) — to collect on delivery'
    return forCustomer ? 'डिलीवरी पर ऑनलाइन भुगतान (UPI) — डिलीवरी पर देना है' : 'डिलीवरी पर ऑनलाइन भुगतान (UPI) — डिलीवरी पर लेना है'
  }
  if (isCod(order)) {
    if (isPaid(order)) {
      if (en) return forCustomer ? 'Cash paid' : 'Cash received'
      return forCustomer ? 'कैश दे दिया' : 'कैश मिल गया'
    }
    if (en) return forCustomer ? 'Cash on Delivery (to be paid on delivery)' : 'Cash on Delivery (to collect on delivery)'
    return forCustomer ? 'कैश ऑन डिलीवरी (डिलीवरी पर देना है)' : 'कैश ऑन डिलीवरी (डिलीवरी पर लेना है)'
  }
  if (en) return translateStatus(order?.payment_status ?? '', 'en')
  return order?.payment_status ?? ''
}
