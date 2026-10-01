// डिलीवरी शुल्क — सब्ज़ी की कीमत से बिल्कुल अलग (Section 14).
// नियम: "कार्ट सबटोटल >= min_subtotal हो तो fee". सबसे ऊँचा लागू min_subtotal जीतता है।
// `zone` कॉलम भविष्य के ज़ोन/दूरी-आधारित रेट के लिए है: अभी zone = null वाले नियम ही चलते हैं,
// zone दिया जाए और उस ज़ोन के नियम हों तो वही चलेंगे।

import { round2 } from './engine.js'

function usable(rules, zone) {
  const all = (Array.isArray(rules) ? rules : []).filter(
    (r) => r && r.is_active !== false && Number.isFinite(Number(r.min_subtotal)) && Number(r.min_subtotal) >= 0 && Number.isFinite(Number(r.fee)) && Number(r.fee) >= 0
  )
  if (zone) {
    const zoned = all.filter((r) => r.zone === zone)
    if (zoned.length) return zoned
  }
  return all.filter((r) => !r.zone)
}

/** @returns {{fee:number, isFree:boolean, rule:object|null, source:'rule'|'settings'}} */
export function calculateDeliveryFee(subtotal, rules, fallback = {}, zone = null) {
  const s = Number(subtotal) || 0
  const list = usable(rules, zone)
  let best = null
  for (const r of list) {
    if (Number(r.min_subtotal) <= s && (!best || Number(r.min_subtotal) > Number(best.min_subtotal))) best = r
  }
  if (best) return { fee: round2(Number(best.fee)), isFree: Number(best.fee) === 0, rule: best, source: 'rule' }

  // कोई नियम नहीं (या सबसे छोटा नियम भी ऊपर से शुरू) → पुरानी delivery_settings
  const base = Number(fallback.delivery_fee)
  const freeAbove = fallback.free_delivery_above == null ? null : Number(fallback.free_delivery_above)
  const fee = freeAbove && s >= freeAbove ? 0 : Number.isFinite(base) && base >= 0 ? base : 0
  return { fee: round2(fee), isFree: fee === 0, rule: null, source: 'settings' }
}

/** "और ₹X जोड़ें तो डिलीवरी मुफ़्त/सस्ती" — अगला सस्ता स्तर. नहीं हो तो null */
export function nextDeliveryBenefit(subtotal, rules, fallback = {}, zone = null) {
  const s = Number(subtotal) || 0
  const current = calculateDeliveryFee(s, rules, fallback, zone)
  const list = usable(rules, zone)
    .filter((r) => Number(r.min_subtotal) > s && Number(r.fee) < current.fee)
    .sort((a, b) => Number(a.min_subtotal) - Number(b.min_subtotal))
  if (!list.length) return null
  const next = list[0]
  return { addAmount: round2(Number(next.min_subtotal) - s), fee: Number(next.fee), isFree: Number(next.fee) === 0 }
}

/** न्यूनतम ऑर्डर में कितना कम है (0 = पूरा) */
export function minOrderShortfall(subtotal, minOrderValue) {
  const min = Number(minOrderValue)
  if (!Number.isFinite(min) || min <= 0) return 0
  const s = Number(subtotal) || 0
  return Math.max(0, round2(min - s))
}

/** नियम-सूची की जांच (एडमिन सेटिंग सेव से पहले) */
export function validateDeliveryRules(rules) {
  const errors = []
  const seen = new Set()
  ;(rules || []).forEach((r, i) => {
    const min = Number(r.min_subtotal)
    const fee = Number(r.fee)
    if (r.min_subtotal === '' || !Number.isFinite(min) || min < 0) errors.push({ row: i, code: 'MIN_INVALID' })
    if (r.fee === '' || !Number.isFinite(fee) || fee < 0) errors.push({ row: i, code: 'FEE_INVALID' })
    const key = `${r.zone || ''}|${min}`
    if (seen.has(key)) errors.push({ row: i, code: 'DUPLICATE_MIN' })
    seen.add(key)
  })
  if (!(rules || []).some((r) => Number(r.min_subtotal) === 0 && !r.zone)) errors.push({ row: -1, code: 'NO_BASE_RULE' })
  return errors
}
