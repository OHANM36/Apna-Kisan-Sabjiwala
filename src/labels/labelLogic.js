import { isCod, isCodOnline, isPaid } from '../utils/paymentMethods.js'

// शिपिंग/डिलीवरी लेबल का शुद्ध (pure) तर्क — कोई React/DOM नहीं, इसलिए node --test से जाँचा जा सकता है।
// ध्यान: यह फ़ाइल सिर्फ़ दिखाने/छापने का हिसाब करती है; ऑर्डर/भुगतान/डिलीवरी की स्थिति कभी नहीं बदलती।

export const MAX_BAGS = 20
export const A4 = { w: 210, h: 297, sheetH: 296 } // sheetH: 1mm कम — कुछ ब्राउज़र में खाली दूसरा पन्ना न बने

// A4 की स्टिकर-शीट के टेम्पलेट। नई शीट (pre-cut) जोड़नी हो तो बस यहाँ एक और आइटम जोड़ें।
// gapX/gapY = लेबलों के बीच खाली जगह (सादी शीट पर 0); offsetX/offsetY खाली छोड़ें तो शीट पर बीच में रखा जाता है।
export const A4_TEMPLATES = [
  { id: 'a4-75x50', name: '75 × 50 mm (2 × 5 = 10 लेबल)', cols: 2, rows: 5, labelW: 75, labelH: 50, gapX: 0, gapY: 0, variant: 'std' },
  { id: 'a4-100x75', name: '100 × 75 mm (2 × 3 = 6 लेबल)', cols: 2, rows: 3, labelW: 100, labelH: 75, gapX: 0, gapY: 0, variant: 'large' },
]
export const DEFAULT_A4_TEMPLATE = 'a4-75x50'

// प्रिंट फ़ॉर्मेट। 'sheet' = A4 पर कई लेबल; 'roll' = हर लेबल अपना अलग पन्ना (स्टिकर/थर्मल प्रिंटर)।
// थर्मल रोल की लंबाई ब्राउज़र में "auto" भरोसेमंद नहीं, इसलिए हर लेबल का तय आकार (नीचे w × h mm) रखा है।
export const FORMATS = [
  { id: 'a4', name: 'A4 Multi Label', kind: 'sheet' },
  { id: 'l75x50', name: '75 × 50 mm', kind: 'roll', w: 75, h: 50, variant: 'std' },
  { id: 'l100x75', name: '100 × 75 mm', kind: 'roll', w: 100, h: 75, variant: 'large' },
  { id: 't58', name: '58 mm Thermal', kind: 'roll', w: 58, h: 90, variant: 't58' },
  { id: 't80', name: '80 mm Thermal', kind: 'roll', w: 80, h: 100, variant: 't80' },
]
export const DEFAULT_FORMAT = 'a4'

export const getFormat = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0]
export const getA4Template = (id) => A4_TEMPLATES.find((t) => t.id === id) || A4_TEMPLATES[0]

// शीट पर लेबल-ग्रिड की जगह (mm)। gap/offset न हों तो बीच में।
export function templateLayout(t) {
  const gridW = t.cols * t.labelW + (t.cols - 1) * (t.gapX || 0)
  const gridH = t.rows * t.labelH + (t.rows - 1) * (t.gapY || 0)
  return {
    perSheet: t.cols * t.rows,
    offsetX: t.offsetX ?? Math.round(((A4.w - gridW) / 2) * 100) / 100,
    offsetY: t.offsetY ?? Math.round(((A4.h - gridH) / 2) * 100) / 100,
    gridW,
    gridH,
  }
}

// ---------- बैग ----------
export function normalizeBags(v, fallback = 1) {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(n, MAX_BAGS)
}

export const bagsOf = (order, bagMap = {}) => normalizeBags(bagMap[order.id] ?? order.bag_count ?? 1)

// ऑर्डर × बैग → लेबलों की सूची (हर बैग का अलग लेबल)
export function buildLabels(orders, bagMap = {}) {
  const out = []
  for (const order of orders || []) {
    const bags = bagsOf(order, bagMap)
    for (let bag = 1; bag <= bags; bag++) out.push({ key: `${order.id}:${bag}`, order, bag, bags })
  }
  return out
}

export function paginate(items, perPage) {
  const size = Math.max(1, perPage | 0)
  const pages = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

export const sheetsRequired = (labelCount, perSheet) => (labelCount > 0 ? Math.ceil(labelCount / perSheet) : 0)

// ---------- लेबल की जानकारी ----------
export function shortNumber(n) {
  const m = String(n ?? '').match(/(\d+)\s*$/)
  return m ? `#${m[1].slice(-4).padStart(4, '0')}` : String(n ?? '')
}

export function rupee(v) {
  const n = Number(v || 0)
  return '₹' + (Number.isInteger(n) ? String(n) : n.toFixed(2))
}

// रंग पर भरोसा नहीं (प्रिंटर मोनोक्रोम है): टेक्स्ट + बॉर्डर-शैली से भुगतान की स्थिति
export function paymentBadge(order) {
  const amount = rupee(order?.total_amount)
  if (isCod(order) && !isPaid(order)) {
    return { kind: 'cod', headline: `COD ${amount}`, note: isCodOnline(order) ? 'COLLECT (UPI)' : 'COLLECT CASH' }
  }
  if (isPaid(order)) {
    return { kind: 'paid', headline: 'PAID', note: isCod(order) ? 'COD – RECEIVED' : 'ONLINE' }
  }
  if (order?.payment_status === 'रिफंड') return { kind: 'unpaid', headline: 'REFUNDED', note: amount }
  return { kind: 'unpaid', headline: `UNPAID ${amount}`, note: 'PAYMENT PENDING' }
}

export function deliveryText(order) {
  const parts = []
  if (order?.delivery_date) {
    const [y, m, d] = String(order.delivery_date).split('-').map(Number)
    if (y && m && d) {
      const dt = new Date(Date.UTC(y, m - 1, d))
      parts.push(dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' }))
    }
  }
  if (order?.delivery_time_slot) parts.push(order.delivery_time_slot)
  return parts.join(' | ')
}

export function addressParts(order) {
  const area = String(order?.mohalla || '').trim()
  const street = String(order?.full_address || '').trim()
  const city = String(order?.city || '').trim()
  const pin = String(order?.pincode || '').trim()
  return { area, street, cityPin: [city, pin].filter(Boolean).join(' - ') }
}

// छपाई से पहले दिखाने के लिए: कौन-सी ज़रूरी जानकारी खाली है (नकली जानकारी कभी नहीं भरी जाती)
export function labelProblems(order) {
  const p = []
  if (!String(order?.customer_name || '').trim()) p.push('नाम')
  if (!String(order?.customer_phone || '').trim()) p.push('मोबाइल')
  if (!String(order?.full_address || '').trim()) p.push('पता')
  if (!String(order?.pincode || '').trim()) p.push('पिनकोड')
  return p
}

// QR में सिर्फ़ ऑर्डर नंबर वाला लिंक — कोई टोकन/की/अंदरूनी ID नहीं। खोलने पर डिलीवरी-पैनल का लॉगिन चाहिए।
export function trackUrl(origin, order) {
  return `${String(origin).replace(/\/+$/, '')}/delivery?o=${encodeURIComponent(order?.order_number ?? '')}`
}
