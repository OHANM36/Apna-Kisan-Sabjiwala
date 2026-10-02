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

// एडमिन के लिए ऑर्डर-स्थितियों के वर्ग (काम के क्रम में: जिसपर सबसे पहले कार्रवाई चाहिए वह ऊपर)
export const ORDER_STAGES = [
  { key: 'new',      label: 'नए ऑर्डर',      icon: '🆕', statuses: ['नया ऑर्डर', 'भुगतान सफल'],                          tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'prep',     label: 'तैयारी में',      icon: '🧺', statuses: ['स्वीकार किया गया', 'सामान तैयार हो रहा है'],        tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'transit',  label: 'रास्ते में',       icon: '🛵', statuses: ['डिलीवरी के लिए निकल गया'],                          tone: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'done',     label: 'पूरे हुए',        icon: '✅', statuses: ['डिलीवरी पूरी हुई'],                                  tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'cancelled', label: 'रद्द',           icon: '❌', statuses: ['रद्द'],                                              tone: 'bg-red-50 text-red-700 border-red-200' },
]

export function stageOf(order) {
  return ORDER_STAGES.find((st) => st.statuses.includes(order?.order_status)) || ORDER_STAGES[0]
}

// वर्ग के क्रम में, फिर वर्ग के अंदर काम के चरण के क्रम में, फिर नया ऑर्डर ऊपर
export function sortOrders(list) {
  const stageIdx = (o) => ORDER_STAGES.indexOf(stageOf(o))
  const stepIdx = (o) => stageOf(o).statuses.indexOf(o.order_status)
  return [...list].sort((a, b) =>
    stageIdx(a) - stageIdx(b) ||
    stepIdx(a) - stepIdx(b) ||
    new Date(b.created_at) - new Date(a.created_at))
}
