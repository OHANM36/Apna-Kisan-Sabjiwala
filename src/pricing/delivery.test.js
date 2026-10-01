import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateDeliveryFee, nextDeliveryBenefit, minOrderShortfall, validateDeliveryRules } from './delivery.js'

const rules = [
  { min_subtotal: 0, fee: 30, is_active: true },
  { min_subtotal: 199, fee: 20, is_active: true },
  { min_subtotal: 299, fee: 0, is_active: true },
]

test('₹199–₹298 pays the configured fee, ₹299+ free', () => {
  assert.equal(calculateDeliveryFee(199, rules).fee, 20)
  assert.equal(calculateDeliveryFee(298.99, rules).fee, 20)
  assert.equal(calculateDeliveryFee(299, rules).fee, 0)
  assert.equal(calculateDeliveryFee(299, rules).isFree, true)
  assert.equal(calculateDeliveryFee(50, rules).fee, 30)
})

test('inactive and malformed rules are ignored; settings are the fallback', () => {
  const r = [{ min_subtotal: 0, fee: 25, is_active: true }, { min_subtotal: 100, fee: 0, is_active: false }, { min_subtotal: 'x', fee: 1 }, { min_subtotal: 50, fee: -3 }]
  assert.equal(calculateDeliveryFee(500, r).fee, 25)
  assert.equal(calculateDeliveryFee(500, [], { delivery_fee: 20, free_delivery_above: 500 }).fee, 0)
  assert.equal(calculateDeliveryFee(499, [], { delivery_fee: 20, free_delivery_above: 500 }).fee, 20)
  assert.equal(calculateDeliveryFee(100, undefined, {}).fee, 0)
  assert.equal(calculateDeliveryFee(undefined, null, { delivery_fee: 20 }).fee, 20)
})

test('future zone support: zone rules win when present, otherwise default rules', () => {
  const z = [...rules, { zone: 'far', min_subtotal: 0, fee: 50 }, { zone: 'far', min_subtotal: 500, fee: 10 }]
  assert.equal(calculateDeliveryFee(300, z).fee, 0)
  assert.equal(calculateDeliveryFee(300, z, {}, 'far').fee, 50)
  assert.equal(calculateDeliveryFee(600, z, {}, 'far').fee, 10)
  assert.equal(calculateDeliveryFee(300, z, {}, 'unknown-zone').fee, 0)
})

test('next benefit hint', () => {
  assert.deepEqual(nextDeliveryBenefit(250, rules), { addAmount: 49, fee: 0, isFree: true })
  assert.equal(nextDeliveryBenefit(299, rules), null)
  assert.deepEqual(nextDeliveryBenefit(150, rules), { addAmount: 49, fee: 20, isFree: false })
})

test('minimum order shortfall: ₹154 in cart → add ₹45', () => {
  assert.equal(minOrderShortfall(154, 199), 45)
  assert.equal(minOrderShortfall(199, 199), 0)
  assert.equal(minOrderShortfall(250, 199), 0)
  assert.equal(minOrderShortfall(198.5, 199), 0.5)
  assert.equal(minOrderShortfall(10, 0), 0)
  assert.equal(minOrderShortfall(undefined, 199), 199)
})

test('rule validation', () => {
  assert.deepEqual(validateDeliveryRules(rules), [])
  assert.equal(validateDeliveryRules([{ min_subtotal: 100, fee: 10 }]).some((e) => e.code === 'NO_BASE_RULE'), true)
  assert.equal(validateDeliveryRules([{ min_subtotal: 0, fee: 10 }, { min_subtotal: 0, fee: 5 }]).some((e) => e.code === 'DUPLICATE_MIN'), true)
  assert.equal(validateDeliveryRules([{ min_subtotal: 0, fee: '' }]).some((e) => e.code === 'FEE_INVALID'), true)
})
