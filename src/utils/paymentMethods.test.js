import test from 'node:test'
import assert from 'node:assert/strict'
import { codAvailability, isCod, isPaid, paymentText } from './paymentMethods.js'

test('COD is unavailable unless explicitly enabled', () => {
  assert.deepEqual(codAvailability(undefined, 100), { available: false, reason: 'disabled' })
  assert.deepEqual(codAvailability({}, 100), { available: false, reason: 'disabled' })
  assert.deepEqual(codAvailability({ cod_enabled: false }, 100), { available: false, reason: 'disabled' })
  assert.equal(codAvailability({ cod_enabled: 'true' }, 100).available, false, 'only boolean true enables')
})

test('COD enabled without a cap is always available', () => {
  assert.deepEqual(codAvailability({ cod_enabled: true }, 99999), { available: true, reason: null })
  assert.equal(codAvailability({ cod_enabled: true, cod_max_order_value: null }, 99999).available, true)
  assert.equal(codAvailability({ cod_enabled: true, cod_max_order_value: 0 }, 99999).available, true, '0 means no cap')
  assert.equal(codAvailability({ cod_enabled: true, cod_max_order_value: 'abc' }, 500).available, true)
})

test('COD cap: equal is allowed, above is blocked (matches server `total > max`)', () => {
  const s = { cod_enabled: true, cod_max_order_value: '500.00' } // numeric columns arrive as strings/numbers
  assert.equal(codAvailability(s, 500).available, true)
  assert.deepEqual(codAvailability(s, 500.01), { available: false, reason: 'limit', limit: 500 })
  assert.equal(codAvailability({ ...s, cod_enabled: false }, 100).reason, 'disabled', 'disabled wins over limit')
})

test('isCod / isPaid / paymentText', () => {
  const cod = { payment_method: 'COD', payment_status: 'लंबित' }
  assert.equal(isCod(cod), true)
  assert.equal(isCod({ payment_method: 'ऑनलाइन' }), false)
  assert.equal(isCod(null), false)
  assert.equal(isPaid(cod), false)
  assert.equal(isPaid({ payment_status: 'सफल' }), true)
  assert.match(paymentText(cod), /कैश ऑन डिलीवरी/)
  assert.equal(paymentText({ ...cod, payment_status: 'सफल' }), 'कैश मिल गया')
  assert.equal(paymentText({ payment_method: 'ऑनलाइन', payment_status: 'लंबित' }), 'लंबित', 'online unchanged')
  assert.equal(paymentText(undefined), '')
})

test('डिलीवरी पर ऑनलाइन (UPI): सिर्फ़ COD ऑर्डर पर, और COD जैसा ही व्यवहार', async () => {
  const { isCodOnline } = await import('./paymentMethods.js')
  const online = { payment_method: 'COD', cod_pay_mode: 'online', payment_status: 'लंबित' }
  assert.equal(isCodOnline(online), true)
  assert.equal(isCod(online), true, 'सर्वर पर यह COD ऑर्डर ही है')
  assert.equal(isCodOnline({ payment_method: 'COD', cod_pay_mode: 'cash' }), false)
  assert.equal(isCodOnline({ payment_method: 'COD' }), false, 'कॉलम न हो (पुराना ऑर्डर) तो कैश माना जाए')
  assert.equal(isCodOnline({ payment_method: 'ऑनलाइन', cod_pay_mode: 'online' }), false, 'गैर-COD पर असर नहीं')
  assert.match(paymentText(online), /ऑनलाइन भुगतान \(UPI\)/)
  assert.equal(paymentText({ ...online, payment_status: 'सफल' }), 'ऑनलाइन (UPI) भुगतान मिल गया')
})
