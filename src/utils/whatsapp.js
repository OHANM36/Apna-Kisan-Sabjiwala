import { formatRupee } from './format'
import { isCod, isCodOnline, isPaid } from './paymentMethods'

/**
 * ऑर्डर की जानकारी से WhatsApp लिंक बनाता है
 */
export function buildWhatsAppOrderLink({ order, items, businessWhatsapp }) {
  const lines = []
  lines.push(`*नया ऑर्डर - अपना किसान सब्ज़ीवाला*`)
  lines.push(``)
  lines.push(`ऑर्डर नंबर: ${order.order_number}`)
  lines.push(`ग्राहक का नाम: ${order.customer_name}`)
  lines.push(`मोबाइल नंबर: ${order.customer_phone}`)
  lines.push(`पता: ${order.full_address}${order.mohalla ? ', ' + order.mohalla : ''}, ${order.city} - ${order.pincode}`)
  if (order.delivery_date) lines.push(`डिलीवरी की तारीख: ${order.delivery_date}`)
  if (order.delivery_time_slot) lines.push(`डिलीवरी का समय: ${order.delivery_time_slot}`)
  lines.push(``)
  lines.push(`*सब्ज़ियाँ:*`)
  items.forEach((i) => {
    lines.push(`- ${i.vegetable_name} x ${i.quantity} ${i.unit} = ${formatRupee(i.item_total)}`)
  })
  lines.push(``)
  lines.push(`सामान का कुल मूल्य: ${formatRupee(order.subtotal)}`)
  lines.push(`डिलीवरी शुल्क: ${formatRupee(order.delivery_fee)}`)
  if (order.discount > 0) lines.push(`छूट: -${formatRupee(order.discount)}`)
  lines.push(`*कुल राशि: ${formatRupee(order.total_amount)}*`)
  if (isCod(order)) {
    // दुकानदार को साफ़ दिखे कि पैसा अभी नहीं आया — डिलीवरी पर कैश लेना है
    if (isCodOnline(order)) {
      lines.push(isPaid(order) ? `भुगतान: ऑनलाइन (UPI) मिल गया` : `भुगतान: डिलीवरी पर ऑनलाइन (UPI) — डिलीवरी पर ${formatRupee(order.total_amount)} लेना है`)
    } else {
      lines.push(isPaid(order) ? `भुगतान: कैश मिल गया` : `भुगतान: कैश ऑन डिलीवरी — डिलीवरी पर ${formatRupee(order.total_amount)} लेना है`)
    }
  } else {
    lines.push(`भुगतान की स्थिति: ${order.payment_status}`)
  }
  if (order.extra_notes) lines.push(`अतिरिक्त जानकारी: ${order.extra_notes}`)

  const text = encodeURIComponent(lines.join('\n'))
  const phone = (businessWhatsapp || '918839351985').replace(/\D/g, '')
  return `https://wa.me/${phone}?text=${text}`
}


// ---- एडमिन -> ग्राहक: ऑर्डर-अपडेट (हाथ से भेजा जाने वाला) ----

// ग्राहक का नंबर wa.me के लिए (10 अंक हों तो भारत का 91 जोड़ें)
export function customerWhatsAppNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length === 10) return '91' + d
  if (d.length === 12 && d.startsWith('91')) return d
  return d
}

// ऑर्डर की मौजूदा स्थिति के हिसाब से ग्राहक के लिए संदेश (एडमिन भेजने से पहले बदल सकता है)
export function buildCustomerUpdateText(order, origin = '') {
  const name = order.customer_name ? ` ${order.customer_name}` : ''
  const no = order.order_number
  const total = formatRupee(order.total_amount)
  const lines = [`नमस्ते${name} जी, *अपना किसान सब्ज़ीवाला* की ओर से अपडेट 🙏`, '']

  switch (order.order_status) {
    case 'रद्द':
      lines.push(`आपका ऑर्डर ${no} रद्द कर दिया गया है।`)
      if (!isCod(order) && isPaid(order)) lines.push('आपका भुगतान नियमों के अनुसार वापस किया जाएगा।')
      break
    case 'डिलीवरी पूरी हुई':
      lines.push(`आपका ऑर्डर ${no} डिलीवर हो गया है ✅`)
      lines.push('हमसे ख़रीदारी के लिए धन्यवाद! फिर मिलेंगे 🥬')
      break
    case 'डिलीवरी के लिए निकल गया':
      lines.push(`आपका ऑर्डर ${no} डिलीवरी के लिए निकल गया है 🛵`)
      if (isCod(order) && !isPaid(order)) {
        lines.push(isCodOnline(order) ? `कृपया डिलीवरी पर ${total} UPI से देने के लिए तैयार रहें (डिलीवरी बॉय QR दिखाएगा)।` : `कृपया डिलीवरी पर ${total} कैश तैयार रखें।`)
      }
      break
    case 'सामान तैयार हो रहा है':
      lines.push(`आपका ऑर्डर ${no} तैयार किया जा रहा है 🧺`)
      break
    case 'स्वीकार किया गया':
      lines.push(`आपका ऑर्डर ${no} स्वीकार कर लिया गया है ✅`)
      if (order.delivery_date) lines.push(`डिलीवरी: ${order.delivery_date}${order.delivery_time_slot ? ', ' + order.delivery_time_slot : ''}`)
      break
    default:
      lines.push(`आपका ऑर्डर ${no} हमें मिल गया है ✅`)
      lines.push(`कुल राशि: ${total}`)
  }

  if (order.access_token && origin) {
    lines.push('')
    lines.push('ऑर्डर की स्थिति यहाँ देखें:')
    lines.push(`${origin}/order-confirmation/${order.id}?t=${order.access_token}`)
  }
  return lines.join('\n')
}

export function buildCustomerWhatsAppLink(phone, text) {
  return `https://wa.me/${customerWhatsAppNumber(phone)}?text=${encodeURIComponent(text)}`
}
