// प्रोडक्ट-स्तर के हेल्पर: DB पंक्तियों → इंजन इनपुट, ग्राहक-टियर, और publish_prices() का payload।
// फ़ॉर्मूला यहां नहीं है — सारी गणना engine.js से।

import { calculateSellingPrice, resolveCustomerPrice, resolveSettings, UNITS, baseUnitOf, round2 } from './engine.js'

const n = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** IST की तारीख 'YYYY-MM-DD' */
export function istDate(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

export function stockAgeDays(receivedDate, today = istDate()) {
  if (!receivedDate) return 0
  const a = Date.parse(String(receivedDate).slice(0, 10))
  const b = Date.parse(today)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.floor((b - a) / 86400000))
}

/** समय-स्टाम्प से अब तक कितने (IST) दिन */
export function daysSince(ts, now = new Date()) {
  if (!ts) return Infinity
  const t = new Date(ts)
  if (Number.isNaN(t.getTime())) return Infinity
  return stockAgeDays(istDate(t), istDate(now))
}

/** स्टोर की `vegetables.unit` (हिंदी) → खरीद यूनिट */
export function purchaseUnitFromStoreUnit(u) {
  if (u === 'नग') return 'piece'
  if (u === 'गड्डी') return 'bunch'
  return 'kg'
}

/** selling unit → `vegetables.unit` (DB में सिर्फ़ किलो/नग/गड्डी) */
export function storeUnitFor(sellingUnit) {
  const base = baseUnitOf(sellingUnit)
  return base === 'piece' ? 'नग' : base === 'bunch' ? 'गड्डी' : 'किलो'
}

/** pack-price → ग्राहक `price_tiers` की एक पंक्ति */
export function tierFromPack(p) {
  const grams = UNITS[p.unit]?.grams
  if (p.unit === 'kg' || grams === 1000) return { qty: 1, unit: 'किलो', price: p.price }
  return { qty: grams, unit: 'ग्राम', price: p.price }
}

export function tiersFromPacks(packPrices) {
  if (!packPrices || packPrices.length === 0) return null
  return packPrices.map(tierFromPack)
}

/** प्रोफ़ाइल/श्रेणी-नियम/सेटिंग से असल wastage, handling, margin (खाली = डिफ़ॉल्ट) */
export function resolveParams(profile, rule, settings) {
  const s = resolveSettings(settings)
  const pick = (own, ruleVal, def) => n(own) ?? n(ruleVal) ?? def
  return {
    wastage: pick(profile?.wastage_pct, rule?.wastage_pct, s.defaultWastagePercent),
    handling: pick(profile?.handling_cost, rule?.handling_cost, s.defaultHandlingCost),
    margin: pick(profile?.margin_pct, rule?.margin_pct, s.defaultMarginPercent),
  }
}

/**
 * एक प्रोडक्ट की पूरी गणना.
 * p = { purchasePrice, purchaseUnit, sellingUnit, packSizes, wastage, handling, margin, demandLevel,
 *       allowClearance, manualOverride, manualPrice, lossConfirmed, stockAge, previousPurchasePrice }
 */
export function computeProduct(p, settings) {
  const calc = calculateSellingPrice({
    purchasePrice: p.purchasePrice,
    purchaseUnit: p.purchaseUnit,
    sellingUnit: p.sellingUnit,
    packSizes: p.packSizes,
    wastagePercent: p.wastage,
    handlingCost: p.handling,
    marginPercent: p.margin,
    demandLevel: p.demandLevel || 'normal',
    allowClearance: !!p.allowClearance,
    stockAge: p.stockAge || 0,
    previousPurchasePrice: p.previousPurchasePrice,
    settings,
  })
  const cust = resolveCustomerPrice(calc, {
    manualOverride: !!p.manualOverride,
    manualPrice: p.manualPrice,
    lossConfirmed: !!p.lossConfirmed,
    sellingUnit: p.sellingUnit,
    packSizes: p.packSizes,
    settings,
  })
  return { calc, cust, tiers: cust.valid ? tiersFromPacks(cust.packPrices) : null, valid: calc.valid && cust.valid }
}

/** DB की पंक्तियों से p बनाएं. overrides में आज की नई खरीद कीमत आदि */
export function productInputFrom(veg, profile, rule, settings, overrides = {}) {
  const { wastage, handling, margin } = resolveParams(profile, rule, settings)
  const purchaseUnit = overrides.purchaseUnit ?? profile?.purchase_unit ?? purchaseUnitFromStoreUnit(veg.unit)
  return {
    purchasePrice: overrides.purchasePrice ?? profile?.purchase_price,
    purchaseUnit,
    sellingUnit: overrides.sellingUnit ?? profile?.selling_unit ?? purchaseUnit,
    packSizes: overrides.packSizes ?? profile?.pack_sizes ?? [],
    wastage: overrides.wastage ?? wastage,
    handling: overrides.handling ?? handling,
    margin: overrides.margin ?? margin,
    demandLevel: overrides.demandLevel ?? profile?.demand_level ?? 'normal',
    allowClearance: overrides.allowClearance ?? profile?.allow_clearance ?? false,
    manualOverride: overrides.manualOverride ?? profile?.manual_override ?? false,
    manualPrice: overrides.manualPrice ?? profile?.manual_price ?? null,
    lossConfirmed: overrides.lossConfirmed ?? profile?.loss_price_confirmed ?? false,
    stockAge: overrides.stockAge ?? 0,
    previousPurchasePrice: overrides.previousPurchasePrice ?? profile?.purchase_price ?? null,
  }
}

/**
 * publish_prices() का एक आइटम. `stored` = प्रोफ़ाइल में सहेजे जाने वाले (खाली = श्रेणी डिफ़ॉल्ट) wastage/handling/margin.
 */
export function buildPublishItem({ veg, profile, p, computed, stored = {}, stockReceivedAt = null }) {
  const { calc, cust, tiers } = computed
  const freshness = calc.freshnessAdjustment?.percent ?? 0
  const demand = calc.demandAdjustment?.percent ?? 0
  return {
    vegetable_id: veg.id,
    base_version: profile ? profile.version : null,
    purchase_price: round2(Number(p.purchasePrice)),
    purchase_unit: p.purchaseUnit,
    selling_unit: p.sellingUnit,
    pack_sizes: p.packSizes || [],
    wastage_pct: stored.wastage ?? null,
    handling_cost: stored.handling ?? null,
    margin_pct: stored.margin ?? null,
    demand_level: p.demandLevel || 'normal',
    allow_clearance: !!p.allowClearance,
    manual_override: !!p.manualOverride,
    manual_price: p.manualOverride ? round2(Number(p.manualPrice)) : null,
    loss_confirmed: !!p.lossConfirmed,
    stock_received_at: stockReceivedAt,
    store_unit: storeUnitFor(p.sellingUnit),
    price_tiers: tiers,
    snapshot: {
      purchase_per_base: calc.purchasePricePerBase,
      effective_cost: calc.effectiveCost,
      base_cost: calc.baseCost,
      min_safe_price: calc.minimumSafePrice,
      recommended_price: calc.recommendedPrice,
      published_price: cust.price,
      price_source: cust.source,
      min_protection_applied: !!calc.minimumProtectionApplied,
      wastage_pct: p.wastage,
      handling_cost: p.handling,
      margin_pct: p.margin,
      stock_age_days: p.stockAge || 0,
      freshness_pct: freshness,
      demand_pct: demand,
      rounding_mode: calc.roundingMode,
    },
  }
}

/** DB की settings-पंक्ति (snake_case) ↔ इंजन settings (camelCase) */
export function settingsFromRow(row) {
  if (!row) return resolveSettings(null)
  return resolveSettings({
    roundingMode: row.rounding_mode,
    smallUnitRoundingMode: row.small_unit_rounding_mode,
    minSafetyMarginPercent: n(row.min_safety_margin_pct),
    maxWastagePercent: n(row.max_wastage_pct),
    maxMarginPercent: n(row.max_margin_pct),
    defaultWastagePercent: n(row.default_wastage_pct),
    defaultHandlingCost: n(row.default_handling_cost),
    defaultMarginPercent: n(row.default_margin_pct),
    freshnessEnabled: row.freshness_enabled,
    freshnessTiers: row.freshness_tiers,
    demandEnabled: row.demand_enabled,
    demandLowPercent: n(row.demand_low_pct),
    demandHighPercent: n(row.demand_high_pct),
    demandMaxIncreasePercent: n(row.demand_max_increase_pct),
    demandMaxDecreasePercent: n(row.demand_max_decrease_pct),
    staleAfterDays: n(row.stale_after_days),
    purchaseChangeAlertPercent: n(row.purchase_change_alert_pct),
    lowMarginPercent: n(row.low_margin_pct),
    highWastagePercent: n(row.high_wastage_pct),
    deliveryCostPerOrder: n(row.delivery_cost_per_order),
    paymentChargePercent: n(row.payment_charge_pct),
  })
}

export function settingsToRow(s) {
  return {
    rounding_mode: s.roundingMode,
    small_unit_rounding_mode: s.smallUnitRoundingMode,
    min_safety_margin_pct: s.minSafetyMarginPercent,
    max_wastage_pct: s.maxWastagePercent,
    max_margin_pct: s.maxMarginPercent,
    default_wastage_pct: s.defaultWastagePercent,
    default_handling_cost: s.defaultHandlingCost,
    default_margin_pct: s.defaultMarginPercent,
    freshness_enabled: s.freshnessEnabled,
    freshness_tiers: s.freshnessTiers.map((t) => ({ minDays: t.minDays, percent: t.percent })),
    demand_enabled: s.demandEnabled,
    demand_low_pct: s.demandLowPercent,
    demand_high_pct: s.demandHighPercent,
    demand_max_increase_pct: s.demandMaxIncreasePercent,
    demand_max_decrease_pct: s.demandMaxDecreasePercent,
    stale_after_days: s.staleAfterDays,
    purchase_change_alert_pct: s.purchaseChangeAlertPercent,
    low_margin_pct: s.lowMarginPercent,
    high_wastage_pct: s.highWastagePercent,
    delivery_cost_per_order: s.deliveryCostPerOrder,
    payment_charge_pct: s.paymentChargePercent,
  }
}

/**
 * मौजूदा ग्राहक `price_tiers` से पैक-साइज़ निकालें ताकि प्राइसिंग शुरू करने पर पहले से बिक रहे पैक गायब न हों.
 * लौटाता है { sellingUnit, packSizes, dropped } — dropped = पहचान में न आए (जैसे 750 ग्राम) टियर की संख्या.
 */
export function packSizesFromTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return { sellingUnit: null, packSizes: [], dropped: 0 }
  const codes = []
  let dropped = 0
  for (const t of tiers) {
    const qty = Number(t?.qty)
    const grams = t?.unit === 'किलो' ? qty * 1000 : t?.unit === 'ग्राम' ? qty : NaN
    const code = grams === 1000 ? 'kg' : grams === 500 ? '500g' : grams === 250 ? '250g' : grams === 200 ? '200g' : grams === 100 ? '100g' : null
    if (code) codes.push(code)
    else dropped++
  }
  const uniq = [...new Set(codes)]
  if (!uniq.length) return { sellingUnit: null, packSizes: [], dropped }
  return { sellingUnit: uniq[0], packSizes: uniq.slice(1), dropped }
}
