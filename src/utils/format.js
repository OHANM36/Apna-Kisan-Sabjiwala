export function formatRupee(amount) {
  const n = Number(amount || 0)
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('hi-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const DELIVERY_TIME_SLOTS = [
  'सुबह 7 - 9 बजे',
  'सुबह 9 - 11 बजे',
  'दोपहर 12 - 2 बजे',
  'शाम 4 - 6 बजे',
  'शाम 6 - 8 बजे',
]

export const ORDER_STATUS_STEPS = [
  'नया ऑर्डर',
  'भुगतान सफल',
  'स्वीकार किया गया',
  'सामान तैयार हो रहा है',
  'डिलीवरी के लिए निकल गया',
  'डिलीवरी पूरी हुई',
]

// COD ऑर्डर में "भुगतान सफल" चरण नहीं होता (पैसा डिलीवरी पर मिलता है), इसलिए उसे सूची से हटाएँ।
export function statusStepsFor(order) {
  return order?.payment_method === 'COD'
    ? ORDER_STATUS_STEPS.filter((s) => s !== 'भुगतान सफल')
    : ORDER_STATUS_STEPS
}
