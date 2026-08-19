import { formatRupee } from './format'

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
  lines.push(`भुगतान की स्थिति: ${order.payment_status}`)
  if (order.extra_notes) lines.push(`अतिरिक्त जानकारी: ${order.extra_notes}`)

  const text = encodeURIComponent(lines.join('\n'))
  const phone = (businessWhatsapp || '918839351985').replace(/\D/g, '')
  return `https://wa.me/${phone}?text=${text}`
}
