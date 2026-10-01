// प्राइस अलर्ट (Section 18) — शुद्ध फ़ंक्शन; डैशबोर्ड और प्रोडक्ट सूची दोनों यही इस्तेमाल करते हैं।
import { resolveSettings, markupPercent, percentChange } from './engine.js'
import { daysSince, resolveParams } from './products.js'

export const ALERT_TYPES = ['purchase_up', 'purchase_down', 'margin_low', 'below_safe', 'high_wastage', 'stale', 'no_profile']

/**
 * items: [{ veg, profile|null, rule|null }]  (सिर्फ़ मालिक की अपनी सब्ज़ियां, seller_id null)
 * लौटाता है [{ type, severity:'high'|'medium'|'low', vegetable_id, name, params }]
 */
export function computeAlerts(items, settingsIn, now = new Date()) {
  const s = resolveSettings(settingsIn)
  const out = []
  for (const { veg, profile, rule } of items || []) {
    if (!veg) continue
    const base = { vegetable_id: veg.id, name: veg.name }
    if (!profile) {
      out.push({ ...base, type: 'no_profile', severity: 'low', params: {} })
      continue
    }
    const { wastage } = resolveParams(profile, rule, s)
    const published = Number(profile.published_price)
    const baseCost = Number(profile.base_cost)
    const minSafe = Number(profile.min_safe_price)

    // खरीद कीमत में बड़ा बदलाव (पिछले सेव की तुलना में)
    const change = percentChange(profile.previous_purchase_price, profile.purchase_price)
    if (change !== null && Math.abs(change) >= s.purchaseChangeAlertPercent && s.purchaseChangeAlertPercent >= 0 && change !== 0) {
      out.push({
        ...base,
        type: change > 0 ? 'purchase_up' : 'purchase_down',
        severity: change > 0 ? 'high' : 'medium',
        params: { from: Number(profile.previous_purchase_price), to: Number(profile.purchase_price), percent: change },
      })
    }
    if (Number.isFinite(published) && Number.isFinite(minSafe) && published < minSafe) {
      out.push({ ...base, type: 'below_safe', severity: 'high', params: { price: published, minSafe } })
    } else {
      const mk = markupPercent(published, baseCost)
      if (mk !== null && mk < s.lowMarginPercent) out.push({ ...base, type: 'margin_low', severity: 'medium', params: { percent: mk, threshold: s.lowMarginPercent } })
    }
    if (wastage >= s.highWastagePercent) out.push({ ...base, type: 'high_wastage', severity: 'medium', params: { percent: wastage } })
    const d = daysSince(profile.last_price_updated_at, now)
    if (d > s.staleAfterDays) out.push({ ...base, type: 'stale', severity: 'low', params: { days: Number.isFinite(d) ? d : null } })
  }
  const rank = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

/** गिनतियां: कितने अलग-अलग प्रोडक्ट को "समीक्षा" चाहिए (खरीद-बदलाव/घाटा/कम मार्जिन) */
export function reviewCount(alerts) {
  const review = new Set(['purchase_up', 'purchase_down', 'below_safe', 'margin_low'])
  return new Set(alerts.filter((a) => review.has(a.type)).map((a) => a.vegetable_id)).size
}
