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

// हिंदी-पैनलों (एडमिन/सेलर/व्हाट्सऐप/मेरे ऑर्डर) में भुगतान की स्थिति का टेक्स्ट
export function paymentText(order) {
  if (isCodOnline(order)) return isPaid(order) ? 'ऑनलाइन (UPI) भुगतान मिल गया' : 'डिलीवरी पर ऑनलाइन भुगतान (UPI) — डिलीवरी पर लेना है'
  if (isCod(order)) return isPaid(order) ? 'कैश मिल गया' : 'कैश ऑन डिलीवरी (डिलीवरी पर लेना है)'
  return order?.payment_status ?? ''
}
