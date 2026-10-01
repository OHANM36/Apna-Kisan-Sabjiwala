import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSellingPrice,
  resolveCustomerPrice,
  applyRounding,
  roundWithFloor,
  derivePackPrices,
  packUnitsFor,
  resolveSettings,
  validatePricingInput,
  validateQuantity,
  freshnessPercentFor,
  markupPercent,
  grossMarginPercent,
  percentChange,
  round2,
} from './engine.js'

const tomato = { purchasePrice: 30, purchaseUnit: 'kg', wastagePercent: 8, handlingCost: 2, marginPercent: 20 }

// ---------- Section 25: spec example ----------
test('spec example: tomato ₹30/kg, 8% wastage, ₹2 handling, 20% margin', () => {
  const r = calculateSellingPrice(tomato)
  assert.equal(r.valid, true)
  assert.equal(r.effectiveCost, 32.61)
  assert.equal(r.baseCost, 34.61)
  assert.equal(r.baseRecommendedPrice, 41.53)
  assert.equal(r.recommendedPrice, 41.53)
  assert.equal(r.roundedPrice, 42)
  assert.equal(r.minimumSafePrice, 34.61) // 0% safety margin => break-even
  assert.equal(r.minimumProtectionApplied, false)
})

test('spec example: explanation breakdown adds up (Section 15)', () => {
  const r = calculateSellingPrice(tomato)
  const byKey = Object.fromEntries(r.explanation.lines.map((l) => [l.key, l]))
  assert.equal(byKey.purchase.amount, 30)
  assert.equal(byKey.wastage.amount, 2.61)
  assert.equal(byKey.effective_cost.amount, 32.61)
  assert.equal(byKey.handling.amount, 2)
  assert.equal(byKey.base_cost.amount, 34.61)
  assert.equal(byKey.margin.percent, 20)
  assert.equal(byKey.base_recommended.amount, 41.53)
  assert.equal(byKey.rounded.amount, 42)
  assert.equal(round2(byKey.purchase.amount + byKey.wastage.amount), byKey.effective_cost.amount)
  assert.equal(round2(byKey.effective_cost.amount + byKey.handling.amount), byKey.base_cost.amount)
})

test('spec example: 500g ≈ ₹21 and 250g ≈ ₹10.50 → small-unit rounding', () => {
  const r = calculateSellingPrice({ ...tomato, sellingUnit: 'kg', packSizes: ['500g', '250g'] })
  assert.equal(r.roundedPrice, 42)
  const p500 = r.packPrices.find((p) => p.unit === '500g')
  const p250 = r.packPrices.find((p) => p.unit === '250g')
  assert.equal(p500.exactPrice, 21)
  assert.equal(p500.price, 21)
  assert.equal(p250.exactPrice, 10.5)
  assert.equal(p250.price, 11) // ceil_1 small-unit rule
  const half = calculateSellingPrice({ ...tomato, packSizes: ['250g'], smallUnitRoundingRule: 'ceil_0_5' })
  assert.equal(half.packPrices.find((p) => p.unit === '250g').price, 10.5)
})

// ---------- Section 4: rounding ----------
test('rounding examples from the spec (default customer-friendly mode)', () => {
  assert.equal(applyRounding(25.21, 'ceil_1'), 26)
  assert.equal(applyRounding(33.71, 'ceil_1'), 34)
  assert.equal(applyRounding(38.6, 'ceil_1'), 39)
  assert.equal(applyRounding(41.53, 'ceil_1'), 42)
})

test('rounding never turns an exact rupee into the next rupee (float noise)', () => {
  assert.equal(applyRounding(42.00000000001, 'ceil_1'), 42)
  assert.equal(applyRounding(0.1 + 0.2 + 41.7, 'ceil_1'), 42)
  assert.equal(applyRounding(round2(1.005), 'nearest_1'), 1)
})

test('nearest ₹1, nearest ₹5, psychological modes', () => {
  assert.equal(applyRounding(41.4, 'nearest_1'), 41)
  assert.equal(applyRounding(41.5, 'nearest_1'), 42)
  assert.equal(applyRounding(41.5, 'nearest_5'), 40)
  assert.equal(applyRounding(43, 'nearest_5'), 45)
  assert.equal(applyRounding(39.6, 'psychological'), 39) // 40 → 39
  assert.equal(applyRounding(49.2, 'psychological'), 49) // 50 → 49
  assert.equal(applyRounding(59.9, 'psychological'), 59) // 60 → 59
  assert.equal(applyRounding(41.53, 'psychological'), 42) // multiple of 10 नहीं → बदलाव नहीं
  assert.equal(applyRounding(9.2, 'psychological'), 10) // छोटी कीमतें (< ₹20) में नहीं
})

test('rounding can never push the price below the minimum safe price', () => {
  // nearest_5: 41.4 → 40 लेकिन floor 41.4 है → ऊपर ₹5 स्टेप पर
  assert.equal(roundWithFloor(41.4, 'nearest_5', 41.4), 45)
  // psychological: 39.6 → 39, पर floor 39.5 → 40
  assert.equal(roundWithFloor(39.6, 'psychological', 39.5), 40)
  // clearance में floor लागू नहीं
  assert.equal(roundWithFloor(39.6, 'psychological', 39.5, true), 39)
})

test('engine respects the configured rounding strategy', () => {
  const r = calculateSellingPrice({ ...tomato, settings: { roundingMode: 'nearest_5' } })
  assert.equal(r.roundedPrice, 40) // 41.53 → nearest ₹5 = 40 (सुरक्षित कीमत 34.61 से ऊपर, इसलिए मान्य)
})

// ---------- Section 3 & 7: minimum price protection / freshness ----------
test('minimum safe price with configured safety margin', () => {
  const r = calculateSellingPrice({ ...tomato, settings: { minSafetyMarginPercent: 10 } })
  assert.equal(r.minimumSafePrice, round2(34.61 * 1.1)) // 38.07
  assert.ok(r.roundedPrice >= r.minimumSafePrice)
})

test('freshness discount tiers: 0 / 5 / 10 / 15 percent', () => {
  const tiers = resolveSettings({}).freshnessTiers
  assert.equal(freshnessPercentFor(0, tiers), 0)
  assert.equal(freshnessPercentFor(1, tiers), 5)
  assert.equal(freshnessPercentFor(2, tiers), 10)
  assert.equal(freshnessPercentFor(7, tiers), 15)
})

test('freshness discount lowers the price but is stopped by minimum protection', () => {
  // 1 दिन पुराना: 41.53 × 0.95 = 39.45 → ₹40 (सुरक्षित कीमत 34.61 से ऊपर)
  const one = calculateSellingPrice({ ...tomato, stockAge: 1 })
  assert.equal(one.freshnessAdjustment.percent, 5)
  assert.equal(one.recommendedPrice, 39.45)
  assert.equal(one.roundedPrice, 40)
  assert.equal(one.minimumProtectionApplied, false)

  // कम मार्जिन (5%) पर 15% छूट → सुरक्षित कीमत से नीचे जाती → सुरक्षा लागू
  const low = calculateSellingPrice({ ...tomato, marginPercent: 5, stockAge: 5 })
  assert.equal(low.minimumProtectionApplied, true)
  assert.equal(low.recommendedPrice, low.minimumSafePrice)
  assert.ok(low.warnings.some((w) => w.code === 'MIN_PRICE_PROTECTION_APPLIED'))
  assert.ok(low.roundedPrice >= low.minimumSafePrice)
  assert.equal(low.explanation.reasons.some((r) => r.code === 'MIN_PROTECTION'), true)
})

test('clearance pricing allowed only when explicitly authorised', () => {
  const blocked = calculateSellingPrice({ ...tomato, marginPercent: 5, stockAge: 5 })
  assert.equal(blocked.clearanceApplied, false)
  const cleared = calculateSellingPrice({ ...tomato, marginPercent: 5, stockAge: 5, allowClearance: true })
  assert.equal(cleared.clearanceApplied, true)
  assert.equal(cleared.minimumProtectionApplied, false)
  assert.ok(cleared.recommendedPrice < cleared.minimumSafePrice)
  assert.ok(cleared.warnings.some((w) => w.code === 'CLEARANCE_BELOW_SAFE'))
})

test('freshness can be switched off', () => {
  const r = calculateSellingPrice({ ...tomato, stockAge: 3, settings: { freshnessEnabled: false } })
  assert.equal(r.freshnessAdjustment.percent, 0)
  assert.equal(r.roundedPrice, 42)
})

// ---------- Section 8: demand ----------
test('demand pricing is off by default and never changes the price', () => {
  const r = calculateSellingPrice({ ...tomato, demandLevel: 'high' })
  assert.equal(r.demandAdjustment.active, false)
  assert.equal(r.roundedPrice, 42)
})

test('demand high +5% / low -5% when enabled', () => {
  const s = { demandEnabled: true }
  const high = calculateSellingPrice({ ...tomato, demandLevel: 'high', settings: s })
  assert.equal(high.demandAdjustment.percent, 5)
  assert.equal(high.recommendedPrice, round2(41.53 * 1.05)) // 43.61
  assert.equal(high.roundedPrice, 44)
  const low = calculateSellingPrice({ ...tomato, demandLevel: 'low', settings: s })
  assert.equal(low.recommendedPrice, round2(41.53 * 0.95)) // 39.45
  const normal = calculateSellingPrice({ ...tomato, demandLevel: 'normal', settings: s })
  assert.equal(normal.roundedPrice, 42)
})

test('demand adjustment is capped by the admin maximum limits', () => {
  const r = calculateSellingPrice({
    ...tomato,
    demandLevel: 'high',
    settings: { demandEnabled: true, demandHighPercent: 30, demandMaxIncreasePercent: 8 },
  })
  assert.equal(r.demandAdjustment.percent, 8)
  assert.equal(r.demandAdjustment.clamped, true)
  assert.ok(r.warnings.some((w) => w.code === 'DEMAND_CLAMPED'))
})

test('explanation says why: cost up + high demand', () => {
  const r = calculateSellingPrice({ ...tomato, purchasePrice: 30, previousPurchasePrice: 24, demandLevel: 'high', settings: { demandEnabled: true } })
  assert.match(r.explanation.summary, /because purchase cost increased and demand is high\.$/)
  assert.deepEqual(r.explanation.reasons.map((x) => x.code), ['COST_UP', 'DEMAND_HIGH'])
})

// ---------- Section 6: units ----------
test('unit conversion: ₹40/kg → 500g ₹20, 250g ₹10', () => {
  const packs = derivePackPrices(40, ['kg', '500g', '250g'])
  assert.deepEqual(packs.map((p) => [p.unit, p.price]), [['kg', 40], ['500g', 20], ['250g', 10]])
})

test('unit conversion: coriander ₹110/kg → 100g ≈ ₹11', () => {
  const [p] = derivePackPrices(110, ['100g'])
  assert.equal(p.exactPrice, 11)
  assert.equal(p.price, 11)
})

test('small pack never goes below its share of the minimum safe price', () => {
  const [p] = derivePackPrices(41.4, ['250g'], { smallUnitRoundingMode: 'nearest_1', minSafePerKg: 41.4 })
  // exact 10.35 → nearest 10, पर floor 10.35 → 11
  assert.equal(p.price, 11)
})

test('pack list: selling unit first, kg-only means no tiers', () => {
  assert.deepEqual(packUnitsFor('kg', []), [])
  assert.deepEqual(packUnitsFor('kg', ['250g', '500g']), ['kg', '500g', '250g'])
  assert.deepEqual(packUnitsFor('250g', ['kg', '500g']), ['250g', 'kg', '500g'])
  assert.deepEqual(packUnitsFor('piece', ['500g']), [])
})

test('purchase unit ≠ base: ₹12 per 500g purchase = ₹24/kg', () => {
  const r = calculateSellingPrice({ purchasePrice: 12, purchaseUnit: '500g', wastagePercent: 0, handlingCost: 1, marginPercent: 20 })
  assert.equal(r.purchasePricePerBase, 24)
  assert.equal(r.baseCost, 26) // 24 + 1/0.5
  assert.equal(r.baseUnit, 'kg')
})

test('selling in 250g packs: primary price is the 250g pack price', () => {
  const r = calculateSellingPrice({ ...tomato, sellingUnit: '250g', packSizes: ['kg', '500g'] })
  assert.equal(r.roundedPrice, 42)
  assert.equal(r.sellingUnitPrice, 11)
  assert.deepEqual(r.packPrices.map((p) => p.unit), ['250g', 'kg', '500g'])
})

test('count units: cauliflower ₹25/piece', () => {
  const r = calculateSellingPrice({ purchasePrice: 25, purchaseUnit: 'piece', wastagePercent: 10, handlingCost: 1, marginPercent: 20 })
  assert.equal(r.baseUnit, 'piece')
  assert.equal(r.effectiveCost, 27.78)
  assert.equal(r.baseCost, 28.78)
  assert.equal(r.recommendedPrice, 34.54)
  assert.equal(r.roundedPrice, 35)
  assert.deepEqual(r.packPrices, [])
})

test('weight ↔ count conversion is refused', () => {
  const r = calculateSellingPrice({ ...tomato, sellingUnit: 'piece' })
  assert.equal(r.valid, false)
  assert.ok(r.errors.some((e) => e.code === 'UNIT_MISMATCH'))
  const r2 = calculateSellingPrice({ ...tomato, purchaseUnit: 'piece', sellingUnit: 'bunch' })
  assert.ok(r2.errors.some((e) => e.code === 'UNIT_MISMATCH'))
})

// ---------- Section 21: validation ----------
test('purchase price: negative, zero, missing, garbage are rejected', () => {
  const codes = (v) => calculateSellingPrice({ ...tomato, purchasePrice: v }).errors.map((e) => e.code)
  assert.deepEqual(codes(-1), ['PURCHASE_PRICE_NEGATIVE'])
  assert.deepEqual(codes(0), ['PURCHASE_PRICE_ZERO'])
  assert.deepEqual(codes(''), ['PURCHASE_PRICE_REQUIRED'])
  assert.deepEqual(codes(null), ['PURCHASE_PRICE_REQUIRED'])
  assert.deepEqual(codes('abc'), ['PURCHASE_PRICE_REQUIRED']) // Number('abc') = NaN
  assert.deepEqual(codes(NaN), ['PURCHASE_PRICE_REQUIRED'])
  assert.equal(calculateSellingPrice({ ...tomato, purchasePrice: Infinity }).valid, false)
})

test('wastage: 100% (divide by zero), above 100, negative, above safe limit are rejected', () => {
  for (const w of [100, 150, 99.9999]) {
    const r = calculateSellingPrice({ ...tomato, wastagePercent: w })
    assert.equal(r.valid, false, `wastage ${w}`)
    assert.equal(r.roundedPrice, null)
  }
  assert.ok(calculateSellingPrice({ ...tomato, wastagePercent: -1 }).errors.some((e) => e.code === 'WASTAGE_NEGATIVE'))
  assert.ok(calculateSellingPrice({ ...tomato, wastagePercent: 60 }).errors.some((e) => e.code === 'WASTAGE_ABOVE_LIMIT'))
  assert.equal(calculateSellingPrice({ ...tomato, wastagePercent: 60, settings: { maxWastagePercent: 70 } }).valid, true)
})

test('margin and handling: invalid values are rejected', () => {
  assert.ok(calculateSellingPrice({ ...tomato, marginPercent: -5 }).errors.some((e) => e.code === 'MARGIN_NEGATIVE'))
  assert.ok(calculateSellingPrice({ ...tomato, marginPercent: 'x' }).errors.some((e) => e.code === 'MARGIN_INVALID'))
  assert.ok(calculateSellingPrice({ ...tomato, marginPercent: 5000 }).errors.some((e) => e.code === 'MARGIN_ABOVE_LIMIT'))
  assert.ok(calculateSellingPrice({ ...tomato, handlingCost: -2 }).errors.some((e) => e.code === 'HANDLING_INVALID'))
})

test('stock age / demand level / units / pack sizes validated', () => {
  assert.ok(calculateSellingPrice({ ...tomato, stockAge: -1 }).errors.some((e) => e.code === 'STOCK_AGE_INVALID'))
  assert.ok(calculateSellingPrice({ ...tomato, demandLevel: 'crazy' }).errors.some((e) => e.code === 'DEMAND_INVALID'))
  assert.ok(calculateSellingPrice({ ...tomato, purchaseUnit: 'litre' }).errors.some((e) => e.code === 'UNIT_INVALID'))
  assert.ok(calculateSellingPrice({ ...tomato, packSizes: ['piece'] }).errors.some((e) => e.code === 'PACK_INVALID'))
})

test('quantity cannot be negative', () => {
  assert.deepEqual(validateQuantity(0), [])
  assert.deepEqual(validateQuantity('12.5'), [])
  assert.equal(validateQuantity(-1)[0].code, 'QUANTITY_NEGATIVE')
  assert.equal(validateQuantity('')[0].code, 'QUANTITY_INVALID')
})

test('missing / malformed settings fall back to safe defaults', () => {
  for (const bad of [undefined, null, {}, 'oops', { roundingMode: 'wild', maxWastagePercent: 'x', freshnessTiers: 'nope', demandHighPercent: NaN }]) {
    const r = calculateSellingPrice({ ...tomato, settings: bad })
    assert.equal(r.valid, true)
    assert.equal(r.roundedPrice, 42)
  }
  const s = resolveSettings({ maxWastagePercent: 100 }) // 100% की सीमा मान्य नहीं
  assert.ok(s.maxWastagePercent < 100)
})

test('missing per-product wastage/handling/margin use configured defaults', () => {
  const r = calculateSellingPrice({ purchasePrice: 100, settings: { defaultWastagePercent: 10, defaultHandlingCost: 0, defaultMarginPercent: 20 } })
  assert.equal(r.effectiveCost, 111.11)
  assert.equal(r.roundedPrice, 134)
})

test('no exceptions on hostile input', () => {
  for (const input of [undefined, null, {}, { purchasePrice: {} }, { purchasePrice: [] }, { purchasePrice: true }]) {
    assert.doesNotThrow(() => calculateSellingPrice(input ?? undefined))
  }
})

// ---------- Section 9: manual override ----------
test('AUTO mode returns the calculated rounded price', () => {
  const calc = calculateSellingPrice(tomato)
  const f = resolveCustomerPrice(calc, { manualOverride: false })
  assert.equal(f.price, 42)
  assert.equal(f.source, 'auto')
  assert.equal(f.requiresConfirmation, false)
})

test('MANUAL price above safe price saves without confirmation', () => {
  const calc = calculateSellingPrice(tomato)
  const f = resolveCustomerPrice(calc, { manualOverride: true, manualPrice: 45 })
  assert.equal(f.price, 45)
  assert.equal(f.source, 'manual')
  assert.equal(f.belowSafePrice, false)
  assert.equal(f.requiresConfirmation, false)
})

test('MANUAL price below safe price needs explicit confirmation', () => {
  const calc = calculateSellingPrice(tomato)
  const f = resolveCustomerPrice(calc, { manualOverride: true, manualPrice: 30 })
  assert.equal(f.belowSafePrice, true)
  assert.equal(f.requiresConfirmation, true)
  assert.equal(f.warnings[0].code, 'MANUAL_BELOW_SAFE')
  const ok = resolveCustomerPrice(calc, { manualOverride: true, manualPrice: 30, lossConfirmed: true })
  assert.equal(ok.requiresConfirmation, false)
  assert.equal(ok.price, 30)
})

test('MANUAL price validation and packs derive from manual price', () => {
  const calc = calculateSellingPrice({ ...tomato, packSizes: ['500g', '250g'] })
  assert.equal(resolveCustomerPrice(calc, { manualOverride: true, manualPrice: '' }).valid, false)
  assert.equal(resolveCustomerPrice(calc, { manualOverride: true, manualPrice: -5 }).valid, false)
  const f = resolveCustomerPrice(calc, { manualOverride: true, manualPrice: 50, sellingUnit: 'kg', packSizes: ['500g', '250g'] })
  assert.deepEqual(f.packPrices.map((p) => [p.unit, p.price]), [['kg', 50], ['500g', 25], ['250g', 13]])
})

test('invalid calc propagates through resolveCustomerPrice', () => {
  const f = resolveCustomerPrice(calculateSellingPrice({ ...tomato, purchasePrice: -1 }), { manualOverride: false })
  assert.equal(f.valid, false)
  assert.equal(f.price, null)
})

// ---------- helpers ----------
test('reporting helpers', () => {
  assert.equal(markupPercent(42, 34.61), 21.35)
  assert.equal(markupPercent(42, 0), null)
  assert.equal(grossMarginPercent(200, 166), 17)
  assert.equal(grossMarginPercent(0, 5), null)
  assert.equal(percentChange(24, 30), 25)
  assert.equal(percentChange(0, 30), null)
  assert.equal(round2(1.005), 1.01)
})

test('validatePricingInput can be used on its own', () => {
  assert.deepEqual(validatePricingInput({ purchasePrice: 10, purchaseUnit: 'kg' }, {}), [])
})
