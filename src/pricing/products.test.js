import test from 'node:test'
import assert from 'node:assert/strict'
import {
  istDate, stockAgeDays, daysSince, purchaseUnitFromStoreUnit, storeUnitFor, tiersFromPacks, resolveParams,
  computeProduct, productInputFrom, buildPublishItem, settingsFromRow, settingsToRow, packSizesFromTiers,
} from './products.js'
import { computeAlerts, reviewCount } from './alerts.js'
import { resolveSettings, calculateSellingPrice } from './engine.js'

test('IST date handling: 18:45 UTC is already next day in India', () => {
  assert.equal(istDate(new Date('2026-09-30T18:45:00Z')), '2026-10-01')
  assert.equal(istDate(new Date('2026-09-30T18:29:00Z')), '2026-09-30')
  assert.equal(stockAgeDays('2026-09-29', '2026-10-01'), 2)
  assert.equal(stockAgeDays('2026-10-02', '2026-10-01'), 0)
  assert.equal(stockAgeDays(null), 0)
  assert.equal(daysSince(null), Infinity)
  assert.equal(daysSince('2026-09-28T10:00:00Z', new Date('2026-10-01T05:00:00Z')), 3)
})

test('unit mapping to store units', () => {
  assert.equal(purchaseUnitFromStoreUnit('किलो'), 'kg')
  assert.equal(purchaseUnitFromStoreUnit('नग'), 'piece')
  assert.equal(purchaseUnitFromStoreUnit('गड्डी'), 'bunch')
  assert.equal(purchaseUnitFromStoreUnit('आधा किलो'), 'kg')
  assert.equal(storeUnitFor('250g'), 'किलो')
  assert.equal(storeUnitFor('piece'), 'नग')
  assert.equal(storeUnitFor('bunch'), 'गड्डी')
})

test('tomato end-to-end through product helpers → customer tiers', () => {
  const veg = { id: 'v1', name: 'टमाटर', unit: 'किलो', price: 34 }
  const rule = { wastage_pct: 8, margin_pct: 20, handling_cost: 2 }
  const p = productInputFrom(veg, null, rule, null, { purchasePrice: 30, packSizes: ['500g', '250g'] })
  const c = computeProduct(p, null)
  assert.equal(c.valid, true)
  assert.equal(c.cust.price, 42)
  assert.deepEqual(c.tiers, [
    { qty: 1, unit: 'किलो', price: 42 },
    { qty: 500, unit: 'ग्राम', price: 21 },
    { qty: 250, unit: 'ग्राम', price: 11 },
  ])
})

test('profile values beat category rule beat global defaults; null means inherit', () => {
  const s = resolveSettings({ defaultWastagePercent: 6, defaultMarginPercent: 22, defaultHandlingCost: 1 })
  assert.deepEqual(resolveParams({ wastage_pct: 3 }, { wastage_pct: 9, margin_pct: 30, handling_cost: 2 }, s), { wastage: 3, handling: 2, margin: 30 })
  assert.deepEqual(resolveParams(null, null, s), { wastage: 6, handling: 1, margin: 22 })
  assert.deepEqual(resolveParams({ wastage_pct: null, margin_pct: '', handling_cost: 0 }, { wastage_pct: 9, margin_pct: 30 }, s), { wastage: 9, handling: 0, margin: 30 })
})

test('manual override flows through to the publish payload, price = manual', () => {
  const veg = { id: 'v1', name: 'टमाटर', unit: 'किलो', price: 34 }
  const profile = { version: 4, purchase_price: 30, purchase_unit: 'kg', selling_unit: 'kg', pack_sizes: [], wastage_pct: 8, handling_cost: 2, margin_pct: 20, manual_override: true, manual_price: 45 }
  const p = productInputFrom(veg, profile, null, null, { purchasePrice: 31 })
  const comp = computeProduct(p, null)
  assert.equal(comp.cust.price, 45)
  const item = buildPublishItem({ veg, profile, p, computed: comp, stored: { wastage: 8, handling: 2, margin: 20 }, stockReceivedAt: '2026-10-01' })
  assert.equal(item.base_version, 4)
  assert.equal(item.manual_override, true)
  assert.equal(item.manual_price, 45)
  assert.equal(item.snapshot.published_price, 45)
  assert.equal(item.snapshot.price_source, 'manual')
  assert.equal(item.store_unit, 'किलो')
  assert.equal(item.price_tiers, null)
})

test('manual price below a risen safe price needs confirmation in the product result', () => {
  const veg = { id: 'v1', unit: 'किलो' }
  const profile = { version: 1, purchase_price: 30, purchase_unit: 'kg', selling_unit: 'kg', wastage_pct: 8, handling_cost: 2, margin_pct: 20, manual_override: true, manual_price: 36 }
  const c = computeProduct(productInputFrom(veg, profile, null, null, { purchasePrice: 40 }), null) // नई safe = 40/0.92+2 = 45.48
  assert.equal(c.cust.belowSafePrice, true)
  assert.equal(c.cust.requiresConfirmation, true)
})

test('new product (no profile) publishes with base_version null and inherited (null) parameters', () => {
  const veg = { id: 'v9', name: 'पालक', unit: 'गड्डी', price: 10 }
  const rule = { wastage_pct: 20, margin_pct: 30, handling_cost: 0 }
  const p = productInputFrom(veg, null, rule, null, { purchasePrice: 8 })
  assert.equal(p.purchaseUnit, 'bunch')
  const comp = computeProduct(p, null)
  const item = buildPublishItem({ veg, profile: null, p, computed: comp, stored: {} })
  assert.equal(item.base_version, null)
  assert.equal(item.wastage_pct, null)
  assert.equal(item.store_unit, 'गड्डी')
  assert.equal(item.snapshot.wastage_pct, 20)
  assert.equal(comp.cust.price, calculateSellingPrice({ purchasePrice: 8, purchaseUnit: 'bunch', wastagePercent: 20, handlingCost: 0, marginPercent: 30 }).roundedPrice)
})

test('settings row ↔ engine settings round trip keeps values and survives junk', () => {
  const s = resolveSettings({ roundingMode: 'nearest_5', minSafetyMarginPercent: 10, demandEnabled: true, deliveryCostPerOrder: 25 })
  const row = settingsToRow(s)
  assert.equal(row.rounding_mode, 'nearest_5')
  const back = settingsFromRow(row)
  assert.deepEqual(back, s)
  assert.doesNotThrow(() => settingsFromRow(null))
  assert.doesNotThrow(() => settingsFromRow({ rounding_mode: 'bad', freshness_tiers: 'x' }))
})

test('tiersFromPacks handles empty', () => {
  assert.equal(tiersFromPacks([]), null)
  assert.equal(tiersFromPacks(undefined), null)
})

// ---------- alerts ----------
const now = new Date('2026-10-01T06:00:00Z')
const prof = (over) => ({
  version: 1, purchase_price: 30, previous_purchase_price: 24, published_price: 42, base_cost: 34.61, min_safe_price: 34.61,
  wastage_pct: 8, last_price_updated_at: '2026-10-01T02:00:00Z', ...over,
})

test('alert: tomato purchase 24 → 30 is +25%', () => {
  const a = computeAlerts([{ veg: { id: 't', name: 'टमाटर' }, profile: prof(), rule: null }], null, now)
  const up = a.find((x) => x.type === 'purchase_up')
  assert.equal(up.params.percent, 25)
  assert.equal(up.severity, 'high')
})

test('alerts: down, below safe, low margin, high wastage, stale, no profile', () => {
  const items = [
    { veg: { id: 'a', name: 'A' }, profile: prof({ purchase_price: 20, previous_purchase_price: 30 }) },
    { veg: { id: 'b', name: 'B' }, profile: prof({ published_price: 30 }) },
    { veg: { id: 'c', name: 'C' }, profile: prof({ published_price: 35, previous_purchase_price: 30 }) },
    { veg: { id: 'd', name: 'D' }, profile: prof({ wastage_pct: 30, previous_purchase_price: 30 }) },
    { veg: { id: 'e', name: 'E' }, profile: prof({ last_price_updated_at: '2026-09-25T00:00:00Z', previous_purchase_price: 30 }) },
    { veg: { id: 'f', name: 'F' }, profile: null },
  ]
  const a = computeAlerts(items, null, now)
  const types = (id) => a.filter((x) => x.vegetable_id === id).map((x) => x.type)
  assert.ok(types('a').includes('purchase_down'))
  assert.ok(types('b').includes('below_safe'))
  assert.ok(!types('b').includes('margin_low'))
  assert.ok(types('c').includes('margin_low'))
  assert.ok(types('d').includes('high_wastage'))
  assert.ok(types('e').includes('stale'))
  assert.deepEqual(types('f'), ['no_profile'])
  assert.equal(a[0].severity, 'high')
  assert.equal(reviewCount(a), 3) // a (down), b (below safe), c (low margin)
})

test('alert thresholds are configurable', () => {
  const items = [{ veg: { id: 't', name: 'T' }, profile: prof() }]
  assert.equal(computeAlerts(items, { purchaseChangeAlertPercent: 50 }, now).some((x) => x.type === 'purchase_up'), false)
  assert.equal(computeAlerts(items, { staleAfterDays: 1 }, new Date('2026-10-04T06:00:00Z')).some((x) => x.type === 'stale'), true)
})

test('existing customer tiers become pack sizes (nothing silently dropped)', () => {
  assert.deepEqual(packSizesFromTiers([{ qty: 0.5, unit: 'किलो', price: 18 }, { qty: 1, unit: 'किलो', price: 30 }]), { sellingUnit: '500g', packSizes: ['kg'], dropped: 0 })
  assert.deepEqual(packSizesFromTiers([{ qty: 250, unit: 'ग्राम', price: 9 }, { qty: 750, unit: 'ग्राम', price: 25 }]), { sellingUnit: '250g', packSizes: [], dropped: 1 })
  assert.deepEqual(packSizesFromTiers(null), { sellingUnit: null, packSizes: [], dropped: 0 })
  assert.deepEqual(packSizesFromTiers([{ qty: 3, unit: 'नग', price: 9 }]), { sellingUnit: null, packSizes: [], dropped: 1 })
})
