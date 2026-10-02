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

// ---- डिलीवरी की तारीख/समय की जाँच (भारत का समय — सर्वर भी Asia/Kolkata की तारीख से जाँचता है) ----

// स्लॉट (शुरू, ख़त्म) घंटे — DELIVERY_TIME_SLOTS के नाम से मेल खाने चाहिए
export const DELIVERY_SLOT_HOURS = {
  'सुबह 7 - 9 बजे': [7, 9],
  'सुबह 9 - 11 बजे': [9, 11],
  'दोपहर 12 - 2 बजे': [12, 14],
  'शाम 4 - 6 बजे': [16, 18],
  'शाम 6 - 8 बजे': [18, 20],
}

// स्लॉट ख़त्म होने से इतने मिनट पहले तक ऑर्डर लिया जाता है (सुरक्षित margin)
// जैसे 9-11 का स्लॉट 10:00 तक चुना जा सकता है, 10:01 से बंद
export const SLOT_CUTOFF_MINUTES = 60

// अभी का भारतीय समय: { date: 'YYYY-MM-DD', minutes: दिन के शुरू से बीते मिनट }
export function istNow(base = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(base)
  const g = (t) => parts.find((p) => p.type === t)?.value
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')) }
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// इस तारीख पर यह स्लॉट अभी चुना जा सकता है?
export function isSlotAvailable(slot, dateStr, now = istNow()) {
  if (!dateStr || dateStr < now.date) return false
  if (dateStr > now.date) return true
  const hours = DELIVERY_SLOT_HOURS[slot]
  if (!hours) return true // अनजान स्लॉट: सर्वर तय करेगा
  return now.minutes <= hours[1] * 60 - SLOT_CUTOFF_MINUTES
}

// अभी सबसे पहली उपलब्ध (तारीख, स्लॉट): आज कोई स्लॉट बचा हो तो आज, वरना कल का पहला
export function defaultDelivery(now = istNow()) {
  const todaySlot = DELIVERY_TIME_SLOTS.find((s) => isSlotAvailable(s, now.date, now))
  if (todaySlot) return { date: now.date, slot: todaySlot, todayFull: false }
  return { date: addDays(now.date, 1), slot: DELIVERY_TIME_SLOTS[0], todayFull: true }
}

// एडमिन के लिए: डिलीवरी का समय निकल गया पर ऑर्डर अभी पूरा/रद्द नहीं हुआ?
export function isDeliveryOverdue(order, now = istNow()) {
  if (!order?.delivery_date || ['डिलीवरी पूरी हुई', 'रद्द'].includes(order.order_status)) return false
  if (order.delivery_date < now.date) return true
  if (order.delivery_date > now.date) return false
  const hours = DELIVERY_SLOT_HOURS[order.delivery_time_slot]
  return hours ? now.minutes > hours[1] * 60 : false
}
