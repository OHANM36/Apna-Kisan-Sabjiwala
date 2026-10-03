import { distanceKm } from './distance.js'
import { DELIVERY_SLOT_HOURS } from './format.js'

// "मेरी डिलीवरी" के ऑर्डर का सुझाया क्रम: पहले डिलीवरी की तारीख और स्लॉट (ग्राहक से किया वादा),
// फिर एक ही स्लॉट के अंदर सबसे छोटा रास्ता (सबसे पास वाले से शुरू + 2-opt सुधार)। दूरी सीधी (हवाई) है।
// origin: { lat, lng } = डिलीवरी बॉय की अभी की जगह। origin न हो तो null लौटता है (क्रम सुझाना संभव नहीं)।
// लौटाता है: [{ order, stop (1 से), legKm (पिछले स्टॉप / आपसे दूरी, लोकेशन न हो तो null) }]

const hasCoords = (o) => Number.isFinite(Number(o?.latitude)) && Number.isFinite(Number(o?.longitude)) && !!o.latitude && !!o.longitude
const pt = (o) => ({ lat: Number(o.latitude), lng: Number(o.longitude) })
const d = (a, b) => distanceKm(a, b) ?? 0

function slotKey(o) {
  return DELIVERY_SLOT_HOURS[o.delivery_time_slot]?.[0] ?? 99
}

// स्टार्ट से शुरू होकर stops (points) को छोटे रास्ते में लगाता है; stops के सूचकांकों का क्रम लौटाता है
function shortestOpenPath(start, points) {
  const n = points.length
  const left = points.map((_, i) => i)
  const order = []
  let cur = start
  while (left.length) {
    let bi = 0
    for (let k = 1; k < left.length; k++) if (d(cur, points[left[k]]) < d(cur, points[left[bi]])) bi = k
    const idx = left.splice(bi, 1)[0]
    order.push(idx)
    cur = points[idx]
  }
  if (n < 4) return order

  // 2-opt: [start, ...order] में हिस्सा उलटने से रास्ता छोटा हो तो उलटें (start अपनी जगह रहता है)
  const P = (k) => (k === 0 ? start : points[order[k - 1]])
  let improved = true
  let guard = 0
  while (improved && guard++ < 50) {
    improved = false
    for (let i = 1; i < n; i++) {
      for (let j = i + 1; j <= n; j++) {
        const before = d(P(i - 1), P(i)) + (j < n ? d(P(j), P(j + 1)) : 0)
        const after = d(P(i - 1), P(j)) + (j < n ? d(P(i), P(j + 1)) : 0)
        if (after + 1e-9 < before) {
          const seg = order.slice(i - 1, j).reverse()
          order.splice(i - 1, j - i + 1, ...seg)
          improved = true
        }
      }
    }
  }
  return order
}

export function suggestStopOrder(orders, origin) {
  if (!origin || !Number.isFinite(Number(origin.lat)) || !Number.isFinite(Number(origin.lng))) return null
  const list = Array.isArray(orders) ? orders : []

  // तारीख (अगर मालूम हो) → स्लॉट का समय → पुराना ऑर्डर पहले
  const sorted = [...list].sort((a, b) =>
    String(a.delivery_date || '').localeCompare(String(b.delivery_date || '')) ||
    slotKey(a) - slotKey(b) ||
    new Date(a.created_at || 0) - new Date(b.created_at || 0))

  const groups = []
  for (const o of sorted) {
    const key = `${o.delivery_date || ''}|${slotKey(o)}`
    const g = groups[groups.length - 1]
    if (g && g.key === key) g.items.push(o)
    else groups.push({ key, items: [o] })
  }

  const result = []
  let here = { lat: Number(origin.lat), lng: Number(origin.lng) }
  for (const g of groups) {
    const located = g.items.filter(hasCoords)
    const unlocated = g.items.filter((o) => !hasCoords(o))
    const pts = located.map(pt)
    const idxOrder = shortestOpenPath(here, pts)
    for (const idx of idxOrder) {
      result.push({ order: located[idx], stop: result.length + 1, legKm: distanceKm(here, pts[idx]) })
      here = pts[idx]
    }
    for (const o of unlocated) result.push({ order: o, stop: result.length + 1, legKm: null })
  }
  return result
}

// पूरे रास्ते की कुल (सीधी) दूरी, किमी
export function totalLegKm(stops) {
  return (stops || []).reduce((s, x) => s + (x.legKm || 0), 0)
}
