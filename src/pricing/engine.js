// =====================================================================
// AKS Dynamic Pricing Engine — एकमात्र (centralized) कीमत निकालने वाला मॉड्यूल
//
// नियम: पूरे ऐप में कहीं भी कीमत का फ़ॉर्मूला दोबारा न लिखें — हर स्क्रीन/API
// इसी फ़ाइल के फ़ंक्शन इस्तेमाल करे।
//
// * शुद्ध (pure) फ़ंक्शन: कोई नेटवर्क/DOM/तारीख की निर्भरता नहीं (stockAge दिनों में बाहर से आता है)
// * सभी रकमें "प्रति बेस-यूनिट" हैं: वज़न वाली सब्ज़ी के लिए प्रति किलो, गिनती वाली के लिए प्रति नग/गड्डी
// * हर बीच का चरण 2 दशमलव (पैसे) तक राउंड होता है, ताकि एडमिन को दिखने वाला
//   ब्रेकडाउन ठीक जोड़ खाए (₹32.61 + ₹2 = ₹34.61)
// * राउंडिंग/तुलना पूर्णांक-पैसों (cents) में होती है, ताकि 42.00000001 जैसी फ़्लोट गड़बड़ी से
//   कीमत ₹43 न हो जाए
// =====================================================================

export const UNITS = Object.freeze({
  kg: { family: 'weight', grams: 1000 },
  '500g': { family: 'weight', grams: 500 },
  '250g': { family: 'weight', grams: 250 },
  '200g': { family: 'weight', grams: 200 },
  '100g': { family: 'weight', grams: 100 },
  piece: { family: 'count' },
  bunch: { family: 'count' },
})
export const UNIT_CODES = Object.freeze(Object.keys(UNITS))
export const WEIGHT_UNITS = Object.freeze(['kg', '500g', '250g', '200g', '100g'])
export const ROUNDING_MODES = Object.freeze([
  'ceil_1', // अगले ₹1 तक ऊपर (डिफ़ॉल्ट): 25.21→26, 41.53→42
  'nearest_1', // सबसे पास का ₹1
  'nearest_5', // सबसे पास का ₹5
  'psychological', // अगला ₹1, और ₹20/30/40... हो तो ₹1 कम: 40→39, 50→49
  'ceil_0_5', // अगले ₹0.50 तक ऊपर (छोटे पैक के लिए)
  'nearest_0_5',
  'none', // सिर्फ़ 2 दशमलव
])
export const DEMAND_LEVELS = Object.freeze(['low', 'normal', 'high'])

export const DEFAULT_PRICING_SETTINGS = Object.freeze({
  roundingMode: 'ceil_1',
  smallUnitRoundingMode: 'ceil_1',
  minSafetyMarginPercent: 0, // 0 = ठीक लागत (break-even) से नीचे कभी नहीं
  maxWastagePercent: 50, // सुरक्षित सीमा (हमेशा < 100)
  maxMarginPercent: 200,
  defaultWastagePercent: 5,
  defaultHandlingCost: 0,
  defaultMarginPercent: 20,
  freshnessEnabled: true,
  freshnessTiers: Object.freeze([
    { minDays: 0, percent: 0 },
    { minDays: 1, percent: 5 },
    { minDays: 2, percent: 10 },
    { minDays: 3, percent: 15 }, // ज़्यादा खराब होने का जोखिम
  ]),
  demandEnabled: false,
  demandLowPercent: -5,
  demandNormalPercent: 0,
  demandHighPercent: 5,
  demandMaxIncreasePercent: 10,
  demandMaxDecreasePercent: 10,
  staleAfterDays: 2,
  purchaseChangeAlertPercent: 10,
  lowMarginPercent: 8,
  highWastagePercent: 25,
  deliveryCostPerOrder: 20,
  paymentChargePercent: 2,
})

// ---------------------------------------------------------------------
// छोटे हेल्पर
// ---------------------------------------------------------------------

function num(v) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return NaN
  return Number(v)
}

/** पैसे तक राउंड (half-up), फ़्लोट शोर हटाकर */
export function round2(x) {
  if (!Number.isFinite(x)) return x
  return Math.round(Number((x * 100).toPrecision(12))) / 100
}

function toCents(x) {
  return Math.round(Number((x * 100).toPrecision(12)))
}

const ceilTo = (cents, step) => Math.ceil(cents / step) * step
const roundTo = (cents, step) => Math.round(cents / step) * step

// ---------------------------------------------------------------------
// राउंडिंग
// ---------------------------------------------------------------------

/** मोड के हिसाब से ग्राहक-अनुकूल कीमत। value पहले से 2-दशमलव रकम मानी जाती है। */
export function applyRounding(value, mode = 'ceil_1') {
  if (!Number.isFinite(value)) return value
  const c = toCents(value)
  switch (mode) {
    case 'ceil_1':
      return ceilTo(c, 100) / 100
    case 'nearest_1':
      return roundTo(c, 100) / 100
    case 'nearest_5':
      return roundTo(c, 500) / 100
    case 'ceil_0_5':
      return ceilTo(c, 50) / 100
    case 'nearest_0_5':
      return roundTo(c, 50) / 100
    case 'psychological': {
      const rupees = ceilTo(c, 100) / 100
      return rupees >= 20 && rupees % 10 === 0 ? rupees - 1 : rupees
    }
    default:
      return c / 100
  }
}

// राउंडिंग के बाद अगर कीमत फ़्लोर से नीचे चली जाए तो फ़्लोर को ऊपर की ओर इसी स्टेप में राउंड करते हैं
function floorStepCents(mode) {
  if (mode === 'nearest_5') return 500
  if (mode === 'ceil_0_5' || mode === 'nearest_0_5') return 50
  if (mode === 'none') return 1
  return 100
}

/** राउंड करके यह पक्का करता है कि नतीजा `floor` (Minimum Safe Price) से नीचे न जाए */
export function roundWithFloor(value, mode, floor, allowBelowFloor = false) {
  let r = applyRounding(value, mode)
  if (!allowBelowFloor && Number.isFinite(floor) && toCents(r) < toCents(floor)) {
    r = ceilTo(toCents(floor), floorStepCents(mode)) / 100
  }
  return r
}

// ---------------------------------------------------------------------
// यूनिट
// ---------------------------------------------------------------------

export function isValidUnit(u) {
  return Object.prototype.hasOwnProperty.call(UNITS, u)
}

/** 'kg' | 'piece' | 'bunch' — वो इकाई जिसमें कीमत रखी जाती है */
export function baseUnitOf(unit) {
  return UNITS[unit]?.family === 'weight' ? 'kg' : unit
}

/** इस यूनिट में कितना बेस-यूनिट है (500g → 0.5, piece → 1) */
export function unitToBaseFactor(unit) {
  const u = UNITS[unit]
  if (!u) return NaN
  return u.family === 'weight' ? u.grams / 1000 : 1
}

/** क्या दोनों यूनिट एक ही बेस में बदल सकती हैं? (kg↔500g ठीक, kg↔piece नहीं, piece↔bunch नहीं) */
export function unitsCompatible(a, b) {
  if (!isValidUnit(a) || !isValidUnit(b)) return false
  return baseUnitOf(a) === baseUnitOf(b)
}

// ---------------------------------------------------------------------
// सेटिंग्स — गायब/खराब वैल्यू पर डिफ़ॉल्ट (graceful)
// ---------------------------------------------------------------------

export function sanitizeFreshnessTiers(tiers) {
  if (!Array.isArray(tiers)) return null
  const clean = tiers
    .map((t) => {
      const tier = { minDays: Math.floor(num(t?.minDays ?? t?.min_days)), percent: num(t?.percent ?? t?.pct) }
      if (typeof t?.label === 'string') tier.label = t.label
      return tier
    })
    .filter((t) => Number.isFinite(t.minDays) && t.minDays >= 0 && Number.isFinite(t.percent) && t.percent >= 0 && t.percent <= 90)
    .sort((a, b) => a.minDays - b.minDays)
  if (clean.length === 0) return null
  // पहला स्तर हमेशा 0 दिन से शुरू हो
  if (clean[0].minDays !== 0) clean.unshift({ minDays: 0, percent: 0 })
  return clean
}

export function resolveSettings(partial) {
  const d = DEFAULT_PRICING_SETTINGS
  const s = partial && typeof partial === 'object' ? partial : {}
  const numeric = (key, { min = -Infinity, max = Infinity } = {}) => {
    const n = num(s[key])
    return Number.isFinite(n) && n >= min && n <= max ? n : d[key]
  }
  const bool = (key) => (typeof s[key] === 'boolean' ? s[key] : d[key])
  const mode = (key) => (ROUNDING_MODES.includes(s[key]) ? s[key] : d[key])
  return {
    roundingMode: mode('roundingMode'),
    smallUnitRoundingMode: mode('smallUnitRoundingMode'),
    minSafetyMarginPercent: numeric('minSafetyMarginPercent', { min: 0, max: 500 }),
    maxWastagePercent: numeric('maxWastagePercent', { min: 0, max: 99 }),
    maxMarginPercent: numeric('maxMarginPercent', { min: 0, max: 1000 }),
    defaultWastagePercent: numeric('defaultWastagePercent', { min: 0, max: 99 }),
    defaultHandlingCost: numeric('defaultHandlingCost', { min: 0 }),
    defaultMarginPercent: numeric('defaultMarginPercent', { min: 0, max: 1000 }),
    freshnessEnabled: bool('freshnessEnabled'),
    freshnessTiers: sanitizeFreshnessTiers(s.freshnessTiers) || d.freshnessTiers,
    demandEnabled: bool('demandEnabled'),
    demandLowPercent: numeric('demandLowPercent', { min: -90, max: 0 }),
    demandNormalPercent: 0,
    demandHighPercent: numeric('demandHighPercent', { min: 0, max: 100 }),
    demandMaxIncreasePercent: numeric('demandMaxIncreasePercent', { min: 0, max: 100 }),
    demandMaxDecreasePercent: numeric('demandMaxDecreasePercent', { min: 0, max: 90 }),
    staleAfterDays: numeric('staleAfterDays', { min: 1, max: 365 }),
    purchaseChangeAlertPercent: numeric('purchaseChangeAlertPercent', { min: 0, max: 1000 }),
    lowMarginPercent: numeric('lowMarginPercent', { min: 0, max: 1000 }),
    highWastagePercent: numeric('highWastagePercent', { min: 0, max: 99 }),
    deliveryCostPerOrder: numeric('deliveryCostPerOrder', { min: 0 }),
    paymentChargePercent: numeric('paymentChargePercent', { min: 0, max: 20 }),
  }
}

/** stock की उम्र (दिन) के हिसाब से freshness छूट % */
export function freshnessPercentFor(days, tiers) {
  let pct = 0
  for (const t of tiers) {
    if (days >= t.minDays) pct = t.percent
  }
  return pct
}

/** Demand % (सीमाओं के भीतर). लौटाता है {percent, clamped} */
export function demandPercentFor(level, settings) {
  const raw =
    level === 'high' ? settings.demandHighPercent : level === 'low' ? settings.demandLowPercent : settings.demandNormalPercent
  const clamped = Math.min(Math.max(raw, -settings.demandMaxDecreasePercent), settings.demandMaxIncreasePercent)
  return { percent: clamped, clamped: clamped !== raw }
}

// ---------------------------------------------------------------------
// वैलिडेशन
// ---------------------------------------------------------------------

function err(code, field, message) {
  return { code, field, message }
}

export function validatePricingInput(input, settingsIn) {
  const settings = settingsIn && settingsIn.roundingMode ? settingsIn : resolveSettings(settingsIn)
  const errors = []
  const purchaseUnit = input.purchaseUnit ?? 'kg'
  const sellingUnit = input.sellingUnit ?? purchaseUnit

  const purchasePrice = num(input.purchasePrice)
  if (!Number.isFinite(purchasePrice)) errors.push(err('PURCHASE_PRICE_REQUIRED', 'purchasePrice', 'Purchase price is required.'))
  else if (purchasePrice < 0) errors.push(err('PURCHASE_PRICE_NEGATIVE', 'purchasePrice', 'Purchase price cannot be negative.'))
  else if (purchasePrice === 0) errors.push(err('PURCHASE_PRICE_ZERO', 'purchasePrice', 'Purchase price must be greater than zero.'))

  if (input.wastagePercent !== undefined && input.wastagePercent !== null && input.wastagePercent !== '') {
    const w = num(input.wastagePercent)
    if (!Number.isFinite(w)) errors.push(err('WASTAGE_INVALID', 'wastagePercent', 'Wastage must be a number.'))
    else if (w < 0) errors.push(err('WASTAGE_NEGATIVE', 'wastagePercent', 'Wastage cannot be negative.'))
    else if (w >= 100) errors.push(err('WASTAGE_TOO_HIGH', 'wastagePercent', 'Wastage must be below 100%.'))
    else if (w > settings.maxWastagePercent)
      errors.push(err('WASTAGE_ABOVE_LIMIT', 'wastagePercent', `Wastage is above the configured safe limit of ${settings.maxWastagePercent}%.`))
  }

  if (input.marginPercent !== undefined && input.marginPercent !== null && input.marginPercent !== '') {
    const m = num(input.marginPercent)
    if (!Number.isFinite(m)) errors.push(err('MARGIN_INVALID', 'marginPercent', 'Profit margin must be a number.'))
    else if (m < 0) errors.push(err('MARGIN_NEGATIVE', 'marginPercent', 'Profit margin cannot be negative.'))
    else if (m > settings.maxMarginPercent)
      errors.push(err('MARGIN_ABOVE_LIMIT', 'marginPercent', `Profit margin is above the configured limit of ${settings.maxMarginPercent}%.`))
  }

  if (input.handlingCost !== undefined && input.handlingCost !== null && input.handlingCost !== '') {
    const h = num(input.handlingCost)
    if (!Number.isFinite(h) || h < 0) errors.push(err('HANDLING_INVALID', 'handlingCost', 'Packing/handling cost cannot be negative.'))
  }

  if (!isValidUnit(purchaseUnit)) errors.push(err('UNIT_INVALID', 'purchaseUnit', `Unknown purchase unit "${purchaseUnit}".`))
  if (!isValidUnit(sellingUnit)) errors.push(err('UNIT_INVALID', 'sellingUnit', `Unknown selling unit "${sellingUnit}".`))
  if (isValidUnit(purchaseUnit) && isValidUnit(sellingUnit) && !unitsCompatible(purchaseUnit, sellingUnit))
    errors.push(err('UNIT_MISMATCH', 'sellingUnit', `Cannot convert ${purchaseUnit} to ${sellingUnit}.`))

  if (input.stockAge !== undefined && input.stockAge !== null && input.stockAge !== '') {
    const a = num(input.stockAge)
    if (!Number.isFinite(a) || a < 0) errors.push(err('STOCK_AGE_INVALID', 'stockAge', 'Stock age cannot be negative.'))
  }

  if (input.demandLevel !== undefined && input.demandLevel !== null && !DEMAND_LEVELS.includes(input.demandLevel))
    errors.push(err('DEMAND_INVALID', 'demandLevel', 'Demand level must be low, normal or high.'))

  if (Array.isArray(input.packSizes)) {
    for (const p of input.packSizes) {
      if (!isValidUnit(p) || UNITS[p].family !== 'weight') errors.push(err('PACK_INVALID', 'packSizes', `Invalid pack size "${p}".`))
    }
  }
  return errors
}

/** स्टॉक की मात्रा नकारात्मक नहीं हो सकती */
export function validateQuantity(q) {
  const n = num(q)
  if (!Number.isFinite(n)) return [err('QUANTITY_INVALID', 'quantity', 'Quantity must be a number.')]
  if (n < 0) return [err('QUANTITY_NEGATIVE', 'quantity', 'Quantity cannot be negative.')]
  return []
}

// ---------------------------------------------------------------------
// छोटे पैक की कीमतें (Section 6)
// ---------------------------------------------------------------------

/**
 * प्रति-किलो कीमत से पैक (500g/250g/...) की कीमतें।
 * हर पैक = प्रति-किलो कीमत × हिस्सा, फिर छोटे-पैक की अलग राउंडिंग;
 * minSafePerKg दिया हो तो कोई पैक अपनी सुरक्षित कीमत से नीचे नहीं जाता।
 */
export function derivePackPrices(pricePerKg, units, { smallUnitRoundingMode = 'ceil_1', minSafePerKg = null, allowBelowFloor = false } = {}) {
  const out = []
  const seen = new Set()
  for (const u of units || []) {
    if (!isValidUnit(u) || UNITS[u].family !== 'weight' || seen.has(u)) continue
    seen.add(u)
    const fraction = UNITS[u].grams / 1000
    const exact = round2(pricePerKg * fraction)
    let price
    if (u === 'kg') {
      price = pricePerKg
    } else {
      const floor = minSafePerKg === null ? null : round2(minSafePerKg * fraction)
      price = roundWithFloor(exact, smallUnitRoundingMode, floor, allowBelowFloor || floor === null)
    }
    out.push({ unit: u, fraction, exactPrice: exact, price })
  }
  return out
}

/** बेचे जाने वाले पैक की सूची: selling unit पहले, फिर बाकी (बड़े→छोटे). सिर्फ kg हो तो कोई टियर नहीं */
export function packUnitsFor(sellingUnit, packSizes = []) {
  if (!isValidUnit(sellingUnit) || UNITS[sellingUnit].family !== 'weight') return []
  const extras = [...new Set((packSizes || []).filter((p) => isValidUnit(p) && UNITS[p].family === 'weight' && p !== sellingUnit))]
  extras.sort((a, b) => UNITS[b].grams - UNITS[a].grams)
  const list = [sellingUnit, ...extras]
  return list.length === 1 && list[0] === 'kg' ? [] : list
}

// ---------------------------------------------------------------------
// मुख्य फ़ंक्शन
// ---------------------------------------------------------------------

function invalidResult(errors) {
  return {
    valid: false,
    errors,
    warnings: [],
    baseUnit: null,
    purchasePricePerBase: null,
    effectiveCost: null,
    baseCost: null,
    minimumSafePrice: null,
    baseRecommendedPrice: null,
    freshnessAdjustment: null,
    demandAdjustment: null,
    recommendedPrice: null,
    roundedPrice: null,
    sellingUnitPrice: null,
    packPrices: [],
    minimumProtectionApplied: false,
    clearanceApplied: false,
    explanation: { summary: '', reasons: [], lines: [] },
  }
}

/**
 * calculateSellingPrice({
 *   purchasePrice, purchaseUnit='kg', sellingUnit, wastagePercent, handlingCost, marginPercent,
 *   stockAge (दिन), demandLevel='normal', roundingRule, smallUnitRoundingRule,
 *   previousPurchasePrice, allowClearance=false, packSizes=[], settings
 * })
 *
 * सभी रकमें प्रति बेस-यूनिट (kg / piece / bunch)। purchasePrice और handlingCost "purchaseUnit" के हिसाब से दिए जाते हैं।
 */
export function calculateSellingPrice(input = {}) {
  const settings = resolveSettings(input.settings)
  const purchaseUnit = input.purchaseUnit ?? 'kg'
  const sellingUnit = input.sellingUnit ?? purchaseUnit

  const cleaned = {
    ...input,
    wastagePercent: input.wastagePercent ?? settings.defaultWastagePercent,
    handlingCost: input.handlingCost ?? settings.defaultHandlingCost,
    marginPercent: input.marginPercent ?? settings.defaultMarginPercent,
  }
  const errors = validatePricingInput(cleaned, settings)
  if (errors.length) return invalidResult(errors)

  const warnings = []
  const wastage = num(cleaned.wastagePercent)
  const margin = num(cleaned.marginPercent)
  const handlingPerPurchaseUnit = num(cleaned.handlingCost)
  const stockAge = Math.floor(num(input.stockAge ?? 0)) || 0
  const demandLevel = input.demandLevel ?? 'normal'
  const mainMode = ROUNDING_MODES.includes(input.roundingRule) ? input.roundingRule : settings.roundingMode
  const smallMode = ROUNDING_MODES.includes(input.smallUnitRoundingRule) ? input.smallUnitRoundingRule : settings.smallUnitRoundingMode
  const allowClearance = input.allowClearance === true

  // 1) बेस-यूनिट (प्रति किलो/नग/गड्डी) पर लाओ
  const factor = unitToBaseFactor(purchaseUnit) // 500g → 0.5
  const purchasePerBase = round2(num(input.purchasePrice) / factor)
  const handlingPerBase = round2(handlingPerPurchaseUnit / factor)

  // 2) Effective Cost = Purchase / (1 - wastage) ; Base Cost = Effective + Handling
  const effectiveCost = round2(purchasePerBase / (1 - wastage / 100))
  const wastageAmount = round2(effectiveCost - purchasePerBase)
  const baseCost = round2(effectiveCost + handlingPerBase)

  // 3) Recommended = Base Cost × (1 + margin) ; Minimum Safe = Base Cost × (1 + minSafetyMargin)
  const baseRecommendedPrice = round2(baseCost * (1 + margin / 100))
  const minimumSafePrice = round2(baseCost * (1 + settings.minSafetyMarginPercent / 100))

  // 4) Demand (सीमाओं के भीतर, वैकल्पिक)
  let demandPercent = 0
  let demandAmount = 0
  let demandClamped = false
  const demandActive = settings.demandEnabled
  if (demandActive) {
    const d = demandPercentFor(demandLevel, settings)
    demandPercent = d.percent
    demandClamped = d.clamped
    demandAmount = round2((baseRecommendedPrice * demandPercent) / 100)
    if (demandClamped) warnings.push({ code: 'DEMAND_CLAMPED', params: { percent: demandPercent } })
  }
  const afterDemand = round2(baseRecommendedPrice + demandAmount)

  // 5) Freshness छूट (वैकल्पिक)
  let freshnessPercent = 0
  if (settings.freshnessEnabled) freshnessPercent = freshnessPercentFor(stockAge, settings.freshnessTiers)
  const freshnessAmount = round2((afterDemand * freshnessPercent) / 100)
  const adjusted = round2(afterDemand - freshnessAmount)

  // 6) Minimum Safe Price सुरक्षा — चुपचाप कभी नीचे नहीं
  let recommendedPrice = adjusted
  let minimumProtectionApplied = false
  let clearanceApplied = false
  if (adjusted < minimumSafePrice) {
    if (allowClearance) {
      clearanceApplied = true
      warnings.push({ code: 'CLEARANCE_BELOW_SAFE', params: { price: adjusted, minimumSafePrice } })
    } else {
      recommendedPrice = minimumSafePrice
      minimumProtectionApplied = true
      warnings.push({ code: 'MIN_PRICE_PROTECTION_APPLIED', params: { minimumSafePrice, wouldBe: adjusted } })
    }
  }
  if (!(recommendedPrice > 0)) return invalidResult([err('PRICE_NOT_POSITIVE', 'recommendedPrice', 'Calculated price must be greater than zero.')])

  // 7) ग्राहक-अनुकूल राउंडिंग (फ़्लोर के साथ)
  const roundedPrice = roundWithFloor(recommendedPrice, mainMode, minimumSafePrice, clearanceApplied)
  const roundedDelta = round2(roundedPrice - recommendedPrice)

  // 8) पैक की कीमतें (सिर्फ़ वज़न वाली)
  const packUnits = packUnitsFor(sellingUnit, input.packSizes)
  const packPrices = derivePackPrices(roundedPrice, packUnits, {
    smallUnitRoundingMode: smallMode,
    minSafePerKg: minimumSafePrice,
    allowBelowFloor: clearanceApplied,
  })
  const primaryPack = packPrices.find((p) => p.unit === sellingUnit)
  const sellingUnitPrice = primaryPack ? primaryPack.price : sellingUnit === baseUnitOf(sellingUnit) ? roundedPrice : round2(roundedPrice * unitToBaseFactor(sellingUnit))

  // 9) कारण/स्पष्टीकरण — सिर्फ़ एडमिन के लिए, कभी ग्राहक को नहीं
  const reasons = []
  const prev = num(input.previousPurchasePrice)
  if (Number.isFinite(prev) && prev > 0) {
    const cur = num(input.purchasePrice)
    if (cur > prev) reasons.push({ code: 'COST_UP', params: { from: prev, to: cur } })
    else if (cur < prev) reasons.push({ code: 'COST_DOWN', params: { from: prev, to: cur } })
  }
  if (demandActive && demandPercent > 0) reasons.push({ code: 'DEMAND_HIGH', params: { percent: demandPercent } })
  if (demandActive && demandPercent < 0) reasons.push({ code: 'DEMAND_LOW', params: { percent: demandPercent } })
  if (freshnessPercent > 0) reasons.push({ code: 'STOCK_AGE', params: { days: stockAge, percent: freshnessPercent } })
  if (minimumProtectionApplied) reasons.push({ code: 'MIN_PROTECTION', params: {} })
  if (clearanceApplied) reasons.push({ code: 'CLEARANCE', params: {} })

  const lines = [
    { key: 'purchase', amount: purchasePerBase },
    { key: 'wastage', amount: wastageAmount, percent: wastage },
    { key: 'effective_cost', amount: effectiveCost },
    { key: 'handling', amount: handlingPerBase },
    { key: 'base_cost', amount: baseCost },
    { key: 'margin', amount: round2(baseRecommendedPrice - baseCost), percent: margin },
    { key: 'base_recommended', amount: baseRecommendedPrice },
  ]
  if (demandActive) lines.push({ key: 'demand', amount: demandAmount, percent: demandPercent, level: demandLevel })
  if (settings.freshnessEnabled) lines.push({ key: 'freshness', amount: -freshnessAmount, percent: -freshnessPercent, days: stockAge })
  lines.push({ key: 'min_safe', amount: minimumSafePrice })
  lines.push({ key: 'recommended', amount: recommendedPrice })
  lines.push({ key: 'rounding', amount: roundedDelta, mode: mainMode })
  lines.push({ key: 'rounded', amount: roundedPrice })

  const unitWord = baseUnitOf(purchaseUnit)
  const summary = buildSummary(roundedPrice, unitWord, reasons)

  return {
    valid: true,
    errors: [],
    warnings,
    baseUnit: unitWord,
    purchasePricePerBase: purchasePerBase,
    effectiveCost,
    baseCost,
    minimumSafePrice,
    baseRecommendedPrice,
    freshnessAdjustment: { percent: freshnessPercent, amount: -freshnessAmount, stockAge },
    demandAdjustment: { level: demandLevel, percent: demandPercent, amount: demandAmount, clamped: demandClamped, active: demandActive },
    recommendedPrice,
    roundedPrice,
    sellingUnit,
    sellingUnitPrice,
    packPrices,
    roundingMode: mainMode,
    smallUnitRoundingMode: smallMode,
    minimumProtectionApplied,
    clearanceApplied,
    explanation: { summary, reasons, lines },
  }
}

const REASON_TEXT = {
  COST_UP: () => 'purchase cost increased',
  COST_DOWN: () => 'purchase cost decreased',
  DEMAND_HIGH: () => 'demand is high',
  DEMAND_LOW: () => 'demand is low',
  STOCK_AGE: (p) => `stock is ${p.days} day${p.days === 1 ? '' : 's'} old (${p.percent}% freshness discount)`,
  MIN_PROTECTION: () => 'minimum price protection was applied',
  CLEARANCE: () => 'clearance pricing is authorised',
}

function buildSummary(price, unit, reasons) {
  const label = `₹${price}/${unit}`
  if (!reasons.length) return `Recommended ${label} based on purchase cost, wastage, handling and target margin.`
  const parts = reasons.map((r) => REASON_TEXT[r.code](r.params))
  const joined = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `Recommended ${label} because ${joined}.`
}

// ---------------------------------------------------------------------
// मैनुअल ओवरराइड (Section 9) — ग्राहक को दिखने वाली अंतिम कीमत
// ---------------------------------------------------------------------

/**
 * AUTO या MANUAL में से जो लागू हो उससे अंतिम (प्रति बेस-यूनिट) कीमत तय करता है।
 * MANUAL कीमत Minimum Safe Price से नीचे हो तो requiresConfirmation = true —
 * स्क्रीन/सेव में उपयोगकर्ता की स्पष्ट पुष्टि (lossConfirmed) के बिना सेव नहीं होना चाहिए।
 */
export function resolveCustomerPrice(calc, { manualOverride = false, manualPrice = null, lossConfirmed = false, sellingUnit, packSizes = [], settings: settingsIn } = {}) {
  const settings = resolveSettings(settingsIn)
  if (!calc || !calc.valid) return { valid: false, price: null, source: manualOverride ? 'manual' : 'auto', errors: calc?.errors || [], warnings: [], packPrices: [], belowSafePrice: false, requiresConfirmation: false }

  const unit = sellingUnit || calc.sellingUnit
  if (!manualOverride) {
    return {
      valid: true,
      price: calc.roundedPrice,
      source: 'auto',
      errors: [],
      warnings: calc.warnings,
      packPrices: calc.packPrices,
      sellingUnitPrice: calc.sellingUnitPrice,
      belowSafePrice: calc.roundedPrice < calc.minimumSafePrice,
      requiresConfirmation: false,
      minimumProtectionApplied: calc.minimumProtectionApplied,
      clearanceApplied: calc.clearanceApplied,
    }
  }

  const mp = num(manualPrice)
  if (!Number.isFinite(mp) || mp <= 0) {
    return { valid: false, price: null, source: 'manual', errors: [err('MANUAL_PRICE_INVALID', 'manualPrice', 'Enter a manual selling price greater than zero.')], warnings: [], packPrices: [], belowSafePrice: false, requiresConfirmation: false }
  }
  const price = round2(mp)
  const belowSafePrice = price < calc.minimumSafePrice
  const warnings = belowSafePrice ? [{ code: 'MANUAL_BELOW_SAFE', params: { price, minimumSafePrice: calc.minimumSafePrice } }] : []
  const packUnits = packUnitsFor(unit, packSizes)
  const packPrices = derivePackPrices(price, packUnits, {
    smallUnitRoundingMode: settings.smallUnitRoundingMode,
    minSafePerKg: calc.minimumSafePrice,
    allowBelowFloor: belowSafePrice, // मालिक ने जान-बूझकर सेट किया
  })
  const primary = packPrices.find((p) => p.unit === unit)
  return {
    valid: true,
    price,
    source: 'manual',
    errors: [],
    warnings,
    packPrices,
    sellingUnitPrice: primary ? primary.price : price,
    belowSafePrice,
    requiresConfirmation: belowSafePrice && !lossConfirmed,
    minimumProtectionApplied: false,
    clearanceApplied: false,
  }
}

// ---------------------------------------------------------------------
// रिपोर्टिंग हेल्पर (डैशबोर्ड/अलर्ट इन्हीं का उपयोग करते हैं)
// ---------------------------------------------------------------------

/** लागत (base cost) पर मार्कअप %, जैसे कीमत 42 और लागत 34.61 → 21.3 */
export function markupPercent(price, baseCost) {
  if (!Number.isFinite(price) || !Number.isFinite(baseCost) || baseCost <= 0) return null
  return round2((price / baseCost - 1) * 100)
}

/** बिक्री पर ग्रॉस मार्जिन %, जैसे (revenue - cost) / revenue */
export function grossMarginPercent(revenue, cost) {
  if (!Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(cost)) return null
  return round2(((revenue - cost) / revenue) * 100)
}

/** पुरानी→नई कीमत का % बदलाव */
export function percentChange(from, to) {
  const a = num(from)
  const b = num(to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null
  return round2(((b - a) / a) * 100)
}
